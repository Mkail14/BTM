<script setup>
/**
 * Dossier de validation, côté entreprise (page « Votre compte est en cours de validation ») :
 *  - Messages : la discussion avec BTM (ce qui manque pour valider le compte) ;
 *  - Documents : les pièces demandées par BTM, à déposer (PDF ou photo), puis le contrat de partenariat à lire et signer.
 * Même fenêtre que la connexion du site (fond flouté, feuille qui monte du bas sur téléphone), toujours en couleurs
 * de nuit (theme-nuit) comme la page d'attente qui l'ouvre. « Lire » sur le contrat pose le PDF dans un second bloc
 * de la même taille, à droite (à la place du dossier sur un écran étroit).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import ContratPartenaire from '@/composants/commun/ContratPartenaire.vue'
import ApercuContrat from '@/composants/commun/ApercuContrat.vue'
import { useAuth } from '@/composables/useAuth.js'
import { iconeDocument, STATUTS_DOCUMENT } from '@/donnees/documentsFournisseur.js'
import { listerMessages, envoyerMessage, marquerLus, listerDocuments, deposerDocument, lienDocument } from '@/services/supabase/serviceDossierFournisseur.js'

const props = defineProps({
  demande: { type: Object, required: true },
  onglet: { type: String, default: 'messages' } // 'messages' | 'documents'
})
const emit = defineEmits(['fermer', 'maj'])
const { utilisateur, rechargerRole } = useAuth()

const vue = ref(props.onglet) // 'messages' | 'documents' | 'contrat'
const erreur = ref('')
const papier = ref(false) // PDF du contrat ouvert à côté de la signature

// ---------- Messages ----------
const messages = ref(null)
const saisie = ref('')
const envoi = ref(false)
const fil = ref(null)
const defilerEnBas = () => nextTick(() => { if (fil.value) fil.value.scrollTop = fil.value.scrollHeight })
async function chargerMessages() {
  try {
    messages.value = await listerMessages(props.demande.id)
    if (vue.value === 'messages' && messages.value.some((m) => m.auteur === 'btm' && !m.lu_le)) { await marquerLus(props.demande.id); emit('maj') }
  } catch (e) { messages.value = messages.value || []; erreur.value = e.message }
}
async function envoyer() {
  const t = saisie.value.trim()
  if (!t || envoi.value) return
  envoi.value = true
  try {
    await envoyerMessage(props.demande.id, t)
    saisie.value = ''
    await chargerMessages()
    defilerEnBas()
  } catch (e) { erreur.value = e.message } finally { envoi.value = false }
}
const heure = (t) => new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

// ---------- Documents ----------
const documents = ref(null)
const depot = ref('') // id du document en cours d'envoi
async function chargerDocuments() {
  try { documents.value = await listerDocuments(props.demande.id) } catch (e) { documents.value = documents.value || []; erreur.value = e.message }
}
async function choisirFichier(doc, e) {
  const fichier = e.target.files?.[0]
  e.target.value = ''
  if (!fichier) return
  depot.value = doc.id
  erreur.value = ''
  try {
    await deposerDocument(doc, fichier, utilisateur.value.id)
    await chargerDocuments()
    emit('maj')
  } catch (err) { erreur.value = err.message } finally { depot.value = '' }
}
async function ouvrirFichier(doc) {
  try { window.open(await lienDocument(doc.chemin), '_blank', 'noopener') } catch (e) { erreur.value = e.message }
}
const aFaire = computed(() => (documents.value || []).filter((d) => ['a_fournir', 'refuse'].includes(d.statut)).length + (props.demande.contrat_signe_le ? 0 : 1))
const nonLus = computed(() => (messages.value || []).filter((m) => m.auteur === 'btm' && !m.lu_le).length)

async function apresSignature() {
  await rechargerRole() // la demande relue porte la signature
  vue.value = 'documents'
  emit('maj')
}

// ---------- Ouverture / actualisation ----------
let minuterie = null
onMounted(async () => {
  document.body.style.overflow = 'hidden'
  await Promise.all([chargerMessages(), chargerDocuments()])
  defilerEnBas()
  minuterie = setInterval(() => { if (document.visibilityState === 'visible') { chargerMessages(); chargerDocuments() } }, 20000)
})
onBeforeUnmount(() => { clearInterval(minuterie); document.body.style.overflow = '' })
watch(vue, (v) => { erreur.value = ''; papier.value = false; if (v === 'messages') { chargerMessages(); defilerEnBas() } })
</script>

<template>
  <div class="dos-voile" :class="{ 'avec-pdf': vue === 'contrat' && papier }" @click.self="emit('fermer')" @keydown.esc="emit('fermer')">
    <section class="dos theme-nuit" role="dialog" aria-modal="true" aria-labelledby="dos-titre">
      <button type="button" class="dos-fermer" aria-label="Fermer" @click="emit('fermer')"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      <header class="dos-tete">
        <p class="dos-surtitre">Validation du compte · {{ demande.entreprise }}</p>
        <h2 id="dos-titre" class="dos-titre">{{ vue === 'contrat' ? 'Contrat de partenariat' : 'Votre dossier' }}</h2>
      </header>

      <div v-if="vue !== 'contrat'" class="dos-onglets" role="tablist">
        <button type="button" role="tab" :aria-selected="vue === 'messages'" @click="vue = 'messages'">
          <i class="fa-solid fa-comments" aria-hidden="true"></i> Messages <b v-if="nonLus" class="dos-pastille">{{ nonLus }}</b>
        </button>
        <button type="button" role="tab" :aria-selected="vue === 'documents'" @click="vue = 'documents'">
          <i class="fa-solid fa-folder-open" aria-hidden="true"></i> Documents <b v-if="aFaire" class="dos-pastille">{{ aFaire }}</b>
        </button>
      </div>

      <!-- Messages : la discussion avec BTM -->
      <template v-if="vue === 'messages'">
        <div ref="fil" class="dos-fil" aria-live="polite">
          <p v-if="messages === null" class="dos-vide"><span class="spinner" aria-hidden="true"></span></p>
          <p v-else-if="!messages.length" class="dos-vide">
            <i class="fa-solid fa-comments" aria-hidden="true"></i>
            Une question sur votre demande ? Écrivez à l’équipe BTM : elle vous dira ici ce qu’il manque pour valider votre compte.
          </p>
          <div v-for="m in messages" :key="m.id" class="dos-message" :class="m.auteur">
            <p>{{ m.texte }}</p>
            <small>{{ m.auteur === 'btm' ? 'Équipe BTM' : 'Vous' }} · {{ heure(m.cree_le) }}</small>
          </div>
        </div>
        <form class="dos-saisie" @submit.prevent="envoyer">
          <textarea v-model="saisie" rows="1" maxlength="2000" placeholder="Votre message à l’équipe BTM" aria-label="Votre message" @keydown.enter.exact.prevent="envoyer"></textarea>
          <button type="submit" class="dos-envoyer" :disabled="!saisie.trim() || envoi" aria-label="Envoyer">
            <span v-if="envoi" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-paper-plane" aria-hidden="true"></i>
          </button>
        </form>
      </template>

      <!-- Documents : pièces demandées, puis le contrat -->
      <div v-else-if="vue === 'documents'" class="dos-docs">
        <!-- tout est validé et le contrat signé : il ne reste que la validation du compte par BTM -->
        <p v-if="documents?.length && documents.every((d) => d.statut === 'valide') && demande.contrat_signe_le" class="dos-complet">
          <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
          <span><strong>Dossier complet</strong>Votre compte sera ouvert dès que l’équipe BTM l’aura validé.</span>
        </p>
        <p v-if="documents === null" class="dos-vide"><span class="spinner" aria-hidden="true"></span></p>
        <p v-else-if="!documents.length" class="dos-note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> BTM n’a pas encore demandé de pièce. Les documents demandés apparaîtront ici.</p>
        <ul class="dos-liste">
          <li v-for="d in documents || []" :key="d.id" class="dos-doc" :class="d.statut">
            <span class="dos-doc-icone"><i :class="iconeDocument(d.type)" aria-hidden="true"></i></span>
            <span class="dos-doc-texte">
              <strong>{{ d.libelle }}</strong>
              <small v-if="d.statut === 'refuse'" class="dos-motif">Refusé : {{ d.motif }}</small>
              <small v-else-if="d.nom_fichier"><button type="button" class="dos-lien" @click="ouvrirFichier(d)">{{ d.nom_fichier }}</button> · {{ STATUTS_DOCUMENT[d.statut].libelle }}</small>
              <small v-else>{{ d.consigne || STATUTS_DOCUMENT[d.statut].libelle }}</small>
            </span>
            <i v-if="d.statut === 'valide'" class="fa-solid fa-circle-check dos-ok" aria-label="Validé"></i>
            <label v-else class="dos-deposer" :class="{ principal: d.statut !== 'envoye' }">
              <span v-if="depot === d.id" class="spinner" aria-hidden="true"></span>
              <template v-else>{{ d.statut === 'envoye' ? 'Remplacer' : 'Déposer' }}</template>
              <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" class="visually-hidden" :disabled="!!depot" @change="choisirFichier(d, $event)" />
            </label>
          </li>
          <!-- toujours en dernier : le contrat à lire et signer -->
          <li class="dos-doc" :class="demande.contrat_signe_le ? 'valide' : 'a_fournir'">
            <span class="dos-doc-icone"><i class="fa-solid fa-file-signature" aria-hidden="true"></i></span>
            <span class="dos-doc-texte">
              <strong>Contrat de partenariat</strong>
              <small>{{ demande.contrat_signe_le ? `Signé par ${demande.contrat_signataire}` : 'À lire et signer en ligne' }}</small>
            </span>
            <button type="button" class="dos-deposer" :class="{ principal: !demande.contrat_signe_le }" @click="vue = 'contrat'">{{ demande.contrat_signe_le ? 'Relire' : 'Lire et signer' }}</button>
          </li>
        </ul>
        <p class="dos-note petite">PDF ou photo, 10 Mo au plus. Vos documents ne sont visibles que par l’équipe BTM.</p>
      </div>

      <!-- Contrat -->
      <template v-else>
        <button type="button" class="dos-retour" @click="vue = 'documents'"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i> Documents</button>
        <ContratPartenaire v-model:papier="papier" :demande="demande" @signe="apresSignature" />
      </template>

      <p v-if="erreur" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreur }}</p>
    </section>

    <!-- le contrat en PDF, bloc de la même taille à droite -->
    <ApercuContrat v-if="vue === 'contrat' && papier" class="dos-pdf" :demande="demande" @fermer="papier = false" />
  </div>
</template>

<style scoped>
.dos-voile {
  position: fixed; inset: 0; z-index: 260; display: flex; align-items: center; justify-content: center; gap: 20px; padding: 24px;
  background: rgba(17, 17, 17, .58); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); animation: dos-fondu .2s ease;
}
@keyframes dos-fondu { from { opacity: 0; } }
/* hauteur fixe : seuls la discussion et le texte du contrat défilent, dans leur cadre */
.dos {
  position: relative; display: flex; flex-direction: column; gap: 14px; width: min(100%, 540px); height: min(680px, calc(100dvh - 48px));
  padding: 24px 28px 22px; border-radius: 28px; background: var(--gris-50); color: var(--ardoise); box-shadow: 0 30px 80px rgba(17, 17, 17, .45);
  animation: dos-monter .34s cubic-bezier(.22, .61, .36, 1);
}
@keyframes dos-monter { from { transform: translateY(18px); opacity: 0; } }
/* contrat lu : deux blocs de la même taille, le dossier à gauche, le PDF à droite */
.dos-pdf { flex: none; width: min(540px, calc((100vw - 68px) / 2)); height: min(680px, calc(100dvh - 48px)); }
.avec-pdf .dos { width: min(540px, calc((100vw - 68px) / 2)); }
.dos-fermer { position: absolute; top: 16px; right: 16px; z-index: 2; display: grid; place-items: center; width: 40px; height: 40px; border: 0; border-radius: 50%; background: var(--gris-100); color: var(--ardoise); font-size: 1.05rem; cursor: pointer; }
.dos-fermer:hover { background: var(--gris-200); }
.dos-tete { padding-right: 48px; }
.dos-surtitre { margin: 0 0 4px; color: var(--lagon-700); font-size: .74rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.dos-titre { margin: 0; font-family: var(--font-display); font-size: 2rem; line-height: 1.1; color: var(--ardoise); }

.dos-onglets { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; border-radius: 999px; background: var(--gris-100); }
.dos-onglets button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 40px; border: 0; border-radius: 999px; background: none; color: var(--texte-secondaire); font: inherit; font-size: .9rem; font-weight: 700; cursor: pointer; }
.dos-onglets button[aria-selected="true"] { background: var(--carte); color: var(--ardoise); box-shadow: var(--ombre-sm); }
.dos-pastille { display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; background: #f59e0b; color: #fff; font-size: .72rem; font-weight: 800; }

/* discussion */
.dos-fil { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; padding: 4px 2px; scrollbar-width: thin; }
.dos-vide { display: flex; flex-direction: column; align-items: center; gap: 10px; margin: auto; padding: 20px; color: var(--texte-secondaire); font-size: .9rem; text-align: center; line-height: 1.5; }
.dos-vide i { color: var(--lagon-600); font-size: 1.6rem; }
.dos-message { max-width: 82%; padding: 10px 14px; border-radius: 16px 16px 16px 4px; background: var(--carte); box-shadow: var(--ombre-sm); }
.dos-message.fournisseur { align-self: flex-end; border-radius: 16px 16px 4px 16px; background: #1f1f1f; color: #fff; }
.dos-message p { margin: 0; font-size: .92rem; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
.dos-message small { display: block; margin-top: 4px; font-size: .72rem; opacity: .7; }
.dos-saisie { display: flex; align-items: flex-end; gap: 8px; }
.dos-saisie textarea {
  flex: 1; min-height: 48px; max-height: 120px; padding: 13px 16px; border: 1.5px solid var(--gris-300); border-radius: 24px; background: var(--carte);
  color: var(--texte); font: inherit; font-size: .95rem; resize: none; field-sizing: content;
}
.dos-saisie textarea:focus { outline: none; border-color: var(--lagon-500); box-shadow: 0 0 0 4px rgba(17, 17, 17, .18); }
.dos-envoyer { display: grid; place-items: center; flex: none; width: 48px; height: 48px; border: 0; border-radius: 50%; background: #1f1f1f; color: #fff; cursor: pointer; }
.dos-envoyer:disabled { opacity: .45; cursor: default; }

/* documents */
.dos-docs { display: flex; flex-direction: column; gap: 10px; min-height: 0; overflow-y: auto; }
.dos-liste { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.dos-doc { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1.5px solid var(--gris-200); border-radius: var(--rayon); background: var(--carte); }
.dos-doc.a_fournir, .dos-doc.refuse { border-color: rgba(245, 158, 11, .5); }
.dos-doc.valide { border-color: rgba(16, 185, 129, .4); }
.dos-doc-icone { display: grid; place-items: center; flex: none; width: 36px; height: 36px; border-radius: 10px; background: var(--gris-100); color: var(--ardoise); }
.dos-doc-texte { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.dos-doc-texte strong { font-size: .92rem; }
.dos-doc-texte small { color: var(--texte-secondaire); font-size: .8rem; overflow: hidden; text-overflow: ellipsis; }
.dos-motif { color: var(--erreur) !important; }
.dos-lien { padding: 0; border: 0; background: none; color: var(--lagon-700); font: inherit; font-weight: 600; text-decoration: underline; cursor: pointer; }
.dos-ok { color: #059669; font-size: 1.2rem; }
.dos-deposer {
  display: inline-grid; place-items: center; flex: none; min-width: 92px; min-height: 38px; padding: 0 14px; border: 1.5px solid var(--gris-300); border-radius: 999px;
  background: var(--carte); color: var(--ardoise); font: inherit; font-size: .85rem; font-weight: 700; cursor: pointer;
}
.dos-deposer.principal { border-color: #1f1f1f; background: #1f1f1f; color: #fff; }
.dos-note { display: flex; gap: 8px; margin: 0; color: var(--texte-secondaire); font-size: .88rem; line-height: 1.5; }
.dos-note i { margin-top: 3px; color: var(--lagon-600); }
.dos-note.petite { font-size: .78rem; }
.dos-complet { display: flex; gap: 10px; margin: 0; padding: 12px 14px; border: 1px solid rgba(16, 185, 129, .4); border-radius: var(--rayon); background: rgba(16, 185, 129, .08); color: var(--ardoise); font-size: .88rem; line-height: 1.45; }
.dos-complet i { margin-top: 2px; color: #059669; font-size: 1.1rem; }
.dos-complet strong { display: block; }
.dos-retour { align-self: flex-start; display: inline-flex; align-items: center; gap: 8px; height: 36px; margin-top: -4px; padding: 0 14px 0 10px; border: 0; border-radius: 999px; background: var(--gris-100); color: var(--ardoise); font: inherit; font-size: .85rem; font-weight: 600; cursor: pointer; }

/* écran étroit : le PDF prend la place du dossier */
@media (max-width: 899px) {
  .avec-pdf .dos { display: none; }
  .dos-pdf { width: min(100%, 540px); }
}
@media (max-width: 639px) {
  .dos-voile { align-items: flex-end; padding: 0; }
  .dos-pdf { width: 100%; height: calc(100dvh - 40px); }
  .dos { width: 100%; height: calc(100dvh - 40px); padding: 18px 18px calc(16px + env(safe-area-inset-bottom)); border-radius: 26px 26px 0 0; }
  .dos-titre { font-size: 1.6rem; }
  .dos-saisie textarea { font-size: 1rem; }
}
</style>

<script setup>
/**
 * Dossier de validation d'une entreprise, côté admin (Fournisseurs → Demandes → Dossier) :
 *  - Messages : écrire à l'entreprise ce qui manque pour valider son compte ;
 *  - Documents : demander des pièces (Kbis, identité, RIB, assurance ou autre), les ouvrir, les valider ou les refuser ;
 *  - Contrat : le texte et la signature de l'entreprise.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AdminPanneau from './AdminPanneau.vue'
import ContratPartenaire from '@/composants/commun/ContratPartenaire.vue'
import { useAdmin } from '@/composables/useAdmin.js'
import { DOCUMENTS, iconeDocument, STATUTS_DOCUMENT } from '@/donnees/documentsFournisseur.js'
import { listerMessages, envoyerMessage, marquerLus, listerDocuments, lienDocument, demanderDocuments, statuerDocument } from '@/services/supabase/serviceDossierFournisseur.js'

const props = defineProps({
  demande: { type: Object, required: true },
  onglet: { type: String, default: 'messages' }
})
const emit = defineEmits(['fermer', 'maj'])
const { notifier } = useAdmin()

const vue = ref(props.onglet)
const erreur = ref('')

// ---------- Messages ----------
const messages = ref(null)
const saisie = ref('')
const envoi = ref(false)
const fil = ref(null)
const defilerEnBas = () => nextTick(() => { if (fil.value) fil.value.scrollTop = fil.value.scrollHeight })
async function chargerMessages() {
  try {
    messages.value = await listerMessages(props.demande.id)
    if (vue.value === 'messages' && messages.value.some((m) => m.auteur === 'fournisseur' && !m.lu_le)) { await marquerLus(props.demande.id); emit('maj') }
  } catch (e) { messages.value = messages.value || []; erreur.value = e.message }
}
async function envoyer() {
  const t = saisie.value.trim()
  if (!t || envoi.value) return
  envoi.value = true
  try { await envoyerMessage(props.demande.id, t); saisie.value = ''; await chargerMessages(); defilerEnBas(); emit('maj') } catch (e) { erreur.value = e.message } finally { envoi.value = false }
}
const heure = (t) => new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

// ---------- Documents ----------
const documents = ref(null)
async function chargerDocuments() {
  try { documents.value = await listerDocuments(props.demande.id) } catch (e) { documents.value = documents.value || []; erreur.value = e.message }
}
// pièces déjà demandées (et pas refusées) : décochées et grisées dans la liste
const dejaDemandes = computed(() => new Set((documents.value || []).filter((d) => d.type !== 'autre' && d.statut !== 'refuse').map((d) => d.type)))
const choix = ref([])
const autre = ref('')
async function demander() {
  const liste = DOCUMENTS.filter((d) => choix.value.includes(d.type)).map(({ type, libelle, consigne }) => ({ type, libelle, consigne }))
  if (autre.value.trim().length >= 2) liste.push({ type: 'autre', libelle: autre.value.trim(), consigne: '' })
  if (!liste.length) { erreur.value = 'Choisissez au moins un document.'; return }
  try {
    await demanderDocuments(props.demande.id, liste)
    choix.value = []; autre.value = ''; erreur.value = ''
    await chargerDocuments()
    notifier(`${liste.length > 1 ? `${liste.length} documents demandés` : 'Document demandé'} : l’entreprise les voit dans son dossier.`)
    emit('maj')
  } catch (e) { erreur.value = e.message }
}
async function ouvrir(doc) {
  try { window.open(await lienDocument(doc.chemin), '_blank', 'noopener') } catch (e) { erreur.value = e.message }
}
const refus = ref(null) // { id, motif }
async function statuer(doc, decision, motif = '') {
  try {
    await statuerDocument(doc.id, decision, motif)
    refus.value = null
    await chargerDocuments()
    emit('maj')
  } catch (e) { erreur.value = e.message }
}

let minuterie = null
onMounted(async () => {
  await Promise.all([chargerMessages(), chargerDocuments()])
  defilerEnBas()
  minuterie = setInterval(() => { if (document.visibilityState === 'visible') { chargerMessages(); chargerDocuments() } }, 20000)
})
onBeforeUnmount(() => clearInterval(minuterie))
watch(vue, (v) => { erreur.value = ''; if (v === 'messages') { chargerMessages(); defilerEnBas() } })
</script>

<template>
  <AdminPanneau :titre="`Dossier · ${demande.entreprise}`" sous-titre="Échanges, pièces et contrat avant la validation du compte." large @fermer="emit('fermer')">
    <div class="doa">
      <div class="adm-segments doa-onglets" role="tablist">
        <button type="button" role="tab" :aria-selected="vue === 'messages'" @click="vue = 'messages'"><i class="fa-solid fa-comments" aria-hidden="true"></i> Messages</button>
        <button type="button" role="tab" :aria-selected="vue === 'documents'" @click="vue = 'documents'"><i class="fa-solid fa-folder-open" aria-hidden="true"></i> Documents <small>{{ documents?.length ?? '' }}</small></button>
        <button type="button" role="tab" :aria-selected="vue === 'contrat'" @click="vue = 'contrat'">
          <i class="fa-solid fa-file-signature" aria-hidden="true"></i> Contrat <i v-if="demande.contrat_signe_le" class="fa-solid fa-circle-check doa-signe" aria-label="signé"></i>
        </button>
      </div>

      <!-- Messages -->
      <template v-if="vue === 'messages'">
        <div ref="fil" class="doa-fil">
          <p v-if="messages === null" class="adm-vide"><span class="spinner" aria-hidden="true"></span></p>
          <p v-else-if="!messages.length" class="doa-vide">Pas encore de message. Écrivez à {{ demande.entreprise }} ce qu’il manque pour valider son compte.</p>
          <div v-for="m in messages" :key="m.id" class="doa-message" :class="m.auteur">
            <p>{{ m.texte }}</p>
            <small>{{ m.auteur === 'btm' ? 'BTM' : demande.entreprise }} · {{ heure(m.cree_le) }}<template v-if="m.auteur === 'btm'"> · {{ m.lu_le ? 'lu' : 'non lu' }}</template></small>
          </div>
        </div>
        <form class="doa-saisie" @submit.prevent="envoyer">
          <textarea v-model="saisie" rows="2" maxlength="2000" :placeholder="`Message à ${demande.entreprise}`" aria-label="Votre message" @keydown.enter.exact.prevent="envoyer"></textarea>
          <button type="submit" class="adm-btn adm-btn-noir" :disabled="!saisie.trim() || envoi"><span v-if="envoi" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-paper-plane" aria-hidden="true"></i> Envoyer</button>
        </form>
      </template>

      <!-- Documents -->
      <template v-else-if="vue === 'documents'">
        <section class="adm-carte doa-demande">
          <h3>Demander des documents</h3>
          <div class="doa-choix">
            <label v-for="d in DOCUMENTS" :key="d.type" class="doa-coche" :class="{ grise: dejaDemandes.has(d.type) }">
              <input v-model="choix" type="checkbox" :value="d.type" :disabled="dejaDemandes.has(d.type)" />
              <i :class="d.icone" aria-hidden="true"></i> {{ d.libelle }}<small v-if="dejaDemandes.has(d.type)"> · déjà demandé</small>
            </label>
            <input v-model="autre" class="doa-autre" maxlength="120" placeholder="Autre document (ex. : liste des tarifs pros)" aria-label="Autre document" />
          </div>
          <button type="button" class="adm-btn adm-btn-noir" :disabled="!choix.length && autre.trim().length < 2" @click="demander"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Demander</button>
        </section>

        <p v-if="documents && !documents.length" class="doa-vide">Aucun document demandé pour l’instant.</p>
        <ul v-else class="doa-liste">
          <li v-for="d in documents || []" :key="d.id" class="adm-carte doa-doc">
            <span class="doa-doc-icone"><i :class="iconeDocument(d.type)" aria-hidden="true"></i></span>
            <span class="doa-doc-texte">
              <strong>{{ d.libelle }}</strong>
              <small>
                <span class="doa-statut" :class="d.statut">{{ STATUTS_DOCUMENT[d.statut].libelle }}</span>
                <template v-if="d.nom_fichier"> · <button type="button" class="doa-lien" @click="ouvrir(d)">{{ d.nom_fichier }} <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></button></template>
                <template v-if="d.statut === 'refuse'"> · {{ d.motif }}</template>
              </small>
              <span v-if="refus?.id === d.id" class="doa-refus">
                <input v-model="refus.motif" maxlength="300" placeholder="Motif du refus (vu par l’entreprise)" aria-label="Motif du refus" />
                <button type="button" class="adm-btn adm-btn-danger" :disabled="refus.motif.trim().length < 3" @click="statuer(d, 'refuser', refus.motif)">Refuser</button>
                <button type="button" class="adm-btn adm-btn-clair" @click="refus = null">Annuler</button>
              </span>
            </span>
            <span v-if="refus?.id !== d.id" class="doa-actions">
              <template v-if="d.statut === 'envoye'">
                <button type="button" class="adm-btn adm-btn-clair" @click="refus = { id: d.id, motif: '' }">Refuser</button>
                <button type="button" class="adm-btn adm-btn-noir" @click="statuer(d, 'valider')"><i class="fa-solid fa-check" aria-hidden="true"></i> Valider</button>
              </template>
              <button v-if="d.statut !== 'valide'" type="button" class="adm-icone-btn danger" :aria-label="`Retirer ${d.libelle}`" title="Retirer la demande" @click="statuer(d, 'retirer')"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
            </span>
          </li>
        </ul>
      </template>

      <!-- Contrat -->
      <ContratPartenaire v-else :demande="demande" lecture-seule />

      <p v-if="erreur" class="adm-erreur-texte" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreur }}</p>
    </div>
  </AdminPanneau>
</template>

<style scoped>
.doa { display: flex; flex-direction: column; gap: 14px; min-height: 100%; }
.doa-onglets { align-self: flex-start; }
.doa-onglets button[aria-selected="true"] { background: var(--adm-noir); color: var(--adm-sur-noir); }
.doa-onglets i { margin-right: 4px; }
.doa-signe { color: #10b981; }
.doa-fil { display: flex; flex-direction: column; gap: 10px; min-height: 260px; max-height: 52vh; overflow-y: auto; padding: 4px 2px; }
.doa-vide { margin: 12px 0; color: var(--adm-muet); font-size: .88rem; text-align: center; }
.doa-message { max-width: 80%; padding: 10px 14px; border-radius: 16px 16px 16px 4px; background: var(--adm-ligne-2); color: var(--adm-encre); }
.doa-message.btm { align-self: flex-end; border-radius: 16px 16px 4px 16px; background: var(--adm-noir); color: var(--adm-sur-noir); }
.doa-message p { margin: 0; font-size: .9rem; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
.doa-message small { display: block; margin-top: 4px; font-size: .72rem; opacity: .7; }
.doa-saisie { display: flex; align-items: flex-end; gap: 8px; }
.doa-saisie textarea { flex: 1; padding: 10px 12px; border: 1px solid var(--adm-ligne-forte); border-radius: var(--adm-rayon-sm); background: var(--adm-champ); color: var(--adm-encre); font: inherit; resize: vertical; }
.doa-demande { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
.doa-demande h3 { margin: 0; font-size: .95rem; }
.doa-choix { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; }
.doa-coche { display: flex; align-items: center; gap: 8px; color: var(--adm-encre); font-size: .88rem; cursor: pointer; }
.doa-coche i { width: 16px; color: var(--adm-muet); text-align: center; }
.doa-coche.grise { color: var(--adm-muet); cursor: default; }
.doa-coche input { accent-color: var(--lagon-600); }
.doa-autre { grid-column: 1 / -1; padding: 9px 12px; border: 1px solid var(--adm-ligne-forte); border-radius: var(--adm-rayon-sm); background: var(--adm-champ); color: var(--adm-encre); font: inherit; }
.doa-demande .adm-btn { align-self: flex-start; }
.doa-liste { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.doa-doc { display: flex; align-items: center; gap: 12px; padding: 12px 14px; }
.doa-doc-icone { display: grid; place-items: center; flex: none; width: 36px; height: 36px; border-radius: 10px; background: var(--adm-ligne-2); color: var(--adm-encre); }
.doa-doc-texte { display: flex; flex: 1; flex-direction: column; gap: 4px; min-width: 0; }
.doa-doc-texte strong { color: var(--adm-encre); font-size: .9rem; }
.doa-doc-texte small { color: var(--adm-muet); font-size: .8rem; }
.doa-statut { font-weight: 700; }
.doa-statut.a_fournir { color: var(--adm-attention-texte); }
.doa-statut.envoye { color: var(--adm-info-texte); }
.doa-statut.valide { color: var(--adm-ok-texte); }
.doa-statut.refuse { color: var(--adm-baisse); }
.doa-lien { padding: 0; border: 0; background: none; color: var(--adm-info-texte); font: inherit; font-weight: 600; cursor: pointer; }
.doa-refus { display: flex; flex-wrap: wrap; gap: 8px; }
.doa-refus input { flex: 1; min-width: 180px; padding: 8px 10px; border: 1px solid var(--adm-ligne-forte); border-radius: var(--adm-rayon-sm); background: var(--adm-champ); color: var(--adm-encre); font: inherit; }
.doa-actions { display: flex; flex: none; align-items: center; gap: 8px; }
@media (max-width: 700px) {
  .doa-choix { grid-template-columns: 1fr; }
  .doa-doc { flex-wrap: wrap; }
}
</style>

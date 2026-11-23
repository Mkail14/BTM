<script setup>
/**
 * Demandes de comptes fournisseur (Admin → Fournisseurs → Demandes) : les entreprises qui ont créé leur compte
 * avec « Devenir partenaire ». Pour chacune : ses informations, le SIRET vérifié dans le registre public, puis
 *  - Valider : la fiche de l'annuaire est créée et le compte devient fournisseur (il rejoint aussitôt son espace) ;
 *  - Demander une rectification : message au fournisseur, qui corrige et renvoie sa demande ;
 *  - Refuser : avec un motif, affiché au fournisseur.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useAdmin, initiales } from '@/composables/useAdmin.js'
import AdminPanneau from './AdminPanneau.vue'
import { statuerDemande } from '@/services/supabase/serviceInscriptionFournisseur.js'
import { formaterSiret, lienAnnuaire, siretValide } from '@/services/entreprises.js'
import { reponse } from '@/donnees/questionnaireFournisseur.js'
import DossierAdminFournisseur from './DossierAdminFournisseur.vue'
import { supabase } from '@/services/supabase/client.js'

const props = defineProps({
  demandes: { type: Array, default: null }, // null : chargement
  categories: { type: Array, default: () => [] }
})
const emit = defineEmits(['maj'])
const { notifier } = useAdmin()

const STATUTS = {
  en_attente: { libelle: 'À examiner', classe: 'adm-badge-attention' },
  a_corriger: { libelle: 'Rectification demandée', classe: 'adm-badge-violet' },
  refusee: { libelle: 'Refusée', classe: '' },
  validee: { libelle: 'Validée', classe: 'adm-badge-ok' }
}
const filtre = ref('a_traiter')
const liste = computed(() => (props.demandes || []).filter((d) => filtre.value === 'toutes' || ['en_attente', 'a_corriger'].includes(d.statut)))
const nomCategorie = (id) => props.categories.find((c) => c.id === id)?.libelle || '—'
// toutes les catégories cochées à l'inscription (la première est la principale) ; anciennes demandes : la seule catégorie
const nomsCategories = (d) => (d.questionnaire?.categories?.length ? d.questionnaire.categories : [d.categorie_id]).map(nomCategorie).join(', ')
const date = (t) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

// ---------- Décision ----------
// ---------- Dossier de chaque demande : messages non lus de l'entreprise, pièces à vérifier (pastilles) ----------
const dossier = ref(null) // { demande, onglet }
const suivi = ref({}) // { [demande_id]: { messages, aVerifier } }
async function chargerSuivi() {
  const ids = (props.demandes || []).map((d) => d.id)
  if (!ids.length) return
  const [m, docs] = await Promise.all([
    supabase.from('messages_demande_fournisseur').select('demande_id').in('demande_id', ids).eq('auteur', 'fournisseur').is('lu_le', null),
    supabase.from('documents_demande_fournisseur').select('demande_id, statut').in('demande_id', ids)
  ])
  const s = {}
  for (const l of m.data || []) (s[l.demande_id] ||= { messages: 0, aVerifier: 0, documents: 0 }).messages++
  for (const l of docs.data || []) { const x = (s[l.demande_id] ||= { messages: 0, aVerifier: 0, documents: 0 }); x.documents++; if (l.statut === 'envoye') x.aVerifier++ }
  suivi.value = s
}
onMounted(chargerSuivi)
watch(() => props.demandes, chargerSuivi)
const demandeDossier = computed(() => (dossier.value ? (props.demandes || []).find((d) => d.id === dossier.value.demande.id) || dossier.value.demande : null))

const decision = ref(null) // { demande, type: 'valider' | 'corriger' | 'refuser', message, categorie, visible }
const erreur = ref('')
const envoi = ref(false)
function ouvrir(demande, type) {
  erreur.value = ''
  decision.value = { demande, type, message: type === 'corriger' ? '' : '', categorie: demande.categorie_id || props.categories[0]?.id || '', visible: true }
}
const TITRES = { valider: 'Valider le compte', corriger: 'Demander une rectification', refuser: 'Refuser la demande' }
async function confirmer() {
  const d = decision.value
  if (d.type === 'corriger' && d.message.trim().length < 5) { erreur.value = 'Expliquez au fournisseur ce qu’il doit corriger.'; return }
  envoi.value = true
  try {
    await statuerDemande(d.demande.id, d.type, { message: d.message.trim(), categorie: d.categorie, visible: d.visible })
    notifier(d.type === 'valider' ? `${d.demande.entreprise} est maintenant fournisseur : son espace est ouvert.`
      : d.type === 'corriger' ? 'Demande de rectification envoyée au fournisseur.' : 'Demande refusée.', d.type === 'refuser' ? 'info' : 'succes')
    decision.value = null
    emit('maj', d.type === 'valider')
  } catch (e) {
    erreur.value = e?.message || 'Opération impossible.'
  } finally {
    envoi.value = false
  }
}
</script>

<template>
  <div class="dem">
    <div class="dem-barre">
      <div class="adm-segments" role="group" aria-label="Demandes affichées">
        <button type="button" :aria-pressed="filtre === 'a_traiter'" @click="filtre = 'a_traiter'">À traiter</button>
        <button type="button" :aria-pressed="filtre === 'toutes'" @click="filtre = 'toutes'">Toutes</button>
      </div>
      <p class="dem-aide"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Les entreprises créent leur compte avec « Devenir partenaire ». Validez-le pour ouvrir leur espace.</p>
    </div>

    <div v-if="demandes === null" class="adm-carte adm-vide"><span class="spinner" aria-hidden="true"></span></div>
    <div v-else-if="!liste.length" class="adm-carte adm-vide">
      <i class="fa-solid fa-inbox" aria-hidden="true"></i>
      <p>{{ filtre === 'a_traiter' ? 'Aucune demande à traiter.' : 'Aucune demande de compte fournisseur pour l’instant.' }}</p>
    </div>

    <ul v-else class="dem-liste">
      <li v-for="d in liste" :key="d.id" class="adm-carte dem-carte" :class="d.statut">
        <header class="dem-tete">
          <span class="adm-avatar dem-avatar">{{ initiales(d.entreprise) }}</span>
          <span class="dem-titre">
            <strong>{{ d.entreprise }}</strong>
            <small>{{ nomsCategories(d) }} · {{ d.commune || 'commune non renseignée' }}</small>
          </span>
          <span class="adm-badge" :class="STATUTS[d.statut]?.classe">{{ STATUTS[d.statut]?.libelle }}</span>
        </header>

        <dl class="dem-infos">
          <div>
            <dt>SIRET</dt>
            <dd v-if="d.siret">
              <span class="adm-mono">{{ formaterSiret(d.siret) }}</span>
              <span v-if="!siretValide(d.siret)" class="dem-alerte">numéro invalide</span>
              <a :href="lienAnnuaire(d.siret)" target="_blank" rel="noopener noreferrer" class="dem-lien">Vérifier au registre <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>
            </dd>
            <dd v-else class="dem-alerte">non renseigné</dd>
          </div>
          <div v-if="d.contact_nom"><dt>Contact</dt><dd>{{ d.contact_nom }}</dd></div>
          <div><dt>Téléphone</dt><dd>{{ d.telephone || '—' }}</dd></div>
          <div><dt>E-mail</dt><dd><a :href="`mailto:${d.email}`" class="dem-lien">{{ d.email }}</a></dd></div>
          <div><dt>Adresse</dt><dd>{{ d.adresse || '—' }}</dd></div>
          <div><dt>Horaires</dt><dd>{{ d.horaires || '—' }}</dd></div>
          <div><dt>Livraison</dt><dd>{{ d.livraison ? 'Oui, sur les chantiers' : 'Non' }}</dd></div>
          <!-- questionnaire de l'inscription : équipe, logiciel (import du catalogue) -->
          <div><dt>Équipe</dt><dd>{{ reponse('equipe', d.questionnaire?.equipe) }}</dd></div>
          <div><dt>Logiciel</dt><dd>{{ reponse('logiciel', d.questionnaire?.logiciel) }}</dd></div>
          <div v-if="d.description" class="plein"><dt>Activité</dt><dd>{{ d.description }}</dd></div>
        </dl>

        <p v-if="d.message_admin && d.statut !== 'validee'" class="dem-message">
          <i class="fa-solid fa-comment-dots" aria-hidden="true"></i>
          <span><strong>{{ d.statut === 'refusee' ? 'Motif du refus' : d.statut === 'a_corriger' ? 'Rectification demandée' : 'Rectification demandée, corrigée depuis' }}</strong>{{ d.message_admin }}</span>
        </p>

        <footer class="dem-pied">
          <small>Demande du {{ date(d.cree_le) }}<template v-if="d.mis_a_jour_le !== d.cree_le"> · mise à jour le {{ date(d.mis_a_jour_le) }}</template></small>
          <span v-if="d.statut !== 'validee'" class="dem-actions">
            <!-- dossier : messages, pièces demandées et contrat signé -->
            <button type="button" class="adm-btn adm-btn-clair dem-dossier" @click="dossier = { demande: d, onglet: suivi[d.id]?.aVerifier ? 'documents' : 'messages' }">
              <i class="fa-solid fa-folder-open" aria-hidden="true"></i> Dossier
              <b v-if="(suivi[d.id]?.messages || 0) + (suivi[d.id]?.aVerifier || 0)" class="dem-pastille">{{ (suivi[d.id]?.messages || 0) + (suivi[d.id]?.aVerifier || 0) }}</b>
              <i v-if="d.contrat_signe_le" class="fa-solid fa-file-signature dem-signe" title="Contrat signé" aria-label="Contrat signé"></i>
            </button>
            <button v-if="d.statut !== 'refusee'" type="button" class="adm-btn adm-btn-clair" @click="ouvrir(d, 'corriger')"><i class="fa-solid fa-pen" aria-hidden="true"></i> Demander une rectification</button>
            <button v-if="d.statut !== 'refusee'" type="button" class="adm-btn adm-btn-danger" @click="ouvrir(d, 'refuser')">Refuser</button>
            <button type="button" class="adm-btn adm-btn-noir" @click="ouvrir(d, 'valider')"><i class="fa-solid fa-check" aria-hidden="true"></i> Valider</button>
          </span>
        </footer>
      </li>
    </ul>

    <DossierAdminFournisseur v-if="dossier" :demande="demandeDossier" :onglet="dossier.onglet" @fermer="dossier = null; chargerSuivi()" @maj="chargerSuivi" />

    <AdminPanneau v-if="decision" :titre="TITRES[decision.type]" :sous-titre="decision.demande.entreprise" @fermer="decision = null">
      <form id="form-decision" class="adm-grille-form" novalidate @submit.prevent="confirmer">
        <template v-if="decision.type === 'valider'">
          <p class="plein dem-explication">La fiche de <strong>{{ decision.demande.entreprise }}</strong> est créée dans l’annuaire avec ses informations, et son compte devient fournisseur : il accède aussitôt à son espace (catalogue, caisse, paiements).</p>
          <div class="adm-champ plein">
            <label for="dec-cat">Catégorie dans l’annuaire</label>
            <select id="dec-cat" v-model="decision.categorie"><option v-for="c in categories" :key="c.id" :value="c.id">{{ c.libelle }}</option></select>
          </div>
          <label class="plein dem-option"><button type="button" role="switch" class="adm-interrupteur" :aria-checked="decision.visible" @click="decision.visible = !decision.visible"></button> Visible dans l’annuaire dès maintenant</label>
          <p v-if="!decision.demande.contrat_signe_le" class="plein adm-alerte dem-sans-contrat"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Le contrat de partenariat n’est pas encore signé par l’entreprise.</p>
        </template>
        <div v-else class="adm-champ plein">
          <label for="dec-msg">{{ decision.type === 'corriger' ? 'Ce que le fournisseur doit corriger *' : 'Motif du refus (facultatif)' }}</label>
          <textarea id="dec-msg" v-model="decision.message" rows="4" maxlength="500" :placeholder="decision.type === 'corriger' ? 'Ex. : le SIRET ne correspond pas à votre entreprise, merci de le vérifier.' : 'Ex. : activité sans lien avec les matériaux de construction.'"></textarea>
          <span class="adm-champ-aide"><span>Affiché au fournisseur sur sa page de suivi.</span><span>{{ decision.message.length }} / 500</span></span>
        </div>
      </form>
      <p v-if="erreur" class="adm-erreur-texte" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreur }}</p>
      <template #pied>
        <button type="button" class="adm-btn adm-btn-clair" @click="decision = null">Annuler</button>
        <button type="submit" form="form-decision" class="adm-btn" :class="decision.type === 'refuser' ? 'adm-btn-danger' : 'adm-btn-noir'" :disabled="envoi">
          <span v-if="envoi" class="spinner" aria-hidden="true"></span>
          {{ decision.type === 'valider' ? 'Valider et ouvrir son espace' : decision.type === 'corriger' ? 'Envoyer la demande' : 'Refuser' }}
        </button>
      </template>
    </AdminPanneau>
  </div>
</template>

<style scoped>
.dem { display: flex; flex-direction: column; gap: 14px; }
.dem-barre { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; }
.dem-barre .adm-segments button[aria-pressed="true"] { background: var(--adm-noir); color: var(--adm-sur-noir); }
.dem-aide { display: flex; gap: 8px; margin: 0; color: var(--adm-muet); font-size: .82rem; }
.dem-aide i { margin-top: 3px; }
.dem-liste { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 14px; margin: 0; padding: 0; list-style: none; }
.dem-carte { display: flex; flex-direction: column; gap: 14px; padding: 20px; }
.dem-carte.en_attente { box-shadow: inset 3px 0 0 #f59e0b, var(--adm-ombre); }
.dem-tete { display: flex; align-items: center; gap: 12px; }
.dem-avatar { width: 44px; height: 44px; flex: none; }
.dem-titre { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.dem-titre strong { color: var(--adm-encre); font-size: 1.05rem; }
.dem-titre small { color: var(--adm-muet); font-size: .82rem; }
.dem-infos { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; margin: 0; }
.dem-infos .plein { grid-column: 1 / -1; }
.dem-infos dt { color: var(--adm-muet); font-size: .74rem; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.dem-infos dd { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin: 2px 0 0; color: var(--adm-encre); font-size: .9rem; overflow-wrap: anywhere; }
.dem-lien { color: var(--adm-info-texte); font-size: .84rem; font-weight: 600; }
.dem-alerte { color: var(--adm-baisse); font-size: .82rem; font-weight: 600; }
.dem-message { display: flex; gap: 10px; margin: 0; padding: 12px 14px; border-radius: 14px; background: var(--adm-attention-fond); color: var(--adm-encre); font-size: .88rem; line-height: 1.5; }
.dem-message i { margin-top: 3px; color: var(--adm-attention-texte); }
.dem-message strong { display: block; font-size: .78rem; }
.dem-pied { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding-top: 12px; border-top: 1px solid var(--adm-ligne); }
.dem-pied small { color: var(--adm-muet); font-size: .78rem; }
.dem-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.dem-dossier { position: relative; }
.dem-pastille { display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; background: #f59e0b; color: #fff; font-size: .72rem; font-weight: 800; }
.dem-signe { color: var(--adm-ok-texte); }
.dem-sans-contrat { margin: 0; }
.dem-explication { margin: 0; color: var(--adm-encre-2); font-size: .9rem; line-height: 1.55; }
.dem-option { display: flex; align-items: center; gap: 10px; color: var(--adm-encre); font-size: .9rem; }
@media (max-width: 700px) {
  .dem-liste { grid-template-columns: 1fr; }
  .dem-infos { grid-template-columns: 1fr; }
  .dem-actions { width: 100%; }
  .dem-actions .adm-btn { flex: 1; justify-content: center; }
}
</style>

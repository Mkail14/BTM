<script setup>
/** Projets enregistrés : filtres par ouvrage, détail complet d'une estimation, suppression */
import { computed, onMounted, ref } from 'vue'
import { useAdmin, formatDate, correspond } from '@/composables/useAdmin.js'
import { typesProjets, trouverTypeProjet } from '@/donnees/typesProjets.js'
import { formaterEuros, formaterQuantite, resumerDimensions, detailPrix } from '@/services/calculs/moteurCalculs.js'
import { useContenuSite } from '@/composables/useContenuSite.js'
import AdminPanneau from './AdminPanneau.vue'

const { api, donnees, erreurs, charger, recherche, confirmer, executer, notifier } = useAdmin()
onMounted(() => charger(['projets', 'profils', 'fournisseurs', 'paiements'], { force: true }))

const filtre = ref('')
const statut = ref('tous') // tous | attente | paye
const tri = ref('recent')
const nomProfil = computed(() => Object.fromEntries((donnees.profils || []).map((p) => [p.id, p.nom_affiche || p.email])))
const nomFournisseur = computed(() => Object.fromEntries((donnees.fournisseurs || []).map((f) => [f.id, f.nom])))

// Paiement confirmé par le fournisseur choisi (lui seul sait si le client a payé) → revenu encaissé ; sinon prévisionnel
const paiementDe = computed(() => Object.fromEntries((donnees.paiements || []).filter((pa) => pa.projet_id).map((pa) => [pa.projet_id, pa])))
const correspondStatut = (p) => statut.value === 'tous' || (statut.value === 'paye') === !!paiementDe.value[p.id]
const compteStatut = (s) => (donnees.projets || []).filter((p) => s === 'tous' || (s === 'paye') === !!paiementDe.value[p.id]).length

const liste = computed(() => {
  const l = (donnees.projets || []).filter((p) => (!filtre.value || p.type_projet_id === filtre.value) && correspondStatut(p)
    && correspond(recherche.value, p.nom, nomProfil.value[p.utilisateur_id], trouverTypeProjet(p.type_projet_id)?.libelle, nomFournisseur.value[p.fournisseur_id]))
  return tri.value === 'montant' ? [...l].sort((a, b) => Number(b.cout_total) - Number(a.cout_total)) : l
})
const total = computed(() => liste.value.reduce((s, p) => s + Number(p.cout_total || 0), 0))
// Commission BTM attendue sur le devis (payée par le fournisseur à l'encaissement), au taux actuel
const contenu = useContenuSite()
const fraisDe = (p) => (Number(p.cout_total || 0) * (Number(contenu.frais.taux) || 0)) / 100
const totalFrais = computed(() => liste.value.reduce((s, p) => s + (paiementDe.value[p.id]?.revenu_btm ?? fraisDe(p)), 0))

// ---------- Détail ----------
const detail = ref(null)
async function ouvrir(p) {
  detail.value = { ...p, chargement: true }
  try {
    detail.value = { ...(await api.lireProjet(p.id)), chargement: false }
  } catch (e) {
    detail.value = null
    notifier(e?.message || 'Lecture impossible.', 'erreur')
  }
}


async function supprimer(p) {
  if (!(await confirmer({ titre: `Supprimer « ${p.nom} » ?`, texte: `Le projet de ${nomProfil.value[p.utilisateur_id] || 'cet utilisateur'} sera supprimé définitivement de son espace.`, libelle: 'Supprimer', danger: true }))) return
  const ok = await executer(async () => { await api.supprimerProjet(p.id); donnees.projets = donnees.projets.filter((x) => x.id !== p.id) }, 'Projet supprimé.')
  if (ok && detail.value?.id === p.id) detail.value = null
}
</script>

<template>
  <div class="projets">
    <p v-if="erreurs.projets" class="adm-alerte" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.projets }}</p>

    <div class="projets-filtres">
      <div class="adm-pilules" role="group" aria-label="Filtrer par paiement">
        <button type="button" class="adm-pilule" :class="{ actif: statut === 'tous' }" :aria-pressed="statut === 'tous'" @click="statut = 'tous'">Tous <small>{{ compteStatut('tous') }}</small></button>
        <button type="button" class="adm-pilule" :class="{ actif: statut === 'attente' }" :aria-pressed="statut === 'attente'" @click="statut = 'attente'"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> En attente de paiement <small>{{ compteStatut('attente') }}</small></button>
        <button type="button" class="adm-pilule" :class="{ actif: statut === 'paye' }" :aria-pressed="statut === 'paye'" @click="statut = 'paye'"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Payés <small>{{ compteStatut('paye') }}</small></button>
      </div>
      <div class="projets-selects">
        <select v-model="filtre" class="adm-saisie" aria-label="Ouvrage">
          <option value="">Tous les ouvrages</option>
          <option v-for="t in typesProjets" :key="t.id" :value="t.id">{{ t.libelle }}</option>
        </select>
        <select v-model="tri" class="adm-saisie" aria-label="Trier">
          <option value="recent">Plus récents</option>
          <option value="montant">Montant le plus élevé</option>
        </select>
      </div>
    </div>

    <section class="adm-carte">
      <div v-if="!donnees.projets" class="adm-chargement"><span class="spinner spinner-grand"></span></div>
      <div v-else class="adm-table-cadre">
        <table class="adm-table adm-table-empile">
          <thead><tr><th>Projet</th><th>Client</th><th>Fournisseur choisi</th><th>Créé le</th><th class="num">Devis client</th><th class="num">Revenu BTM</th><th><span class="visually-hidden">Actions</span></th></tr></thead>
          <tbody>
            <tr v-for="p in liste" :key="p.id" class="projets-ligne" @click="ouvrir(p)">
              <td class="principal">
                <span class="adm-identite">
                  <span class="adm-avatar"><i :class="trouverTypeProjet(p.type_projet_id)?.icone || 'fa-solid fa-folder'" aria-hidden="true"></i></span>
                  <span><strong>{{ p.nom }}</strong><small>{{ trouverTypeProjet(p.type_projet_id)?.libelle || p.type_projet_id }}</small></span>
                </span>
              </td>
              <td data-label="Client">{{ nomProfil[p.utilisateur_id] || 'Compte supprimé' }}</td>
              <td data-label="Fournisseur">{{ nomFournisseur[p.fournisseur_id] || '—' }}</td>
              <td data-label="Créé le">{{ formatDate(p.cree_le) }}</td>
              <td data-label="Devis client" class="num">{{ formaterEuros(p.cout_total) }}</td>
              <td data-label="Revenu BTM" class="num">
                <strong>{{ formaterEuros(paiementDe[p.id]?.revenu_btm ?? fraisDe(p)) }}</strong>
                <small v-if="paiementDe[p.id]" class="statut paye"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> payé le {{ formatDate(paiementDe[p.id].paye_le, { day: 'numeric', month: 'short' }) }}</small>
                <small v-else class="statut attente">{{ p.fournisseur_id ? 'en attente de paiement' : 'aucun fournisseur choisi' }}</small>
              </td>
              <td class="actions" @click.stop>
                <button type="button" class="adm-icone-btn" title="Voir le détail" :aria-label="`Voir ${p.nom}`" @click="ouvrir(p)"><i class="fa-solid fa-eye"></i></button>
                <button type="button" class="adm-icone-btn danger" title="Supprimer" :aria-label="`Supprimer ${p.nom}`" @click="supprimer(p)"><i class="fa-solid fa-trash-can"></i></button>
              </td>
            </tr>
          </tbody>
          <tfoot v-if="liste.length">
            <tr><td colspan="4">{{ liste.length }} projet{{ liste.length > 1 ? 's' : '' }}</td><td class="num">{{ formaterEuros(total) }}</td><td class="num"><strong>{{ formaterEuros(totalFrais) }}</strong></td><td></td></tr>
          </tfoot>
        </table>
        <div v-if="!liste.length" class="adm-vide"><i class="fa-regular fa-folder-open"></i><p>Aucun projet ne correspond.</p></div>
      </div>
    </section>

    <AdminPanneau v-if="detail" large :titre="detail.nom" :sous-titre="`${trouverTypeProjet(detail.type_projet_id)?.libelle || detail.type_projet_id} · ${nomProfil[detail.utilisateur_id] || 'Compte supprimé'} · ${formatDate(detail.cree_le)}`" @fermer="detail = null">
      <div v-if="detail.chargement" class="adm-chargement"><span class="spinner spinner-grand"></span></div>
      <template v-else>
        <div class="detail-total">
          <small>Total estimé</small>
          <strong>{{ formaterEuros(detail.resultat?.total ?? detail.cout_total) }}</strong>
          <span>{{ resumerDimensions(detail.type_projet_id, detail.dimensions) }}</span>
        </div>

        <h3 class="detail-titre">Matériaux</h3>
        <table v-if="detail.resultat?.lignes?.length" class="adm-table detail-table">
          <thead><tr><th>Matériau</th><th class="num">Quantité</th><th class="num">Prix u.</th><th class="num">Sous-total</th></tr></thead>
          <tbody>
            <tr v-for="l in detail.resultat.lignes" :key="l.id"><td>{{ l.libelle }}</td><td class="num">{{ formaterQuantite(l.quantite, l.unite) }}</td><td class="num">{{ formaterEuros(l.prixUnitaire) }}</td><td class="num">{{ formaterEuros(l.sousTotal) }}</td></tr>
          </tbody>
        </table>
        <p v-else class="adm-vide">Détail des matériaux indisponible.</p>

        <dl v-if="detail.resultat" class="detail-synthese">
          <div v-for="l in detailPrix(detail.resultat)" :key="l.cle" :class="{ 'detail-frais': l.cle === 'frais' }">
            <dt>{{ l.label }} <small v-if="l.cle === 'frais'">Revenu BTM sur ce devis</small></dt>
            <dd>{{ formaterEuros(l.valeur) }}</dd>
          </div>
          <div class="detail-grand-total"><dt>Total payé par le client</dt><dd>{{ formaterEuros(detail.resultat.total) }}</dd></div>
        </dl>
        <p class="detail-note">
          Montant calculé avec les prix en vigueur le {{ formatDate(detail.resultat?.calculeLe || detail.cree_le) }}.
          Commission BTM attendue : {{ formaterEuros(fraisDe(detail)) }}, payée par le fournisseur à l’encaissement.
        </p>

        <!-- Paiement : prévisionnel tant que le fournisseur (ou l'admin) n'a pas confirmé -->
        <div class="detail-paiement" :class="paiementDe[detail.id] ? 'paye' : 'attente'">
          <i :class="paiementDe[detail.id] ? 'fa-solid fa-circle-check' : 'fa-solid fa-hourglass-half'" aria-hidden="true"></i>
          <div v-if="paiementDe[detail.id]">
            <strong>Payé — {{ formaterEuros(paiementDe[detail.id].revenu_btm) }} encaissés</strong>
            <small>Confirmé le {{ formatDate(paiementDe[detail.id].paye_le, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</small>
          </div>
          <div v-else>
            <strong>En attente de paiement — revenu prévisionnel</strong>
            <small>{{ detail.fournisseur_id ? `${nomFournisseur[detail.fournisseur_id] || 'Le fournisseur'} encaissera le paiement au comptoir, avec le code de retrait du client.` : 'Le client n’a choisi aucun fournisseur : ce revenu reste prévisionnel jusqu’à ce qu’un fournisseur encaisse le devis avec son code de retrait.' }}</small>
          </div>
        </div>
      </template>
      <template #pied>
        <button type="button" class="adm-btn adm-btn-danger" :disabled="detail.chargement" @click="supprimer(detail)"><i class="fa-solid fa-trash-can" aria-hidden="true"></i> Supprimer</button>
        <button type="button" class="adm-btn adm-btn-noir" @click="detail = null">Fermer</button>
      </template>
    </AdminPanneau>
  </div>
</template>

<style scoped>
.projets { display: flex; flex-direction: column; gap: 16px; }
.projets-filtres { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
.projets-ligne { cursor: pointer; }
.adm-table tfoot td { padding: 14px 16px; border-top: 1px solid var(--adm-ligne); color: var(--adm-encre-2); font-size: .86rem; }
.adm-table td .adm-avatar { width: 38px; height: 38px; }
@media (max-width: 760px) { .adm-table tfoot { display: none; } }

.detail-total { display: flex; flex-direction: column; gap: 4px; padding: 20px 22px; border-radius: 18px; background: var(--adm-noir); color: #fff; }
.detail-total small { font-size: .8rem; color: rgba(255, 255, 255, .6); }
.detail-total strong { font-size: 2rem; font-weight: 600; letter-spacing: -.02em; }
.detail-total span { font-size: .86rem; color: rgba(255, 255, 255, .7); }
.detail-titre { margin: 24px 0 8px; font-family: var(--font-corps); font-size: .95rem; font-weight: 600; letter-spacing: 0; }
.detail-table th, .detail-table td { padding: 10px 8px; }
.detail-synthese { margin: 16px 0 0; padding: 14px 18px; border-radius: 16px; background: var(--adm-ligne-2); }
.detail-synthese div { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; font-size: .9rem; }
.detail-synthese dt small { display: block; color: var(--adm-muet); font-size: .76rem; }
.detail-synthese dd { margin: 0; font-variant-numeric: tabular-nums; }
.detail-frais { margin: 4px -10px; padding: 8px 10px !important; border-radius: 10px; background: var(--adm-carte); font-weight: 600; }
.detail-grand-total { margin-top: 6px; padding-top: 12px !important; border-top: 1px solid var(--adm-ligne); font-weight: 700; }
.detail-note { margin: 14px 0 0; color: var(--adm-muet); font-size: .8rem; }
.detail-paiement { display: flex; align-items: flex-start; gap: 12px; margin-top: 18px; padding: 14px 16px; border-radius: 14px; }
.detail-paiement i { margin-top: 3px; font-size: 1.1rem; }
.detail-paiement div { display: flex; flex-direction: column; gap: 2px; }
.detail-paiement small { font-size: .82rem; opacity: .85; }
.detail-paiement.paye { background: var(--adm-ok-fond); color: var(--adm-ok-texte); }
.detail-paiement.attente { background: var(--adm-attention-fond); color: var(--adm-attention-texte-2); }
.projets-selects { display: flex; gap: 8px; }
.projets-selects .adm-saisie { width: auto; min-height: 38px; padding: 6px 12px; border-radius: 999px; font-size: .86rem; }
.statut { display: block; margin-top: 2px; font-size: .74rem; font-weight: 600; white-space: nowrap; }
.statut.paye { color: var(--adm-hausse); }
.statut.attente { color: var(--adm-muet); font-weight: 500; }
</style>

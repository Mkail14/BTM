<script setup>
/**
 * Utilisateurs : filtres par rôle, modification (fonction serveur admin-utilisateurs, qui revérifie le rôle),
 * e-mail de réinitialisation du mot de passe.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useAdmin, formatDate, initiales, correspond } from '@/composables/useAdmin.js'
import { useAuth } from '@/composables/useAuth.js'
import ChampTelephone from '@/composants/commun/ChampTelephone.vue'
import AdminPanneau from './AdminPanneau.vue'
import { formaterSiret, lienAnnuaire, rechercherSiret } from '@/services/entreprises.js'

const { api, donnees, erreurs, charger, recherche, confirmer, executer, notifier } = useAdmin()
const { utilisateur: moi } = useAuth()
onMounted(() => charger(['profils', 'projets', 'fournisseurs'], { force: true }))
const nomFournisseur = computed(() => Object.fromEntries((donnees.fournisseurs || []).map((f) => [f.id, f.nom])))

const ROLES = { admin: { label: 'Administrateur', classe: 'adm-badge-noir' }, fournisseur: { label: 'Fournisseur', classe: 'adm-badge-info' }, user: { label: 'Utilisateur', classe: '' } }
const TYPES = { particulier: 'Particulier', professionnel: 'Professionnel', fournisseur: 'Fournisseur' }
const filtre = ref('')

const projetsPar = computed(() => {
  const n = {}
  for (const p of donnees.projets || []) n[p.utilisateur_id] = (n[p.utilisateur_id] || 0) + 1
  return n
})
const compte = (role) => (donnees.profils || []).filter((p) => !role || p.role === role).length
// filtre : un rôle, ou « pro_attente » (comptes professionnels à vérifier)
const correspondFiltre = (p) => !filtre.value || (filtre.value === 'pro_attente' ? p.pro_statut === 'en_attente' : p.role === filtre.value)
const aVerifier = computed(() => (donnees.profils || []).filter((p) => p.pro_statut === 'en_attente').length)
const liste = computed(() => (donnees.profils || []).filter((p) => correspondFiltre(p) && correspond(recherche.value, p.email, p.nom_affiche, ROLES[p.role]?.label, TYPES[p.type_profil], p.pro_raison_sociale, p.pro_siret)))
const STATUTS_PRO = { en_attente: { label: 'à vérifier', classe: 'adm-badge-attention' }, verifie: { label: 'vérifié', classe: 'adm-badge-ok' }, refuse: { label: 'refusé', classe: '' } }

// ---------- Modification ----------
const edition = ref(null)
const editionErreur = ref('')
const enregistrement = ref(false)
const telephoneValide = ref(true)

async function ouvrir(p) {
  editionErreur.value = ''
  edition.value = { id: p.id, email: p.email, chargement: true }
  try {
    edition.value = { ...(await api.lireUtilisateur(p.id)), fournisseur_id: p.fournisseur_id || '', chargement: false }
  } catch (e) {
    editionErreur.value = `${e?.message || 'Lecture impossible.'} Seuls les champs du profil sont modifiables.`
    edition.value = { id: p.id, email: p.email, pseudo: '', prenom: '', nom: '', telephone: '', role: p.role, type_profil: p.type_profil, fournisseur_id: p.fournisseur_id || '', chargement: false }
  }
}

async function enregistrer() {
  const u = edition.value
  editionErreur.value = ''
  if (!telephoneValide.value) { editionErreur.value = 'Numéro de téléphone incomplet ou invalide.'; return }
  if (!u.email?.trim()) { editionErreur.value = 'L’adresse e-mail est obligatoire.'; return }
  if (u.role === 'fournisseur' && !u.fournisseur_id) { editionErreur.value = 'Choisissez l’entreprise de l’annuaire que ce compte représente.'; return }
  const ancien = donnees.profils.find((p) => p.id === u.id)
  if (u.role === 'admin' && ancien?.role !== 'admin'
    && !(await confirmer({ titre: 'Donner les droits administrateur ?', texte: `${u.email} pourra modifier tout le site, les prix et les comptes.`, libelle: 'Confirmer' }))) return
  enregistrement.value = true
  try {
    const { id, chargement: _c, derniereConnexion: _d, fournisseur_id: fournisseurId, ...champs } = u
    await api.modifierUtilisateur(id, champs)
    // compte fournisseur : lien avec la fiche de l'annuaire (fonction SQL réservée à l'admin)
    const lienVoulu = champs.role === 'fournisseur' ? fournisseurId : null
    if ((ancien?.fournisseur_id || null) !== (lienVoulu || null)) await api.lierCompteFournisseur(id, lienVoulu)
    edition.value = null
    notifier('Utilisateur mis à jour.')
    await charger(['profils'], { force: true })
  } catch (e) {
    editionErreur.value = e?.message || 'Enregistrement impossible.'
  } finally {
    enregistrement.value = false
  }
}

// ---------- Vérification des comptes professionnels ----------
const profilEdite = computed(() => (edition.value ? (donnees.profils || []).find((p) => p.id === edition.value.id) : null))
const registre = ref({ etat: '', donnees: null }) // '' | 'recherche' | 'trouvee' | 'inconnue' | 'indisponible'
const refus = ref(null) // motif en cours de saisie
const decisionEnCours = ref(false)

async function consulterRegistre(siret) {
  registre.value = { etat: 'recherche', donnees: null }
  try {
    const d = await rechercherSiret(siret)
    registre.value = d ? { etat: 'trouvee', donnees: d } : { etat: 'inconnue', donnees: null }
  } catch (e) {
    registre.value = { etat: 'indisponible', donnees: e.message }
  }
}
watch(() => profilEdite.value?.id, () => {
  refus.value = null
  registre.value = { etat: '', donnees: null }
  if (profilEdite.value?.pro_siret) consulterRegistre(profilEdite.value.pro_siret)
})

async function statuer(decision) {
  const p = profilEdite.value
  if (decision === 'refuse' && !refus.value?.trim()) { notifier('Indiquez le motif du refus : il sera affiché à l’utilisateur.', 'erreur'); return }
  decisionEnCours.value = true
  const ok = await executer(async () => {
    await api.statuerVerificationPro(p.id, decision, decision === 'refuse' ? refus.value.trim() : null)
    Object.assign(p, { pro_statut: decision, pro_statue_le: new Date().toISOString(), pro_motif_refus: decision === 'refuse' ? refus.value.trim() : null })
  }, decision === 'verifie' ? `${p.pro_raison_sociale} est vérifié : compte professionnel actif.` : 'Demande refusée : l’utilisateur voit le motif dans son profil.')
  if (ok) refus.value = null
  decisionEnCours.value = false
}

async function reinitialiser(p) {
  if (!(await confirmer({ titre: 'Réinitialiser le mot de passe ?', texte: `Un e-mail avec un lien pour choisir un nouveau mot de passe sera envoyé à ${p.email}.`, libelle: 'Envoyer l’e-mail' }))) return
  await executer(async () => { const r = await api.reinitialiserMotDePasse(p.id); notifier(r?.message || 'E-mail envoyé.') })
}
</script>

<template>
  <div class="utils">
    <p v-if="erreurs.profils" class="adm-alerte" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.profils }}</p>

    <div class="adm-pilules" role="group" aria-label="Filtrer par rôle">
      <button type="button" class="adm-pilule" :class="{ actif: !filtre }" :aria-pressed="!filtre" @click="filtre = ''">Tous <small>{{ compte() }}</small></button>
      <button v-for="(r, id) in ROLES" :key="id" type="button" class="adm-pilule" :class="{ actif: filtre === id }" :aria-pressed="filtre === id" @click="filtre = id">{{ r.label }}s <small>{{ compte(id) }}</small></button>
      <button type="button" class="adm-pilule" :class="{ actif: filtre === 'pro_attente', 'pilule-alerte': aVerifier && filtre !== 'pro_attente' }" :aria-pressed="filtre === 'pro_attente'" @click="filtre = 'pro_attente'"><i class="fa-solid fa-helmet-safety" aria-hidden="true"></i> Pros à vérifier <small>{{ aVerifier }}</small></button>
    </div>

    <section class="adm-carte">
      <div v-if="!donnees.profils" class="adm-chargement"><span class="spinner spinner-grand"></span></div>
      <div v-else class="adm-table-cadre">
        <table class="adm-table adm-table-empile">
          <thead><tr><th>Utilisateur</th><th>Profil</th><th>Rôle</th><th class="num">Projets</th><th>Inscrit le</th><th><span class="visually-hidden">Actions</span></th></tr></thead>
          <tbody>
            <tr v-for="p in liste" :key="p.id">
              <td class="principal">
                <span class="adm-identite">
                  <span class="adm-avatar rond">{{ initiales(p.nom_affiche || p.email) }}</span>
                  <span><strong>{{ p.nom_affiche || '—' }} <span v-if="p.id === moi?.id" class="utils-moi">vous</span></strong><small>{{ p.email }}</small></span>
                </span>
              </td>
              <td data-label="Profil">
                {{ TYPES[p.type_profil] || p.type_profil }}
                <span v-if="p.pro_statut" class="adm-badge" :class="STATUTS_PRO[p.pro_statut]?.classe">{{ STATUTS_PRO[p.pro_statut]?.label }}</span>
                <small v-if="p.pro_raison_sociale" class="utils-lien">{{ p.pro_raison_sociale }}</small>
              </td>
              <td data-label="Rôle">
                <span class="adm-badge" :class="ROLES[p.role]?.classe">{{ ROLES[p.role]?.label || p.role }}</span>
                <small v-if="p.role === 'fournisseur'" class="utils-lien">{{ nomFournisseur[p.fournisseur_id] || 'aucune entreprise liée' }}</small>
              </td>
              <td data-label="Projets" class="num">{{ projetsPar[p.id] || 0 }}</td>
              <td data-label="Inscrit le">{{ formatDate(p.cree_le) }}</td>
              <td class="actions">
                <button type="button" class="adm-icone-btn" title="Modifier" :aria-label="`Modifier ${p.email}`" @click="ouvrir(p)"><i class="fa-solid fa-user-pen"></i></button>
                <button type="button" class="adm-icone-btn" title="Réinitialiser le mot de passe" :aria-label="`Réinitialiser le mot de passe de ${p.email}`" @click="reinitialiser(p)"><i class="fa-solid fa-key"></i></button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!liste.length" class="adm-vide"><i class="fa-solid fa-users"></i><p>Aucun utilisateur ne correspond.</p></div>
      </div>
    </section>

    <AdminPanneau v-if="edition" titre="Modifier l’utilisateur" :sous-titre="edition.email" @fermer="edition = null">
      <div v-if="edition.chargement" class="adm-chargement"><span class="spinner spinner-grand"></span></div>
      <form v-else id="form-utilisateur" class="adm-grille-form" novalidate @submit.prevent="enregistrer">
        <div class="adm-champ"><label for="u-prenom">Prénom</label><input id="u-prenom" v-model="edition.prenom" maxlength="60" autocomplete="off" /></div>
        <div class="adm-champ"><label for="u-nom">Nom</label><input id="u-nom" v-model="edition.nom" maxlength="60" autocomplete="off" /></div>
        <div class="adm-champ"><label for="u-pseudo">Pseudo</label><input id="u-pseudo" v-model="edition.pseudo" maxlength="30" autocomplete="off" /></div>
        <div class="adm-champ"><label for="u-mail">Adresse e-mail</label><input id="u-mail" v-model="edition.email" type="email" autocomplete="off" required /></div>
        <ChampTelephone id="u-tel" v-model="edition.telephone" v-model:valide="telephoneValide" class="plein" />
        <div class="adm-champ"><label for="u-type">Type de profil</label>
          <select id="u-type" v-model="edition.type_profil"><option v-for="(l, v) in TYPES" :key="v" :value="v">{{ l }}</option></select></div>
        <div class="adm-champ"><label for="u-role">Rôle</label>
          <select id="u-role" v-model="edition.role" :disabled="edition.id === moi?.id"><option v-for="(r, v) in ROLES" :key="v" :value="v">{{ r.label }}</option></select>
          <span v-if="edition.id === moi?.id" class="adm-champ-aide"><span>Vous ne pouvez pas modifier votre propre rôle.</span></span></div>
        <div v-if="edition.role === 'fournisseur'" class="adm-champ plein">
          <label for="u-fournisseur">Entreprise représentée</label>
          <select id="u-fournisseur" v-model="edition.fournisseur_id">
            <option value="" disabled>Choisir dans l’annuaire…</option>
            <option v-for="f in donnees.fournisseurs || []" :key="f.id" :value="f.id">{{ f.nom }} — {{ f.commune }}</option>
          </select>
          <span class="adm-champ-aide"><span>Ce compte verra les devis qui ont choisi cette entreprise et pourra confirmer leur paiement.</span></span>
        </div>
        <!-- Demande de compte professionnel -->
        <section v-if="profilEdite?.pro_statut" class="plein pro-bloc" :class="profilEdite.pro_statut">
          <header>
            <strong><i class="fa-solid fa-helmet-safety" aria-hidden="true"></i> Compte professionnel</strong>
            <span class="adm-badge" :class="STATUTS_PRO[profilEdite.pro_statut]?.classe">{{ STATUTS_PRO[profilEdite.pro_statut]?.label }}</span>
          </header>
          <dl>
            <div><dt>Raison sociale déclarée</dt><dd>{{ profilEdite.pro_raison_sociale || '—' }}</dd></div>
            <div><dt>SIRET</dt><dd class="adm-mono">{{ profilEdite.pro_siret ? formaterSiret(profilEdite.pro_siret) : '—' }}</dd></div>
            <div><dt>Demande du</dt><dd>{{ formatDate(profilEdite.pro_demande_le) }}</dd></div>
          </dl>

          <!-- Ce que dit le registre officiel -->
          <div v-if="profilEdite.pro_siret" class="pro-registre">
            <span class="pro-registre-titre">Registre public des entreprises</span>
            <p v-if="registre.etat === 'recherche'"><span class="spinner" aria-hidden="true"></span> Recherche…</p>
            <p v-else-if="registre.etat === 'trouvee'" :class="registre.donnees.active ? 'bon' : 'alerte'">
              <i :class="registre.donnees.active ? 'fa-solid fa-circle-check' : 'fa-solid fa-triangle-exclamation'" aria-hidden="true"></i>
              {{ registre.donnees.nom }}<template v-if="registre.donnees.commune"> · {{ registre.donnees.commune }}</template>
              — {{ registre.donnees.active ? 'entreprise active' : 'établissement fermé' }}
            </p>
            <p v-else-if="registre.etat === 'inconnue'" class="alerte"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> SIRET introuvable dans le registre.</p>
            <p v-else-if="registre.etat === 'indisponible'">{{ registre.donnees }} <button type="button" class="pro-lien" @click="consulterRegistre(profilEdite.pro_siret)">Réessayer</button></p>
            <a :href="lienAnnuaire(profilEdite.pro_siret)" target="_blank" rel="noopener noreferrer" class="pro-lien">Voir la fiche officielle <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>
          </div>

          <p v-if="profilEdite.pro_statut === 'refuse' && profilEdite.pro_motif_refus" class="pro-motif">Motif du refus : {{ profilEdite.pro_motif_refus }}</p>

          <div v-if="refus !== null" class="adm-champ">
            <label for="pro-motif">Motif du refus (affiché à l’utilisateur)</label>
            <textarea id="pro-motif" v-model="refus" rows="2" maxlength="300" placeholder="Ex. : le SIRET ne correspond pas à l’entreprise déclarée."></textarea>
          </div>
          <div class="pro-actions">
            <template v-if="refus === null">
              <button v-if="profilEdite.pro_statut !== 'refuse'" type="button" class="adm-btn adm-btn-clair adm-btn-sm" :disabled="decisionEnCours" @click="refus = ''">Refuser</button>
              <button v-if="profilEdite.pro_statut !== 'verifie'" type="button" class="adm-btn adm-btn-noir adm-btn-sm" :disabled="decisionEnCours" @click="statuer('verifie')"><i class="fa-solid fa-check" aria-hidden="true"></i> Valider le compte pro</button>
            </template>
            <template v-else>
              <button type="button" class="adm-btn adm-btn-clair adm-btn-sm" @click="refus = null">Annuler</button>
              <button type="button" class="adm-btn adm-btn-danger adm-btn-sm" :disabled="decisionEnCours" @click="statuer('refuse')">Confirmer le refus</button>
            </template>
          </div>
        </section>

        <p v-if="edition.derniereConnexion" class="plein utils-connexion"><i class="fa-regular fa-clock" aria-hidden="true"></i> Dernière connexion : {{ formatDate(edition.derniereConnexion, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</p>
      </form>
      <p v-if="editionErreur" class="adm-erreur-texte" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ editionErreur }}</p>
      <template #pied>
        <button type="button" class="adm-btn adm-btn-clair" @click="edition = null">Annuler</button>
        <button type="submit" form="form-utilisateur" class="adm-btn adm-btn-noir" :disabled="enregistrement || edition.chargement">
          <span v-if="enregistrement" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-check" aria-hidden="true"></i> Enregistrer
        </button>
      </template>
    </AdminPanneau>
  </div>
</template>

<style scoped>
.utils { display: flex; flex-direction: column; gap: 16px; }
.utils-moi { margin-left: 6px; padding: 1px 8px; border-radius: 999px; background: var(--adm-accent-doux); color: var(--lagon-800); font-size: .7rem; font-weight: 600; vertical-align: middle; }
.utils-connexion { margin: 0; color: var(--adm-muet); font-size: .84rem; }
.utils-lien { display: block; margin-top: 4px; color: var(--adm-muet); font-size: .78rem; }
.pilule-alerte { box-shadow: inset 0 0 0 1.5px #f59e0b; color: #b45309; }
.pro-bloc { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: 16px; border: 1px solid var(--adm-ligne); background: #fafbfc; }
.pro-bloc.en_attente { border-color: #fde68a; background: #fffdf5; }
.pro-bloc header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.pro-bloc header i { margin-right: 6px; }
.pro-bloc dl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 0; }
.pro-bloc dt { font-size: .76rem; color: var(--adm-muet); }
.pro-bloc dd { margin: 2px 0 0; font-weight: 600; font-size: .88rem; word-break: break-word; }
.pro-registre { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border-radius: 12px; background: #fff; box-shadow: inset 0 0 0 1px var(--adm-ligne); font-size: .88rem; }
.pro-registre-titre { font-size: .72rem; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--adm-muet); }
.pro-registre p { margin: 0; }
.pro-registre .bon { color: #047857; font-weight: 600; }
.pro-registre .alerte { color: #b45309; font-weight: 600; }
.pro-registre .spinner { width: 12px; height: 12px; border-width: 2px; vertical-align: -2px; }
.pro-lien { align-self: flex-start; padding: 0; border: 0; background: none; color: var(--adm-accent); font: inherit; font-size: .85rem; font-weight: 600; cursor: pointer; }
.pro-motif { margin: 0; color: var(--adm-baisse); font-size: .86rem; }
.pro-actions { display: flex; justify-content: flex-end; gap: 8px; }
@media (max-width: 560px) { .pro-bloc dl { grid-template-columns: 1fr; } }
</style>

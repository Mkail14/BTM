<script setup>
/**
 * Utilisateurs : filtres par rôle, modification, bannissement (à vie ou pour une durée, section « Bannis ») et suppression
 * (fonction serveur admin-utilisateurs, qui revérifie le rôle), e-mail de réinitialisation du mot de passe.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useAdmin, formatDate, initiales, correspond } from '@/composables/useAdmin.js'
import { useAuth } from '@/composables/useAuth.js'
import ChampTelephone from '@/composants/commun/ChampTelephone.vue'
import AdminPanneau from './AdminPanneau.vue'
import { formaterSiret, lienAnnuaire, rechercherSiret } from '@/services/entreprises.js'
import { typesProjets } from '@/donnees/typesProjets.js'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'

const { api, donnees, erreurs, charger, recherche, confirmer, executer, notifier } = useAdmin()
const { utilisateur: moi } = useAuth()
onMounted(() => charger(['profils', 'projets', 'fournisseurs', 'realisations'], { force: true }))
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

// ---------- Suppression définitive (n'importe quel compte sauf le sien, revérifié par le serveur) ----------
async function supprimer(p) {
  const projets = projetsPar.value[p.id] || 0
  const texte = [
    `Le compte ${p.email} sera supprimé définitivement`,
    projets ? `, avec ses ${projets} projet${projets > 1 ? 's' : ''} et son crédit fidélité` : ', avec son crédit fidélité',
    '. Ses avis et ses paiements sont conservés sans auteur.',
    p.role === 'admin' ? ' Attention : c’est un compte administrateur.' : '',
    ' Cette action est irréversible.'
  ].join('')
  if (!(await confirmer({ titre: 'Supprimer cet utilisateur ?', texte, libelle: 'Supprimer le compte', danger: true }))) return
  const ok = await executer(async () => { const r = await api.supprimerUtilisateur(p.id); notifier(r?.message || 'Compte supprimé.') })
  if (!ok) return
  if (edition.value?.id === p.id) edition.value = null
  await charger(['profils', 'projets'], { force: true })
}

// ---------- Proposer de publier un projet sur l'accueil (réalisations, migration 0025) ----------
// L'utilisateur reçoit l'invitation dans « Mes projets » : il ajoute une photo et ses infos, puis l'admin valide.
const TYPES_OUVRAGE = Object.fromEntries(typesProjets.map((t) => [t.id, t.libelle]))
const ETATS_REALISATION = { proposee: 'proposition envoyée', soumise: 'à valider', publiee: 'en ligne', refusee: 'refusée', declinee: 'déclinée' }
const projetsDe = (id) => (donnees.projets || []).filter((p) => p.utilisateur_id === id)
// projet déjà proposé (ou en ligne) : pas de seconde proposition pour le même projet
const realisationDuProjet = (projetId) => (donnees.realisations || []).find((r) => r.projet_id === projetId && ['proposee', 'soumise', 'publiee'].includes(r.statut))

const proposition = ref(null) // { profil, projetId, message, envoi, erreur }
function ouvrirProposition(p) {
  const libre = projetsDe(p.id).find((x) => !realisationDuProjet(x.id))
  proposition.value = {
    profil: p, projetId: libre?.id || '', envoi: false, erreur: '',
    message: 'Votre projet nous plaît ! Acceptez-vous qu’il apparaisse sur la page d’accueil de BTM, avec une photo de votre chantier ?'
  }
}
async function envoyerProposition() {
  const prop = proposition.value
  const projet = projetsDe(prop.profil.id).find((x) => x.id === prop.projetId)
  if (!projet) { prop.erreur = 'Choisissez le projet à mettre en avant.'; return }
  prop.envoi = true
  prop.erreur = ''
  const ok = await executer(async () => {
    const ligne = await api.proposerRealisation({
      utilisateur_id: prop.profil.id, projet_id: projet.id, titre: projet.nom,
      type_projet: TYPES_OUVRAGE[projet.type_projet_id] ? projet.type_projet_id : null,
      fournisseur_id: projet.fournisseur_id || null, fournisseur_nom: nomFournisseur.value[projet.fournisseur_id] || null,
      message_admin: prop.message
    })
    donnees.realisations = [ligne, ...(donnees.realisations || [])]
  }, `Proposition envoyée : ${prop.profil.nom_affiche || prop.profil.email} la verra dans « Mes projets ».`)
  prop.envoi = false
  if (ok) proposition.value = null
}

// ---------- Bannissement (migration 0022) ----------
// Bloqué par Supabase Auth (plus de connexion) ; un ban temporaire se lève tout seul à sa date de fin.
const banActif = api.banActif
const DUREES = [
  { id: '24h', label: '24 heures', heures: 24 },
  { id: '7j', label: '7 jours', heures: 24 * 7 },
  { id: '30j', label: '30 jours', heures: 24 * 30 },
  { id: 'date', label: 'Jusqu’au…' },
  { id: 'vie', label: 'À vie' }
]
const dateLongue = (d) => new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
// valeur d'un champ datetime-local (heure locale, sans fuseau)
const versSaisie = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
const emailDe = computed(() => Object.fromEntries((donnees.profils || []).map((p) => [p.id, p.nom_affiche || p.email])))

// à vie d'abord, puis les bans qui se terminent le plus tôt
const bannis = computed(() => (donnees.profils || []).filter(banActif)
  .sort((a, b) => (a.banni_jusqua ? new Date(a.banni_jusqua).getTime() : -Infinity) - (b.banni_jusqua ? new Date(b.banni_jusqua).getTime() : -Infinity)))
const listeBannis = computed(() => bannis.value.filter((p) => correspond(recherche.value, p.email, p.nom_affiche, p.banni_motif)))
const nbAVie = computed(() => bannis.value.filter((p) => !p.banni_jusqua).length)
function restant(p) {
  if (!p.banni_jusqua) return 'définitif'
  const ms = new Date(p.banni_jusqua) - Date.now()
  const jours = Math.floor(ms / 86400000)
  return jours >= 1 ? `encore ${jours} jour${jours > 1 ? 's' : ''}` : `encore ${Math.max(1, Math.ceil(ms / 3600000))} h`
}

const ban = ref(null) // { profil, duree, date, motif, envoi, erreur }
function ouvrirBan(p) {
  const actif = banActif(p)
  ban.value = {
    profil: p, motif: actif ? p.banni_motif || '' : '', envoi: false, erreur: '',
    duree: actif ? (p.banni_jusqua ? 'date' : 'vie') : '7j',
    date: versSaisie(actif && p.banni_jusqua ? new Date(p.banni_jusqua) : new Date(Date.now() + 7 * 86400000))
  }
}
// fin du ban choisi : Date, null (à vie), ou undefined (date pas encore saisie)
const finBan = computed(() => {
  const b = ban.value
  if (!b || b.duree === 'vie') return null
  if (b.duree === 'date') return b.date ? new Date(b.date) : undefined
  return new Date(Date.now() + DUREES.find((d) => d.id === b.duree).heures * 3600000)
})
const resumeBan = computed(() => {
  if (finBan.value === null) return 'Banni à vie : le compte ne pourra plus se connecter, sauf si vous levez le bannissement.'
  if (!finBan.value || Number.isNaN(finBan.value.getTime())) return 'Choisissez la date de fin du bannissement.'
  return `Banni jusqu’au ${dateLongue(finBan.value)} : le compte pourra se reconnecter ensuite, automatiquement.`
})

async function confirmerBan() {
  const b = ban.value
  const fin = finBan.value
  b.erreur = ''
  if (fin === undefined || (fin && (Number.isNaN(fin.getTime()) || fin <= new Date()))) { b.erreur = 'Choisissez une date de fin dans le futur.'; return }
  if (b.profil.role === 'admin' && !(await confirmer({
    titre: 'Bannir un administrateur ?', danger: true, libelle: 'Bannir',
    texte: `${b.profil.email} perdra l’accès à l’administration ${fin ? 'jusqu’à la fin du bannissement' : 'définitivement'}.`
  }))) return
  b.envoi = true
  const ok = await executer(async () => {
    const r = await api.bannirUtilisateur(b.profil.id, fin ? fin.toISOString() : null, b.motif.trim())
    notifier(r?.message || 'Utilisateur banni.')
  })
  b.envoi = false
  if (!ok) return
  ban.value = null
  await charger(['profils'], { force: true })
}

async function lever(p) {
  if (!(await confirmer({ titre: 'Lever le bannissement ?', texte: `${p.email} pourra de nouveau se connecter immédiatement.`, libelle: 'Lever le bannissement' }))) return
  const ok = await executer(async () => { const r = await api.debannirUtilisateur(p.id); notifier(r?.message || 'Bannissement levé.') })
  if (!ok) return
  if (ban.value?.profil.id === p.id) ban.value = null
  await charger(['profils'], { force: true })
}
</script>

<template>
  <div class="utils">
    <p v-if="erreurs.profils" class="adm-alerte" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.profils }}</p>

    <div class="adm-pilules" role="group" aria-label="Filtrer par rôle">
      <button type="button" class="adm-pilule" :class="{ actif: !filtre }" :aria-pressed="!filtre" @click="filtre = ''">Tous <small>{{ compte() }}</small></button>
      <button v-for="(r, id) in ROLES" :key="id" type="button" class="adm-pilule" :class="{ actif: filtre === id }" :aria-pressed="filtre === id" @click="filtre = id">{{ r.label }}s <small>{{ compte(id) }}</small></button>
      <button type="button" class="adm-pilule" :class="{ actif: filtre === 'pro_attente', 'pilule-alerte': aVerifier && filtre !== 'pro_attente' }" :aria-pressed="filtre === 'pro_attente'" @click="filtre = 'pro_attente'"><i class="fa-solid fa-helmet-safety" aria-hidden="true"></i> Pros à vérifier <small>{{ aVerifier }}</small></button>
      <button type="button" class="adm-pilule" :class="{ actif: filtre === 'bannis' }" :aria-pressed="filtre === 'bannis'" @click="filtre = 'bannis'"><i class="fa-solid fa-ban" aria-hidden="true"></i> Bannis <small>{{ bannis.length }}</small></button>
    </div>

    <!-- Section « Bannis » : à vie ou jusqu'à une date -->
    <section v-if="filtre === 'bannis'" class="adm-carte">
      <header class="utils-bannis-entete">
        <h3><i class="fa-solid fa-ban" aria-hidden="true"></i> Comptes bannis</h3>
        <p>{{ nbAVie }} à vie · {{ bannis.length - nbAVie }} temporaire{{ bannis.length - nbAVie > 1 ? 's' : '' }}. Un bannissement temporaire se lève tout seul à sa date de fin.</p>
      </header>
      <div v-if="!donnees.profils" class="adm-chargement"><span class="spinner spinner-grand"></span></div>
      <div v-else class="adm-table-cadre">
        <table v-if="listeBannis.length" class="adm-table adm-table-empile">
          <thead><tr><th>Utilisateur</th><th>Sanction</th><th>Fin</th><th>Motif</th><th>Banni le</th><th><span class="visually-hidden">Actions</span></th></tr></thead>
          <tbody>
            <tr v-for="p in listeBannis" :key="p.id">
              <td class="principal">
                <span class="adm-identite">
                  <span class="adm-avatar rond">{{ initiales(p.nom_affiche || p.email) }}</span>
                  <span><strong>{{ p.nom_affiche || '—' }}</strong><small>{{ p.email }}</small></span>
                </span>
              </td>
              <td data-label="Sanction"><span class="adm-badge" :class="p.banni_jusqua ? 'adm-badge-attention' : 'adm-badge-noir'">{{ p.banni_jusqua ? 'Temporaire' : 'À vie' }}</span></td>
              <td data-label="Fin">
                <template v-if="p.banni_jusqua">{{ dateLongue(p.banni_jusqua) }}<small class="utils-lien">{{ restant(p) }}</small></template>
                <template v-else>—</template>
              </td>
              <td data-label="Motif" class="utils-motif">{{ p.banni_motif || '—' }}</td>
              <td data-label="Banni le">{{ formatDate(p.banni_le) }}<small v-if="p.banni_par" class="utils-lien">par {{ emailDe[p.banni_par] || 'un administrateur' }}</small></td>
              <td class="actions">
                <button type="button" class="adm-icone-btn" title="Modifier le bannissement" :aria-label="`Modifier le bannissement de ${p.email}`" @click="ouvrirBan(p)"><i class="fa-solid fa-pen"></i></button>
                <button type="button" class="adm-icone-btn" title="Lever le bannissement" :aria-label="`Lever le bannissement de ${p.email}`" @click="lever(p)"><i class="fa-solid fa-unlock"></i></button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="adm-vide"><i class="fa-solid fa-user-check"></i><p>{{ bannis.length ? 'Aucun compte banni ne correspond à la recherche.' : 'Aucun compte banni.' }}</p></div>
      </div>
    </section>

    <section v-else class="adm-carte">
      <div v-if="!donnees.profils" class="adm-chargement"><span class="spinner spinner-grand"></span></div>
      <div v-else class="adm-table-cadre">
        <table class="adm-table adm-table-empile">
          <thead><tr><th>Utilisateur</th><th>Profil</th><th>Rôle</th><th class="num">Projets</th><th>Inscrit le</th><th><span class="visually-hidden">Actions</span></th></tr></thead>
          <tbody>
            <tr v-for="p in liste" :key="p.id">
              <td class="principal">
                <span class="adm-identite">
                  <span class="adm-avatar rond">{{ initiales(p.nom_affiche || p.email) }}</span>
                  <span><strong>{{ p.nom_affiche || '—' }} <span v-if="p.id === moi?.id" class="utils-moi">vous</span><span v-if="banActif(p)" class="utils-banni" :title="p.banni_jusqua ? `Banni jusqu’au ${dateLongue(p.banni_jusqua)}` : 'Banni à vie'"><i class="fa-solid fa-ban" aria-hidden="true"></i> {{ p.banni_jusqua ? 'banni' : 'banni à vie' }}</span></strong><small>{{ p.email }}</small></span>
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
                <button type="button" class="adm-icone-btn" :disabled="!projetsPar[p.id]" :title="projetsPar[p.id] ? 'Proposer de publier un projet sur l’accueil' : 'Aucun projet enregistré'" :aria-label="`Proposer à ${p.email} de publier un projet`" @click="ouvrirProposition(p)"><i class="fa-solid fa-images"></i></button>
                <button type="button" class="adm-icone-btn" title="Réinitialiser le mot de passe" :aria-label="`Réinitialiser le mot de passe de ${p.email}`" @click="reinitialiser(p)"><i class="fa-solid fa-key"></i></button>
                <button v-if="p.id !== moi?.id" type="button" class="adm-icone-btn danger" :title="banActif(p) ? 'Modifier le bannissement' : 'Bannir'" :aria-label="`${banActif(p) ? 'Modifier le bannissement de' : 'Bannir'} ${p.email}`" @click="ouvrirBan(p)"><i class="fa-solid fa-ban"></i></button>
                <button v-if="p.id !== moi?.id" type="button" class="adm-icone-btn danger" title="Supprimer le compte" :aria-label="`Supprimer le compte ${p.email}`" @click="supprimer(p)"><i class="fa-solid fa-trash-can"></i></button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!liste.length" class="adm-vide"><i class="fa-solid fa-users"></i><p>Aucun utilisateur ne correspond.</p></div>
      </div>
    </section>

    <!-- Proposer de publier un projet sur la page d'accueil -->
    <AdminPanneau v-if="proposition" titre="Proposer de publier un projet" :sous-titre="proposition.profil.nom_affiche || proposition.profil.email" @fermer="proposition = null">
      <p class="utils-prop-intro">
        L’utilisateur verra l’invitation dans <strong>Mes projets</strong> : il ajoute une photo de son chantier et ses infos, puis vous validez la publication
        dans <strong>Contenus du site → Réalisations</strong>.
      </p>
      <fieldset class="adm-champ">
        <legend class="adm-champ-label">Projet à mettre en avant</legend>
        <ul class="utils-prop-projets">
          <li v-for="pr in projetsDe(proposition.profil.id)" :key="pr.id">
            <label class="utils-prop-projet" :class="{ choisi: proposition.projetId === pr.id, pris: realisationDuProjet(pr.id) }">
              <input v-model="proposition.projetId" type="radio" :value="pr.id" :disabled="!!realisationDuProjet(pr.id)" />
              <span>
                <strong>{{ pr.nom }}</strong>
                <small>{{ TYPES_OUVRAGE[pr.type_projet_id] || pr.type_projet_id }} · {{ formaterEuros(pr.cout_total) }} · {{ formatDate(pr.cree_le) }}<template v-if="nomFournisseur[pr.fournisseur_id]"> · {{ nomFournisseur[pr.fournisseur_id] }}</template></small>
              </span>
              <span v-if="realisationDuProjet(pr.id)" class="adm-badge adm-badge-info">{{ ETATS_REALISATION[realisationDuProjet(pr.id).statut] }}</span>
            </label>
          </li>
        </ul>
      </fieldset>
      <div class="adm-champ">
        <label for="prop-message">Message à l’utilisateur</label>
        <textarea id="prop-message" v-model="proposition.message" rows="4" maxlength="400"></textarea>
      </div>
      <p v-if="proposition.erreur" class="adm-erreur-texte" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ proposition.erreur }}</p>
      <template #pied>
        <button type="button" class="adm-btn adm-btn-clair" @click="proposition = null">Annuler</button>
        <button type="button" class="adm-btn adm-btn-noir" :disabled="proposition.envoi || !proposition.projetId" @click="envoyerProposition">
          <span v-if="proposition.envoi" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-paper-plane" aria-hidden="true"></i> Envoyer la proposition
        </button>
      </template>
    </AdminPanneau>

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

    <!-- Bannir / modifier un bannissement -->
    <AdminPanneau v-if="ban" :titre="banActif(ban.profil) ? 'Modifier le bannissement' : 'Bannir l’utilisateur'" :sous-titre="ban.profil.email" @fermer="ban = null">
      <form id="form-ban" class="adm-grille-form" novalidate @submit.prevent="confirmerBan">
        <p v-if="banActif(ban.profil)" class="plein utils-ban-actuel">
          <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
          Actuellement banni {{ ban.profil.banni_jusqua ? `jusqu’au ${dateLongue(ban.profil.banni_jusqua)}` : 'à vie' }} depuis le {{ formatDate(ban.profil.banni_le) }}.
        </p>
        <div class="adm-champ plein">
          <span class="adm-champ-label">Durée</span>
          <div class="adm-pilules" role="radiogroup" aria-label="Durée du bannissement">
            <button v-for="d in DUREES" :key="d.id" type="button" class="adm-pilule" :class="{ actif: ban.duree === d.id }" role="radio" :aria-checked="ban.duree === d.id" @click="ban.duree = d.id">{{ d.label }}</button>
          </div>
        </div>
        <div v-if="ban.duree === 'date'" class="adm-champ plein">
          <label for="ban-date">Fin du bannissement</label>
          <input id="ban-date" v-model="ban.date" type="datetime-local" :min="versSaisie(new Date())" />
        </div>
        <div class="adm-champ plein">
          <label for="ban-motif">Motif <small>(visible par l’équipe uniquement)</small></label>
          <textarea id="ban-motif" v-model="ban.motif" rows="3" maxlength="300" placeholder="Ex. : propos insultants envers un fournisseur, faux devis…"></textarea>
        </div>
        <p class="plein utils-ban-resume" :class="{ vie: finBan === null }"><i class="fa-solid fa-ban" aria-hidden="true"></i> {{ resumeBan }}</p>
      </form>
      <p v-if="ban.erreur" class="adm-erreur-texte" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ ban.erreur }}</p>
      <template #pied>
        <button v-if="banActif(ban.profil)" type="button" class="adm-btn adm-btn-clair" @click="lever(ban.profil)"><i class="fa-solid fa-unlock" aria-hidden="true"></i> Lever le ban</button>
        <button type="button" class="adm-btn adm-btn-clair" @click="ban = null">Annuler</button>
        <button type="submit" form="form-ban" class="adm-btn adm-btn-danger" :disabled="ban.envoi">
          <span v-if="ban.envoi" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-ban" aria-hidden="true"></i> {{ banActif(ban.profil) ? 'Mettre à jour' : 'Bannir' }}
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
.utils-banni { margin-left: 6px; padding: 1px 8px; border-radius: 999px; background: #fff1f2; color: var(--adm-baisse); font-size: .7rem; font-weight: 600; vertical-align: middle; }
.utils-bannis-entete { padding: 18px 20px 4px; }
.utils-bannis-entete h3 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 1.05rem; }
.utils-bannis-entete h3 i { color: var(--adm-baisse); }
.utils-bannis-entete p { margin: 4px 0 0; color: var(--adm-muet); font-size: .86rem; }
.utils-motif { max-width: 280px; color: var(--adm-encre-2); font-size: .86rem; }
.utils-prop-intro { margin: 0 0 16px; color: var(--adm-encre-2); font-size: .88rem; line-height: 1.55; }
.utils-prop-projets { display: flex; flex-direction: column; gap: 8px; margin: 0 0 16px; padding: 0; list-style: none; }
.utils-prop-projet { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1.5px solid var(--adm-ligne); border-radius: 14px; cursor: pointer; }
.utils-prop-projet.choisi { border-color: var(--adm-noir); background: var(--adm-ligne-2); }
.utils-prop-projet.pris { opacity: .6; cursor: default; }
.utils-prop-projet > span:first-of-type { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.utils-prop-projet strong { font-size: .92rem; }
.utils-prop-projet small { color: var(--adm-muet); font-size: .78rem; }
.utils-ban-actuel { display: flex; gap: 8px; margin: 0; padding: 12px 14px; border-radius: 12px; background: #fafbfc; color: var(--adm-encre-2); font-size: .88rem; }
.utils-ban-resume { display: flex; gap: 8px; margin: 0; padding: 12px 14px; border-radius: 12px; background: #fffbeb; color: #92400e; font-size: .88rem; line-height: 1.45; }
.utils-ban-resume.vie { background: #fff1f2; color: var(--adm-baisse); }
.utils-ban-resume i { margin-top: 3px; }
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

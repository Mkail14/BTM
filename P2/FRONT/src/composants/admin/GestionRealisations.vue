<script setup>
/**
 * Réalisations de la page d'accueil (contenu du site) :
 *  - proposition à un utilisateur de publier l'un de ses projets (aussi depuis la page Utilisateurs), relance si déclinée ;
 *  - à valider : envoyées par les utilisateurs après une proposition → publier ou refuser ;
 *  - en ligne : 10 au maximum, la plus ancienne est retirée quand on en publie une 11e ;
 *  - création et modification directes (infos + photo) par l'admin.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useAdmin, formatDate } from '@/composables/useAdmin.js'
import { typesProjets } from '@/donnees/typesProjets.js'
import { MAX_REALISATIONS, supprimerPhotos } from '@/services/supabase/serviceRealisations.js'
import AdminPanneau from './AdminPanneau.vue'
import PanneauPropositionRealisation from './PanneauPropositionRealisation.vue'

const { api, donnees, erreurs, charger, confirmer, executer, notifier } = useAdmin()
onMounted(async () => {
  await charger(['realisations', 'fournisseurs', 'profils', 'projets'], { force: true })
  if (parStatut('soumise').length) filtre.value = 'soumise' // des envois attendent : on les montre d'abord
})

const TYPES = Object.fromEntries(typesProjets.map((t) => [t.id, t]))
const STATUTS = {
  soumise: { label: 'À valider', classe: 'adm-badge-attention' },
  publiee: { label: 'En ligne', classe: 'adm-badge-ok' },
  proposee: { label: 'En attente de l’utilisateur', classe: 'adm-badge-info' },
  refusee: { label: 'Refusée', classe: '' },
  declinee: { label: 'Déclinée par l’utilisateur', classe: '' }
}
const toutes = computed(() => donnees.realisations || [])
const parStatut = (s) => toutes.value.filter((r) => r.statut === s)
const enLigne = computed(() => parStatut('publiee').sort((a, b) => new Date(b.publiee_le) - new Date(a.publiee_le)))
const plusAncienne = computed(() => (enLigne.value.length >= MAX_REALISATIONS ? enLigne.value.at(-1) : null))
const FILTRES = [['soumise', 'À valider'], ['publiee', 'En ligne'], ['proposee', 'Proposées'], ['refusee', 'Refusées ou déclinées']]
const VIDES = {
  soumise: 'Aucune réalisation à valider.',
  publiee: 'Aucune réalisation en ligne : la page d’accueil affiche des exemples.',
  proposee: 'Aucune proposition en attente de réponse.',
  refusee: 'Aucune réalisation refusée ou déclinée.'
}
const nombre = (f) => (f === 'refusee' ? toutes.value.filter((r) => r.statut === 'refusee' || r.statut === 'declinee').length : parStatut(f).length)
const filtre = ref('publiee')
const liste = computed(() => {
  if (filtre.value === 'publiee') return enLigne.value
  if (filtre.value === 'refusee') return toutes.value.filter((r) => r.statut === 'refusee' || r.statut === 'declinee')
  return parStatut(filtre.value)
})
const compteDe = computed(() => Object.fromEntries((donnees.profils || []).map((p) => [p.id, p.nom_affiche || p.email])))
const lieu = (r) => [r.quartier, r.commune].filter(Boolean).join(', ') || 'Lieu à compléter'

// ---------- Proposition à un utilisateur / relance ----------
const proposition = ref(false)
async function relancer(r) {
  const ok = await executer(async () => { Object.assign(r, await api.relancerRealisation(r.id, r.message_admin)) },
    'Proposition relancée : l’utilisateur la revoit dans « Mes projets ».')
  if (ok) filtre.value = 'proposee'
}

// ---------- Publication / refus / suppression ----------
async function publier(r) {
  const retiree = plusAncienne.value && plusAncienne.value.id !== r.id ? plusAncienne.value : null
  if (retiree && !(await confirmer({
    titre: 'Publier cette réalisation ?', libelle: 'Publier',
    texte: `${MAX_REALISATIONS} réalisations sont déjà en ligne : la plus ancienne (« ${retiree.titre} ») sera supprimée, avec sa photo.`
  }))) return
  await executer(async () => {
    await api.publierRealisation(r.id)
    await charger(['realisations'], { force: true })
  }, 'Réalisation en ligne sur la page d’accueil.')
}

const refus = ref(null) // { r, motif }
async function confirmerRefus() {
  const { r, motif } = refus.value
  const ok = await executer(async () => {
    const ligne = await api.refuserRealisation(r.id, motif)
    Object.assign(r, ligne)
  }, 'Réalisation refusée : l’utilisateur voit le motif dans « Mes projets ».')
  if (ok) refus.value = null
}

async function supprimer(r) {
  const proposition = r.statut === 'proposee'
  if (!(await confirmer({
    titre: proposition ? 'Annuler la proposition ?' : `Supprimer « ${r.titre || 'cette réalisation'} » ?`,
    texte: proposition ? 'L’utilisateur ne verra plus l’invitation à publier son projet.' : 'Elle disparaît de la page d’accueil et sa photo est effacée. Action définitive.',
    libelle: proposition ? 'Annuler la proposition' : 'Supprimer', danger: true
  }))) return
  await executer(async () => {
    await api.supprimerRealisation(r)
    donnees.realisations = donnees.realisations.filter((x) => x.id !== r.id)
  }, proposition ? 'Proposition annulée.' : 'Réalisation supprimée.')
}

// ---------- Création / modification (infos + photo) ----------
const formulaire = ref(null)
const formErreur = ref('')
const enregistrement = ref(false)
const fichier = ref(null)
const apercu = ref('')
const vide = () => ({ id: null, titre: '', type_projet: 'mur', auteur: '', commune: '', quartier: '', fournisseur_id: '', fournisseur_nom: '', detail: '', annee: new Date().getFullYear(), photo_url: '', photo_chemin: null })
function ouvrir(r) {
  formErreur.value = ''
  fichier.value = null
  formulaire.value = r ? { ...vide(), ...r, fournisseur_id: r.fournisseur_id || '', annee: r.annee || '' } : vide()
  apercu.value = formulaire.value.photo_url || ''
}
function choisirPhoto(e) {
  const f = e.target.files?.[0]
  if (!f) return
  if (!f.type.startsWith('image/')) { formErreur.value = 'Choisissez une image (JPEG, PNG ou WebP).'; return }
  formErreur.value = ''
  fichier.value = f
  apercu.value = URL.createObjectURL(f)
}
// le nom du fournisseur affiché suit le fournisseur choisi dans l'annuaire
watch(() => formulaire.value?.fournisseur_id, (id) => {
  if (!formulaire.value || id === undefined) return
  const f = (donnees.fournisseurs || []).find((x) => x.id === id)
  if (f) formulaire.value.fournisseur_nom = f.nom
  else if (!id) formulaire.value.fournisseur_nom = formulaire.value.fournisseur_nom || ''
})

async function enregistrer() {
  const f = formulaire.value
  if (!f.titre.trim() || !f.commune.trim() || !f.auteur.trim()) { formErreur.value = 'Titre, commune et nom de l’auteur sont obligatoires.'; return }
  if (!fichier.value && !f.photo_url) { formErreur.value = 'Ajoutez une photo du chantier.'; return }
  const creation = !f.id
  if (creation && plusAncienne.value && !(await confirmer({
    titre: 'Mettre en ligne cette réalisation ?', libelle: 'Mettre en ligne',
    texte: `${MAX_REALISATIONS} réalisations sont déjà en ligne : la plus ancienne (« ${plusAncienne.value.titre} ») sera supprimée, avec sa photo.`
  }))) return
  formErreur.value = ''
  enregistrement.value = true
  try {
    const ancienne = f.photo_chemin
    const photo = fichier.value ? await api.televerserPhotoRealisation(fichier.value) : null
    const ligne = await api.enregistrerRealisation({ ...f, annee: Number(f.annee) || null, ...(photo ? { photo_url: photo.url, photo_chemin: photo.chemin } : {}) })
    if (photo && ancienne) supprimerPhotos([ancienne]).catch(() => {}) // photo remplacée
    if (creation) await api.publierRealisation(ligne.id) // saisie par l'admin : en ligne tout de suite
    await charger(['realisations'], { force: true })
    formulaire.value = null
    if (creation) filtre.value = 'publiee'
    notifier(creation ? 'Réalisation créée et mise en ligne.' : 'Réalisation mise à jour.')
  } catch (e) {
    formErreur.value = e?.migration ? 'Appliquez d’abord la migration 0025 (réalisations) sur Supabase.' : (e?.message || 'Enregistrement impossible.')
  } finally {
    enregistrement.value = false
  }
}
</script>

<template>
  <div class="gr">
    <p v-if="erreurs.realisations" class="adm-alerte" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.realisations }}</p>

    <header class="adm-carte gr-tete">
      <div>
        <h2>Réalisations de la page d’accueil</h2>
        <p>Proposez à un utilisateur de publier son projet, ou ajoutez une réalisation vous-même. {{ MAX_REALISATIONS }} au maximum : en publier une de plus retire la plus ancienne.</p>
      </div>
      <div class="gr-tete-actions">
        <span class="gr-compteur" :class="{ plein: enLigne.length >= MAX_REALISATIONS }"><strong>{{ enLigne.length }}</strong> / {{ MAX_REALISATIONS }} en ligne</span>
        <a href="/#realisations" target="_blank" rel="noopener" class="adm-btn adm-btn-fantome adm-btn-sm"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> Voir sur le site</a>
        <button type="button" class="adm-btn adm-btn-clair adm-btn-sm" @click="ouvrir()"><i class="fa-solid fa-plus" aria-hidden="true"></i> Ajouter moi-même</button>
        <button type="button" class="adm-btn adm-btn-noir adm-btn-sm" @click="proposition = true"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Proposer à un utilisateur</button>
      </div>
    </header>

    <div class="adm-pilules" role="group" aria-label="Filtrer les réalisations">
      <button v-for="f in FILTRES" :key="f[0]" type="button" class="adm-pilule" :class="{ actif: filtre === f[0], 'pilule-alerte': f[0] === 'soumise' && nombre('soumise') && filtre !== 'soumise' }" :aria-pressed="filtre === f[0]" @click="filtre = f[0]">
        {{ f[1] }} <small>{{ nombre(f[0]) }}</small>
      </button>
    </div>

    <div v-if="!donnees.realisations" class="adm-chargement"><span class="spinner spinner-grand"></span></div>
    <ul v-else-if="liste.length" class="gr-grille">
      <li v-for="r in liste" :key="r.id" class="adm-carte gr-carte">
        <div class="gr-photo">
          <img v-if="r.photo_url" :src="r.photo_url" alt="" loading="lazy" />
          <span v-else class="gr-sans-photo"><i class="fa-regular fa-image" aria-hidden="true"></i> Photo à venir</span>
          <span class="adm-badge gr-statut" :class="STATUTS[r.statut]?.classe">{{ STATUTS[r.statut]?.label }}</span>
        </div>
        <div class="gr-corps">
          <strong>{{ r.titre || 'Titre à compléter' }}</strong>
          <span><i class="fa-solid fa-location-dot" aria-hidden="true"></i> {{ lieu(r) }}</span>
          <span v-if="r.fournisseur_nom"><i class="fa-solid fa-store" aria-hidden="true"></i> {{ r.fournisseur_nom }}</span>
          <span v-if="r.type_projet && TYPES[r.type_projet]"><i :class="TYPES[r.type_projet].icone" aria-hidden="true"></i> {{ TYPES[r.type_projet].libelle }}<template v-if="r.annee"> · {{ r.annee }}</template></span>
          <small>
            {{ r.auteur || 'Auteur à compléter' }}<template v-if="r.utilisateur_id"> · compte {{ compteDe[r.utilisateur_id] || 'supprimé' }}</template>
          </small>
          <small class="gr-date">
            <template v-if="r.statut === 'publiee'">En ligne depuis le {{ formatDate(r.publiee_le) }}</template>
            <template v-else-if="r.statut === 'soumise'">Envoyée le {{ formatDate(r.soumise_le) }}</template>
            <template v-else>Proposée le {{ formatDate(r.cree_le) }}</template>
          </small>
          <p v-if="r.message_admin && r.statut !== 'publiee'" class="gr-message"><i class="fa-regular fa-comment" aria-hidden="true"></i> {{ r.message_admin }}</p>
          <p v-if="r === plusAncienne" class="gr-message gr-alerte"><i class="fa-solid fa-hourglass-end" aria-hidden="true"></i> La plus ancienne : retirée à la prochaine publication.</p>
        </div>
        <div class="gr-actions">
          <button v-if="r.statut === 'soumise' || r.statut === 'refusee'" type="button" class="adm-btn adm-btn-noir adm-btn-sm" @click="publier(r)"><i class="fa-solid fa-check" aria-hidden="true"></i> Publier</button>
          <button v-if="r.statut === 'soumise'" type="button" class="adm-btn adm-btn-clair adm-btn-sm" @click="refus = { r, motif: '' }">Refuser</button>
          <button v-if="r.statut === 'declinee'" type="button" class="adm-btn adm-btn-noir adm-btn-sm" @click="relancer(r)"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Relancer</button>
          <span class="gr-icones">
            <button v-if="r.statut !== 'proposee'" type="button" class="adm-icone-btn" title="Modifier" :aria-label="`Modifier ${r.titre}`" @click="ouvrir(r)"><i class="fa-solid fa-pen"></i></button>
            <button type="button" class="adm-icone-btn danger" :title="r.statut === 'proposee' ? 'Annuler la proposition' : 'Supprimer'" :aria-label="`Supprimer ${r.titre}`" @click="supprimer(r)"><i class="fa-solid fa-trash-can"></i></button>
          </span>
        </div>
      </li>
    </ul>
    <div v-else class="adm-carte adm-vide">
      <i class="fa-regular fa-images"></i>
      <p>{{ VIDES[filtre] }}</p>
      <button v-if="filtre !== 'refusee'" type="button" class="adm-btn adm-btn-clair adm-btn-sm" @click="proposition = true"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Proposer à un utilisateur</button>
    </div>

    <!-- Proposer à un utilisateur de publier l'un de ses projets -->
    <PanneauPropositionRealisation v-if="proposition" @envoyee="filtre = 'proposee'" @fermer="proposition = false" />

    <!-- Création / modification -->
    <AdminPanneau v-if="formulaire" :titre="formulaire.id ? 'Modifier la réalisation' : 'Nouvelle réalisation'" :sous-titre="formulaire.id ? STATUTS[formulaire.statut]?.label : 'Elle sera mise en ligne dès l’enregistrement.'" @fermer="formulaire = null">
      <form id="form-realisation" class="adm-grille-form" novalidate @submit.prevent="enregistrer">
        <div class="adm-champ plein">
          <span class="adm-champ-label">Photo du chantier</span>
          <label class="gr-depot" :class="{ rempli: apercu }">
            <img v-if="apercu" :src="apercu" alt="Aperçu de la photo" />
            <span v-else><i class="fa-solid fa-camera" aria-hidden="true"></i> Choisir une photo</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" class="visually-hidden" @change="choisirPhoto" />
          </label>
          <span class="adm-champ-aide"><span>JPEG, PNG ou WebP. Réduite automatiquement avant l’envoi.</span></span>
        </div>
        <div class="adm-champ plein"><label for="r-titre">Titre</label><input id="r-titre" v-model="formulaire.titre" maxlength="80" placeholder="Ex. : Maison familiale" /></div>
        <div class="adm-champ">
          <label for="r-type">Type d’ouvrage</label>
          <select id="r-type" v-model="formulaire.type_projet">
            <option v-for="t in typesProjets" :key="t.id" :value="t.id">{{ t.libelle }}</option>
            <option :value="null">Autre</option>
          </select>
        </div>
        <div class="adm-champ"><label for="r-auteur">Nom affiché</label><input id="r-auteur" v-model="formulaire.auteur" maxlength="60" placeholder="Ex. : Amina M." /></div>
        <div class="adm-champ"><label for="r-commune">Commune</label><input id="r-commune" v-model="formulaire.commune" maxlength="60" placeholder="Ex. : Mamoudzou" /></div>
        <div class="adm-champ"><label for="r-quartier">Quartier (facultatif)</label><input id="r-quartier" v-model="formulaire.quartier" maxlength="60" placeholder="Ex. : Kawéni" /></div>
        <div class="adm-champ">
          <label for="r-fournisseur">Fournisseur des matériaux</label>
          <select id="r-fournisseur" v-model="formulaire.fournisseur_id">
            <option value="">Aucun / non précisé</option>
            <option v-for="f in donnees.fournisseurs || []" :key="f.id" :value="f.id">{{ f.nom }}</option>
          </select>
        </div>
        <div class="adm-champ"><label for="r-annee">Année</label><input id="r-annee" v-model="formulaire.annee" type="number" min="2000" max="2100" /></div>
        <div class="adm-champ plein"><label for="r-detail">Détail (facultatif)</label><input id="r-detail" v-model="formulaire.detail" maxlength="160" placeholder="Ex. : 68 m² de murs en parpaings" /></div>
      </form>
      <p v-if="formErreur" class="adm-erreur-texte" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ formErreur }}</p>
      <template #pied>
        <button type="button" class="adm-btn adm-btn-clair" @click="formulaire = null">Annuler</button>
        <button type="submit" form="form-realisation" class="adm-btn adm-btn-noir" :disabled="enregistrement">
          <span v-if="enregistrement" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-check" aria-hidden="true"></i>
          {{ formulaire.id ? 'Enregistrer' : 'Enregistrer et mettre en ligne' }}
        </button>
      </template>
    </AdminPanneau>

    <!-- Refus -->
    <AdminPanneau v-if="refus" titre="Refuser la réalisation" :sous-titre="refus.r.titre" @fermer="refus = null">
      <div class="adm-champ">
        <label for="r-motif">Motif (visible par l’utilisateur)</label>
        <textarea id="r-motif" v-model="refus.motif" rows="4" maxlength="400" placeholder="Ex. : la photo est floue, pouvez-vous en envoyer une autre ?"></textarea>
      </div>
      <template #pied>
        <button type="button" class="adm-btn adm-btn-clair" @click="refus = null">Annuler</button>
        <button type="button" class="adm-btn adm-btn-noir" @click="confirmerRefus">Refuser</button>
      </template>
    </AdminPanneau>
  </div>
</template>

<style scoped>
.gr { display: flex; flex-direction: column; gap: 16px; }
.gr > .adm-alerte { margin: 0; }
.gr-tete { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 22px 24px; }
.gr-tete h2 { margin: 0; font-family: var(--font-corps); font-size: 1.2rem; font-weight: 600; letter-spacing: 0; }
.gr-tete p { margin: 6px 0 0; max-width: 620px; color: var(--adm-encre-2); font-size: .9rem; line-height: 1.5; }
.gr-tete-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.gr-compteur { padding: 6px 12px; border-radius: 999px; background: var(--adm-ligne-2); font-size: .85rem; color: var(--adm-encre-2); }
.gr-compteur strong { color: var(--adm-encre); }
.gr-compteur.plein { background: var(--adm-attention-fond-2); color: var(--adm-attention-texte-2); }

.gr-grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; margin: 0; padding: 0; list-style: none; }
.gr-carte { display: flex; flex-direction: column; overflow: hidden; }
.gr-photo { position: relative; aspect-ratio: 4 / 3; background: var(--adm-ligne-2); }
.gr-photo img { width: 100%; height: 100%; object-fit: cover; }
.gr-sans-photo { position: absolute; inset: 0; display: grid; place-items: center; color: var(--adm-muet); font-size: .85rem; }
.gr-statut { position: absolute; top: 10px; left: 10px; }
.gr-corps { display: flex; flex: 1; flex-direction: column; gap: 4px; padding: 14px 16px; font-size: .85rem; color: var(--adm-encre-2); }
.gr-corps strong { color: var(--adm-encre); font-size: .98rem; }
.gr-corps i { width: 14px; color: var(--adm-muet); }
.gr-corps small { color: var(--adm-muet); font-size: .78rem; }
.gr-date { margin-top: 2px; }
.gr-message { margin: 6px 0 0; padding: 8px 10px; border-radius: 10px; background: var(--adm-ligne-2); font-size: .8rem; line-height: 1.45; }
.gr-alerte { background: var(--adm-attention-fond-2); color: var(--adm-attention-texte-2); }
.gr-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 0 12px 12px 16px; }
.gr-icones { display: flex; margin-left: auto; }

/* Ordinateur : l'en-tête et les filtres restent en place, seules les réalisations défilent (page fixe de SectionContenus) */
@media (min-width: 1024px) and (min-height: 640px) {
  .gr-tete, .gr > .adm-pilules { flex: none; }
  /* max-content : sans lui, les cartes (overflow: hidden) sont écrasées pour tenir dans la hauteur au lieu de défiler */
  .gr-grille { flex: 1; min-height: 0; grid-auto-rows: max-content; align-content: start; margin: 0 -8px; padding: 0 8px 24px; overflow-y: auto; scrollbar-width: thin; }
}

.gr-depot {
  display: grid; place-items: center; aspect-ratio: 16 / 9; overflow: hidden; border: 1.5px dashed var(--adm-ligne); border-radius: 14px;
  background: var(--adm-ligne-2); color: var(--adm-encre-2); font-size: .9rem; font-weight: 600; cursor: pointer;
}
.gr-depot:hover { border-color: var(--adm-encre-2); }
.gr-depot.rempli { border-style: solid; }
.gr-depot img { width: 100%; height: 100%; object-fit: cover; }
.gr-depot i { margin-right: 6px; }
.gr-depot:focus-within { outline: 2px solid var(--adm-noir); outline-offset: 2px; }
</style>

/**
 * useAdmin — état partagé de l'espace d'administration.
 *  - données chargées à la demande, section par section, puis mises en cache ;
 *  - notifications (toasts) ;
 *  - fenêtre de confirmation unique, utilisable en `await confirmer({...})`.
 */
import { reactive, ref } from 'vue'
import * as api from '@/services/supabase/serviceAdmin.js'
import { surChangementCompte } from '@/composables/useAuth.js'

const chargeurs = {
  profils: api.listerProfils,
  projets: api.listerProjets,
  avis: api.listerAvis,
  realisations: api.listerRealisations,
  fournisseurs: api.listerFournisseurs,
  categories: api.listerCategories,
  materiaux: api.listerMateriaux,
  types: api.listerTypesProjets,
  contenus: api.listerContenus,
  codes: api.listerCodes,
  paiements: api.listerPaiements,
  reversements: api.listerReversements,
  versement: api.lireParametresVersement
}

const donnees = reactive(Object.fromEntries(Object.keys(chargeurs).map((c) => [c, null])))
const erreurs = reactive({})
const enCours = reactive({})
const recherche = ref('')
const compteOuvert = ref(false) // panneau « Compte BTM », ouvrable depuis le profil et le tableau de bord
const migrationManquante = ref(false) // une table ou colonne de la migration 0007 manque : bandeau d'aide global

// Changement de compte : rien de ce qu'a chargé l'admin précédent ne reste en mémoire
surChangementCompte(() => {
  for (const cle of Object.keys(donnees)) donnees[cle] = null
  for (const cle of Object.keys(erreurs)) delete erreurs[cle]
  recherche.value = ''
  compteOuvert.value = false
  migrationManquante.value = false
})

async function chargerUne(cle, force) {
  if (!force && donnees[cle]) return
  enCours[cle] = true
  delete erreurs[cle]
  try {
    donnees[cle] = await chargeurs[cle]()
  } catch (e) {
    console.warn(`Admin : ${cle}`, e)
    if (e?.migration) migrationManquante.value = true
    else erreurs[cle] = e?.message || 'Chargement impossible.'
    if (!donnees[cle]) donnees[cle] = []
  } finally {
    enCours[cle] = false
  }
}

/** charger(['profils', 'projets'], { force: true }) */
const charger = (cles, { force = false } = {}) => Promise.all(cles.map((c) => chargerUne(c, force)))

// ---------- Notifications ----------
const notifications = ref([])
let compteur = 0
function notifier(texte, type = 'succes') {
  const id = ++compteur
  notifications.value.push({ id, texte, type })
  setTimeout(() => { notifications.value = notifications.value.filter((n) => n.id !== id) }, type === 'erreur' ? 6000 : 3500)
}

// ---------- Confirmation ----------
const confirmation = ref(null) // { titre, texte, libelle, danger, resoudre }
function confirmer({ titre, texte = '', libelle = 'Confirmer', danger = false }) {
  return new Promise((resoudre) => { confirmation.value = { titre, texte, libelle, danger, resoudre } })
}
function repondre(valeur) {
  confirmation.value?.resoudre(valeur)
  confirmation.value = null
}

/** Exécute une action d'écriture : notification de succès ou d'erreur, renvoie true si réussie */
async function executer(action, succes) {
  try {
    await action()
    if (succes) notifier(succes)
    return true
  } catch (e) {
    if (e?.migration) migrationManquante.value = true
    notifier(e?.message || 'L’opération a échoué.', 'erreur')
    return false
  }
}

export function useAdmin() {
  return { api, donnees, erreurs, enCours, charger, recherche, migrationManquante, compteOuvert, notifications, notifier, confirmation, confirmer, repondre, executer }
}

// ---------- Utilitaires d'affichage partagés par les sections ----------
export const formatDate = (d, options = { day: '2-digit', month: 'short', year: 'numeric' }) =>
  d ? new Intl.DateTimeFormat('fr-FR', options).format(new Date(d)) : '—'

export const initiales = (texte = '') =>
  texte.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((m) => m[0].toUpperCase()).join('') || '?'

/** Recherche insensible à la casse et aux accents */
const normaliser = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export const correspond = (terme, ...valeurs) => !terme.trim() || normaliser(valeurs.join(' ')).includes(normaliser(terme.trim()))

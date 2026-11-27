/**
 * Assistance « Sur le site » :
 *  - côté visiteur : l'API BTM (/api/assistance) fait répondre Tamilya, passe la main à un conseiller et le prévient
 *    par e-mail ; la conversation est protégée par un jeton secret gardé dans le navigateur ;
 *  - côté admin (conseiller) : /api/admin/support/… (lecture des conversations, réponses, statut, présence).
 * « Écrit… » et « Vu » : relevés toutes les 2,5 s auprès de l'API.
 */
import { api, apiConfiguree } from './client.js'

// ---------- Visiteur ----------
// { conversation_id, jeton, compte } : `compte` est le compte connecté au moment où la discussion a été gardée (null : visiteur).
// La discussion d'un compte ne s'affiche qu'une fois connecté à ce compte ; celle d'un visiteur rejoint son compte à la connexion.
const CLE = 'btm:assistance'
let compteActuel = null
const lireGardee = () => { try { return JSON.parse(localStorage.getItem(CLE) || 'null') } catch { return null } }
const ecrireGardee = (v) => { try { v ? localStorage.setItem(CLE, JSON.stringify(v)) : localStorage.removeItem(CLE) } catch { /* stockage bloqué */ } }
export function conversationGardee() {
  const g = lireGardee()
  if (!g?.conversation_id || (g.compte && g.compte !== compteActuel)) return null
  return { conversation_id: g.conversation_id, jeton: g.jeton }
}
function garderConversation(r) {
  if (r?.conversation_id) ecrireGardee({ conversation_id: r.conversation_id, jeton: r.jeton, compte: compteActuel })
}
export function oublierConversation() {
  // compte connecté : la « nouvelle discussion » est notée, l'ancienne n'est pas rouverte au prochain chargement
  ecrireGardee(compteActuel ? { compte: compteActuel } : null)
}

/**
 * Connexion, déconnexion ou changement de compte (useAuth.surChangementCompte) :
 *  - déconnexion ou autre compte : la discussion du compte précédent disparaît du navigateur (elle reste dans son compte) ;
 *  - visiteur qui se connecte : sa discussion en cours est rattachée à son compte ;
 *  - connexion sans discussion dans ce navigateur : on reprend la dernière discussion du compte.
 */
export async function changerCompteSupport(id) {
  compteActuel = id || null
  const g = lireGardee()
  if (g?.compte && g.compte !== compteActuel) ecrireGardee(null)
  if (!compteActuel || !apiConfiguree) return
  try {
    if (conversationGardee()) await lireConversation(0) // la fonction « assistant » rattache la discussion au compte
    else if (!lireGardee()) await assistant({ action: 'mienne' })
  } catch { /* reprise au prochain chargement */ }
}

async function assistant(corps) {
  if (!apiConfiguree) throw new Error('Assistance indisponible pour le moment.')
  const conv = conversationGardee()
  try {
    const data = await api.post('/assistance', { ...conv, page: window.location.pathname, ...corps }, { delai: 75000 })
    garderConversation(data)
    return data
  } catch (e) {
    if (e.statut === 404) oublierConversation() // conversation supprimée : on repartira de zéro
    throw e
  }
}

export const envoyerQuestion = (texte, apres = 0) => assistant({ texte, apres })
export const demanderConseiller = ({ contexte = '', email = '', nom = '' } = {}, apres = 0) => assistant({ action: 'conseiller', contexte, email, nom, apres })
export const donnerCoordonnees = (email, nom = '', apres = 0) => assistant({ action: 'coordonnees', email, nom, apres })
/** `presence` (fenêtre ouverte seulement) : { vu: dernier message affiché }, enregistré pour le conseiller */
export const lireConversation = (apres = 0, presence = {}) => (conversationGardee() ? assistant({ action: 'lire', apres, ...presence }) : Promise.resolve(null))

// ---------- Présence (client et conseiller) ----------
const RELEVE = 2500
/**
 * « Écrit… » et « Vu » d'une discussion : chaque côté envoie les siens à l'API et relève ceux de l'autre toutes les 2,5 s.
 * Les messages, eux, sont relus par les écrans toutes les 4 s.
 * `qui` : 'client' | 'conseiller' ; `surSignal({ type: 'ecrit' | 'vu', ... })` ne reçoit que l'autre côté.
 */
export function canalSupport(conversation, jeton, qui, surSignal) {
  if (!apiConfiguree || !conversation || (qui === 'client' && !jeton)) return null
  const envoyer = (presence) => (qui === 'client'
    ? api.post('/assistance', { action: 'presence', conversation_id: conversation, jeton, ...presence })
    : api.post(`/admin/support/${conversation}/presence`, presence))
  let ecritAvant = null
  let vuAvant = 0
  const relever = async (presence = {}) => {
    if (typeof document !== 'undefined' && document.hidden && !Object.keys(presence).length) return
    try {
      const r = await envoyer(presence)
      const ecrit = qui === 'client' ? r.conseiller_ecrit : r.client_ecrit
      const vu = qui === 'client' ? r.vu_conseiller_id : r.vu_client_id
      if (ecrit !== ecritAvant) { ecritAvant = ecrit; surSignal({ type: 'ecrit', ecrit }) }
      if (vu > vuAvant) { vuAvant = vu; surSignal({ type: 'vu', id: vu }) }
    } catch { /* nouvel essai au prochain relevé */ }
  }
  const minuterie = setInterval(relever, RELEVE)
  relever()
  return {
    ecrit: (oui) => relever({ ecrit: !!oui }),
    vu: (id) => relever({ vu: id }),
    message: () => {}, // l'autre côté relit les messages de lui-même
    fermer: () => clearInterval(minuterie)
  }
}

/** Côté qui tape : « écrit » au début de la frappe (renouvelé toutes les 2 s), « n'écrit plus » 3 s après la dernière touche */
export function emetteurEcriture(signaler) {
  let annonce = 0
  let minuterie = null
  function arret() {
    clearTimeout(minuterie)
    minuterie = null
    if (annonce) { annonce = 0; signaler(false) }
  }
  function frappe(texte) {
    if (!texte.trim()) return arret()
    if (Date.now() - annonce > 2000) { annonce = Date.now(); signaler(true) }
    clearTimeout(minuterie)
    minuterie = setTimeout(arret, 3000)
  }
  return { frappe, arret }
}

/** Côté qui lit : affiche « écrit… » ; masqué au signal d'arrêt, ou au bout de 5 s sans nouvelle (signal perdu) */
export function recepteurEcriture(etat) {
  let minuterie = null
  return (oui) => {
    clearTimeout(minuterie)
    etat.value = oui
    if (oui) minuterie = setTimeout(() => { etat.value = false }, 5000)
  }
}

// ---------- Conseiller (admin) ----------
/** Conversations, les plus récentes d'abord ; `filtre` : 'a-traiter' | 'en-cours' | 'assistante' | 'fermees' | 'toutes' */
export const listerConversations = (filtre = 'a-traiter') => api.get(`/admin/support/conversations?filtre=${encodeURIComponent(filtre)}`)

/** Nombre de conversations qui attendent le conseiller (pastilles de l'admin) */
export const compterDemandes = async () => (await api.get('/admin/support/nombre'))?.nombre || 0

export const lireMessagesSupport = (conversation, apres = 0) => api.get(`/admin/support/${conversation}/messages?apres=${apres}`)
export const repondreSupport = (conversation, texte) => api.post(`/admin/support/${conversation}/repondre`, { texte })
export const changerStatutSupport = (conversation, statut) => api.post(`/admin/support/${conversation}/statut`, { statut })
/** Enregistre ce que le conseiller a vu (jusqu'à `vu`) ; renvoie { vu_client_id, client_ecrit } */
export const presenceSupport = (conversation, vu = null) => api.post(`/admin/support/${conversation}/presence`, vu ? { vu } : {})

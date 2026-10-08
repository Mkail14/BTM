/**
 * Assistance « Sur le site » :
 *  - côté visiteur : fonction Supabase « assistant » (assistante IA, passage à un conseiller, notification par e-mail) ;
 *    la conversation est protégée par un jeton secret gardé dans le navigateur ;
 *  - côté admin (conseiller) : lecture des conversations par la RLS (est_admin) et réponses par les RPC
 *    support_repondre / support_statut (migration 0018).
 */
import { supabase, supabaseConfigure } from './client.js'

// ---------- Visiteur ----------
const CLE = 'btm:assistance'
export function conversationGardee() {
  try { return JSON.parse(localStorage.getItem(CLE) || 'null') } catch { return null }
}
function garderConversation(r) {
  try { if (r?.conversation_id) localStorage.setItem(CLE, JSON.stringify({ conversation_id: r.conversation_id, jeton: r.jeton })) } catch { /* stockage bloqué */ }
}
export function oublierConversation() {
  try { localStorage.removeItem(CLE) } catch { /* stockage bloqué */ }
}

async function assistant(corps) {
  if (!supabaseConfigure) throw new Error('Assistance indisponible pour le moment.')
  const conv = conversationGardee()
  const { data, error } = await supabase.functions.invoke('assistant', { body: { ...conv, page: window.location.pathname, ...corps }, timeout: 45000 })
  if (error) {
    if (/abort/i.test(error.message)) throw new Error('L’assistance ne répond pas pour le moment. Réessayez dans un instant.')
    let message = error.message
    try { message = (await error.context.json()).erreur || message } catch { /* corps non JSON */ }
    if (/introuvable/i.test(message)) oublierConversation() // conversation supprimée : on repartira de zéro
    throw new Error(message)
  }
  if (data?.erreur) throw new Error(data.erreur)
  garderConversation(data)
  return data
}

export const envoyerQuestion = (texte, apres = 0) => assistant({ texte, apres })
export const demanderConseiller = ({ contexte = '', email = '', nom = '' } = {}, apres = 0) => assistant({ action: 'conseiller', contexte, email, nom, apres })
export const donnerCoordonnees = (email, nom = '', apres = 0) => assistant({ action: 'coordonnees', email, nom, apres })
/** `presence` (fenêtre ouverte seulement) : { vu: dernier message affiché }, enregistré pour le conseiller (migration 0021) */
export const lireConversation = (apres = 0, presence = {}) => (conversationGardee() ? assistant({ action: 'lire', apres, ...presence }) : Promise.resolve(null))

// ---------- Temps réel (client et conseiller) ----------
/**
 * Canal Supabase Realtime (« broadcast ») d'une discussion : « écrit… », « vu » et « nouveau message » arrivent
 * en moins d'une seconde de l'autre côté. Rien n'y est stocké ; les messages et le « vu » restent enregistrés en base.
 * Le nom contient le jeton secret de la conversation : seuls le client et les conseillers le connaissent.
 * `qui` : 'client' | 'conseiller' ; `surSignal({ type: 'ecrit' | 'vu' | 'message', ... })` ne reçoit que l'autre côté.
 */
export function canalSupport(conversation, jeton, qui, surSignal) {
  if (!supabaseConfigure || !conversation || !jeton) return null
  const canal = supabase.channel(`support-${conversation}-${jeton}`)
  canal.on('broadcast', { event: 'signal' }, ({ payload }) => { if (payload && payload.qui !== qui) surSignal(payload) }).subscribe()
  const envoyer = (type, donnees = {}) => canal.send({ type: 'broadcast', event: 'signal', payload: { qui, type, ...donnees } }).catch(() => {})
  return {
    ecrit: (oui) => envoyer('ecrit', { ecrit: oui }),
    vu: (id) => envoyer('vu', { id }),
    message: () => envoyer('message'),
    fermer: () => supabase.removeChannel(canal)
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
const verifier = ({ data, error }) => { if (error) throw new Error(error.message); return data }

/** Conversations, les plus récentes d'abord ; `filtre` : 'a-traiter' | 'en-cours' | 'assistante' | 'fermees' | 'toutes' */
export async function listerConversations(filtre = 'a-traiter') {
  let q = supabase.from('support_conversations').select('id, jeton, nom, email, statut, raison, page, non_lu, utilisateur_id, cree_le, mis_a_jour_le').order('mis_a_jour_le', { ascending: false }).limit(100)
  if (filtre === 'a-traiter') q = q.or('statut.eq.attente,and(statut.eq.humain,non_lu.eq.true)')
  else if (filtre === 'en-cours') q = q.eq('statut', 'humain')
  else if (filtre === 'assistante') q = q.eq('statut', 'ia')
  else if (filtre === 'fermees') q = q.eq('statut', 'fermee')
  return verifier(await q)
}

/** Nombre de conversations qui attendent le conseiller (pastilles de l'admin) */
export async function compterDemandes() {
  const { count, error } = await supabase.from('support_conversations').select('id', { count: 'exact', head: true }).or('statut.eq.attente,and(statut.eq.humain,non_lu.eq.true)')
  if (error) throw new Error(error.message)
  return count || 0
}

export const lireMessagesSupport = async (conversation, apres = 0) =>
  verifier(await supabase.from('support_messages').select('id, auteur, texte, cree_le').eq('conversation_id', conversation).gt('id', apres).order('id').limit(500))
export const repondreSupport = async (conversation, texte) => verifier(await supabase.rpc('support_repondre', { p_conversation: conversation, p_texte: texte }))
export const changerStatutSupport = async (conversation, statut) => verifier(await supabase.rpc('support_statut', { p_conversation: conversation, p_statut: statut }))
/** Enregistre ce que le conseiller a vu (jusqu'à `vu`) ; renvoie { vu_client_id } (migration 0021) */
export const presenceSupport = async (conversation, vu = null) =>
  verifier(await supabase.rpc('support_presence', { p_conversation: conversation, p_vu: vu, p_ecrit: false }))

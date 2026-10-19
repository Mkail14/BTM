/**
 * useMessagerie — état partagé de la messagerie contact@btm.yt :
 *  - nombre de non lus (bouton du haut de l'admin, menu latéral), relu toutes les 2 minutes ;
 *  - dossiers, liste de chaque dossier et messages déjà ouverts ou préchargés, gardés en mémoire : revenir
 *    dans la messagerie, changer de dossier ou rouvrir un message est instantané (l'actualisation suit en arrière-plan) ;
 *  - dossiers et listes enregistrés sur l'appareil : après un rechargement de la page, la boîte s'affiche
 *    tout de suite. Effacés à la déconnexion ou au changement de compte.
 */
import { ref, shallowRef } from 'vue'
import { compterNonLus } from '@/services/supabase/serviceMessagerie.js'
import { surChangementCompte, useAuth } from '@/composables/useAuth.js'

const CLE = 'btm-messagerie'
const VERSION = 1
const MESSAGES_MAX = 80 // contenus gardés en mémoire (les plus anciens sont oubliés)
const LISTE_VIDE = () => ({ messages: [], total: 0, page: 1, pages: 1 })

const nonLus = ref(0)
const indisponible = ref(false)
let minuterie = null

function lireStockage() {
  try {
    const s = JSON.parse(localStorage.getItem(CLE) || 'null')
    return s?.version === VERSION ? s : null
  } catch { return null }
}
const enregistre = lireStockage()
const listesEnregistrees = new Map(Object.entries(enregistre?.listes || {}))
const dossierEnregistre = enregistre?.dossier || 'INBOX'

// mémoire de la messagerie
const memoire = {
  dossiers: ref(enregistre?.dossiers || []),
  dossier: ref(dossierEnregistre),
  liste: ref(listesEnregistrees.get(dossierEnregistre) || LISTE_VIDE()),
  listes: listesEnregistrees, // chemin du dossier → dernière liste affichée
  messages: new Map(), // `${dossier}:${uid}` → message complet
  chargee: shallowRef(!!enregistre)
}

/** Garde un message complet en mémoire (les plus anciens sont oubliés au-delà de MESSAGES_MAX) */
function memoriser(cle, message) {
  memoire.messages.delete(cle)
  memoire.messages.set(cle, message)
  if (memoire.messages.size > MESSAGES_MAX) memoire.messages.delete(memoire.messages.keys().next().value)
}

// compte à qui appartient la copie enregistrée : un autre compte ne la voit jamais
let proprietaire = enregistre?.proprietaire || null

/** Dossiers et premières pages des listes enregistrés sur l'appareil (jamais le contenu des messages) */
function sauverMemoire() {
  if (!proprietaire) return
  const listes = {}
  for (const [chemin, l] of memoire.listes) if (l.page === 1) listes[chemin] = l
  try { localStorage.setItem(CLE, JSON.stringify({ version: VERSION, proprietaire, dossier: memoire.dossier.value, dossiers: memoire.dossiers.value, listes })) } catch { /* stockage plein ou bloqué */ }
}

/** Déconnexion ou changement de compte : rien de la boîte ne reste sur l'appareil ni en mémoire */
function oublierMessagerie() {
  try { localStorage.removeItem(CLE) } catch { /* stockage bloqué */ }
  memoire.dossiers.value = []
  memoire.dossier.value = 'INBOX'
  memoire.liste.value = LISTE_VIDE()
  memoire.listes.clear()
  memoire.messages.clear()
  memoire.chargee.value = false
  nonLus.value = 0
}

function verifierCompte(id, ancien) {
  if (!id) { if (ancien) { oublierMessagerie(); proprietaire = null } return }
  if (proprietaire && proprietaire !== id) oublierMessagerie()
  proprietaire = id
}
surChangementCompte(verifierCompte)
const { utilisateur } = useAuth()
if (utilisateur.value?.id) verifierCompte(utilisateur.value.id)

async function rafraichirNonLus() {
  try {
    nonLus.value = (await compterNonLus()).nonLus || 0
    indisponible.value = false
  } catch {
    indisponible.value = true // boîte injoignable : pas de pastille, la section affichera l'erreur
  }
}

/** Les dossiers donnent déjà le nombre de non lus de la boîte de réception : pas d'appel supplémentaire */
function majDepuisDossiers(dossiers) {
  const reception = dossiers.find((d) => d.cle === 'reception')
  if (reception) nonLus.value = reception.nonLus
}

export function useMessagerie() {
  function suivre() {
    rafraichirNonLus()
    clearInterval(minuterie)
    minuterie = setInterval(() => { if (!document.hidden) rafraichirNonLus() }, 120000)
  }
  const arreter = () => { clearInterval(minuterie); minuterie = null }
  return { nonLus, indisponible, rafraichirNonLus, majDepuisDossiers, suivre, arreter, memoire, memoriser, sauverMemoire, LISTE_VIDE }
}

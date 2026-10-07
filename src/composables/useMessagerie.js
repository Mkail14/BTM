/**
 * useMessagerie — état partagé de la messagerie contact@btm.yt :
 *  - nombre de non lus (bouton du haut de l'admin, menu latéral), relu toutes les 2 minutes ;
 *  - dossiers, liste affichée et messages déjà ouverts, gardés en mémoire : revenir dans la messagerie
 *    ou rouvrir un message est instantané (l'actualisation se fait ensuite, en arrière-plan).
 */
import { ref, shallowRef } from 'vue'
import { compterNonLus } from '@/services/supabase/serviceMessagerie.js'

const nonLus = ref(0)
const indisponible = ref(false)
let minuterie = null

// mémoire de la messagerie (vidée à la fermeture de l'onglet)
const memoire = {
  dossiers: ref([]),
  dossier: ref('INBOX'),
  liste: ref({ messages: [], total: 0, page: 1, pages: 1 }),
  messages: new Map(), // `${dossier}:${uid}` → message complet
  chargee: shallowRef(false)
}

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
  return { nonLus, indisponible, rafraichirNonLus, majDepuisDossiers, suivre, arreter, memoire }
}

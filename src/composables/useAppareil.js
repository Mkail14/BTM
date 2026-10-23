/**
 * Appareil léger : téléphone ou ordinateur peu puissant, ou qui saccade. Le site reste le même, en plus sobre :
 *  - classe « appareil-leger » sur <html> : ni flou d'arrière-plan ni décor animé (style.css) ;
 *  - maquettes 3D : sans ombres ni lissage, immobiles ; les cartes d'ouvrages montrent une icône à la place.
 * Deux signes : ce que le navigateur dit de l'appareil (mémoire, cœurs, économiseur de données : Chrome et Android
 * seulement) et la fluidité mesurée pendant les premières secondes (tous les navigateurs, iPhone compris).
 * Une saccade mesurée est retenue une semaine : la visite suivante démarre légère dès la première image.
 */
import { ref } from 'vue'

const CLE = 'btm-appareil-leger'
const SEMAINE = 7 * 24 * 3600 * 1000

function indicesMateriel() {
  const n = navigator
  if (n.connection?.saveData) return true // économiseur de données activé
  if (n.deviceMemory && n.deviceMemory <= 2) return true // 2 Go de mémoire ou moins
  return !!n.hardwareConcurrency && n.hardwareConcurrency <= 2
}
function memorise() {
  try { return Date.now() - Number(localStorage.getItem(CLE) || 0) < SEMAINE } catch { return false }
}

/** Vrai sur un appareil peu puissant : lu par les composants lourds (maquettes 3D) */
export const appareilLeger = ref(indicesMateriel() || memorise())
if (appareilLeger.value) document.documentElement.classList.add('appareil-leger')

function passerEnLeger() {
  appareilLeger.value = true
  document.documentElement.classList.add('appareil-leger')
  try { localStorage.setItem(CLE, String(Date.now())) } catch { /* stockage bloqué : remesuré à chaque visite */ }
}

/**
 * Suit la fluidité pendant les 30 premières secondes d'affichage, par tranches de 3 s : deux tranches de suite où
 * la page est restée figée plus d'un quart du temps (images de plus de 50 ms), ou tombée sous 25 images par seconde,
 * font passer l'appareil en léger (une seule tranche lente peut venir d'un chargement passager).
 * Un iPhone en mode économie d'énergie (30 images par seconde) n'est pas visé. Pas de mesure :
 *  - en développement (npm run dev) : le serveur de Vite ralentit le démarrage, la mesure serait faussée ;
 *  - sur un appareil de 8 Go de mémoire ou plus (Chrome) : assez puissant, une lenteur y est passagère.
 */
export function suivreFluidite() {
  if (appareilLeger.value || import.meta.env.DEV || navigator.deviceMemory >= 8) return
  let total = 0, tranche = 0, fige = 0, images = 0, precedente = 0, lentes = 0
  const image = (t) => {
    const dt = precedente ? t - precedente : 0
    precedente = t
    if (dt > 0 && dt < 1000) { // plus d'une seconde : onglet caché ou appareil en veille, pas une saccade
      tranche += dt
      images++
      if (dt > 50) fige += dt - 16.7
    }
    if (tranche >= 3000) {
      lentes = fige > tranche * 0.25 || tranche / images > 40 ? lentes + 1 : 0
      if (lentes === 2) return passerEnLeger()
      total += tranche
      tranche = fige = images = 0
    }
    if (total < 30000) requestAnimationFrame(image)
  }
  requestAnimationFrame(image)
}

/**
 * Calcul en cours — sessionStorage (section 12 du CDC).
 * Conserve l'estimation courante pendant le parcours et lors d'un rechargement.
 */
const CLE = 'btm:calcul-courant'

const dispo = () => typeof window !== 'undefined' && !!window.sessionStorage

export function lireCalcul() {
  if (!dispo()) return null
  try {
    const brut = sessionStorage.getItem(CLE)
    return brut ? JSON.parse(brut) : null
  } catch {
    return null
  }
}

export function ecrireCalcul(calcul) {
  if (!dispo()) return
  try {
    sessionStorage.setItem(CLE, JSON.stringify(calcul))
  } catch (e) {
    console.warn('sessionStorage indisponible', e)
  }
}

export function effacerCalcul() {
  if (dispo()) sessionStorage.removeItem(CLE)
}

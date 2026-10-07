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

// Devis d'un visiteur qui s'inscrit : le lien de confirmation reçu par e-mail s'ouvre dans un nouvel onglet,
// qui ne voit pas le sessionStorage de l'onglet d'origine. Une copie est donc mise de côté (localStorage, 48 h).
const CLE_ATTENTE = 'btm:devis-en-attente'
const DUREE_ATTENTE = 48 * 3600 * 1000

export function mettreDeCoteCalcul(calcul) {
  try {
    localStorage.setItem(CLE_ATTENTE, JSON.stringify({ calcul, le: Date.now() }))
  } catch (e) {
    console.warn('localStorage indisponible', e)
  }
}

/** Le devis mis de côté, s'il a moins de 48 h (il reste disponible jusqu'à la connexion : oublierCalculMisDeCote) */
export function reprendreCalculMisDeCote() {
  try {
    const brut = localStorage.getItem(CLE_ATTENTE)
    if (!brut) return null
    const { calcul, le } = JSON.parse(brut)
    if (Date.now() - le < DUREE_ATTENTE) return calcul
    localStorage.removeItem(CLE_ATTENTE)
    return null
  } catch {
    return null
  }
}

export function oublierCalculMisDeCote() {
  try { localStorage.removeItem(CLE_ATTENTE) } catch { /* stockage indisponible : rien à oublier */ }
}

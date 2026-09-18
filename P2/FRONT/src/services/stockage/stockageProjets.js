/**
 * Projets sauvegardés — localStorage (section 12 du CDC, F05).
 * Utilisé comme stockage principal hors connexion et comme cache local
 * lorsque l'utilisateur est connecté à Supabase.
 */
const CLE = 'btm:projets'

const dispo = () => typeof window !== 'undefined' && !!window.localStorage

export function lireProjets() {
  if (!dispo()) return []
  try {
    const brut = localStorage.getItem(CLE)
    const liste = brut ? JSON.parse(brut) : []
    return Array.isArray(liste) ? liste : []
  } catch {
    return []
  }
}

export function ecrireProjets(projets) {
  if (!dispo()) return
  try {
    localStorage.setItem(CLE, JSON.stringify(projets))
  } catch (e) {
    console.warn('localStorage indisponible', e)
  }
}

export const genererId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

export function ajouterProjet(projet) {
  const liste = lireProjets()
  const nouveau = { id: genererId(), cree_le: new Date().toISOString(), ...projet }
  ecrireProjets([nouveau, ...liste])
  return nouveau
}

export function supprimerProjet(id) {
  ecrireProjets(lireProjets().filter((p) => p.id !== id))
}

export function trouverProjet(id) {
  return lireProjets().find((p) => p.id === id) || null
}

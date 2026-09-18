/** Fonctions partagées par les formules de calcul */

export const arrondi = (n, decimales = 2) => {
  const f = 10 ** decimales
  return Math.round((Number(n) + Number.EPSILON) * f) / f
}

export const nombre = (v) => {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Construit une ligne de matériau à partir du catalogue de prix */
export function ligneMateriau(catalogue, id, quantite, decimales = 2) {
  const m = catalogue[id]
  if (!m) throw new Error(`Matériau inconnu : ${id}`)
  const q = arrondi(quantite, decimales)
  return {
    id,
    libelle: m.libelle,
    unite: m.unite,
    quantite: q,
    prixUnitaire: m.prixUnitaire,
    sousTotal: arrondi(q * m.prixUnitaire)
  }
}

export function synthese(lignes, heures, tauxHoraire, livraison) {
  const totalMateriaux = arrondi(lignes.reduce((s, l) => s + l.sousTotal, 0))
  const mainOeuvre = { heures: arrondi(heures, 1), tauxHoraire, total: arrondi(heures * tauxHoraire) }
  const liv = arrondi(livraison)
  return { totalMateriaux, mainOeuvre, livraison: liv, total: arrondi(totalMateriaux + mainOeuvre.total + liv) }
}

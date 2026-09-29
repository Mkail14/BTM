/**
 * Devis combiné (comptes professionnels) : plusieurs estimations du calculateur — ouvrages mesurés ou
 * achats directs — réunies en un seul devis. Les matériaux identiques sont additionnés.
 */
import { arrondi } from './utilitaires.js'
import { trouverTypeProjet } from '@/donnees/typesProjets.js'

export const TYPE_ENSEMBLE = 'ensemble'
export const TYPE_ACHAT = 'achat'

/** Libellé et icône d'une estimation, y compris hors calculateur (achat direct, devis combiné) */
export function infoType(resultat) {
  if (resultat?.type === TYPE_ACHAT) return { libelle: 'Achat direct', icone: 'fa-solid fa-cart-shopping', hypotheses: 'Quantités choisies par vous ; prix du fournisseur choisi.' }
  if (resultat?.type === TYPE_ENSEMBLE) return { libelle: 'Devis pro', icone: 'fa-solid fa-city', hypotheses: 'Chaque ouvrage est calculé avec les règles du calculateur ; les matériaux identiques sont additionnés.' }
  return trouverTypeProjet(resultat?.type) || { libelle: resultat?.typeLibelle || 'Devis', icone: 'fa-solid fa-file-invoice', hypotheses: '' }
}

/** Libellé court d'un ouvrage (« Dalle 8 × 6 m », « Achat direct · 3 matériaux ») */
export function libelleOuvrage(r) {
  const t = infoType(r)
  if (r.type === TYPE_ACHAT) return `${t.libelle} · ${r.lignes.length} matériau${r.lignes.length > 1 ? 'x' : ''}`
  const principale = r.mesures?.find((m) => m.principale)
  return principale ? `${t.libelle} · ${String(principale.valeur).replace('.', ',')} ${principale.unite}` : t.libelle
}

/** Réunit plusieurs estimations en un devis ; une seule estimation est rendue telle quelle */
export function fusionnerResultats(liste) {
  const valides = liste.filter((r) => r?.lignes?.length)
  if (valides.length <= 1) return valides[0] || null
  const cumul = new Map()
  for (const r of valides) {
    for (const l of r.lignes) {
      const c = cumul.get(l.id)
      if (c) { c.quantite += l.quantite; c.sousTotal += l.sousTotal } else cumul.set(l.id, { ...l })
    }
  }
  const lignes = [...cumul.values()].map((l) => ({ ...l, quantite: arrondi(l.quantite, 2), sousTotal: arrondi(l.quantite * l.prixUnitaire) }))
  const totalMateriaux = arrondi(lignes.reduce((s, l) => s + l.sousTotal, 0))
  return {
    type: TYPE_ENSEMBLE,
    typeLibelle: 'Devis pro',
    calculeLe: new Date().toISOString(),
    dimensions: {},
    ouvrages: valides.map((r) => ({ nom: libelleOuvrage(r), type: r.type, total: r.totalMateriaux, parties: [{ libelle: infoType(r).libelle, total: r.totalMateriaux }], resultat: r })),
    lignes,
    totalMateriaux,
    total: totalMateriaux,
    mesures: [{ label: 'Ouvrages', valeur: valides.length, unite: '', principale: true }]
  }
}

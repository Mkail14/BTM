/**
 * Moteur de calculs BTM — orchestre validation + formules (BF04, BF05, BNF06).
 * Les calculs sont 100 % côté client (section 15 : aucun appel API requis).
 */
import { trouverTypeProjet } from '@/donnees/typesProjets.js'
import { materiaux as catalogueLocal } from '@/donnees/materiaux.js'
import { calculerMur } from './formuleMur.js'
import { calculerDalle } from './formuleDalle.js'
import { calculerFondation } from './formuleFondation.js'
import { calculerTerrasse } from './formuleTerrasse.js'
import { nombre } from './utilitaires.js'

const FORMULES = { mur: calculerMur, dalle: calculerDalle, fondation: calculerFondation, terrasse: calculerTerrasse }

export const MESSAGES = {
  obligatoire: 'Ce champ est obligatoire',            // ER01
  nombreInvalide: 'Doit être un nombre supérieur à 0', // ER02
  ouverturesTropGrandes: 'La surface d’ouvertures dépasse la surface du mur', // ER03
  erreurCalcul: 'Erreur lors du calcul'               // ER06
}

/**
 * Valide les dimensions saisies pour un type de projet.
 * @returns {{ valide: boolean, erreurs: Record<string,string> }}
 */
export function validerDimensions(typeId, dimensions = {}) {
  const type = trouverTypeProjet(typeId)
  const erreurs = {}
  if (!type) return { valide: false, erreurs: { type: 'Type de projet inconnu' } }

  for (const champ of type.champs) {
    const brut = dimensions[champ.nom]
    if (champ.type === 'select') {
      if (!brut) erreurs[champ.nom] = MESSAGES.obligatoire
      continue
    }
    const vide = brut === undefined || brut === null || String(brut).trim() === ''
    if (vide) {
      if (!champ.optionnel) erreurs[champ.nom] = MESSAGES.obligatoire
      continue
    }
    const n = nombre(brut)
    if (!Number.isFinite(n) || (champ.optionnel ? n < 0 : n <= 0)) {
      erreurs[champ.nom] = MESSAGES.nombreInvalide
      continue
    }
    if (champ.max !== undefined && n > champ.max) {
      erreurs[champ.nom] = `Valeur maximale : ${champ.max} ${champ.unite}`
    }
  }

  if (typeId === 'mur' && !erreurs.longueur && !erreurs.hauteur && !erreurs.ouvertures) {
    const surface = nombre(dimensions.longueur) * nombre(dimensions.hauteur)
    if (nombre(dimensions.ouvertures) >= surface && surface > 0) erreurs.ouvertures = MESSAGES.ouverturesTropGrandes
  }

  return { valide: Object.keys(erreurs).length === 0, erreurs }
}

/**
 * Calcule l'estimation complète.
 * @param {string} typeId
 * @param {object} dimensions
 * @param {object} [options] { catalogue?: prix Supabase, parametres?: override }
 */
export function calculerEstimation(typeId, dimensions, options = {}) {
  const type = trouverTypeProjet(typeId)
  if (!type) throw new Error('Type de projet inconnu')
  const { valide, erreurs } = validerDimensions(typeId, dimensions)
  if (!valide) {
    const err = new Error('Dimensions invalides')
    err.erreurs = erreurs
    throw err
  }
  const catalogue = { ...catalogueLocal, ...(options.catalogue || {}) }
  const parametres = { ...type.parametres, ...(options.parametres || {}) }
  const formule = FORMULES[typeId]
  const resultat = formule(dimensions, parametres, catalogue)

  const dims = {}
  for (const c of type.champs) dims[c.nom] = c.type === 'select' ? (dimensions[c.nom] ?? c.defaut) : nombre(dimensions[c.nom])

  return {
    type: type.id,
    typeLibelle: type.libelle,
    dimensions: dims,
    calculeLe: new Date().toISOString(),
    ...resultat
  }
}

/** Résumé lisible des dimensions (ex. « 10 m × 2.5 m ») pour cartes et PDF */
export function resumerDimensions(typeId, dimensions = {}) {
  const type = trouverTypeProjet(typeId)
  if (!type) return ''
  return type.champs
    .filter((c) => c.type !== 'select' && dimensions[c.nom] !== undefined && dimensions[c.nom] !== '')
    .map((c) => `${dimensions[c.nom]} ${c.unite}`)
    .join(' × ')
}

export const formaterEuros = (n) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(Number(n) || 0)

export const formaterNombre = (n, decimales = 2) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: decimales }).format(Number(n) || 0)

/**
 * ⭐⭐⭐ MOTEUR DE CALCUL — cœur du projet BTM
 *
 * Point d'entrée unique pour transformer les dimensions saisies par
 * l'utilisateur en une estimation de matériaux + budget.
 *
 * Pour ajouter un nouveau type de projet :
 *   1. Créer une formule dans ./formulas/monProjet.js (retourne le même
 *      format que les formules existantes : materials, materialsCost,
 *      labor, delivery, totalCost...)
 *   2. L'enregistrer dans FORMULAS ci-dessous
 *   3. Ajouter l'entrée correspondante dans src/data/projectTypes.js
 *   4. Créer le formulaire dans src/components/calculator/
 */
import { calculateWall } from './formulas/wallFormula.js'
import { calculateSlab } from './formulas/slabFormula.js'
import { calculateFoundation } from './formulas/foundationFormula.js'
import { calculateTerrace } from './formulas/terraceFormula.js'

const FORMULAS = {
  mur: calculateWall,
  dalle: calculateSlab,
  fondation: calculateFoundation,
  terrasse: calculateTerrace
}

/**
 * Calcule l'estimation complète pour un type de projet donné.
 * @param {'mur'|'dalle'|'fondation'|'terrasse'} projectTypeId
 * @param {Record<string, number|string>} formData
 * @returns {object} résultat détaillé (matériaux, coûts, main d'œuvre, total)
 */
export async function calculateProject(projectTypeId, formData) {
  const formula = FORMULAS[projectTypeId]
  if (!formula) {
    throw new Error(`Type de projet non supporté par le moteur de calcul : "${projectTypeId}"`)
  }

  const errors = validateInputs(projectTypeId, formData)
  if (errors.length > 0) {
    throw new CalculationError('Données de saisie invalides', errors)
  }

  const result = await formula(formData)

  return {
    ...result,
    formData,
    calculatedAt: new Date().toISOString()
  }
}

/**
 * Valide les données d'entrée avant calcul. Retourne un tableau d'erreurs
 * (vide si tout est valide). Utilisé par les formulaires pour afficher les
 * messages inline, et par le moteur pour refuser un calcul incohérent.
 */
export function validateInputs(projectTypeId, formData) {
  const errors = []
  const positive = (key, label) => {
    const value = Number(formData[key])
    if (formData[key] === '' || formData[key] === undefined || formData[key] === null) {
      errors.push({ field: key, message: `${label} est obligatoire.` })
    } else if (Number.isNaN(value) || value <= 0) {
      errors.push({ field: key, message: `${label} doit être un nombre supérieur à 0.` })
    }
  }

  if (projectTypeId === 'mur') {
    positive('length', 'La longueur')
    positive('height', 'La hauteur')
    if (!['15', '20'].includes(String(formData.thickness))) {
      errors.push({ field: 'thickness', message: 'Choisissez une épaisseur de mur (15 ou 20 cm).' })
    }
    const openings = Number(formData.openings) || 0
    const gross = (Number(formData.length) || 0) * (Number(formData.height) || 0)
    if (openings < 0) {
      errors.push({ field: 'openings', message: 'La surface des ouvertures ne peut pas être négative.' })
    } else if (openings >= gross && gross > 0) {
      errors.push({ field: 'openings', message: 'La surface des ouvertures dépasse la surface totale du mur.' })
    }
  }

  if (projectTypeId === 'dalle') {
    positive('length', 'La longueur')
    positive('width', 'La largeur')
    positive('thickness', 'L\'épaisseur')
  }

  if (projectTypeId === 'fondation') {
    positive('length', 'La longueur')
    positive('width', 'La largeur de tranchée')
    positive('depth', 'La profondeur')
  }

  if (projectTypeId === 'terrasse') {
    positive('length', 'La longueur')
    positive('width', 'La largeur')
    positive('thickness', 'L\'épaisseur')
    if (!['carrelage', 'beton_lisse'].includes(formData.finish)) {
      errors.push({ field: 'finish', message: 'Choisissez une finition.' })
    }
  }

  return errors
}

export class CalculationError extends Error {
  constructor(message, fieldErrors = []) {
    super(message)
    this.name = 'CalculationError'
    this.fieldErrors = fieldErrors
  }
}

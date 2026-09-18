import { getMaterial, LABOR, DELIVERY } from '../../data/materials.js'

/**
 * Construit une ligne de matériau (quantité + coût) à partir du catalogue.
 * @param {string} key - clé du matériau dans data/materials.js
 * @param {number} quantity - quantité nécessaire (arrondie en amont par la formule)
 */
export function lineItem(key, quantity) {
  const material = getMaterial(key)
  const qty = Math.max(0, quantity)
  return {
    key,
    label: material.label,
    unit: material.unit,
    quantity: qty,
    unitPrice: material.unitPrice,
    subtotal: round2(qty * material.unitPrice)
  }
}

/** Total du coût des matériaux (hors main-d'œuvre et livraison). */
export function sumMaterials(items) {
  return round2(items.reduce((total, item) => total + item.subtotal, 0))
}

/**
 * Estime les frais de livraison à partir d'un poids total approximatif.
 * @param {number} totalWeightTonnes
 */
export function estimateDelivery(totalWeightTonnes) {
  const extra = Math.max(0, totalWeightTonnes - 1)
  return round2(DELIVERY.base + extra * DELIVERY.perTonne)
}

/**
 * Estime la main-d'œuvre à partir d'une quantité de travail (m², m³ ou mètres
 * linéaires selon le type de projet) et de la productivité journalière moyenne.
 * @param {'mur'|'dalle'|'fondation'|'terrasse'} projectTypeId
 * @param {number} workQuantity
 */
export function estimateLabor(projectTypeId, workQuantity) {
  const dailyOutput = LABOR.productivity[projectTypeId]
  const days = Math.max(0.5, roundHalf(workQuantity / dailyOutput))
  return {
    days,
    dailyRate: LABOR.dailyRate,
    total: round2(days * LABOR.dailyRate)
  }
}

export function round2(value) {
  return Math.round(value * 100) / 100
}

export function roundHalf(value) {
  return Math.round(value * 2) / 2
}

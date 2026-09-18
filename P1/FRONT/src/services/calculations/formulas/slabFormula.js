import {
  lineItem,
  sumMaterials,
  estimateDelivery,
  estimateLabor,
  round2
} from '../pricing.js'

const PANEL_WEIGHT_KG = 22
const PANEL_AREA_M2 = 2.4 * 1.2

/**
 * Calcule les matériaux nécessaires pour une dalle béton armé.
 *
 * Dosage :
 * - 350 kg de ciment / m³
 * - 700 kg de sable / m³
 * - 1200 kg de gravier / m³
 * - Treillis soudé
 *
 * @param {{ length: number, width: number, thickness: number }} input
 * thickness en cm
 */
export async function calculateSlab(input) {
  const length = Number(input.length) || 0
  const width = Number(input.width) || 0
  const thicknessCm = Number(input.thickness) || 0

  // Surface de la dalle
  const surface = round2(length * width)

  // Volume de béton
  const rawVolume = round2(
    length * width * (thicknessCm / 100)
  )

  // +5 % de perte
  const concreteVolume = round2(rawVolume * 1.05)

  // Quantité de matériaux
  const cementSacks = Math.ceil(
    (concreteVolume * 350) / 25
  )

  const sandTonnes = round2(
    concreteVolume * 0.7
  )

  const gravelTonnes = round2(
    concreteVolume * 1.2
  )

  // Treillis soudé avec +10 % de recouvrement
  const meshPanels = Math.ceil(
    (surface / PANEL_AREA_M2) * 1.1
  )

  const materials = await Promise.all([
    lineItem('ciment', cementSacks),
    lineItem('sable', sandTonnes),
    lineItem('gravier', gravelTonnes),
    lineItem('treillisSoude', meshPanels)
  ])

  // Poids total des matériaux
  const totalWeightTonnes = round2(
    (
      cementSacks * 25 +
      sandTonnes * 1000 +
      gravelTonnes * 1000 +
      meshPanels * PANEL_WEIGHT_KG
    ) / 1000
  )

  // Coût des matériaux
  const materialsCost = sumMaterials(materials)

  // Main-d'œuvre
  const labor = await estimateLabor(
    'dalle',
    surface
  )

  // Livraison
  const delivery = await estimateDelivery(
    totalWeightTonnes
  )

  return {
    projectType: 'dalle',

    inputsSummary: [
      {
        label: 'Longueur',
        value: `${length} m`
      },
      {
        label: 'Largeur',
        value: `${width} m`
      },
      {
        label: 'Épaisseur',
        value: `${thicknessCm} cm`
      }
    ],

    quantityLabel: 'Volume de béton',
    quantityValue: concreteVolume,
    quantityUnit: 'm³',

    materials,

    materialsCost,

    labor,

    delivery,

    totalWeightTonnes,

    totalCost: round2(
      materialsCost +
      labor.total +
      delivery
    )
  }
}

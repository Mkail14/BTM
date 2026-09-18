import { lineItem, sumMaterials, estimateDelivery, estimateLabor, round2 } from '../pricing.js'

const REBAR_LENGTH_M = 6

/**
 * Calcule les matériaux nécessaires pour une semelle de fondation filante.
 * Dosage béton renforcé : 400 kg ciment / m³, 650 kg sable / m³, 1250 kg
 * gravier / m³. Ferraillage estimé à 3 fers filants HA12 sur la longueur
 * + une bobine de ligature tous les 20 mètres.
 *
 * @param {{ length: number, width: number, depth: number }} input - width en cm (largeur de tranchée)
 */
export async function calculateFoundation(input) {
  const length = Number(input.length) || 0
  const widthCm = Number(input.width) || 0
  const depth = Number(input.depth) || 0

  const rawVolume = round2(length * (widthCm / 100) * depth)
  const concreteVolume = round2(rawVolume * 1.08) // +8% de perte (terrain irrégulier)

  const cementSacks = Math.ceil((concreteVolume * 400) / 25)
  const sandTonnes = round2(concreteVolume * 0.65)
  const gravelTonnes = round2(concreteVolume * 1.25)
  const rebarBars = Math.ceil(((length * 3) / REBAR_LENGTH_M) * 1.1) // 3 fers filants + 10% recouvrement
  const tieWireRolls = Math.max(1, Math.ceil(length / 20))

  const materials = await Promise.all([
    lineItem('ciment', cementSacks),
    lineItem('sable', sandTonnes),
    lineItem('gravier', gravelTonnes),
    lineItem('ferBeton', rebarBars),
    lineItem('ligature', tieWireRolls)
  ])

  const totalWeightTonnes = round2(
    (cementSacks * 25 + sandTonnes * 1000 + gravelTonnes * 1000 + rebarBars * 6) / 1000
  )

  const materialsCost = sumMaterials(materials)
  const labor = await estimateLabor('fondation', length)
  const delivery = await estimateDelivery(totalWeightTonnes)

  return {
    projectType: 'fondation',
    inputsSummary: [
      { label: 'Longueur', value: `${length} m` },
      { label: 'Largeur de tranchée', value: `${widthCm} cm` },
      { label: 'Profondeur', value: `${depth} m` }
    ],
    quantityLabel: 'Volume de béton',
    quantityValue: concreteVolume,
    quantityUnit: 'm³',
    materials,
    materialsCost,
    labor,
    delivery,
    totalWeightTonnes,
    totalCost: round2(materialsCost + labor.total + delivery)
  }
}

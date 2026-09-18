import { lineItem, sumMaterials, estimateDelivery, estimateLabor, round2 } from '../pricing.js'

const BLOCK_WEIGHT_KG = { parpaing15: 14, parpaing20: 18 }

/**
 * Calcule les matériaux nécessaires pour un mur en parpaings.
 * Règle de base : ~10 parpaings/m² (bloc 50×20 cm) + 5% de perte,
 * ~0,4 sac de ciment/m² et ~0,03 t de sable/m² pour les joints/enduit léger.
 * Ces ratios sont indicatifs — à ajuster avec un maçon selon l'appareillage retenu.
 *
 * @param {{ length: number, height: number, thickness: '15'|'20', openings?: number }} input
 */
export async function calculateWall(input) {
  const length = Number(input.length) || 0
  const height = Number(input.height) || 0
  const openings = Number(input.openings) || 0
  const thickness = String(input.thickness) === '15' ? '15' : '20'
  const blockKey = thickness === '15' ? 'parpaing15' : 'parpaing20'

  const grossSurface = round2(length * height)
  const netSurface = Math.max(0, round2(grossSurface - openings))

  const blocks = Math.ceil(netSurface * 10 * 1.05)
  const cementSacks = Math.ceil(netSurface * 0.4)
  const sandTonnes = round2(netSurface * 0.03)

  const materials = [
    await lineItem(blockKey, blocks),
    await lineItem('ciment', cementSacks),
    await lineItem('sable', sandTonnes)
  ]

  const totalWeightTonnes = round2(
    (blocks * BLOCK_WEIGHT_KG[blockKey] + cementSacks * 25 + sandTonnes * 1000) / 1000
  )

  const materialsCost = sumMaterials(materials)
  const labor = await estimateLabor('mur', netSurface)
  const delivery = await estimateDelivery(totalWeightTonnes)

  return {
    projectType: 'mur',
    inputsSummary: [
      { label: 'Longueur', value: `${length} m` },
      { label: 'Hauteur', value: `${height} m` },
      { label: 'Épaisseur', value: `${thickness} cm` },
      ...(openings > 0 ? [{ label: 'Ouvertures déduites', value: `${openings} m²` }] : [])
    ],
    quantityLabel: 'Surface nette de mur',
    quantityValue: netSurface,
    quantityUnit: 'm²',
    materials,
    materialsCost,
    labor,
    delivery,
    totalWeightTonnes,
    totalCost: round2(materialsCost + labor.total + delivery)
  }
}

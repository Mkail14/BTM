import { lineItem, sumMaterials, estimateDelivery, estimateLabor, round2 } from '../pricing.js'

/**
 * Calcule les matériaux nécessaires pour une terrasse : dalle béton support
 * (dosage 320 kg ciment / m³) + revêtement au choix.
 * - "carrelage" : ajoute carrelage extérieur + colle + joint
 * - "beton_lisse" : dalle seule, finition talochée/lissée (pas de matériau supplémentaire)
 *
 * @param {{ length: number, width: number, thickness: number, finish: 'carrelage'|'beton_lisse' }} input
 */
export async function calculateTerrace(input) {
  const length = Number(input.length) || 0
  const width = Number(input.width) || 0
  const thicknessCm = Number(input.thickness) || 0
  const finish = input.finish === 'carrelage' ? 'carrelage' : 'beton_lisse'

  const surface = round2(length * width)
  const rawVolume = round2(length * width * (thicknessCm / 100))
  const concreteVolume = round2(rawVolume * 1.05)

  const cementSacks = Math.ceil((concreteVolume * 320) / 25)
  const sandTonnes = round2(concreteVolume * 0.68)
  const gravelTonnes = round2(concreteVolume * 1.15)

  const materialRequests = [
    lineItem('ciment', cementSacks),
    lineItem('sable', sandTonnes),
    lineItem('gravier', gravelTonnes)
  ]

  if (finish === 'carrelage') {
    const tileSurface = round2(surface * 1.1) // +10% chutes de coupe
    const glueSacks = Math.ceil(surface / 5)
    const jointSacks = Math.ceil(surface / 15)
    materialRequests.push(
      lineItem('revetementTerrasse', tileSurface),
      lineItem('colleCarrelage', glueSacks),
      lineItem('jointCarrelage', jointSacks)
    )
  }

  const materials = await Promise.all(materialRequests)

  const totalWeightTonnes = round2(
    (cementSacks * 25 + sandTonnes * 1000 + gravelTonnes * 1000) / 1000 +
      (finish === 'carrelage' ? surface * 0.02 : 0) // ~20kg/m² pour le carrelage + colle
  )

  const materialsCost = sumMaterials(materials)
  const labor = await estimateLabor('terrasse', surface)
  const delivery = await estimateDelivery(totalWeightTonnes)

  return {
    projectType: 'terrasse',
    inputsSummary: [
      { label: 'Longueur', value: `${length} m` },
      { label: 'Largeur', value: `${width} m` },
      { label: 'Épaisseur dalle', value: `${thicknessCm} cm` },
      { label: 'Finition', value: finish === 'carrelage' ? 'Carrelage extérieur' : 'Béton lissé' }
    ],
    quantityLabel: 'Surface de terrasse',
    quantityValue: surface,
    quantityUnit: 'm²',
    materials,
    materialsCost,
    labor,
    delivery,
    totalWeightTonnes,
    totalCost: round2(materialsCost + labor.total + delivery)
  }
}

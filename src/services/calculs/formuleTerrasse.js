/**
 * 9.4 Terrasse
 * Reprend le calcul de la dalle et ajoute une finition :
 *  - Carrelage   : Surface × 50 €/m²
 *  - Béton lissé : Surface × 15 €/m²
 */
import { ligneMateriau, synthese } from './utilitaires.js'
import { baseDalle } from './formuleDalle.js'

export function calculerTerrasse(dimensions, parametres, catalogue) {
  const b = baseDalle(dimensions, parametres, catalogue)
  const finition = dimensions.finition === 'beton_lisse' ? 'beton_lisse' : 'carrelage'
  const lignes = [...b.lignes, ligneMateriau(catalogue, finition, b.surface, 2)]
  return {
    mesures: [...b.mesures, { label: 'Finition', valeur: finition === 'carrelage' ? 'Carrelage' : 'Béton lissé', unite: '' }],
    lignes,
    ...synthese(lignes)
  }
}

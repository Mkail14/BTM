/**
 * 9.4 Terrasse
 * Reprend le calcul de la dalle et ajoute la finition béton lissé : Surface × 15 €/m²
 * (le carrelage a son propre ouvrage, voir formuleCarrelage.js)
 */
import { ligneMateriau, synthese } from './utilitaires.js'
import { baseDalle } from './formuleDalle.js'

export function calculerTerrasse(dimensions, parametres, catalogue) {
  const b = baseDalle(dimensions, parametres, catalogue)
  const lignes = [...b.lignes, ligneMateriau(catalogue, 'beton_lisse', b.surface, 2)]
  return {
    mesures: [...b.mesures, { label: 'Finition', valeur: 'Béton lissé', unite: '' }],
    lignes,
    ...synthese(lignes)
  }
}

/**
 * 9.3 Fondation
 * Volume des fouilles = Longueur × Largeur de la tranchée × Profondeur
 *  - Béton armé      : Volume × 2,4 t/m³
 *  - Armatures acier : Volume × 50 kg/m³
 */
import { arrondi, nombre, ligneMateriau, synthese } from './utilitaires.js'

export function calculerFondation(dimensions, parametres, catalogue) {
  const longueur = nombre(dimensions.longueur)
  const largeur = nombre(dimensions.largeur)
  const profondeur = nombre(dimensions.profondeur)
  const volume = longueur * largeur * profondeur
  const tonnesBeton = volume * parametres.densiteBeton

  const lignes = [
    ligneMateriau(catalogue, 'beton_arme', tonnesBeton, 2),
    ligneMateriau(catalogue, 'acier', volume * parametres.kgAcierParM3, 1)
  ]

  return {
    mesures: [
      { label: 'Volume des fouilles', valeur: arrondi(volume, 3), unite: 'm³', principale: true },
      { label: 'Poids de béton', valeur: arrondi(tonnesBeton, 2), unite: 't' }
    ],
    lignes,
    ...synthese(lignes)
  }
}

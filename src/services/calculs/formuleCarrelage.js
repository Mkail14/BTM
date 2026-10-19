/**
 * 9.5 Carrelage
 * Surface = Longueur × Largeur
 *  - Carreaux : Surface × 1,10 (coupes et casse)
 *  - Colle    : Surface × 5 kg/m², en sacs de 25 kg
 *  - Joint    : Surface × 0,5 kg/m²
 */
import { arrondi, nombre, ligneMateriau, synthese } from './utilitaires.js'

const FORMATS = { '30x30': 0.3, '45x45': 0.45, '60x60': 0.6 }

export function calculerCarrelage(dimensions, parametres, catalogue) {
  const surface = nombre(dimensions.longueur) * nombre(dimensions.largeur)
  const format = FORMATS[dimensions.format] ? dimensions.format : '60x60'
  const m2Carreaux = surface * parametres.margeCarreaux
  const nbCarreaux = Math.ceil(m2Carreaux / FORMATS[format] ** 2)

  const lignes = [
    ligneMateriau(catalogue, 'carrelage_sol', m2Carreaux, 2),
    ligneMateriau(catalogue, 'colle_carrelage', Math.ceil((surface * parametres.kgColleParM2) / parametres.kgParSacColle), 0),
    ligneMateriau(catalogue, 'joint_carrelage', surface * parametres.kgJointParM2, 1)
  ]
  return {
    mesures: [
      { label: 'Surface', valeur: arrondi(surface), unite: 'm²', principale: true },
      { label: 'Carreaux à commander', valeur: arrondi(m2Carreaux), unite: 'm²' },
      { label: `Nombre de carreaux (${format.replace('x', ' × ')} cm)`, valeur: nbCarreaux, unite: '' }
    ],
    lignes,
    ...synthese(lignes)
  }
}

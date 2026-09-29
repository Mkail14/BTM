/**
 * 9.2 Dalle
 * Volume = Longueur × Largeur × (Épaisseur / 100)
 *  - Béton       : Volume × 2,4 t/m³
 *  - Ferraillage : Surface × 5 kg/m²
 *  - Gravier     : Volume × 0,8 t/m³
 */
import { arrondi, nombre, ligneMateriau, synthese } from './utilitaires.js'

export function baseDalle(dimensions, parametres, catalogue) {
  const longueur = nombre(dimensions.longueur)
  const largeur = nombre(dimensions.largeur)
  const epaisseur = nombre(dimensions.epaisseur)
  const surface = longueur * largeur
  const volume = surface * (epaisseur / 100)
  const tonnesBeton = volume * parametres.densiteBeton

  const lignes = [
    ligneMateriau(catalogue, 'beton', tonnesBeton, 2),
    ligneMateriau(catalogue, 'ferraillage', surface * parametres.kgFerParM2, 1),
    ligneMateriau(catalogue, 'gravier', volume * parametres.tonnesGravierParM3, 2)
  ]

  return {
    surface, volume, tonnesBeton, lignes,
    mesures: [
      { label: 'Surface', valeur: arrondi(surface), unite: 'm²', principale: true },
      { label: 'Volume de béton', valeur: arrondi(volume, 3), unite: 'm³' },
      { label: 'Poids de béton', valeur: arrondi(tonnesBeton, 2), unite: 't' }
    ]
  }
}

export function calculerDalle(dimensions, parametres, catalogue) {
  const b = baseDalle(dimensions, parametres, catalogue)
  return { mesures: b.mesures, lignes: b.lignes, ...synthese(b.lignes) }
}

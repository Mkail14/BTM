/**
 * 9.1 Mur
 * Surface nette = (Longueur × Hauteur) − Surface des ouvertures
 *  - Parpaings 20×20×40 : Surface nette / 0,08 × 1,05 (marge 5 %)
 *  - Ciment gris 35 kg  : Surface nette / 2,5
 *  - Sable              : Surface nette / 10
 *  - Main-d'œuvre       : 8 h pour 10 m² à 15 €/h
 *  - Livraison          : 50 € fixe
 */
import { arrondi, nombre, ligneMateriau, synthese } from './utilitaires.js'

export function calculerMur(dimensions, parametres, catalogue) {
  const longueur = nombre(dimensions.longueur)
  const hauteur = nombre(dimensions.hauteur)
  const ouvertures = nombre(dimensions.ouvertures)
  const surfaceBrute = longueur * hauteur
  const surfaceNette = Math.max(0, surfaceBrute - ouvertures)

  const lignes = [
    ligneMateriau(catalogue, 'parpaing', Math.ceil((surfaceNette / parametres.surfaceParpaing) * parametres.margeParpaing), 0),
    ligneMateriau(catalogue, 'ciment', Math.ceil(surfaceNette / parametres.m2ParSacCiment), 0),
    ligneMateriau(catalogue, 'sable', surfaceNette / parametres.m2ParM3Sable, 2)
  ]

  const heures = (surfaceNette / 10) * parametres.heuresPour10m2

  return {
    mesures: [
      { label: 'Surface brute', valeur: arrondi(surfaceBrute), unite: 'm²' },
      { label: 'Ouvertures', valeur: arrondi(ouvertures), unite: 'm²' },
      { label: 'Surface nette', valeur: arrondi(surfaceNette), unite: 'm²', principale: true }
    ],
    lignes,
    ...synthese(lignes, heures, parametres.tauxHoraire, parametres.livraisonFixe)
  }
}

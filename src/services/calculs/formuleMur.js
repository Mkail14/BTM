/**
 * 9.1 Mur
 * Surface nette = (Longueur × Hauteur) − Surface des ouvertures, additionnée sur tous les murs
 *  - Parpaings 20×20×40 : Surface nette / 0,08 × 1,05 (marge 5 %)
 *  - Ciment gris 35 kg  : Surface nette / 2,5
 *  - Sable              : Surface nette / 10
 */
import { arrondi, nombre, ligneMateriau, synthese } from './utilitaires.js'

/** Mur principal (champs racine) + murs ajoutés (`autresMurs`) */
export function listerMurs(dimensions = {}) {
  const principal = { longueur: dimensions.longueur, hauteur: dimensions.hauteur, ouvertures: dimensions.ouvertures }
  return [principal, ...(Array.isArray(dimensions.autresMurs) ? dimensions.autresMurs : [])]
}

export function calculerMur(dimensions, parametres, catalogue) {
  const murs = listerMurs(dimensions)
  let surfaceBrute = 0
  let ouvertures = 0
  for (const m of murs) {
    surfaceBrute += nombre(m.longueur) * nombre(m.hauteur)
    ouvertures += nombre(m.ouvertures)
  }
  const surfaceNette = Math.max(0, surfaceBrute - ouvertures)

  const lignes = [
    ligneMateriau(catalogue, 'parpaing', Math.ceil((surfaceNette / parametres.surfaceParpaing) * parametres.margeParpaing), 0),
    ligneMateriau(catalogue, 'ciment', Math.ceil(surfaceNette / parametres.m2ParSacCiment), 0),
    ligneMateriau(catalogue, 'sable', surfaceNette / parametres.m2ParM3Sable, 2)
  ]

  return {
    mesures: [
      ...(murs.length > 1 ? [{ label: 'Nombre de murs', valeur: murs.length, unite: '' }] : []),
      { label: 'Surface brute', valeur: arrondi(surfaceBrute), unite: 'm²' },
      { label: 'Ouvertures', valeur: arrondi(ouvertures), unite: 'm²' },
      { label: 'Surface nette', valeur: arrondi(surfaceNette), unite: 'm²', principale: true }
    ],
    lignes,
    ...synthese(lignes)
  }
}

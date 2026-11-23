/**
 * 9.5 Carrelage
 * Surface = Longueur × Largeur
 *  - Carreaux : Surface × 1,10 (coupes et casse)
 *      · modèle choisi chez un fournisseur : carreaux entiers × son prix à l'unité, ou cartons entiers × prix du
 *        carton s'il vend au carton (parCarton) ;
 *      · sinon : m² au prix moyen du catalogue (carrelage de sol)
 *  - Colle    : Surface × 5 kg/m², en sacs de 25 kg
 *  - Joint    : Surface × 0,5 kg/m²
 */
import { arrondi, nombre, ligneMateriau, synthese } from './utilitaires.js'

const FORMATS = { '30x30': 0.3, '45x45': 0.45, '60x60': 0.6 }

/** Modèle retenu, s'il correspond au format choisi (un changement de format l'annule) */
export function modeleCarreau(dimensions, format = dimensions.format) {
  const m = dimensions.carreau
  return m && typeof m === 'object' && m.id && m.format === format && Number(m.prix) > 0 ? m : null
}

export function calculerCarrelage(dimensions, parametres, catalogue) {
  const surface = nombre(dimensions.longueur) * nombre(dimensions.largeur)
  const format = FORMATS[dimensions.format] ? dimensions.format : '60x60'
  const m2Carreaux = surface * parametres.margeCarreaux
  const nbCarreaux = Math.ceil(m2Carreaux / FORMATS[format] ** 2)
  const modele = modeleCarreau(dimensions, format)
  const parCarton = modele && Number(modele.parCarton) > 1 ? Number(modele.parCarton) : 0
  const nbCartons = parCarton ? Math.ceil(nbCarreaux / parCarton) : 0

  const lignes = [
    modele
      ? {
          id: `carreau:${modele.id}`,
          libelle: `Carreaux « ${modele.nom} » ${format.replace('x', ' × ')} cm${parCarton ? `, carton de ${parCarton}` : ''}${modele.fournisseur ? ` — ${modele.fournisseur}` : ''}`,
          unite: parCarton ? 'carton' : 'carreau',
          quantite: parCarton ? nbCartons : nbCarreaux,
          prixUnitaire: Number(modele.prix),
          sousTotal: arrondi((parCarton ? nbCartons : nbCarreaux) * Number(modele.prix))
        }
      : ligneMateriau(catalogue, 'carrelage_sol', m2Carreaux, 2),
    ligneMateriau(catalogue, 'colle_carrelage', Math.ceil((surface * parametres.kgColleParM2) / parametres.kgParSacColle), 0),
    ligneMateriau(catalogue, 'joint_carrelage', surface * parametres.kgJointParM2, 1)
  ]
  return {
    mesures: [
      { label: 'Surface', valeur: arrondi(surface), unite: 'm²', principale: true },
      { label: 'Carreaux à commander', valeur: arrondi(m2Carreaux), unite: 'm²' },
      { label: `Nombre de carreaux (${format.replace('x', ' × ')} cm)`, valeur: nbCarreaux, unite: '' },
      ...(parCarton ? [{ label: `Cartons de ${parCarton}`, valeur: nbCartons, unite: '' }] : [])
    ],
    lignes,
    ...synthese(lignes)
  }
}

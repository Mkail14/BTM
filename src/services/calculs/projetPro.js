/**
 * Projet professionnel (multi-ouvrages) : plusieurs maisons, dalles, murs et terrasses dans un même projet.
 * Chaque ouvrage est calculé avec les formules du calculateur (mêmes paramètres, mêmes prix) ;
 * les matériaux sont additionnés en un seul devis, puis les frais de service BTM sont ajoutés une fois.
 * Coordonnées : 1 unité = 1 mètre ; x vers l'est, z vers le sud ; rotation en quarts de tour.
 */
import { calculerEstimation } from './moteurCalculs.js'
import { arrondi } from './utilitaires.js'

export const TYPE_ENSEMBLE = 'ensemble'

export const TYPES_OUVRAGES = {
  maison: { libelle: 'Maison', icone: 'fa-solid fa-house', description: 'Fondations, dalle et murs périphériques' },
  dalle: { libelle: 'Dalle', icone: 'fa-solid fa-layer-group', description: 'Garage, parking, abri' },
  mur: { libelle: 'Mur', icone: 'fa-solid fa-building', description: 'Clôture, mur de soutènement' },
  terrasse: { libelle: 'Terrasse', icone: 'fa-solid fa-umbrella-beach', description: 'Carrelage ou béton lissé' }
}

let compteur = 0
const nouvelId = () => `o${Date.now().toString(36)}${(compteur++).toString(36)}`

/** Ouvrage par défaut, placé à côté des existants */
export function creerOuvrage(type, existants = []) {
  const x = existants.reduce((max, o) => Math.max(max, (o.x || 0) + emprise(o).longueur), -2) + 2
  const n = existants.filter((o) => o.type === type).length + 1
  const base = { id: nouvelId(), type, nom: `${TYPES_OUVRAGES[type].libelle} ${n}`, x: existants.length ? arrondi(x, 1) : 0, z: 0, rotation: 0 }
  if (type === 'maison') {
    return {
      ...base, longueur: 10, largeur: 8, hauteur: 2.7, epaisseurMur: 0.2, epaisseurDalle: 12,
      fondationLargeur: 0.5, fondationProfondeur: 0.6, portes: 1, fenetres: 4, refends: 0,
      terrasse: false, terrasseProfondeur: 3, terrasseFinition: 'carrelage'
    }
  }
  if (type === 'dalle') return { ...base, longueur: 6, largeur: 4, epaisseurDalle: 12 }
  if (type === 'mur') return { ...base, longueur: 10, hauteur: 1.8, epaisseurMur: 0.2, ouvertures: 0 }
  return { ...base, longueur: 6, largeur: 4, epaisseurDalle: 10, terrasseFinition: 'carrelage' }
}

// Dimensions d'ouvertures standard (m) : porte 0,9 × 2,15 ; fenêtre 1,2 × 1,15
export const PORTE = { largeur: 0.9, hauteur: 2.15 }
export const FENETRE = { largeur: 1.2, hauteur: 1.15, allege: 0.95 }

/** Emprise au sol après rotation (longueur selon x, largeur selon z) */
export function emprise(o) {
  const profondeur = o.type === 'mur' ? (o.epaisseurMur || 0.2) : o.largeur + (o.type === 'maison' && o.terrasse ? o.terrasseProfondeur : 0)
  return o.rotation % 2 ? { longueur: profondeur, largeur: o.longueur } : { longueur: o.longueur, largeur: profondeur }
}

/** Mesures exactes d'un ouvrage (affichées dans le panneau et sur la maquette) */
export function mesuresOuvrage(o) {
  if (o.type === 'maison') {
    const perimetre = 2 * (o.longueur + o.largeur)
    const ouvertures = o.portes * PORTE.largeur * PORTE.hauteur + o.fenetres * FENETRE.largeur * FENETRE.hauteur
    const interieur = Math.max(0, (o.longueur - 2 * o.epaisseurMur) * (o.largeur - 2 * o.epaisseurMur))
    return {
      perimetre: arrondi(perimetre), surfaceDalle: arrondi(o.longueur * o.largeur), surfaceHabitable: arrondi(interieur),
      surfaceMurs: arrondi(Math.max(0, perimetre * o.hauteur - ouvertures)), ouvertures: arrondi(ouvertures),
      volumeDalle: arrondi(o.longueur * o.largeur * o.epaisseurDalle / 100, 3),
      longueurFondations: arrondi(perimetre + o.refends * o.largeur),
      surfaceTerrasse: o.terrasse ? arrondi(o.longueur * o.terrasseProfondeur) : 0
    }
  }
  if (o.type === 'mur') return { surfaceMurs: arrondi(Math.max(0, o.longueur * o.hauteur - (o.ouvertures || 0))), longueur: o.longueur }
  return { surfaceDalle: arrondi(o.longueur * o.largeur), volumeDalle: arrondi(o.longueur * o.largeur * o.epaisseurDalle / 100, 3) }
}

/** Décompose un ouvrage en calculs élémentaires du calculateur : [{ type, dimensions, libelle }] */
function decomposer(o) {
  const m = mesuresOuvrage(o)
  if (o.type === 'maison') {
    const parties = [
      { type: 'fondation', libelle: 'Fondations', dimensions: { longueur: m.longueurFondations, largeur: o.fondationLargeur, profondeur: o.fondationProfondeur } },
      { type: 'dalle', libelle: 'Dalle', dimensions: { longueur: o.longueur, largeur: o.largeur, epaisseur: o.epaisseurDalle } },
      { type: 'mur', libelle: 'Murs', dimensions: { longueur: m.perimetre, hauteur: o.hauteur, ouvertures: m.ouvertures } }
    ]
    if (o.terrasse) parties.push({ type: 'terrasse', libelle: 'Terrasse', dimensions: { longueur: o.longueur, largeur: o.terrasseProfondeur, epaisseur: 10, finition: o.terrasseFinition } })
    return parties
  }
  if (o.type === 'mur') return [{ type: 'mur', libelle: 'Mur', dimensions: { longueur: o.longueur, hauteur: o.hauteur, ouvertures: o.ouvertures || 0 } }]
  if (o.type === 'dalle') return [{ type: 'dalle', libelle: 'Dalle', dimensions: { longueur: o.longueur, largeur: o.largeur, epaisseur: o.epaisseurDalle } }]
  return [{ type: 'terrasse', libelle: 'Terrasse', dimensions: { longueur: o.longueur, largeur: o.largeur, epaisseur: o.epaisseurDalle, finition: o.terrasseFinition } }]
}

/**
 * Devis complet du projet : même forme qu'une estimation du calculateur (lignes, totaux, frais, mesures),
 * plus le détail par ouvrage et le projet lui-même (pour le rouvrir).
 * @throws {Error} message lisible si un ouvrage a une dimension hors limites
 */
export function calculerProjetPro(projet, { catalogue, tauxFrais = 0 } = {}) {
  const ouvrages = []
  const cumul = new Map()
  for (const o of projet.ouvrages) {
    let totalOuvrage = 0
    const parties = []
    for (const p of decomposer(o)) {
      let r
      try {
        r = calculerEstimation(p.type, p.dimensions, { catalogue, tauxFrais: 0 })
      } catch (e) {
        const champ = e.erreurs ? Object.values(e.erreurs)[0] : e.message
        throw new Error(`${o.nom} — ${p.libelle.toLowerCase()} : ${champ}`)
      }
      totalOuvrage += r.totalMateriaux
      parties.push({ libelle: p.libelle, total: r.totalMateriaux })
      for (const l of r.lignes) {
        const c = cumul.get(l.id)
        if (c) { c.quantite += l.quantite; c.sousTotal += l.sousTotal } else cumul.set(l.id, { ...l })
      }
    }
    ouvrages.push({ id: o.id, nom: o.nom, type: o.type, total: arrondi(totalOuvrage), parties })
  }
  const lignes = [...cumul.values()].map((l) => ({ ...l, quantite: arrondi(l.quantite, 2), sousTotal: arrondi(l.sousTotal) }))
  const totalMateriaux = arrondi(lignes.reduce((s, l) => s + l.sousTotal, 0))
  const taux = Number.isFinite(Number(tauxFrais)) ? Number(tauxFrais) : 0
  const frais = arrondi((totalMateriaux * taux) / 100)

  const mesures = projet.ouvrages.map(mesuresOuvrage)
  const somme = (cle) => arrondi(mesures.reduce((s, m) => s + (m[cle] || 0), 0), 3)
  return {
    type: TYPE_ENSEMBLE,
    typeLibelle: 'Projet professionnel',
    calculeLe: new Date().toISOString(),
    projet: JSON.parse(JSON.stringify(projet)),
    dimensions: {},
    ouvrages,
    lignes,
    totalMateriaux,
    sousTotal: totalMateriaux,
    fraisService: { taux, montant: frais },
    total: arrondi(totalMateriaux + frais),
    mesures: [
      { label: 'Ouvrages', valeur: projet.ouvrages.length, unite: '', principale: true },
      { label: 'Surface de dalles', valeur: somme('surfaceDalle'), unite: 'm²' },
      { label: 'Surface habitable', valeur: somme('surfaceHabitable'), unite: 'm²' },
      { label: 'Surface de murs', valeur: somme('surfaceMurs'), unite: 'm²' },
      { label: 'Volume de dalles', valeur: somme('volumeDalle'), unite: 'm³' },
      { label: 'Terrasses', valeur: somme('surfaceTerrasse'), unite: 'm²' }
    ].filter((m) => m.valeur)
  }
}

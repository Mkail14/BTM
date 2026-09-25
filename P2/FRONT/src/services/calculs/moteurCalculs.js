/**
 * Moteur de calculs BTM — orchestre validation + formules (BF04, BF05, BNF06).
 * Les calculs sont 100 % côté client (section 15 : aucun appel API requis).
 */
import { trouverTypeProjet } from '@/donnees/typesProjets.js'
import { materiaux as catalogueLocal } from '@/donnees/materiaux.js'
import { calculerMur, listerMurs } from './formuleMur.js'
import { calculerDalle } from './formuleDalle.js'
import { calculerFondation } from './formuleFondation.js'
import { calculerTerrasse } from './formuleTerrasse.js'
import { nombre } from './utilitaires.js'

const FORMULES = { mur: calculerMur, dalle: calculerDalle, fondation: calculerFondation, terrasse: calculerTerrasse }

export const MESSAGES = {
  obligatoire: 'Ce champ est obligatoire',            // ER01
  nombreInvalide: 'Doit être un nombre supérieur à 0', // ER02
  ouverturesTropGrandes: 'La surface d’ouvertures dépasse la surface du mur', // ER03
  erreurCalcul: 'Erreur lors du calcul'               // ER06
}

/**
 * Valide les dimensions saisies pour un type de projet.
 * @returns {{ valide: boolean, erreurs: Record<string,string> }}
 */
export function validerDimensions(typeId, dimensions = {}) {
  const type = trouverTypeProjet(typeId)
  const erreurs = {}
  if (!type) return { valide: false, erreurs: { type: 'Type de projet inconnu' } }

  validerChamps(type.champs, dimensions, erreurs)

  if (typeId === 'mur') {
    verifierOuvertures(dimensions, erreurs)
    ;(dimensions.autresMurs || []).forEach((mur, i) => {
      validerChamps(type.champs, mur, erreurs, `autresMurs.${i}.`)
      verifierOuvertures(mur, erreurs, `autresMurs.${i}.`)
    })
  }

  return { valide: Object.keys(erreurs).length === 0, erreurs }
}

/** Les erreurs sont indexées par `prefixe + nom du champ` (ex. « autresMurs.0.longueur ») */
function validerChamps(champs, valeurs, erreurs, prefixe = '') {
  for (const champ of champs) {
    const cle = prefixe + champ.nom
    const brut = valeurs[champ.nom]
    if (champ.type === 'select') {
      if (!brut) erreurs[cle] = MESSAGES.obligatoire
      continue
    }
    const vide = brut === undefined || brut === null || String(brut).trim() === ''
    if (vide) {
      if (!champ.optionnel) erreurs[cle] = MESSAGES.obligatoire
      continue
    }
    const n = nombre(brut)
    if (!Number.isFinite(n) || (champ.optionnel ? n < 0 : n <= 0)) {
      erreurs[cle] = MESSAGES.nombreInvalide
      continue
    }
    if (champ.max !== undefined && n > champ.max) {
      erreurs[cle] = `Valeur maximale : ${champ.max} ${champ.unite}`
    }
  }
}

function verifierOuvertures(mur, erreurs, prefixe = '') {
  if (erreurs[`${prefixe}longueur`] || erreurs[`${prefixe}hauteur`] || erreurs[`${prefixe}ouvertures`]) return
  const surface = nombre(mur.longueur) * nombre(mur.hauteur)
  if (nombre(mur.ouvertures) >= surface && surface > 0) erreurs[`${prefixe}ouvertures`] = MESSAGES.ouverturesTropGrandes
}

/**
 * Calcule l'estimation complète.
 * @param {string} typeId
 * @param {object} dimensions
 * @param {object} [options] { catalogue?: prix Supabase, parametres?: override }
 */
export function calculerEstimation(typeId, dimensions, options = {}) {
  const type = trouverTypeProjet(typeId)
  if (!type) throw new Error('Type de projet inconnu')
  const { valide, erreurs } = validerDimensions(typeId, dimensions)
  if (!valide) {
    const err = new Error('Dimensions invalides')
    err.erreurs = erreurs
    throw err
  }
  const catalogue = { ...catalogueLocal, ...(options.catalogue || {}) }
  const parametres = { ...type.parametres, ...(options.parametres || {}) }
  const formule = FORMULES[typeId]
  const resultat = formule(dimensions, parametres, catalogue)

  const dims = {}
  for (const c of type.champs) dims[c.nom] = c.type === 'select' ? (dimensions[c.nom] ?? c.defaut) : nombre(dimensions[c.nom])
  if (typeId === 'mur' && dimensions.autresMurs?.length) {
    dims.autresMurs = dimensions.autresMurs.map((m) => ({
      longueur: nombre(m.longueur), hauteur: nombre(m.hauteur), ouvertures: nombre(m.ouvertures)
    }))
  }

  return {
    type: type.id,
    typeLibelle: type.libelle,
    dimensions: dims,
    calculeLe: new Date().toISOString(),
    ...resultat
  }
}

/** Résumé lisible des dimensions (ex. « 10 m × 2.5 m ») pour cartes et PDF */
export function resumerDimensions(typeId, dimensions = {}) {
  const type = trouverTypeProjet(typeId)
  if (!type) return ''
  const resume = type.champs
    .filter((c) => c.type !== 'select' && dimensions[c.nom] !== undefined && dimensions[c.nom] !== '')
    .map((c) => `${dimensions[c.nom]} ${c.unite}`)
    .join(' × ')
  const autres = dimensions.autresMurs?.length || 0
  return autres ? `${resume} (+ ${autres} mur${autres > 1 ? 's' : ''})` : resume
}

/** Une ligne par mur (« Mur 1 », « Mur 2 »…) quand l'estimation en compte plusieurs — résultats et PDF */
export function lignesMurs(dimensions = {}) {
  return listerMurs(dimensions).map((m, i) => {
    const ouvertures = nombre(m.ouvertures) ? ` − ${formaterNombre(m.ouvertures, 2)} m² d’ouvertures` : ''
    return { label: `Mur ${i + 1}`, valeur: `${formaterNombre(m.longueur, 2)} m × ${formaterNombre(m.hauteur, 2)} m${ouvertures}` }
  })
}

export const formaterEuros = (n) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(Number(n) || 0)

export const formaterNombre = (n, decimales = 2) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: decimales }).format(Number(n) || 0)

const UNITES_EN_TOUTES_LETTRES = { u: ['unité', 'unités'], sac: ['sac', 'sacs'], t: ['tonne', 'tonnes'] }

/** « 13 sacs », « 1,5 tonne », « 3,2 m³ » — quantité lisible pour un particulier */
export function formaterQuantite(quantite, unite) {
  const mots = UNITES_EN_TOUTES_LETTRES[unite]
  const n = formaterNombre(quantite, 2)
  return mots ? `${n} ${quantite >= 2 ? mots[1] : mots[0]}` : `${n} ${unite}`
}

/** « Votre mur », « Vos murs », « Vos fondations »… + accord du verbe */
export function sujetEstimation(resultat) {
  const type = trouverTypeProjet(resultat?.type)
  if (!type) return { sujet: 'Votre projet', pluriel: false }
  if (resultat.dimensions?.autresMurs?.length) return { sujet: type.sujetPluriel, pluriel: true }
  return { sujet: type.sujet, pluriel: type.sujet.startsWith('Vos') }
}

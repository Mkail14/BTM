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
import { nombre, arrondi } from './utilitaires.js'

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

/** Taux des frais de service BTM (%) — modifiable dans /admin, section « Calculateur & prix » */
export const TAUX_FRAIS_DEFAUT = 1.25

/**
 * Frais de service BTM : pourcentage du coût des matériaux, ajouté au devis du client.
 * `sousTotal` = matériaux, `total` = ce que paie le client.
 */
function ajouterFraisService(resultat, tauxFrais) {
  const taux = Number.isFinite(Number(tauxFrais)) && Number(tauxFrais) >= 0 ? Number(tauxFrais) : TAUX_FRAIS_DEFAUT
  const sousTotal = resultat.total
  const montant = arrondi((sousTotal * taux) / 100)
  return { ...resultat, sousTotal, fraisService: { taux, montant }, total: arrondi(sousTotal + montant) }
}

/**
 * Code promo (choisi par l'admin) : réduction en % ou en €, sur tout le devis (`total`)
 * ou sur les seuls frais de service BTM (`frais`). Jamais plus que la base réduite.
 * @param {object|null} code { code, type: 'pourcentage'|'montant', valeur, portee: 'total'|'frais' }
 */
function appliquerRemise(resultat, code) {
  if (!code || !(Number(code.valeur) > 0)) return resultat
  const base = code.portee === 'frais' ? (resultat.fraisService?.montant || 0) : resultat.total
  const brut = code.type === 'montant' ? Number(code.valeur) : (base * Number(code.valeur)) / 100
  const montant = arrondi(Math.min(base, Math.max(0, brut)))
  return {
    ...resultat,
    remise: { code: code.code, type: code.type, valeur: Number(code.valeur), portee: code.portee, montant },
    total: arrondi(resultat.total - montant)
  }
}

/** Code promo appliqué à un devis déjà chiffré (achat direct, devis pro) : même règle que le calculateur */
export function appliquerCodePromo(resultat, code) {
  if (!resultat) return resultat
  const { remise: _r, ...sans } = resultat
  const base = { ...sans, total: arrondi(Number(sans.totalMateriaux) || 0) }
  return code ? appliquerRemise(base, code) : base
}

/** « −10 % », « −20 € » */
export const libelleReduction = (code) => (code.type === 'montant' ? `−${formaterEuros(code.valeur)}` : `−${formaterNombre(code.valeur, 2)} %`)

/**
 * Calcule l'estimation complète.
 * @param {string} typeId
 * @param {object} dimensions
 * @param {object} [options] { catalogue?, parametres?, tauxFrais?: % des frais BTM, remise?: code promo vérifié }
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
  // Modèle plateforme : aucun frais pour le client (la commission BTM est payée par le fournisseur).
  // tauxFrais > 0 n'est plus utilisé que pour d'anciens appels.
  const brut = formule(dimensions, parametres, catalogue)
  const resultat = appliquerRemise(Number(options.tauxFrais) > 0 ? ajouterFraisService(brut, options.tauxFrais) : brut, options.remise)

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

/** Libellé des frais de service, ex. « Frais de service BTM (1,25 %) » */
export const libelleFrais = (taux) => `Frais de service BTM (${formaterNombre(taux, 2)} %)`

/**
 * Décomposition du prix pour l'affichage (résultats, PDF, admin).
 * Les estimations enregistrées avant l'ajout des frais n'ont pas de ligne « frais ».
 */
export function detailPrix(resultat) {
  const lignes = [{ cle: 'materiaux', label: 'Matériaux', valeur: resultat.totalMateriaux }]
  if (resultat.fraisService?.montant > 0) lignes.push({ cle: 'frais', label: libelleFrais(resultat.fraisService.taux), detail: 'Service de mise en relation et d’accompagnement', valeur: resultat.fraisService.montant })
  if (resultat.remise?.montant) {
    const r = resultat.remise
    lignes.push({ cle: 'remise', label: `Code ${r.code} (${libelleReduction(r)}${r.portee === 'frais' ? ' sur les frais' : ''})`, valeur: -r.montant })
  }
  return lignes
}

/**
 * Anciennes estimations (avant le passage « matériaux uniquement ») : elles contenaient une main-d'œuvre
 * et une livraison estimées, puis des frais BTM payés par le client. On les retire : le total ne porte
 * que sur les matériaux, pour que tout devis affiché, exporté ou compté suive la même règle.
 */
export function normaliserResultat(resultat) {
  if (!resultat) return resultat
  // Devis d'avant le modèle plateforme : les frais BTM étaient payés par le client ; on les retire du total
  if (resultat.fraisService?.montant > 0 && resultat.mainOeuvre === undefined && resultat.livraison === undefined) {
    const { fraisService, sousTotal: _st, remise, ...reste } = resultat
    const materiaux = Number(reste.totalMateriaux) || 0
    const rem = remise && remise.portee !== 'frais' ? remise : null
    const montantRemise = rem ? arrondi(Math.min(materiaux, rem.type === 'montant' ? Number(rem.valeur) : (materiaux * Number(rem.valeur)) / 100)) : 0
    return { ...reste, ...(rem ? { remise: { ...rem, montant: montantRemise } } : {}), total: arrondi(materiaux - montantRemise) }
  }
  if (resultat.mainOeuvre === undefined && resultat.livraison === undefined) return resultat
  const { mainOeuvre: _mo, livraison: _liv, sousTotal: _st, fraisService: _f, ...reste } = resultat
  return { ...reste, total: arrondi(Number(reste.totalMateriaux) || 0) }
}

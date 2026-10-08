/**
 * Offres des fournisseurs (modèle plateforme) : ce que chacun propose, à quel prix, et si c'est disponible.
 *  - prix : prix BTM, réservé aux achats avec un code de retrait ;
 *  - prix_comptoir : ce que paie un client qui vient sans code.
 * Lecture publique via la fonction SQL offres_publiques (migration 0017) ; le stock exact n'est jamais publié.
 */
import { supabase, supabaseConfigure } from './client.js'
import { arrondi } from '@/services/calculs/utilitaires.js'

let cache = null
export async function chargerOffres({ force = false } = {}) {
  if (!supabaseConfigure) return []
  if (cache && !force) return cache
  const { data, error } = await supabase.rpc('offres_publiques')
  if (error) { console.warn('Offres indisponibles', error); return [] }
  cache = data.map((o) => ({ ...o, prix: Number(o.prix), prix_comptoir: Number(o.prix_comptoir) }))
  return cache
}

/** Offres groupées par fournisseur : { id, nom, commune, livraison, materiaux: { [id]: offre }, articles: [] } */
export function parFournisseur(offres) {
  const groupes = new Map()
  for (const o of offres) {
    if (!groupes.has(o.fournisseur_id)) groupes.set(o.fournisseur_id, { id: o.fournisseur_id, nom: o.fournisseur_nom, commune: o.commune, livraison: o.livraison, materiaux: {}, articles: [] })
    const g = groupes.get(o.fournisseur_id)
    if (o.materiau_id) g.materiaux[o.materiau_id] = o
    else g.articles.push(o)
  }
  return [...groupes.values()]
}

/**
 * Prix exact d'un devis chez un fournisseur : chaque ligne à son prix BTM, et ce qu'elle coûterait au comptoir.
 * @returns {{ lignes, total, totalComptoir, economie, disponibles, manquantes }}
 */
export function chiffrerChez(fournisseur, lignes) {
  let total = 0, totalComptoir = 0
  const detail = lignes.map((l) => {
    const o = fournisseur.materiaux[l.id]
    const propose = !!o && o.disponible
    const prix = propose ? o.prix : null
    const st = propose ? arrondi(l.quantite * prix) : 0
    if (propose) { total += st; totalComptoir += arrondi(l.quantite * o.prix_comptoir) }
    return { ...l, propose, prixFournisseur: prix, prixComptoir: propose ? o.prix_comptoir : null, sousTotalFournisseur: st, rupture: !!o && !o.disponible }
  })
  const disponibles = detail.filter((l) => l.propose).length
  return {
    lignes: detail, total: arrondi(total), totalComptoir: arrondi(totalComptoir), economie: arrondi(totalComptoir - total),
    disponibles, manquantes: detail.filter((l) => !l.propose)
  }
}

/**
 * Devis au prix du fournisseur choisi : les lignes qu'il propose prennent son prix BTM ;
 * les autres gardent le prix de référence et sont marquées « non disponible chez ce fournisseur ».
 * Le code promo BTM éventuel est recalculé sur le nouveau total.
 */
export function appliquerPrixFournisseur(resultat, fournisseur) {
  if (!resultat || !fournisseur) return resultat
  const lignes = resultat.lignes.map((l) => {
    const o = fournisseur.materiaux[l.id]
    const prixReference = l.prixReference ?? l.prixUnitaire
    if (!o || !o.disponible) return { ...l, prixUnitaire: prixReference, prixReference, sousTotal: arrondi(l.quantite * prixReference), indisponible: true, prixComptoir: null }
    return { ...l, prixUnitaire: o.prix, prixReference, prixComptoir: o.prix_comptoir, sousTotal: arrondi(l.quantite * o.prix), indisponible: false }
  })
  const totalMateriaux = arrondi(lignes.reduce((s, l) => s + l.sousTotal, 0))
  const totalComptoir = arrondi(lignes.reduce((s, l) => s + (l.prixComptoir != null ? l.quantite * l.prixComptoir : l.sousTotal), 0))
  const r = resultat.remise
  const remise = r ? { ...r, montant: arrondi(Math.min(totalMateriaux, r.type === 'montant' ? Number(r.valeur) : (totalMateriaux * Number(r.valeur)) / 100)) } : undefined
  return {
    ...resultat, lignes, totalMateriaux, ...(remise ? { remise } : {}),
    total: arrondi(totalMateriaux - (remise?.montant || 0)),
    prixFournisseur: { id: fournisseur.id, nom: fournisseur.nom, totalComptoir, economie: arrondi(totalComptoir - totalMateriaux) }
  }
}

/** Meilleure offre disponible pour chaque matériau (catalogue « Je sais ce qu'il me faut ») */
export function meilleuresOffres(offres) {
  const m = {}
  for (const o of offres) {
    if (!o.materiau_id || !o.disponible) continue
    const e = (m[o.materiau_id] ||= { min: o.prix, max: o.prix, comptoirMax: o.prix_comptoir, fournisseurs: 0 })
    e.min = Math.min(e.min, o.prix); e.max = Math.max(e.max, o.prix); e.comptoirMax = Math.max(e.comptoirMax, o.prix_comptoir); e.fournisseurs++
  }
  return m
}

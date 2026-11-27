/**
 * Carreaux des fournisseurs : les modèles qu'un fournisseur met en ligne (nom, format, finition, couleur, photo),
 * vendus au carreau ou au carton (carreaux_par_carton) : prix_unitaire est le prix d'un carreau, ou d'un carton.
 * Stock facultatif, dans la même unité : décompté à l'encaissement, 0 = en rupture pour les clients.
 *  - calculateur (carrelage) : le client choisit son modèle, le devis compte les carreaux (ou cartons) entiers à ce prix ;
 *  - espace fournisseur : le fournisseur ajoute, modifie, masque ou retire ses modèles ;
 *  - administration : l'admin corrige ou retire un modèle.
 */
import { api, apiConfiguree } from './client.js'
import { televerserPhoto } from './serviceRealisations.js'

/** Côté d'un carreau en mètres, par format proposé dans le calculateur */
export const FORMATS_CARREAUX = { '30x30': 0.3, '45x45': 0.45, '60x60': 0.6 }
export const libelleFormat = (format) => `${String(format).replace('x', ' × ')} cm`
/** Carreaux par unité de vente : 1 au carreau, N au carton */
export const parUnite = (c) => (c.carreaux_par_carton > 1 ? c.carreaux_par_carton : 1)
/** m² couverts par une unité de vente (un carreau ou un carton) */
export const m2ParUnite = (c) => Math.round(FORMATS_CARREAUX[c.format] ** 2 * parUnite(c) * 100) / 100
/** « le carreau », « le carton de 4 » */
export const libelleVente = (c) => (parUnite(c) > 1 ? `le carton de ${parUnite(c)}` : 'le carreau')
/** « carreau » ou « carton » : unité du prix et du stock */
export const uniteVente = (c) => (parUnite(c) > 1 ? 'carton' : 'carreau')
/** Prix au m² d'un modèle (à titre indicatif : le devis compte des carreaux ou cartons entiers) */
export const prixAuM2 = (c) => Math.round((c.prix_unitaire / (FORMATS_CARREAUX[c.format] ** 2 * parUnite(c))) * 100) / 100
/** Nombre d'unités de vente pour `nbCarreaux` carreaux (cartons entiers) */
export const unitesPour = (c, nbCarreaux) => Math.ceil(nbCarreaux / parUnite(c))

const versCarreau = (c) => ({
  ...c,
  prix_unitaire: Number(c.prix_unitaire),
  prix_comptoir: c.prix_comptoir == null ? null : Number(c.prix_comptoir),
  carreaux_par_carton: c.carreaux_par_carton > 1 ? Number(c.carreaux_par_carton) : null,
  stock: c.stock == null ? null : Number(c.stock)
})

let cache = null
export function oublierCarreaux() { cache = null }

/**
 * Modèles en ligne (actifs, chez des fournisseurs actifs), avec le nom, la commune et la livraison du fournisseur,
 * et `devis` : le nombre de devis qui les ont choisis
 */
export async function listerCarreauxPublics({ force = false } = {}) {
  if (!apiConfiguree) return []
  if (cache && !force) return cache
  try {
    cache = ((await api.get('/carreaux')) || []).map((c) => ({ ...versCarreau(c), rupture: c.rupture || (c.stock != null && Number(c.stock) === 0) }))
  } catch (e) {
    console.warn('Carreaux indisponibles', e)
    return []
  }
  return cache
}

// ---------- Espace fournisseur ----------------------------------------------------------------

/** Admin : tous les modèles, masqués compris */
export async function listerTousCarreaux() {
  return ((await api.get('/admin/carreaux')) || []).map(versCarreau)
}

export async function listerMesCarreaux() {
  return ((await api.get('/espace-fournisseur/carreaux')) || []).map(versCarreau)
}

const champsCarreau = (c) => ({
  nom: c.nom.trim(),
  format: c.format,
  finition: c.finition?.trim() || null,
  couleur: c.couleur,
  photo_url: c.photo_url || null,
  prix_unitaire: c.prix_unitaire,
  prix_comptoir: c.prix_comptoir ?? null,
  carreaux_par_carton: c.carreaux_par_carton > 1 ? Math.round(c.carreaux_par_carton) : null,
  stock: c.stock ?? null,
  rupture: !!c.rupture,
  actif: c.actif !== false
})

/** Le fournisseur connecté (l'API déduit sa fiche du jeton) ; un admin passe par l'administration */
export async function enregistrerCarreau(_fournisseurId, c, { admin = false } = {}) {
  if (admin) await api.patch(`/admin/carreaux/${c.id}`, champsCarreau(c))
  else if (c.id) await api.put(`/espace-fournisseur/carreaux/${c.id}`, champsCarreau(c))
  else await api.post('/espace-fournisseur/carreaux', champsCarreau(c))
  oublierCarreaux()
}

/** Import d'un fichier : modèles ajoutés et modèles mis à jour, en une requête */
export async function importerCarreaux(_fournisseurId, nouveaux, modifies) {
  await api.post('/espace-fournisseur/carreaux/import', {
    nouveaux: nouveaux.map(champsCarreau), modifies: modifies.map((c) => ({ ...champsCarreau(c), id: c.id }))
  })
  oublierCarreaux()
}

export async function supprimerCarreau(id, { admin = false } = {}) {
  await api.delete(admin ? `/admin/carreaux/${id}` : `/espace-fournisseur/carreaux/${id}`)
  oublierCarreaux()
}

/** Photo du modèle, dans le dossier du compte (même stockage que les réalisations) */
export const televerserPhotoCarreau = (fichier) => televerserPhoto(fichier)

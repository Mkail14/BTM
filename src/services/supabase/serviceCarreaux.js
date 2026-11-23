/**
 * Carreaux des fournisseurs (table carreaux_fournisseur, migration 0029) : les modèles qu'un fournisseur met
 * en ligne (nom, format, finition, couleur, photo), vendus au carreau ou au carton (carreaux_par_carton,
 * migration 20261023200000) : prix_unitaire est le prix d'un carreau, ou d'un carton. Stock facultatif
 * (migration 20261023220000), dans la même unité : décompté à l'encaissement, 0 = en rupture pour les clients.
 *  - calculateur (carrelage) : le client choisit son modèle, le devis compte les carreaux (ou cartons) entiers à ce prix ;
 *  - espace fournisseur : le fournisseur ajoute, modifie, masque ou retire ses modèles.
 * Avant la migration 0029 (ou sans Supabase), la liste est vide : le devis garde le prix moyen du catalogue.
 */
import { supabase, supabaseConfigure } from './client.js'
import { televerserPhoto } from './serviceRealisations.js'

const TABLE_ABSENTE = ['42P01', 'PGRST205']
const COLONNES = 'id, fournisseur_id, nom, format, finition, couleur, photo_url, prix_unitaire, prix_comptoir, carreaux_par_carton, stock, rupture, actif'

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
 * Popularité : nombre de devis enregistrés qui utilisent chaque modèle (fonction popularite_carreaux,
 * totaux seulement : les projets restent privés). Fonction absente ou en erreur : tout à 0.
 */
async function lirePopularite() {
  const { data, error } = await supabase.rpc('popularite_carreaux')
  if (error) { console.warn('Popularité des carreaux indisponible', error); return new Map() }
  return new Map((data || []).map((l) => [l.carreau_id, l.devis]))
}

/**
 * Modèles en ligne (actifs, chez des fournisseurs actifs), avec le nom, la commune et la livraison du fournisseur,
 * et `devis` : le nombre de devis qui les ont choisis
 */
export async function listerCarreauxPublics({ force = false } = {}) {
  if (!supabaseConfigure) return []
  if (cache && !force) return cache
  const [{ data, error }, popularite] = await Promise.all([
    supabase
      .from('carreaux_fournisseur')
      .select(`${COLONNES}, fournisseurs(nom, commune, livraison, actif)`)
      .eq('actif', true)
      .order('prix_unitaire'),
    lirePopularite()
  ])
  if (error) {
    if (!TABLE_ABSENTE.includes(error.code)) console.warn('Carreaux indisponibles', error)
    return []
  }
  cache = (data || [])
    .filter((c) => c.fournisseurs?.actif !== false)
    .map(({ fournisseurs: f, ...c }) => ({
      ...versCarreau(c), rupture: c.rupture || (c.stock != null && Number(c.stock) === 0), fournisseur: f?.nom || '', commune: f?.commune || '', livraison: !!f?.livraison, devis: popularite.get(c.id) || 0
    }))
  return cache
}

// ---------- Espace fournisseur ----------------------------------------------------------------

const erreurTable = (error) => (TABLE_ABSENTE.includes(error?.code)
  ? new Error('La gestion des carreaux n’est pas encore activée (migration 0029).')
  : error)

/** Admin : tous les modèles, masqués compris (la RLS réserve cette lecture à l'admin) */
export async function listerTousCarreaux() {
  const { data, error } = await supabase.from('carreaux_fournisseur').select(COLONNES).order('fournisseur_id').order('cree_le')
  if (error) throw erreurTable(error)
  return (data || []).map(versCarreau)
}

export async function listerMesCarreaux(fournisseurId) {
  const { data, error } = await supabase.from('carreaux_fournisseur').select(COLONNES).eq('fournisseur_id', fournisseurId).order('cree_le')
  if (error) throw erreurTable(error)
  return (data || []).map(versCarreau)
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
  actif: c.actif !== false,
  mis_a_jour_le: new Date().toISOString()
})

export async function enregistrerCarreau(fournisseurId, c) {
  const champs = champsCarreau(c)
  const { error } = await (c.id
    ? supabase.from('carreaux_fournisseur').update(champs).eq('id', c.id)
    : supabase.from('carreaux_fournisseur').insert({ ...champs, fournisseur_id: fournisseurId }))
  if (error) throw erreurTable(error)
  oublierCarreaux()
}

/** Import d'un fichier : modèles ajoutés et modèles mis à jour, en deux requêtes */
export async function importerCarreaux(fournisseurId, nouveaux, modifies) {
  if (nouveaux.length) {
    const { error } = await supabase.from('carreaux_fournisseur').insert(nouveaux.map((c) => ({ ...champsCarreau(c), fournisseur_id: fournisseurId })))
    if (error) throw erreurTable(error)
  }
  if (modifies.length) {
    const { error } = await supabase.from('carreaux_fournisseur').upsert(modifies.map((c) => ({ ...champsCarreau(c), id: c.id, fournisseur_id: fournisseurId })))
    if (error) throw erreurTable(error)
  }
  oublierCarreaux()
}

export async function supprimerCarreau(id) {
  const { error } = await supabase.from('carreaux_fournisseur').delete().eq('id', id)
  if (error) throw erreurTable(error)
  oublierCarreaux()
}

/** Photo du modèle, dans le dossier du compte (même stockage que les réalisations) */
export const televerserPhotoCarreau = (fichier, utilisateurId) => televerserPhoto(fichier, `${utilisateurId}/carreaux`)

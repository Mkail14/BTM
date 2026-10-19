/**
 * Carreaux des fournisseurs (table carreaux_fournisseur, migration 0029) : les modèles qu'un fournisseur met
 * en ligne (nom, format, finition, couleur, photo) avec leur prix à l'unité.
 *  - calculateur (carrelage) : le client choisit son modèle, le devis compte les carreaux à ce prix ;
 *  - espace fournisseur : le fournisseur ajoute, modifie, masque ou retire ses modèles.
 * Avant la migration 0029 (ou sans Supabase), la liste est vide : le devis garde le prix moyen du catalogue.
 */
import { supabase, supabaseConfigure } from './client.js'
import { televerserPhoto } from './serviceRealisations.js'

const TABLE_ABSENTE = ['42P01', 'PGRST205']
const COLONNES = 'id, fournisseur_id, nom, format, finition, couleur, photo_url, prix_unitaire, prix_comptoir, rupture, actif'

/** Côté d'un carreau en mètres, par format proposé dans le calculateur */
export const FORMATS_CARREAUX = { '30x30': 0.3, '45x45': 0.45, '60x60': 0.6 }
export const libelleFormat = (format) => `${String(format).replace('x', ' × ')} cm`
/** Prix au m² d'un modèle (à titre indicatif : le devis compte des carreaux entiers) */
export const prixAuM2 = (c) => Math.round((c.prix_unitaire / FORMATS_CARREAUX[c.format] ** 2) * 100) / 100

const versCarreau = (c) => ({
  ...c,
  prix_unitaire: Number(c.prix_unitaire),
  prix_comptoir: c.prix_comptoir == null ? null : Number(c.prix_comptoir)
})

let cache = null
export function oublierCarreaux() { cache = null }

/** Modèles en ligne (actifs, chez des fournisseurs actifs), avec le nom, la commune et la livraison du fournisseur */
export async function listerCarreauxPublics({ force = false } = {}) {
  if (!supabaseConfigure) return []
  if (cache && !force) return cache
  const { data, error } = await supabase
    .from('carreaux_fournisseur')
    .select(`${COLONNES}, fournisseurs(nom, commune, livraison, actif)`)
    .eq('actif', true)
    .order('prix_unitaire')
  if (error) {
    if (!TABLE_ABSENTE.includes(error.code)) console.warn('Carreaux indisponibles', error)
    return []
  }
  cache = (data || [])
    .filter((c) => c.fournisseurs?.actif !== false)
    .map(({ fournisseurs: f, ...c }) => ({ ...versCarreau(c), fournisseur: f?.nom || '', commune: f?.commune || '', livraison: !!f?.livraison }))
  return cache
}

// ---------- Espace fournisseur ----------------------------------------------------------------

const erreurTable = (error) => (TABLE_ABSENTE.includes(error?.code)
  ? new Error('La gestion des carreaux n’est pas encore activée (migration 0029).')
  : error)

export async function listerMesCarreaux(fournisseurId) {
  const { data, error } = await supabase.from('carreaux_fournisseur').select(COLONNES).eq('fournisseur_id', fournisseurId).order('cree_le')
  if (error) throw erreurTable(error)
  return (data || []).map(versCarreau)
}

export async function enregistrerCarreau(fournisseurId, c) {
  const champs = {
    nom: c.nom.trim(),
    format: c.format,
    finition: c.finition?.trim() || null,
    couleur: c.couleur,
    photo_url: c.photo_url || null,
    prix_unitaire: c.prix_unitaire,
    prix_comptoir: c.prix_comptoir ?? null,
    rupture: !!c.rupture,
    actif: c.actif !== false,
    mis_a_jour_le: new Date().toISOString()
  }
  const { error } = await (c.id
    ? supabase.from('carreaux_fournisseur').update(champs).eq('id', c.id)
    : supabase.from('carreaux_fournisseur').insert({ ...champs, fournisseur_id: fournisseurId }))
  if (error) throw erreurTable(error)
  oublierCarreaux()
}

export async function supprimerCarreau(id) {
  const { error } = await supabase.from('carreaux_fournisseur').delete().eq('id', id)
  if (error) throw erreurTable(error)
  oublierCarreaux()
}

/** Photo du modèle, dans le dossier du compte (même stockage que les réalisations) */
export const televerserPhotoCarreau = (fichier, utilisateurId) => televerserPhoto(fichier, `${utilisateurId}/carreaux`)

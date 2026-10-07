/** Avis clients (table avis : lecture publique, publication réservée aux comptes connectés) */
import { supabase, supabaseConfigure } from './client.js'

const COLONNES = 'id, nom, ville, note, commentaire, cree_le, source, lien, modifie_le'
const COLONNES_ANCIENNES = 'id, nom, ville, note, commentaire, cree_le' // avant la migration 0024

const versFront = (l) => ({
  id: l.id,
  nom: l.nom,
  ville: l.ville,
  note: l.note,
  commentaire: l.commentaire || '',
  date: l.cree_le,
  source: l.source || 'site', // 'site' (utilisateur du site) ou 'google' (recopié depuis la fiche Google)
  lien: l.lien || null,
  modifie: l.modifie_le || null
})

/** Lit avec les colonnes de la migration 0024, ou sans elles si elle n'est pas encore appliquée */
async function lire(construire) {
  let { data, error } = await construire(COLONNES)
  if (error?.code === '42703') ({ data, error } = await construire(COLONNES_ANCIENNES))
  return { data, error }
}

export async function listerAvis() {
  if (!supabaseConfigure) return []
  // filtre explicite : l'auteur (et l'admin) peuvent lire un avis masqué, il ne doit pas s'afficher pour autant
  const { data, error } = await lire((colonnes) => supabase.from('avis').select(colonnes).eq('visible', true).order('cree_le', { ascending: false }))
  if (error) throw error
  return (data || []).map(versFront)
}

export async function publierAvis(utilisateurId, { nom, ville, note, commentaire }) {
  const { data, error } = await lire((colonnes) => supabase
    .from('avis')
    .insert({ utilisateur_id: utilisateurId, nom, ville: ville || 'Mayotte', note, commentaire: commentaire || '' })
    .select(colonnes)
    .single())
  if (error) {
    // 23505 : index unique « un avis par compte »
    if (error.code === '23505') throw new Error('Vous avez déjà publié un avis : vous pouvez le modifier.')
    throw error
  }
  return versFront(data)
}

/** Avis déjà publié par cet utilisateur (pour le modifier), ou null */
export async function monAvis(utilisateurId) {
  if (!supabaseConfigure || !utilisateurId) return null
  const { data, error } = await lire((colonnes) => supabase.from('avis').select(colonnes).eq('utilisateur_id', utilisateurId).maybeSingle())
  return error || !data ? null : versFront(data)
}

/** L'auteur modifie sa note, sa ville et son commentaire (migration 0024) */
export async function modifierAvis(id, { ville, note, commentaire }) {
  const { data, error } = await supabase
    .from('avis')
    .update({ ville: ville || 'Mayotte', note, commentaire: commentaire || '' })
    .eq('id', id)
    .select(COLONNES)
    .single()
  if (error) {
    if (error.code === '42703' || error.code === '42501' || error.code === 'PGRST116') throw new Error('La modification des avis n’est pas encore activée sur le serveur (migration 0024).')
    throw error
  }
  return versFront(data)
}

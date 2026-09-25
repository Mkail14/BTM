/** Avis clients (table avis : lecture publique, publication réservée aux comptes connectés) */
import { supabase, supabaseConfigure } from './client.js'

const versFront = (l) => ({
  id: l.id,
  nom: l.nom,
  ville: l.ville,
  note: l.note,
  commentaire: l.commentaire || '',
  date: l.cree_le
})

export async function listerAvis() {
  if (!supabaseConfigure) return []
  const { data, error } = await supabase
    .from('avis')
    .select('id, nom, ville, note, commentaire, cree_le')
    .order('cree_le', { ascending: false })
  if (error) throw error
  return (data || []).map(versFront)
}

export async function publierAvis(utilisateurId, { nom, ville, note, commentaire }) {
  const { data, error } = await supabase
    .from('avis')
    .insert({ utilisateur_id: utilisateurId, nom, ville: ville || 'Mayotte', note, commentaire: commentaire || '' })
    .select('id, nom, ville, note, commentaire, cree_le')
    .single()
  if (error) {
    // 23505 : index unique « un avis par compte »
    if (error.code === '23505') throw new Error('Vous avez déjà publié un avis. Merci !')
    throw error
  }
  return versFront(data)
}

/** L'utilisateur a-t-il déjà publié un avis ? */
export async function aDejaPublie(utilisateurId) {
  if (!supabaseConfigure || !utilisateurId) return false
  const { count, error } = await supabase.from('avis').select('id', { count: 'exact', head: true }).eq('utilisateur_id', utilisateurId)
  return !error && (count || 0) > 0
}

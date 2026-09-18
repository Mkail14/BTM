/** Projets cloud (table projets, protégée par RLS) */
import { supabase, supabaseConfigure } from './client.js'

const versFront = (l) => ({
  id: l.id,
  nom: l.nom,
  type: l.type_projet_id,
  dimensions: l.dimensions,
  resultat: l.resultat,
  fournisseur_id: l.fournisseur_id,
  cout_total: Number(l.cout_total),
  cree_le: l.cree_le,
  cloud: true
})

export async function listerProjetsCloud() {
  if (!supabaseConfigure) return []
  const { data, error } = await supabase.from('projets').select('*').order('cree_le', { ascending: false })
  if (error) throw error
  return (data || []).map(versFront)
}

export async function creerProjetCloud(utilisateurId, projet) {
  const { data, error } = await supabase
    .from('projets')
    .insert({
      utilisateur_id: utilisateurId,
      nom: projet.nom,
      type_projet_id: projet.type,
      dimensions: projet.dimensions,
      resultat: projet.resultat,
      fournisseur_id: projet.fournisseur_uuid || null,
      cout_total: projet.cout_total
    })
    .select()
    .single()
  if (error) throw error
  return versFront(data)
}

export async function supprimerProjetCloud(id) {
  const { error } = await supabase.from('projets').delete().eq('id', id)
  if (error) throw error
}

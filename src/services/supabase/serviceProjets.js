/** Projets cloud (table projets, protégée par RLS) */
import { supabase, supabaseConfigure } from './client.js'
import { normaliserResultat } from '@/services/calculs/moteurCalculs.js'
import { oublierCarreaux } from './serviceCarreaux.js'

const versFront = (l) => ({
  id: l.id,
  nom: l.nom,
  type: l.type_projet_id,
  dimensions: l.dimensions,
  resultat: normaliserResultat(l.resultat),
  fournisseur_id: l.fournisseur_id,
  fournisseurs: l.fournisseurs || (l.fournisseur_id ? [l.fournisseur_id] : []),
  code_retrait: l.code_retrait || '',
  cout_total: Number(normaliserResultat(l.resultat)?.total ?? l.cout_total),
  cree_le: l.cree_le,
  cloud: true
})

/**
 * Projets du compte connecté uniquement. Le filtre est indispensable : la RLS laisse l'admin
 * lire tous les projets (pour /admin), il ne faut pas qu'ils apparaissent dans « Mes projets ».
 */
export async function listerProjetsCloud(utilisateurId) {
  if (!supabaseConfigure || !utilisateurId) return []
  const { data, error } = await supabase.from('projets').select('*').eq('utilisateur_id', utilisateurId).order('cree_le', { ascending: false })
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
      // plusieurs fournisseurs choisis : le code BTM marche chez chacun (colonne absente avant la migration : ignorée)
      ...(projet.fournisseurs?.length > 1 ? { fournisseurs: projet.fournisseurs } : {}),
      cout_total: projet.cout_total
    })
    .select()
    .single()
  if (error) throw error
  if (projet.dimensions?.carreau?.id) oublierCarreaux() // un devis de plus pour ce modèle : popularité à relire
  return versFront(data)
}

export async function supprimerProjetCloud(id) {
  const { error } = await supabase.from('projets').delete().eq('id', id)
  if (error) throw error
}

/** Choix du client pour ce devis : utiliser son crédit fidélité chez le fournisseur ou le garder */
export async function lireChoixCredit(codeRetrait) {
  if (!supabaseConfigure || !codeRetrait) return false
  const { data, error } = await supabase.from('projets').select('utiliser_credit').eq('code_retrait', codeRetrait).maybeSingle()
  if (error) throw error
  return !!data?.utiliser_credit
}
export async function choisirCredit(codeRetrait, utiliser) {
  const { error } = await supabase.from('projets').update({ utiliser_credit: !!utiliser }).eq('code_retrait', codeRetrait)
  if (error) throw error
}

/** Crédit fidélité du compte connecté (migration 0017) : solde et mouvements récents */
export async function lireCreditFidelite() {
  if (!supabaseConfigure) return { solde: 0, mouvements: [] }
  const [{ data: solde, error: e1 }, { data: mouvements, error: e2 }] = await Promise.all([
    supabase.rpc('solde_credit'),
    supabase.from('credits_fidelite').select('montant, libelle, cree_le').order('cree_le', { ascending: false }).limit(5)
  ])
  if (e1 || e2) return { solde: 0, mouvements: [] }
  return { solde: Number(solde) || 0, mouvements: mouvements.map((m) => ({ ...m, montant: Number(m.montant) })) }
}

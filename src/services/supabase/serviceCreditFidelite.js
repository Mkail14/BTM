/** Crédit fidélité du compte connecté (migration 0017) : solde et mouvements récents */
import { supabase, supabaseConfigure } from './client.js'

export async function lireCreditFidelite() {
  if (!supabaseConfigure) return { solde: 0, mouvements: [] }
  const [{ data: solde, error: e1 }, { data: mouvements, error: e2 }] = await Promise.all([
    supabase.rpc('solde_credit'),
    supabase.from('credits_fidelite').select('montant, libelle, cree_le').order('cree_le', { ascending: false }).limit(5)
  ])
  if (e1 || e2) return { solde: 0, mouvements: [] }
  return { solde: Number(solde) || 0, mouvements: mouvements.map((m) => ({ ...m, montant: Number(m.montant) })) }
}

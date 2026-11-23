/**
 * Avis sur les fournisseurs (migration 20261023180000) :
 *  - côté client : demandes reçues après un retrait au comptoir, publication ou refus ;
 *  - annuaire : avis publiés, sans le compte ni le projet du client (fonction avis_fournisseurs_publics).
 */
import { supabase, supabaseConfigure } from './client.js'

const ok = ({ data, error }) => { if (error) throw error; return data }

/** Demandes d'avis reçues par le client connecté (la RLS ne renvoie que les siennes) */
export async function mesDemandesAvis() {
  if (!supabaseConfigure) return []
  try {
    return ok(await supabase.from('avis_fournisseurs').select('*').order('demande_le', { ascending: false }))
  } catch (e) {
    console.warn(e) // migration pas encore appliquée : rien à afficher
    return []
  }
}

export async function publierAvisFournisseur(id, { note, commentaire, nom }) {
  return ok(await supabase.rpc('publier_avis_fournisseur', { p_id: id, p_note: note, p_commentaire: commentaire, p_nom: nom }))
}

export async function declinerAvisFournisseur(id) {
  return ok(await supabase.rpc('decliner_avis_fournisseur', { p_id: id }))
}

/** Avis publiés regroupés par fournisseur : { [id]: { moyenne, nombre, liste } } */
export async function avisParFournisseur() {
  if (!supabaseConfigure) return {}
  const { data, error } = await supabase.rpc('avis_fournisseurs_publics')
  if (error) { console.warn(error); return {} }
  return regrouperAvis(data || [])
}

export function regrouperAvis(lignes) {
  const groupes = {}
  for (const a of lignes) (groupes[a.fournisseur_id] ||= []).push(a)
  return Object.fromEntries(Object.entries(groupes).map(([id, liste]) => [id, {
    moyenne: Math.round((liste.reduce((s, a) => s + a.note, 0) / liste.length) * 10) / 10,
    nombre: liste.length,
    liste
  }]))
}

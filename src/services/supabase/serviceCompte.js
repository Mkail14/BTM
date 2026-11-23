/**
 * Rôle et état du compte connecté, lus directement dans Supabase (table profils, RLS « propriétaire »).
 * Reste côté Supabase comme la connexion elle-même : un compte banni doit pouvoir lire son état
 * pour être déconnecté et redirigé vers la page « Compte suspendu ».
 */
import { supabase, supabaseConfigure } from './client.js'

/** Ban en cours ? (un ban temporaire dont la date est passée est levé automatiquement par Supabase Auth) */
export const banActif = (p) => !!p?.banni_le && (!p.banni_jusqua || new Date(p.banni_jusqua) > new Date())

/** Rôle et type du compte : { role, fournisseur_id, type_profil, pro } (select * : fonctionne avant les migrations 0010/0011) */
export async function lireRoleCompte(utilisateurId) {
  if (!supabaseConfigure || !utilisateurId) return { role: null, fournisseur_id: null, type_profil: null, pro: null, banni: false }
  const { data, error } = await supabase.from('profils').select('*').eq('id', utilisateurId).maybeSingle()
  if (error || !data) return { role: null, fournisseur_id: null, type_profil: null, pro: null, banni: false }
  return {
    role: data.role, fournisseur_id: data.fournisseur_id || null, type_profil: data.type_profil || 'particulier',
    banni: banActif(data), // compte banni (migration 0022) : le site le déconnecte
    bannieJusqua: data.banni_jusqua || null,
    bannieMotif: data.banni_motif || null, // affiché au compte banni (page « Compte suspendu »)
    // demande de compte professionnel (migration 0011) : statut, entreprise, motif d'un éventuel refus
    pro: data.pro_statut ? { statut: data.pro_statut, raisonSociale: data.pro_raison_sociale, siret: data.pro_siret, motif: data.pro_motif_refus, demandeLe: data.pro_demande_le } : null
  }
}

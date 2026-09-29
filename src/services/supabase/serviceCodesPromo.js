/**
 * Codes promo côté visiteur : vérification d'un code précis (fonction SQL verifier_code_promo).
 * La liste des codes n'est jamais lisible publiquement (RLS réservée à l'admin).
 */
import { supabase, supabaseConfigure } from './client.js'

/** Normalise la saisie : « bienvenue 10 » → « BIENVENUE10 » */
export const nettoyerCode = (saisie) => String(saisie || '').toUpperCase().replace(/\s+/g, '')

/**
 * @returns {Promise<object|null>} { code, type, valeur, portee, expire_le } si le code est valable, sinon null
 * @throws si Supabase est injoignable (à distinguer d'un code invalide)
 */
export async function verifierCode(saisie) {
  const code = nettoyerCode(saisie)
  if (!supabaseConfigure || !/^[A-Z0-9_-]{3,30}$/.test(code)) return null
  const { data, error } = await supabase.rpc('verifier_code_promo', { p_code: code })
  if (error) throw error
  const ligne = Array.isArray(data) ? data[0] : data
  return ligne ? { ...ligne, valeur: Number(ligne.valeur) } : null
}

/** Un code promo BTM ne sert qu'une fois par compte : déjà utilisé sur un devis encaissé ? (migration 0016) */
export async function codeDejaUtilise(saisie) {
  if (!supabaseConfigure) return false
  const { data, error } = await supabase.rpc('code_promo_deja_utilise', { p_code: nettoyerCode(saisie) })
  if (error) { console.warn(error); return false } // migration absente : la base revérifie à l'encaissement
  return !!data
}

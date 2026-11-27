/**
 * Codes promo côté visiteur : vérification d'un code précis (/api/codes-promo/verifier).
 * La liste des codes n'est jamais lisible publiquement (réservée à l'admin).
 */
import { api, apiConfiguree } from './client.js'

/** Normalise la saisie : « bienvenue 10 » → « BIENVENUE10 » */
export const nettoyerCode = (saisie) => String(saisie || '').toUpperCase().replace(/\s+/g, '')

/**
 * @returns {Promise<object|null>} { code, type, valeur, portee, expire_le } si le code est valable, sinon null
 * @throws si l'API est injoignable (à distinguer d'un code invalide)
 */
export async function verifierCode(saisie) {
  const code = nettoyerCode(saisie)
  if (!apiConfiguree || !/^[A-Z0-9_-]{3,30}$/.test(code)) return null
  return api.post('/codes-promo/verifier', { code })
}

/** Un code promo BTM ne sert qu'une fois par compte (RG33) : déjà utilisé sur un devis encaissé ? */
export async function codeDejaUtilise(saisie) {
  if (!apiConfiguree) return false
  try {
    return !!(await api.get(`/codes-promo/deja-utilise?code=${encodeURIComponent(nettoyerCode(saisie))}`))?.deja
  } catch (e) {
    console.warn(e) // l'API revérifie à l'encaissement
    return false
  }
}

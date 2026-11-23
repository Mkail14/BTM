/**
 * Client de l'API REST BTM (BACK/src).
 * La connexion reste gérée par Supabase Auth : le jeton de la session courante
 * est joint à chaque appel (Authorization: Bearer …) et vérifié par l'API.
 * Si VITE_API_URL est absent, l'application fonctionne avec les données locales.
 */
import { supabase } from '@/services/supabase/client.js'

const base = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

export const apiConfiguree = Boolean(base)

export class ErreurApi extends Error {
  constructor(statut, message, details) {
    super(message)
    this.statut = statut
    this.details = details
    this.migration = Boolean(details?.migration) // base en retard sur le code (réponse 503 de l'API)
  }
}

async function jetonSession() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/**
 * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} methode
 * @param {string} chemin  ex. '/projets'
 * @param {object} [corps]
 */
export async function appelApi(methode, chemin, corps) {
  if (!apiConfiguree) throw new ErreurApi(0, 'API non configurée (VITE_API_URL).')
  const jeton = await jetonSession()
  const reponse = await fetch(`${base}${chemin}`, {
    method: methode,
    headers: {
      Accept: 'application/json',
      ...(corps !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(jeton ? { Authorization: `Bearer ${jeton}` } : {})
    },
    body: corps !== undefined ? JSON.stringify(corps) : undefined
  })
  if (reponse.status === 204) return null
  const donnees = await reponse.json().catch(() => null)
  if (!reponse.ok) throw new ErreurApi(reponse.status, donnees?.erreur || `Erreur ${reponse.status}`, donnees?.details)
  return donnees
}

export const api = {
  get: (chemin) => appelApi('GET', chemin),
  post: (chemin, corps) => appelApi('POST', chemin, corps),
  put: (chemin, corps) => appelApi('PUT', chemin, corps),
  patch: (chemin, corps) => appelApi('PATCH', chemin, corps),
  delete: (chemin) => appelApi('DELETE', chemin)
}

/**
 * Client HTTP générique — PAS ENCORE UTILISÉ.
 *
 * Aucun backend n'existe pour le moment (voir 00_START_HERE.md). Ce module
 * prépare le terrain pour le jour où une vraie API sera disponible : il
 * suffira de faire pointer les services (projectStorage, authService,
 * suppliers...) vers ces fonctions au lieu de localStorage / data mockées,
 * sans changer la façon dont les composants les appellent.
 *
 * Exemple d'usage futur :
 *   import { apiGet, apiPost } from '../api/apiClient.js'
 *   export function getAllProjects() {
 *     return apiGet('/projects')
 *   }
 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new ApiError(body.message || `Erreur API (${response.status})`, response.status)
  }

  if (response.status === 204) return null
  return response.json()
}

export function apiGet(path) {
  return request(path, { method: 'GET' })
}

export function apiPost(path, data) {
  return request(path, { method: 'POST', body: JSON.stringify(data) })
}

export function apiPut(path, data) {
  return request(path, { method: 'PUT', body: JSON.stringify(data) })
}

export function apiDelete(path) {
  return request(path, { method: 'DELETE' })
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

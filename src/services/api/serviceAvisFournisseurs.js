/**
 * Avis sur les fournisseurs :
 *  - côté client : demandes reçues après un retrait au comptoir, publication ou refus ;
 *  - annuaire : avis publiés, sans le compte ni le projet du client (/api/avis-fournisseurs).
 */
import { api, apiConfiguree } from './client.js'

/** Demandes d'avis reçues par le client connecté */
export async function mesDemandesAvis() {
  if (!apiConfiguree) return []
  try {
    return await api.get('/mes-avis-fournisseurs')
  } catch (e) {
    console.warn(e)
    return []
  }
}

export const publierAvisFournisseur = (id, { note, commentaire, nom }) => api.post(`/mes-avis-fournisseurs/${id}/publier`, { note, commentaire, nom })
export const declinerAvisFournisseur = (id) => api.post(`/mes-avis-fournisseurs/${id}/decliner`)

/** Avis publiés regroupés par fournisseur : { [id]: { moyenne, nombre, liste } } */
export async function avisParFournisseur() {
  if (!apiConfiguree) return {}
  try {
    return regrouperAvis(await api.get('/avis-fournisseurs'))
  } catch (e) {
    console.warn(e)
    return {}
  }
}

export function regrouperAvis(lignes) {
  const groupes = {}
  for (const a of lignes || []) (groupes[a.fournisseur_id] ||= []).push(a)
  return Object.fromEntries(Object.entries(groupes).map(([id, liste]) => [id, {
    moyenne: Math.round((liste.reduce((s, a) => s + a.note, 0) / liste.length) * 10) / 10,
    nombre: liste.length,
    liste
  }]))
}

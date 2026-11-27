/**
 * Réalisations : projets d'utilisateurs affichés sur la page d'accueil.
 *  - lecture publique des réalisations publiées (10 au plus) ;
 *  - côté utilisateur : propositions reçues de l'admin, envoi (photo + infos) ou refus.
 * Sans API, l'accueil affiche les exemples locaux.
 */
import { api, apiConfiguree, formulaire } from './client.js'
import { realisations as exemples } from '@/donnees/realisations.js'
import { compresserImage } from '@/services/images.js'

export const MAX_REALISATIONS = 10

/** Ligne de la base → format de l'accueil */
export const versCarte = (r) => ({
  id: r.id,
  titre: r.titre,
  type: r.type_projet || null,
  auteur: r.auteur,
  commune: r.commune,
  quartier: r.quartier || '',
  fournisseur: r.fournisseur_nom || '',
  detail: r.detail || '',
  annee: r.annee || null,
  photo: r.photo_url || ''
})

export async function listerRealisationsPubliques() {
  if (!apiConfiguree) return exemples
  return ((await api.get('/realisations')) || []).map(versCarte)
}

/** Dépose une photo (compressée) dans le dossier du compte ; renvoie { url, chemin } */
export async function televerserPhoto(fichier) {
  const blob = await compresserImage(fichier)
  return api.post('/medias/photos', formulaire(new File([blob], 'photo.jpg', { type: 'image/jpeg' })), { delai: 60000 })
}
export async function supprimerPhotos(chemins) {
  const liste = (chemins || []).filter(Boolean)
  if (liste.length) await api.post('/medias/photos/supprimer', { chemins: liste })
}

// ---------- Côté utilisateur ------------------------------------------------------------------

/** Propositions et réalisations de l'utilisateur (les plus récentes d'abord) */
export async function mesRealisations() {
  if (!apiConfiguree) return []
  try {
    return await api.get('/mes-realisations')
  } catch {
    return []
  }
}

/**
 * L'utilisateur envoie sa réalisation à BTM pour validation (avec son accord pour la diffusion).
 * `fichier` : nouvelle photo (facultative si une photo est déjà enregistrée).
 */
export async function envoyerRealisation(r, champs, fichier) {
  const photo = fichier ? new File([await compresserImage(fichier)], 'realisation.jpg', { type: 'image/jpeg' }) : null
  return api.post(`/mes-realisations/${r.id}/envoyer`, formulaire(photo, { ...champs, consentement: true }), { delai: 60000 })
}

export const declinerRealisation = (id) => api.post(`/mes-realisations/${id}/decliner`)

/**
 * Réalisations : projets d'utilisateurs affichés sur la page d'accueil (table realisations, migration 0025).
 *  - lecture publique des réalisations publiées (10 au plus) ;
 *  - côté utilisateur : propositions reçues de l'admin, envoi (photo + infos) ou refus.
 * Avant la migration 0025 (ou sans Supabase), l'accueil affiche les exemples locaux.
 */
import { supabase, supabaseConfigure } from './client.js'
import { realisations as exemples } from '@/donnees/realisations.js'
import { compresserImage } from '@/services/images.js'

export const MAX_REALISATIONS = 10
export const BUCKET_REALISATIONS = 'realisations'
const TABLE_ABSENTE = ['42P01', 'PGRST205']

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
  if (!supabaseConfigure) return exemples
  const { data, error } = await supabase
    .from('realisations')
    .select('id, titre, type_projet, auteur, commune, quartier, fournisseur_nom, detail, annee, photo_url')
    .eq('statut', 'publiee')
    .order('publiee_le', { ascending: false })
    .limit(MAX_REALISATIONS)
  if (error) {
    if (TABLE_ABSENTE.includes(error.code)) return exemples // migration 0025 pas encore appliquée
    throw error
  }
  return (data || []).map(versCarte)
}

/** Dépose une photo (compressée) dans le dossier donné ; renvoie { url, chemin } */
export async function televerserPhoto(fichier, dossier) {
  const blob = await compresserImage(fichier)
  const chemin = `${dossier}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  const { error } = await supabase.storage.from(BUCKET_REALISATIONS).upload(chemin, blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
  if (error) throw new Error(/bucket|not found/i.test(error.message) ? 'Le stockage des photos n’est pas encore activé (migration 0025).' : error.message)
  return { url: supabase.storage.from(BUCKET_REALISATIONS).getPublicUrl(chemin).data.publicUrl, chemin }
}
export async function supprimerPhotos(chemins) {
  const liste = (chemins || []).filter(Boolean)
  if (liste.length) await supabase.storage.from(BUCKET_REALISATIONS).remove(liste)
}

// ---------- Côté utilisateur ------------------------------------------------------------------

/** Propositions et réalisations de l'utilisateur (les plus récentes d'abord) */
export async function mesRealisations() {
  if (!supabaseConfigure) return []
  const { data: session } = await supabase.auth.getSession()
  const uid = session.session?.user?.id
  if (!uid) return []
  const { data, error } = await supabase.from('realisations').select('*').eq('utilisateur_id', uid).order('cree_le', { ascending: false })
  if (error) return [] // table absente : aucune proposition
  return data || []
}

/**
 * L'utilisateur envoie sa réalisation à BTM pour validation.
 * `fichier` : nouvelle photo (facultative si une photo est déjà enregistrée).
 */
export async function envoyerRealisation(r, champs, fichier) {
  const { data: session } = await supabase.auth.getSession()
  const uid = session.session?.user?.id
  if (!uid) throw new Error('Reconnectez-vous pour envoyer votre réalisation.')
  let photo = {}
  if (fichier) {
    const { url, chemin } = await televerserPhoto(fichier, uid)
    photo = { photo_url: url, photo_chemin: chemin }
  }
  const { data, error } = await supabase.from('realisations')
    .update({ ...champs, ...photo, statut: 'soumise', consentement: true })
    .eq('id', r.id).select().single()
  if (error) {
    if (photo.photo_chemin) await supprimerPhotos([photo.photo_chemin]).catch(() => {}) // envoi refusé : photo orpheline effacée
    throw new Error(error.message)
  }
  // l'ancienne photo, remplacée, n'est plus utilisée
  if (photo.photo_chemin && r.photo_chemin) supprimerPhotos([r.photo_chemin]).catch(() => {})
  return data
}

export async function declinerRealisation(id) {
  const { data, error } = await supabase.from('realisations').update({ statut: 'declinee' }).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  return data
}

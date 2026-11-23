/**
 * Dossier de validation d'un compte fournisseur (migration 20261025020000) : messages entre l'entreprise et BTM,
 * pièces demandées par BTM et déposées par l'entreprise (stockage privé « dossiers-fournisseurs »), contrat signé.
 * Les mêmes fonctions servent à l'entreprise (son dossier) et à l'admin (tous les dossiers) : la base vérifie qui appelle.
 */
import { supabase } from './client.js'
import { TYPES_FICHIERS, TAILLE_MAX } from '@/donnees/documentsFournisseur.js'

const BUCKET = 'dossiers-fournisseurs'
const ABSENTE = ['42P01', 'PGRST205', 'PGRST202']
const ok = ({ data, error }) => {
  if (error) throw new Error(ABSENTE.includes(error.code) ? 'Le dossier fournisseur n’est pas encore activé (migration 20261025020000).' : error.message || 'Opération impossible.')
  return data
}

// ---------- Messages ----------
export const listerMessages = async (demandeId) =>
  ok(await supabase.from('messages_demande_fournisseur').select('*').eq('demande_id', demandeId).order('cree_le'))
export const envoyerMessage = async (demandeId, texte) => ok(await supabase.rpc('envoyer_message_dossier', { p_demande: demandeId, p_texte: texte }))
export const marquerLus = async (demandeId) => ok(await supabase.rpc('lire_messages_dossier', { p_demande: demandeId }))

// ---------- Documents ----------
export const listerDocuments = async (demandeId) =>
  ok(await supabase.from('documents_demande_fournisseur').select('*').eq('demande_id', demandeId).order('demande_le'))

/** Entreprise : dépose le fichier d'une pièce (PDF ou photo, 10 Mo au plus) dans son dossier privé */
export async function deposerDocument(document, fichier, utilisateurId) {
  if (!TYPES_FICHIERS.includes(fichier.type)) throw new Error('Format accepté : PDF ou photo (JPG, PNG, WebP).')
  if (fichier.size > TAILLE_MAX) throw new Error('Fichier trop lourd : 10 Mo au plus.')
  const extension = (fichier.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5)
  const chemin = `${utilisateurId}/${document.type}-${Date.now()}.${extension}`
  ok(await supabase.storage.from(BUCKET).upload(chemin, fichier, { contentType: fichier.type, upsert: false }))
  ok(await supabase.rpc('deposer_document_dossier', { p_document: document.id, p_chemin: chemin, p_nom: fichier.name }))
}

/** Lien temporaire (5 min) pour ouvrir une pièce déposée */
export async function lienDocument(chemin) {
  const { signedUrl } = ok(await supabase.storage.from(BUCKET).createSignedUrl(chemin, 300))
  return signedUrl
}

// ---------- Admin ----------
/** documents : [{ type, libelle, consigne }] */
export const demanderDocuments = async (demandeId, documents) => ok(await supabase.rpc('demander_documents_dossier', { p_demande: demandeId, p_documents: documents }))
/** decision : 'valider' | 'refuser' (motif requis) | 'retirer' */
export const statuerDocument = async (documentId, decision, motif = '') => ok(await supabase.rpc('statuer_document_dossier', { p_document: documentId, p_decision: decision, p_motif: motif || null }))

// ---------- Contrat ----------
export const signerContrat = async ({ version, signataire, qualite, signature }) =>
  ok(await supabase.rpc('signer_contrat_dossier', { p_version: version, p_signataire: signataire, p_qualite: qualite, p_signature: signature }))

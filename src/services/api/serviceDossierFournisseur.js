/**
 * Dossier de validation d'un compte fournisseur : messages entre l'entreprise et BTM, pièces demandées par BTM
 * et déposées par l'entreprise (stockage PRIVÉ sur le serveur), contrat signé.
 * Les mêmes fonctions servent à l'entreprise (son dossier) et à l'admin (tous les dossiers) : l'API vérifie qui appelle.
 */
import { api, formulaire } from './client.js'
import { TYPES_FICHIERS, TAILLE_MAX } from '@/donnees/documentsFournisseur.js'

// ---------- Messages ----------
export const listerMessages = (demandeId) => api.get(`/dossiers/${demandeId}/messages`)
export const envoyerMessage = async (demandeId, texte) => (await api.post(`/dossiers/${demandeId}/messages`, { texte }))?.id
export const marquerLus = (demandeId) => api.post(`/dossiers/${demandeId}/messages/lus`)

// ---------- Documents ----------
export const listerDocuments = (demandeId) => api.get(`/dossiers/${demandeId}/documents`)

/** Entreprise : dépose le fichier d'une pièce (PDF ou photo, 10 Mo au plus) dans son dossier privé */
export async function deposerDocument(document, fichier) {
  if (!TYPES_FICHIERS.includes(fichier.type)) throw new Error('Format accepté : PDF ou photo (JPG, PNG, WebP).')
  if (fichier.size > TAILLE_MAX) throw new Error('Fichier trop lourd : 10 Mo au plus.')
  return api.post(`/dossiers/documents/${document.id}/fichier`, formulaire(fichier), { delai: 120000 })
}

/** Lien temporaire (5 min) pour ouvrir une pièce déposée */
export async function lienDocument(document) {
  return (await api.post(`/dossiers/documents/${document.id}/lien`))?.url
}

// ---------- Admin ----------
/** documents : [{ type, libelle, consigne }] */
export const demanderDocuments = (demandeId, documents) => api.post(`/admin/dossiers/${demandeId}/documents`, { documents })
/** decision : 'valider' | 'refuser' (motif requis) | 'retirer' */
export const statuerDocument = (documentId, decision, motif = '') =>
  api.post(`/admin/dossiers/documents/${documentId}/decision`, { decision, motif: motif || null })

// ---------- Contrat ----------
export const signerContrat = ({ version, signataire, qualite, signature }) =>
  api.post('/partenaire/contrat', { version, signataire, qualite, signature })

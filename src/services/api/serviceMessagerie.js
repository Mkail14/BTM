/**
 * Messagerie contact@btm.yt (espace admin) : tout passe par l'API BTM (/api/admin/messagerie), qui vérifie le rôle
 * admin et garde les identifiants de la boîte côté serveur.
 */
import { api } from './client.js'

// délai maximal : jamais de chargement sans fin si la boîte ne répond pas
const boiteMail = (corps) => api.post('/admin/messagerie', corps, { delai: corps.action === 'envoyer' ? 90000 : 45000 })

/** Dossiers + messages du dossier en un seul appel (ouverture et actualisation de la messagerie) */
export const ouvrirBoite = (dossier = 'INBOX', recherche = '') => boiteMail({ action: 'ouverture', dossier, recherche })
export const listerDossiers = () => boiteMail({ action: 'dossiers' })
export const compterNonLus = () => boiteMail({ action: 'non-lus' })
export const listerMessages = (dossier, page = 1, recherche = '') => boiteMail({ action: 'lister', dossier, page, recherche })
export const lireMessage = (dossier, uid) => boiteMail({ action: 'lire', dossier, uid })
/** Contenu de plusieurs messages (10 au plus) sans les marquer comme lus : préchargement de la liste */
export const lireMessages = (dossier, uids) => boiteMail({ action: 'lire-plusieurs', dossier, uids })
export const lirePieceJointe = (dossier, uid, index) => boiteMail({ action: 'piece', dossier, uid, index })
export const marquerMessages = (dossier, uids, etat) => boiteMail({ action: 'marquer', dossier, uids, ...etat })
export const deplacerMessages = (dossier, uids, vers) => boiteMail({ action: 'deplacer', dossier, uids, vers })
export const supprimerMessages = (dossier, uids) => boiteMail({ action: 'supprimer', dossier, uids })
export const envoyerMessage = (message) => boiteMail({ action: 'envoyer', ...message })

/** base64 (pièce jointe reçue) → Blob */
export function versBlob({ base64, type }) {
  const binaire = atob(base64)
  const octets = new Uint8Array(binaire.length)
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i)
  return new Blob([octets], { type: type || 'application/octet-stream' })
}

/** Fichier choisi par l'admin → { nom, type, base64 } pour l'envoi */
export function lireFichier(fichier) {
  return new Promise((ok, ko) => {
    const lecteur = new FileReader()
    lecteur.onload = () => ok({ nom: fichier.name, type: fichier.type || 'application/octet-stream', base64: String(lecteur.result).split(',')[1] || '', taille: fichier.size })
    lecteur.onerror = () => ko(lecteur.error)
    lecteur.readAsDataURL(fichier)
  })
}

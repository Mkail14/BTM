/** Avis clients sur le site (RG36, RG37) : lecture publique, publication réservée aux comptes connectés */
import { api, apiConfiguree } from './client.js'

const versFront = (l) => ({
  id: l.id,
  nom: l.nom,
  ville: l.ville,
  note: l.note,
  commentaire: l.commentaire || '',
  date: l.cree_le,
  source: l.source || 'site', // 'site' (utilisateur du site) ou 'trustpilot' (recopié depuis la page Trustpilot)
  lien: l.lien || null,
  modifie: l.modifie_le || null
})

export async function listerAvis() {
  if (!apiConfiguree) return []
  return ((await api.get('/avis')) || []).map(versFront)
}

export async function publierAvis(_utilisateurId, { nom, ville, note, commentaire }) {
  return versFront(await api.post('/avis', { nom, ville: ville || 'Mayotte', note, commentaire: commentaire || '' }))
}

/** Avis déjà publié par l'utilisateur connecté (pour le modifier), ou null */
export async function monAvis(utilisateurId) {
  if (!apiConfiguree || !utilisateurId) return null
  try {
    const a = await api.get('/avis/mien')
    return a ? versFront(a) : null
  } catch {
    return null
  }
}

/** L'auteur modifie sa note, sa ville et son commentaire */
export async function modifierAvis(_id, { ville, note, commentaire }) {
  return versFront(await api.patch('/avis/mien', { ville: ville || 'Mayotte', note, commentaire: commentaire || '' }))
}

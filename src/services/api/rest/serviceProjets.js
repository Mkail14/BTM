/** Projets cloud du compte connecté (/api/projets : l'API vérifie la propriété) */
import { api, apiConfiguree } from '../client.js'
import { normaliserResultat } from '@/services/calculs/moteurCalculs.js'

const versFront = (l) => ({
  id: l.id,
  nom: l.nom,
  type: l.type_projet_id,
  dimensions: l.dimensions,
  resultat: normaliserResultat(l.resultat),
  fournisseur_id: l.fournisseur_id,
  code_retrait: l.code_retrait || '',
  cout_total: Number(normaliserResultat(l.resultat)?.total ?? l.cout_total),
  cree_le: l.cree_le,
  cloud: true
})

/** L'API ne renvoie que les projets de l'appelant (même pour un admin). */
export async function listerProjetsCloud(utilisateurId) {
  if (!apiConfiguree || !utilisateurId) return []
  return ((await api.get('/projets')) || []).map(versFront)
}

/** L'utilisateur est déduit du jeton de connexion côté serveur. */
export async function creerProjetCloud(_utilisateurId, projet) {
  const data = await api.post('/projets', {
    nom: projet.nom,
    type_projet_id: projet.type,
    dimensions: projet.dimensions,
    resultat: projet.resultat,
    fournisseur_id: projet.fournisseur_uuid || null,
    ...(Number.isFinite(Number(projet.cout_total)) ? { cout_total: Number(projet.cout_total) } : {})
  })
  return versFront(data)
}

export async function supprimerProjetCloud(id) {
  await api.delete(`/projets/${id}`)
}

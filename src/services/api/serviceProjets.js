/** Estimations du compte connecté (/api/projets : l'API ne renvoie et ne modifie que celles de l'appelant) */
import { api, apiConfiguree } from './client.js'
import { normaliserResultat } from '@/services/calculs/moteurCalculs.js'
import { oublierCarreaux } from './serviceCarreaux.js'

export { lireCreditFidelite } from './serviceCreditFidelite.js'

const versFront = (l) => ({
  id: l.id,
  nom: l.nom,
  type: l.type_projet_id,
  dimensions: l.dimensions,
  resultat: normaliserResultat(l.resultat),
  fournisseur_id: l.fournisseur_id,
  fournisseurs: l.fournisseurs || (l.fournisseur_id ? [l.fournisseur_id] : []),
  code_retrait: l.code_retrait || '',
  cout_total: Number(normaliserResultat(l.resultat)?.total ?? l.cout_total),
  cree_le: l.cree_le,
  cloud: true
})

export async function listerProjetsCloud(utilisateurId) {
  if (!apiConfiguree || !utilisateurId) return []
  return ((await api.get('/projets')) || []).map(versFront)
}

/** Le propriétaire est le compte du jeton ; plusieurs fournisseurs : le code BTM marche chez chacun */
export async function creerProjetCloud(_utilisateurId, projet) {
  const fournisseurs = (projet.fournisseurs?.length ? projet.fournisseurs : [projet.fournisseur_uuid]).filter(Boolean)
  const data = await api.post('/projets', {
    nom: projet.nom,
    type_projet_id: projet.type,
    dimensions: projet.dimensions,
    resultat: projet.resultat,
    fournisseurs,
    ...(Number.isFinite(Number(projet.cout_total)) ? { cout_total: Number(projet.cout_total) } : {})
  })
  if (projet.dimensions?.carreau?.id) oublierCarreaux() // un devis de plus pour ce modèle : popularité à relire
  return versFront(data)
}

export async function supprimerProjetCloud(id) {
  await api.delete(`/projets/${id}`)
}

/** Choix du client pour ce devis : utiliser son crédit fidélité chez le fournisseur ou le garder */
export async function lireChoixCredit(codeRetrait) {
  if (!apiConfiguree || !codeRetrait) return false
  return !!(await api.get(`/projets/code/${encodeURIComponent(codeRetrait)}/credit`))?.utiliser_credit
}
export async function choisirCredit(codeRetrait, utiliser) {
  await api.put(`/projets/code/${encodeURIComponent(codeRetrait)}/credit`, { utiliser: !!utiliser })
}

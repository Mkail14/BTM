/** Projets du compte : API BTM (BACK, /api/projets) quand VITE_API_URL est réglé, sinon Supabase directement */
import { apiConfiguree } from './client.js'
import * as rest from './rest/serviceProjets.js'
import * as supa from '@/services/supabase/serviceProjets.js'
import { oublierCarreaux } from '@/services/supabase/serviceCarreaux.js'

// choix du crédit fidélité, solde… : Supabase uniquement
export * from '@/services/supabase/serviceProjets.js'

export const listerProjetsCloud = (...a) => (apiConfiguree ? rest : supa).listerProjetsCloud(...a)
export const supprimerProjetCloud = (...a) => (apiConfiguree ? rest : supa).supprimerProjetCloud(...a)

/** Un devis chez plusieurs fournisseurs (colonne `fournisseurs`) n'est pas encore géré par l'API : il passe par Supabase */
export async function creerProjetCloud(utilisateurId, projet) {
  if (!apiConfiguree || projet.fournisseurs?.length > 1) return supa.creerProjetCloud(utilisateurId, projet)
  const cree = await rest.creerProjetCloud(utilisateurId, projet)
  if (projet.dimensions?.carreau?.id) oublierCarreaux() // un devis de plus pour ce modèle : popularité à relire
  return { ...cree, fournisseurs: cree.fournisseur_id ? [cree.fournisseur_id] : [] }
}

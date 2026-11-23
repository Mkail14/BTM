/**
 * Administration : API BTM (BACK, /api/admin/…) quand VITE_API_URL est réglé, sinon Supabase directement.
 * Les fonctions sans équivalent dans l'API (comptes de connexion, crédits, RIB, versements…) restent côté Supabase.
 */
import { apiConfiguree } from './client.js'
import * as rest from './rest/serviceAdmin.js'
import * as supa from '@/services/supabase/serviceAdmin.js'
import { supabase } from '@/services/supabase/client.js'

export * from '@/services/supabase/serviceAdmin.js'

const source = () => (apiConfiguree ? rest : supa)

export const listerProfils = (...a) => source().listerProfils(...a)
export const listerProjets = (...a) => source().listerProjets(...a)
export const lireProjet = (...a) => source().lireProjet(...a)
export const supprimerProjet = (...a) => source().supprimerProjet(...a)
export const enregistrerAvisTrustpilot = (...a) => source().enregistrerAvisTrustpilot(...a)
export const listerRealisations = (...a) => source().listerRealisations(...a)
export const proposerRealisation = (...a) => source().proposerRealisation(...a)
export const relancerRealisation = (...a) => source().relancerRealisation(...a)
export const enregistrerRealisation = (...a) => source().enregistrerRealisation(...a)
export const publierRealisation = (...a) => source().publierRealisation(...a)
export const refuserRealisation = (...a) => source().refuserRealisation(...a)
export const supprimerRealisation = (...a) => source().supprimerRealisation(...a)
export const listerFournisseurs = (...a) => source().listerFournisseurs(...a)
export const definirFournisseurActif = (...a) => source().definirFournisseurActif(...a)
export const supprimerFournisseur = (...a) => source().supprimerFournisseur(...a)
export const enregistrerFournisseur = (...a) => source().enregistrerFournisseur(...a)
export const listerCategories = (...a) => source().listerCategories(...a)
export const enregistrerCategorie = (...a) => source().enregistrerCategorie(...a)
export const supprimerCategorie = (...a) => source().supprimerCategorie(...a)
export const listerMateriaux = (...a) => source().listerMateriaux(...a)
export const enregistrerMateriau = (...a) => source().enregistrerMateriau(...a)
export const listerTypesProjets = (...a) => source().listerTypesProjets(...a)
export const enregistrerTypeProjet = (...a) => source().enregistrerTypeProjet(...a)
export const listerContenus = (...a) => source().listerContenus(...a)
export const enregistrerContenu = (...a) => source().enregistrerContenu(...a)
export const listerCodes = (...a) => source().listerCodes(...a)
export const enregistrerCode = (...a) => source().enregistrerCode(...a)
export const definirCodeActif = (...a) => source().definirCodeActif(...a)
export const supprimerCode = (...a) => source().supprimerCode(...a)
export const listerPaiements = (...a) => source().listerPaiements(...a)
export const lierCompteFournisseur = (...a) => source().lierCompteFournisseur(...a)
export const lireParametresVersement = (...a) => source().lireParametresVersement(...a)
export const enregistrerParametresVersement = (...a) => source().enregistrerParametresVersement(...a)
export const listerReversements = (...a) => source().listerReversements(...a)
export const statuerVerificationPro = (...a) => source().statuerVerificationPro(...a)
export const definirRoleCompte = (...a) => source().definirRoleCompte(...a)

// Avis : ceux du site passent par l'API ; les avis sur les fournisseurs (table avis_fournisseurs) restent dans Supabase
export async function listerAvis() {
  if (!apiConfiguree) return supa.listerAvis()
  const [site, surFournisseurs] = await Promise.all([
    rest.listerAvis(),
    supabase ? supabase.from('avis_fournisseurs').select('*').eq('statut', 'publie').then((r) => r.data || []).catch(() => []) : []
  ])
  return [
    ...site,
    ...surFournisseurs.map((a) => ({ ...a, source: 'fournisseur', table: 'avis_fournisseurs', ville: `sur ${a.fournisseur_nom}`, cree_le: a.repondu_le }))
  ].sort((x, y) => new Date(y.cree_le) - new Date(x.cree_le))
}
export const definirAvisVisible = (id, visible, table = 'avis') =>
  apiConfiguree && table === 'avis' ? rest.definirAvisVisible(id, visible) : supa.definirAvisVisible(id, visible, table)
export const supprimerAvis = (id, table = 'avis') =>
  apiConfiguree && table === 'avis' ? rest.supprimerAvis(id) : supa.supprimerAvis(id, table)

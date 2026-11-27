/**
 * Inscription des fournisseurs (« Devenir partenaire », RG40) : l'entreprise crée elle-même son compte avec ses
 * informations ; sa demande attend la validation de BTM.
 *  - fournisseur : créer son compte, lire sa demande, la corriger après une demande de rectification ;
 *  - admin : lister les demandes, valider (fiche de l'annuaire + compte fournisseur), demander une rectification, refuser.
 */
import { api, apiConfiguree } from './client.js'
import { inscription } from './serviceAuth.js'

/** Informations de l'entreprise, telles qu'enregistrées dans la demande */
export const champsDemande = (f) => ({
  entreprise: f.entreprise?.trim() || '',
  siret: String(f.siret || '').replace(/\D/g, ''),
  categorie_id: f.categorie_id || '',
  commune: f.commune?.trim() || '',
  adresse: f.adresse?.trim() || '',
  telephone: f.telephone || '',
  email: f.email?.trim() || '',
  contact_nom: f.contact_nom?.trim() || '',
  horaires: f.horaires?.trim() || '',
  description: f.description?.trim() || '',
  livraison: !!f.livraison,
  // réponses aux questions (src/donnees/questionnaireFournisseur.js) : seules les réponses données sont gardées
  questionnaire: Object.fromEntries(Object.entries(f.questionnaire || {}).filter(([, v]) => (Array.isArray(v) ? v.length : v)))
})

/** Crée le compte du fournisseur ; la demande part avec le compte */
export async function inscrireFournisseur(infos, motDePasse) {
  const d = champsDemande(infos)
  // compte au nom de l'entreprise : pas de personne à nommer
  return inscription(d.email, motDePasse, { type_profil: 'fournisseur', pseudo: d.entreprise.slice(0, 80), fournisseur: d })
}

/** Demande du compte connecté (null : pas de demande) */
export async function lireMaDemande() {
  if (!apiConfiguree) return null
  try {
    return await api.get('/partenaire/demande')
  } catch {
    return null
  }
}

export async function corrigerMaDemande(infos) {
  await api.put('/partenaire/demande', champsDemande(infos))
}

// ---------- Admin ----------
export const listerDemandes = () => api.get('/admin/demandes-fournisseurs')

/** Messages non lus de l'entreprise et pièces, par demande : [{ demande_id, non_lus, a_verifier, a_fournir, valides, refuses }] */
export const compteursDemandes = () => api.get('/admin/demandes-fournisseurs/compteurs')

/** decision : 'valider' | 'corriger' | 'refuser' ; renvoie l'id de la fiche créée à la validation */
export async function statuerDemande(id, decision, { message = '', categorie = null, visible = true } = {}) {
  const r = await api.post(`/admin/demandes-fournisseurs/${id}/decision`, { decision, message: message || null, categorie: categorie || null, visible })
  return r?.fournisseur_id || null
}

/**
 * Inscription des fournisseurs (migration 20261024030000) : l'entreprise crée elle-même son compte avec ses
 * informations ; sa demande attend la validation de BTM (table demandes_fournisseur).
 *  - fournisseur : créer son compte, lire sa demande, la corriger après une demande de rectification ;
 *  - admin : lister les demandes, valider (fiche de l'annuaire + compte fournisseur), demander une rectification, refuser.
 */
import { supabase, supabaseConfigure } from './client.js'
import { inscription } from './serviceAuth.js'

const TABLE_ABSENTE = ['42P01', 'PGRST205', 'PGRST202']
const erreur = (error) => (TABLE_ABSENTE.includes(error?.code)
  ? new Error('L’inscription des fournisseurs n’est pas encore activée (migration 20261024030000).')
  : new Error(error?.message || 'Opération impossible.'))

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

/** Crée le compte du fournisseur ; la demande est enregistrée par la base à la création du compte */
export async function inscrireFournisseur(infos, motDePasse) {
  const d = champsDemande(infos)
  // compte au nom de l'entreprise : pas de personne à nommer
  return inscription(d.email, motDePasse, { type_profil: 'fournisseur', nom_complet: d.entreprise, fournisseur: d })
}

/** Demande du compte connecté (null : pas de demande, ou migration absente) */
export async function lireMaDemande(utilisateurId) {
  if (!supabaseConfigure || !utilisateurId) return null
  const { data, error } = await supabase.from('demandes_fournisseur').select('*').eq('utilisateur_id', utilisateurId).maybeSingle()
  return error ? null : data
}

export async function corrigerMaDemande(infos) {
  const { error } = await supabase.rpc('corriger_demande_fournisseur', { p_infos: champsDemande(infos) })
  if (error) throw erreur(error)
}

// ---------- Admin ----------
export async function listerDemandes() {
  const { data, error } = await supabase.from('demandes_fournisseur').select('*').order('mis_a_jour_le', { ascending: false })
  if (error) throw erreur(error)
  return data || []
}

/** decision : 'valider' | 'corriger' | 'refuser' ; renvoie l'id de la fiche créée à la validation */
export async function statuerDemande(id, decision, { message = '', categorie = null, visible = true } = {}) {
  const { data, error } = await supabase.rpc('statuer_demande_fournisseur', { p_id: id, p_decision: decision, p_message: message || null, p_categorie: categorie || null, p_visible: visible })
  if (error) throw erreur(error)
  return data
}

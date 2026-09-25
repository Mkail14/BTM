/**
 * Administration — toutes ces requêtes passent par les politiques RLS :
 * elles ne renvoient des données que si le compte connecté a le rôle « admin » (fonction SQL est_admin()).
 */
import { supabase, supabaseConfigure } from './client.js'

const verifier = () => { if (!supabaseConfigure) throw new Error('Backend Supabase non configuré') }
const ok = ({ data, error }) => { if (error) throw error; return data }

export async function estAdmin(utilisateurId) {
  if (!supabaseConfigure || !utilisateurId) return false
  const { data, error } = await supabase.from('profils').select('role').eq('id', utilisateurId).maybeSingle()
  return !error && data?.role === 'admin'
}

async function compter(table, filtre) {
  let requete = supabase.from(table).select('*', { count: 'exact', head: true })
  if (filtre) requete = filtre(requete)
  const { count, error } = await requete
  if (error) throw error
  return count || 0
}

export async function statistiques() {
  verifier()
  const [utilisateurs, projets, avis, fournisseurs, projetsCout, notes] = await Promise.all([
    compter('profils'),
    compter('projets'),
    compter('avis'),
    compter('fournisseurs', (r) => r.eq('actif', true)),
    supabase.from('projets').select('cout_total').then(ok),
    supabase.from('avis').select('note').then(ok)
  ])
  return {
    utilisateurs, projets, avis, fournisseurs,
    budgetCumule: projetsCout.reduce((s, p) => s + Number(p.cout_total || 0), 0),
    noteMoyenne: notes.length ? notes.reduce((s, a) => s + a.note, 0) / notes.length : 0
  }
}

export async function listerProfils() {
  verifier()
  return ok(await supabase.from('profils').select('id, email, nom_affiche, type_profil, role, cree_le').order('cree_le', { ascending: false }))
}

/** Appelle la fonction serveur (qui revérifie le rôle admin) et remonte son message d'erreur */
async function fonctionAdmin(corps) {
  verifier()
  const { data, error } = await supabase.functions.invoke('admin-utilisateurs', { body: corps })
  if (error) {
    let message = error.message
    try { message = (await error.context.json()).erreur || message } catch { /* corps non JSON */ }
    throw new Error(message)
  }
  if (data?.erreur) throw new Error(data.erreur)
  return data
}
export const lireUtilisateur = (id) => fonctionAdmin({ action: 'lire', id })
export const modifierUtilisateur = (id, champs) => fonctionAdmin({ action: 'modifier', id, ...champs })
export const reinitialiserMotDePasse = (id) => fonctionAdmin({ action: 'reinitialiser', id, origine: window.location.origin })

export async function listerProjets() {
  verifier()
  return ok(await supabase.from('projets').select('id, utilisateur_id, nom, type_projet_id, cout_total, cree_le').order('cree_le', { ascending: false }).limit(200))
}
export const supprimerProjet = async (id) => { verifier(); ok(await supabase.from('projets').delete().eq('id', id)) }

export async function listerAvis() {
  verifier()
  return ok(await supabase.from('avis').select('id, utilisateur_id, nom, ville, note, commentaire, demo, cree_le').order('cree_le', { ascending: false }))
}
export const supprimerAvis = async (id) => { verifier(); ok(await supabase.from('avis').delete().eq('id', id)) }

export async function listerFournisseurs() {
  verifier()
  return ok(await supabase.from('fournisseurs').select('*').order('nom'))
}
export async function listerCategories() {
  verifier()
  return ok(await supabase.from('categories_fournisseurs').select('id, libelle').order('ordre'))
}
export const definirFournisseurActif = async (id, actif) => { verifier(); ok(await supabase.from('fournisseurs').update({ actif }).eq('id', id)) }
export const supprimerFournisseur = async (id) => { verifier(); ok(await supabase.from('fournisseurs').delete().eq('id', id)) }

const slugifier = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Crée ou met à jour un fournisseur (id présent = mise à jour) */
export async function enregistrerFournisseur(f) {
  verifier()
  const champs = {
    nom: f.nom.trim(),
    categorie_id: f.categorie_id,
    commune: f.commune.trim(),
    adresse: f.adresse?.trim() || null,
    telephone: f.telephone.trim(),
    email: f.email?.trim() || null,
    site_web: f.site_web?.trim() || null,
    description: f.description?.trim() || null,
    horaires: f.horaires?.trim() || null,
    livraison: !!f.livraison
  }
  if (f.id) return ok(await supabase.from('fournisseurs').update(champs).eq('id', f.id).select().single())
  return ok(await supabase.from('fournisseurs').insert({ ...champs, slug: `${slugifier(champs.nom)}-${Math.random().toString(36).slice(2, 6)}` }).select().single())
}

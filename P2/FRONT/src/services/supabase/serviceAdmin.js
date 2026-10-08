/**
 * Administration — toutes ces requêtes passent par les politiques RLS :
 * elles ne renvoient / n'écrivent des données que si le compte connecté a le rôle « admin »
 * (fonction SQL est_admin(), migrations 0004, 0006 et 0007).
 */
import { supabase, supabaseConfigure } from './client.js'
import { normaliserResultat } from '@/services/calculs/moteurCalculs.js'
import { televerserPhoto, supprimerPhotos } from './serviceRealisations.js'

const verifier = () => { if (!supabaseConfigure) throw new Error('Backend Supabase non configuré') }
const ok = ({ data, error }) => { if (error) throw traduire(error); return data }

// Codes signalant une base en retard sur le code : table / colonne absente, droit manquant
const CODES_MIGRATION = ['PGRST205', 'PGRST204', '42P01', '42703', '42501']

/** Messages PostgreSQL / PostgREST → phrases lisibles pour l'admin ; `migration` = base à mettre à jour */
function traduire(error) {
  const messages = {
    '23503': 'Élément encore utilisé ailleurs : retirez d’abord ce qui y fait référence.',
    '23505': 'Cet élément existe déjà (identifiant ou code en double).'
  }
  const migration = CODES_MIGRATION.includes(error.code)
  const e = new Error(migration ? 'La base Supabase n’est pas à jour : appliquez les dernières migrations (dossier BACK/supabase/migrations).' : messages[error.code] || error.message || 'Erreur inconnue')
  e.migration = migration
  return e
}

/** Rôle et type du compte : { role, fournisseur_id, type_profil, pro } (select * : fonctionne avant les migrations 0010/0011) */
export async function lireRoleCompte(utilisateurId) {
  if (!supabaseConfigure || !utilisateurId) return { role: null, fournisseur_id: null, type_profil: null, pro: null, banni: false }
  const { data, error } = await supabase.from('profils').select('*').eq('id', utilisateurId).maybeSingle()
  if (error || !data) return { role: null, fournisseur_id: null, type_profil: null, pro: null, banni: false }
  return {
    role: data.role, fournisseur_id: data.fournisseur_id || null, type_profil: data.type_profil || 'particulier',
    banni: banActif(data), // compte banni (migration 0022) : le site le déconnecte
    bannieJusqua: data.banni_jusqua || null,
    bannieMotif: data.banni_motif || null, // affiché au compte banni (page « Compte suspendu »)
    // demande de compte professionnel (migration 0011) : statut, entreprise, motif d'un éventuel refus
    pro: data.pro_statut ? { statut: data.pro_statut, raisonSociale: data.pro_raison_sociale, siret: data.pro_siret, motif: data.pro_motif_refus, demandeLe: data.pro_demande_le } : null
  }
}

export async function estAdmin(utilisateurId) {
  if (!supabaseConfigure || !utilisateurId) return false
  const { data, error } = await supabase.from('profils').select('role').eq('id', utilisateurId).maybeSingle()
  return !error && data?.role === 'admin'
}

// ---------- Utilisateurs ---------------------------------------------------------
/**
 * Compte administrateur principal : ni supprimé, ni banni, ni rétrogradé, et son adresse ne change pas.
 * L'interface retire ces actions ; la base les refuse aussi (supabase/admin_principal.sql).
 */
export const ADMIN_PRINCIPAL = 'contact@btm.yt'
export const estAdminPrincipal = (p) => (p?.email || '').trim().toLowerCase() === ADMIN_PRINCIPAL
export async function listerProfils() {
  verifier()
  return ok(await supabase.from('profils').select('*').order('cree_le', { ascending: false }))
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
/** Suppression définitive du compte (refusée par le serveur pour son propre compte) */
export const supprimerUtilisateur = (id) => fonctionAdmin({ action: 'supprimer', id })
/** Bannissement (migration 0022) : `jusqua` = date ISO de fin, ou null pour un ban à vie */
export const bannirUtilisateur = (id, jusqua, motif) => fonctionAdmin({ action: 'bannir', id, jusqua: jusqua || 'vie', motif })
export const debannirUtilisateur = (id) => fonctionAdmin({ action: 'debannir', id })
/** Ban en cours ? (un ban temporaire dont la date est passée est levé automatiquement par Supabase Auth) */
export const banActif = (p) => !!p?.banni_le && (!p.banni_jusqua || new Date(p.banni_jusqua) > new Date())
// ---------- Accès fournisseur (fonction admin-utilisateurs) ----------
// Statut lu dans Auth : { id, email, statut: 'invite'|'actif', invite_le, derniere_connexion, fournisseur_id }
export const listerAccesFournisseurs = async () => (await fonctionAdmin({ action: 'acces_fournisseurs' })).acces || []
/** Invite le responsable par e-mail ; { envoye: false, lien } si l'e-mail n'a pas pu partir, { relie: true } si le compte existait */
export const inviterFournisseur = (email, fournisseurId) => fonctionAdmin({ action: 'inviter_fournisseur', email, fournisseur_id: fournisseurId, origine: window.location.origin })
/** Renvoie l'invitation (compte pas encore activé) ou un e-mail de nouveau mot de passe (compte actif) */
export const relancerFournisseur = (id) => fonctionAdmin({ action: 'relancer_fournisseur', id, origine: window.location.origin })
/** Lien d'invitation à transmettre soi-même (quand l'e-mail ne part pas) */
export const lienFournisseur = async (id) => (await fonctionAdmin({ action: 'lien_fournisseur', id, origine: window.location.origin })).lien
/** Retire l'accès : compte jamais activé supprimé, compte actif redevenu particulier */
export const retirerFournisseur = (id) => fonctionAdmin({ action: 'retirer_fournisseur', id })

// ---------- Projets --------------------------------------------------------------
export async function listerProjets() {
  verifier()
  // `frais` : montant des frais de service BTM enregistré dans le devis (absent des devis antérieurs aux frais)
  const lignes = ok(await supabase.from('projets')
    .select('id, utilisateur_id, nom, type_projet_id, cout_total, fournisseur_id, cree_le, frais:resultat->fraisService->>montant, remise:resultat->remise->>montant, code:resultat->remise->>code')
    .order('cree_le', { ascending: false }).limit(1000))
  // remise : réduction d'un code promo (déduite du revenu BTM) ; code : le code utilisé
  return lignes.map((p) => ({ ...p, frais: p.frais === null || p.frais === undefined ? null : Number(p.frais), remise: Number(p.remise) || 0 }))
}
export async function lireProjet(id) {
  verifier()
  const p = ok(await supabase.from('projets').select('*').eq('id', id).single())
  return { ...p, resultat: normaliserResultat(p.resultat) }
}
export const supprimerProjet = async (id) => { verifier(); ok(await supabase.from('projets').delete().eq('id', id)) }

// ---------- Avis -----------------------------------------------------------------
export async function listerAvis() {
  verifier()
  const lignes = ok(await supabase.from('avis').select('*').order('cree_le', { ascending: false }))
  return lignes.map((a) => ({ ...a, visible: a.visible !== false })) // colonne absente avant 0007 : tout est visible
}
export const definirAvisVisible = async (id, visible) => { verifier(); ok(await supabase.from('avis').update({ visible }).eq('id', id)) }
export const supprimerAvis = async (id) => { verifier(); ok(await supabase.from('avis').delete().eq('id', id)) }
// ---------- Réalisations (accueil, migration 0025) ------------------------------------------
export async function listerRealisations() {
  verifier()
  return ok(await supabase.from('realisations').select('*').order('cree_le', { ascending: false }))
}
const CHAMPS_REALISATION = ['titre', 'type_projet', 'auteur', 'commune', 'quartier', 'fournisseur_id', 'fournisseur_nom', 'detail', 'annee', 'photo_url', 'photo_chemin']
const champsRealisation = (r) => Object.fromEntries(CHAMPS_REALISATION.map((c) => [c, typeof r[c] === 'string' ? r[c].trim() || null : r[c] ?? null]))

/** Proposition à un utilisateur de mettre en ligne l'un de ses projets */
export async function proposerRealisation(p) {
  verifier()
  return ok(await supabase.from('realisations').insert({
    ...champsRealisation(p), titre: p.titre?.trim() || '', auteur: p.auteur?.trim() || '', commune: '',
    utilisateur_id: p.utilisateur_id, projet_id: p.projet_id || null, message_admin: p.message_admin?.trim() || null, statut: 'proposee'
  }).select().single())
}
/** Relance d'une proposition déclinée par l'utilisateur : elle réapparaît dans « Mes projets » */
export async function relancerRealisation(id, message) {
  verifier()
  return ok(await supabase.from('realisations').update({ statut: 'proposee', message_admin: message?.trim() || null }).eq('id', id).eq('statut', 'declinee').select().single())
}
/** Création (saisie directe par l'admin, puis publiée) ou modification d'une réalisation */
export async function enregistrerRealisation(r) {
  verifier()
  const champs = { ...champsRealisation(r), titre: r.titre.trim(), auteur: r.auteur.trim(), commune: r.commune.trim() }
  if (r.id) return ok(await supabase.from('realisations').update(champs).eq('id', r.id).select().single())
  return ok(await supabase.from('realisations').insert({ ...champs, statut: 'soumise', consentement: true }).select().single())
}
/** Met en ligne ; au-delà de 10, la plus ancienne est supprimée (avec sa photo). Renvoie le nombre de réalisations retirées. */
export async function publierRealisation(id) {
  verifier()
  const chemins = ok(await supabase.rpc('publier_realisation', { p_id: id })) || []
  await supprimerPhotos(chemins).catch(() => {})
  return chemins.length
}
export async function refuserRealisation(id, motif) {
  verifier()
  return ok(await supabase.from('realisations').update({ statut: 'refusee', message_admin: motif?.trim() || null }).eq('id', id).select().single())
}
export async function supprimerRealisation(r) {
  verifier()
  ok(await supabase.from('realisations').delete().eq('id', r.id))
  if (r.photo_chemin) await supprimerPhotos([r.photo_chemin]).catch(() => {})
}
export const televerserPhotoRealisation = (fichier) => { verifier(); return televerserPhoto(fichier, 'admin') }

/** Avis Google recopié depuis la fiche Google de BTM (migration 0024) : création ou correction */
export async function enregistrerAvisGoogle(a) {
  verifier()
  const champs = {
    nom: a.nom.trim(), note: Number(a.note), commentaire: a.commentaire.trim(), ville: 'Google',
    lien: a.lien?.trim() || null, cree_le: a.date ? new Date(`${a.date}T12:00:00`).toISOString() : new Date().toISOString()
  }
  if (a.id) return ok(await supabase.from('avis').update(champs).eq('id', a.id).select().single())
  return ok(await supabase.from('avis').insert({ ...champs, source: 'google', utilisateur_id: null }).select().single())
}

// ---------- Fournisseurs et catégories ---------------------------------------------
export async function listerFournisseurs() {
  verifier()
  return ok(await supabase.from('fournisseurs').select('*').order('nom'))
}
export const definirFournisseurActif = async (id, actif) => { verifier(); ok(await supabase.from('fournisseurs').update({ actif }).eq('id', id)) }
export const supprimerFournisseur = async (id) => { verifier(); ok(await supabase.from('fournisseurs').delete().eq('id', id)) }

export const slugifier = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

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
    logo_url: f.logo_url?.trim() || null,
    livraison: !!f.livraison,
    actif: f.actif !== false
  }
  if (f.id) return ok(await supabase.from('fournisseurs').update(champs).eq('id', f.id).select().single())
  return ok(await supabase.from('fournisseurs').insert({ ...champs, slug: `${slugifier(champs.nom)}-${Math.random().toString(36).slice(2, 6)}` }).select().single())
}

export async function listerCategories() {
  verifier()
  return ok(await supabase.from('categories_fournisseurs').select('id, libelle, icone, ordre').order('ordre'))
}
/** Nouvelle catégorie : l'identifiant est dérivé du libellé et ne change plus ensuite (clé étrangère) */
export async function enregistrerCategorie(c, creation) {
  verifier()
  const champs = { libelle: c.libelle.trim(), icone: c.icone?.trim() || null, ordre: Number(c.ordre) || 0 }
  if (creation) return ok(await supabase.from('categories_fournisseurs').insert({ id: slugifier(champs.libelle), ...champs }).select().single())
  return ok(await supabase.from('categories_fournisseurs').update(champs).eq('id', c.id).select().single())
}
export const supprimerCategorie = async (id) => { verifier(); ok(await supabase.from('categories_fournisseurs').delete().eq('id', id)) }

// ---------- Calculateur : matériaux et types de projets ---------------------------
export async function listerMateriaux() {
  verifier()
  return ok(await supabase.from('materiaux').select('*').order('libelle'))
}
export async function enregistrerMateriau(m) {
  verifier()
  const champs = { libelle: m.libelle.trim(), unite: m.unite.trim(), prix_unitaire: Number(m.prix_unitaire), source: m.source?.trim() || null }
  return ok(await supabase.from('materiaux').update(champs).eq('id', m.id).select().single())
}

export async function listerTypesProjets() {
  verifier()
  return ok(await supabase.from('types_projets').select('*').order('ordre'))
}
export async function enregistrerTypeProjet(t) {
  verifier()
  const champs = {
    libelle: t.libelle.trim(),
    description: t.description?.trim() || null,
    accroche: t.accroche?.trim() || null,
    hypotheses: t.hypotheses?.trim() || null,
    parametres: t.parametres
  }
  return ok(await supabase.from('types_projets').update(champs).eq('id', t.id).select().single())
}

// ---------- Contenus du site ------------------------------------------------------
export async function listerContenus() {
  verifier()
  return ok(await supabase.from('contenus_site').select('*'))
}
export async function enregistrerContenu(cle, valeur, auteurId) {
  verifier()
  return ok(await supabase.from('contenus_site').upsert({ cle, valeur, mis_a_jour_par: auteurId || null }).select().single())
}

// ---------- Codes promo ---------------------------------------------------------
export async function listerCodes() {
  verifier()
  return ok(await supabase.from('codes_promo').select('*').order('cree_le', { ascending: false }))
}
/** Crée ou met à jour un code (id présent = mise à jour) ; le code est toujours enregistré en majuscules */
export async function enregistrerCode(c) {
  verifier()
  const champs = {
    code: String(c.code).toUpperCase().replace(/\s+/g, ''),
    type: c.type,
    valeur: Number(c.valeur),
    portee: c.portee,
    expire_le: c.expire_le || null,
    actif: c.actif !== false,
    note: c.note?.trim() || null
  }
  if (c.id) return ok(await supabase.from('codes_promo').update(champs).eq('id', c.id).select().single())
  return ok(await supabase.from('codes_promo').insert(champs).select().single())
}
export const definirCodeActif = async (id, actif) => { verifier(); ok(await supabase.from('codes_promo').update({ actif }).eq('id', id)) }
export const supprimerCode = async (id) => { verifier(); ok(await supabase.from('codes_promo').delete().eq('id', id)) }

// ---------- Paiements : revenus encaissés -----------------------------------------------
export async function listerPaiements() {
  verifier()
  return ok(await supabase.from('paiements').select('*').order('paye_le', { ascending: false }))
    .map((p) => ({ ...p, montant_devis: Number(p.montant_devis), revenu_btm: Number(p.revenu_btm) }))
}
// Confirmation des paiements : uniquement par le fournisseur, depuis son espace (serviceEspaceFournisseur.js)

/** Relie un compte à une fiche fournisseur (null = délier) ; le rôle suit automatiquement */
export async function lierCompteFournisseur(profilId, fournisseurId) {
  verifier()
  const { error } = await supabase.rpc('lier_compte_fournisseur', { p_profil: profilId, p_fournisseur: fournisseurId || null })
  if (error) throw traduire(error)
}

// ---------- RIB de BTM (communiqué aux fournisseurs pour leurs reversements) ----------------
export async function lireParametresVersement() {
  verifier()
  const lignes = ok(await supabase.from('parametres_versement').select('*').eq('id', 1))
  const p = lignes[0]
  return p ? { ...p, seuil_minimum: Number(p.seuil_minimum) } : null
}
export async function enregistrerParametresVersement(p, auteurId) {
  verifier()
  const champs = {
    id: 1,
    titulaire: p.titulaire?.trim() || null,
    iban: p.iban ? p.iban.toUpperCase().replace(/\s+/g, '') : null,
    bic: p.bic ? p.bic.toUpperCase().replace(/\s+/g, '') : null,
    banque: p.banque?.trim() || null,
    frequence: p.frequence,
    jour: Number(p.jour),
    seuil_minimum: Number(p.seuil_minimum) || 0,
    mis_a_jour_par: auteurId || null
  }
  const ligne = ok(await supabase.from('parametres_versement').upsert(champs).select().single())
  return { ...ligne, seuil_minimum: Number(ligne.seuil_minimum) }
}
// ---------- Reversements des fournisseurs à BTM (migration 0014) ----------
// Le fournisseur encaisse tout et reverse les frais de service BTM ; pris en compte dès sa déclaration.
export async function listerReversements() {
  verifier()
  const { data, error } = await supabase.from('reversements').select('*, fournisseurs(nom)').order('declare_le', { ascending: false })
  if (error) throw traduire(error)
  return data.map((r) => ({ ...r, montant: Number(r.montant), fournisseur_nom: r.fournisseurs?.nom || 'Fournisseur supprimé' }))
}


// ---------- Comptes professionnels : vérification (migration 0011) ----------------------
/** decision : 'verifie' | 'refuse' (motif obligatoire, affiché à l'utilisateur) */
export async function statuerVerificationPro(profilId, decision, motif) {
  verifier()
  const { error } = await supabase.rpc('statuer_verification_pro', { p_profil: profilId, p_decision: decision, p_motif: motif || null })
  if (error) throw traduire(error)
}

// ---------- Profil d'un compte, tel que l'admin le choisit -----------------------------------
/**
 * Quatre profils, chacun avec ses pages : utilisateur (site public et « Mes projets »), professionnel (en plus la page
 * « Projet pro »), fournisseur (espace fournisseur), administrateur (administration). Dans l'admin, ce choix unique
 * règle le rôle, le type de profil, la fiche fournisseur liée et le statut professionnel de la base.
 */
export const ROLES_COMPTE = {
  particulier: { label: 'Particulier', icone: 'fa-solid fa-user', classe: '', aide: 'Site public : calculateur, devis et « Mes projets ».' },
  professionnel: { label: 'Professionnel', icone: 'fa-solid fa-helmet-safety', classe: 'adm-badge-violet', aide: 'Comme un utilisateur, avec en plus la page « Projet pro » : chantiers multi-ouvrages et maquette 3D.' },
  fournisseur: { label: 'Fournisseur', icone: 'fa-solid fa-truck', classe: 'adm-badge-info', aide: 'Espace fournisseur de son entreprise : devis reçus, paiements et catalogue.' },
  admin: { label: 'Administrateur', icone: 'fa-solid fa-user-shield', classe: 'adm-badge-noir', aide: 'Administration du site : textes, prix, comptes et reversements.' }
}
export const roleCompte = (p) => (p?.role === 'admin' ? 'admin' : p?.role === 'fournisseur' ? 'fournisseur' : p?.pro_statut === 'verifie' ? 'professionnel' : 'particulier')

/**
 * Donne à un compte l'un des rôles de ROLES_COMPTE.
 * @param {object} profil ligne de `profils` (état actuel du compte)
 * @param {string} choix clé de ROLES_COMPTE
 * @param {{ fournisseurId?: string, champs?: object }} [options] fiche de l'annuaire (rôle fournisseur) ;
 *        `champs` : identité déjà saisie dans la fiche de l'utilisateur, enregistrée du même coup (sinon relue)
 */
export async function definirRoleCompte(profil, choix, { fournisseurId = null, champs = null } = {}) {
  verifier()
  if (!ROLES_COMPTE[choix]) throw new Error('Profil inconnu.')
  if (estAdminPrincipal(profil) && choix !== 'admin') throw new Error('Le compte administrateur principal reste administrateur.')
  if (choix === 'fournisseur' && !fournisseurId) throw new Error('Choisissez l’entreprise de l’annuaire que ce compte représente.')
  if (!champs) {
    const { id: _id, derniereConnexion: _d, fournisseur_id: _f, ...lus } = await lireUtilisateur(profil.id)
    champs = lus
  }
  const role = choix === 'admin' ? 'admin' : choix === 'fournisseur' ? 'fournisseur' : 'user'
  const type_profil = choix === 'admin' ? champs.type_profil : choix
  await modifierUtilisateur(profil.id, { ...champs, role, type_profil })
  // fiche de l'annuaire : liée pour un fournisseur, déliée pour tout autre rôle
  const lien = choix === 'fournisseur' ? fournisseurId : null
  if ((profil.fournisseur_id || null) !== lien) await lierCompteFournisseur(profil.id, lien)
  if (choix === 'professionnel' && profil.pro_statut !== 'verifie') await definirPro(profil.id, true)
  if (choix === 'particulier' && profil.pro_statut) await definirPro(profil.id, false)
}

/** Statut professionnel posé par l'admin, sans demande de l'utilisateur (fonction SQL de supabase/roles_comptes.sql) */
async function definirPro(profilId, pro) {
  const { error } = await supabase.rpc('admin_definir_pro', { p_profil: profilId, p_pro: pro })
  if (!error) return
  if (!['PGRST202', '42883'].includes(error.code)) throw traduire(error)
  // fonction pas encore installée : on passe par la vérification des demandes pro (migration 0011)
  await statuerVerificationPro(profilId, pro ? 'verifie' : 'refuse', pro ? null : 'Compte repassé en particulier par l’équipe BTM.')
}

/**
 * Administration — toutes les données passent par l'API BTM (/api/admin/…) : rôle admin exigé et revérifié
 * à chaque requête par l'API, sur le compte du jeton. Le compte administrateur principal est protégé par la base.
 */
import { api, apiConfiguree } from './client.js'
import { normaliserResultat } from '@/services/calculs/moteurCalculs.js'
import { televerserPhoto } from './serviceRealisations.js'

/** Ban en cours ? (un ban temporaire dont la date est passée est levé de lui-même) */
export const banActif = (p) => !!p?.banni_le && (!p.banni_jusqua || new Date(p.banni_jusqua) > new Date())

const verifier = () => { if (!apiConfiguree) throw new Error('API BTM non configurée (VITE_API_URL).') }
const texte = (v) => (typeof v === 'string' ? v.trim() || null : v ?? null)

// ---------- Utilisateurs ---------------------------------------------------------
/**
 * Compte administrateur principal : ni supprimé, ni banni, ni rétrogradé, et son adresse ne change pas.
 * L'interface retire ces actions ; l'API et la base les refusent aussi.
 */
export const ADMIN_PRINCIPAL = 'contact@btm.yt'
export const estAdminPrincipal = (p) => (p?.email || '').trim().toLowerCase() === ADMIN_PRINCIPAL
export async function listerProfils() {
  verifier()
  return api.get('/admin/profils')
}

export const lireUtilisateur = (id) => { verifier(); return api.get(`/admin/utilisateurs/${id}`) }
export const modifierUtilisateur = (id, champs) => { verifier(); return api.patch(`/admin/utilisateurs/${id}`, champs) }
/** Un code part par e-mail à l'utilisateur pour choisir un nouveau mot de passe */
export const reinitialiserMotDePasse = (id) => { verifier(); return api.post(`/admin/utilisateurs/${id}/reinitialiser`) }
/** Suppression définitive du compte (refusée pour son propre compte) ; le crédit restant est annulé avec `motif` */
export const supprimerUtilisateur = (id, motif = '') => { verifier(); return api.post(`/admin/utilisateurs/${id}/supprimer`, { motif: texte(motif) }) }
export const soldeCreditUtilisateur = async (id) => { verifier(); return Number((await api.get(`/admin/utilisateurs/${id}/credit`))?.solde) || 0 }
/** Crédits annulés à la suppression d'un compte (preuve : montant, motif, mouvements, auteur) */
export const listerCreditsAnnules = () => { verifier(); return api.get('/admin/credits-annules') }
/** Crédit fidélité cumulé par compte : { [utilisateur_id]: { gagne, utilise, solde, mouvements, dernier } } */
export const listerCredits = () => { verifier(); return api.get('/admin/credits') }
/** Bannissement : `jusqua` = date ISO de fin, ou null pour un ban à vie */
export const bannirUtilisateur = (id, jusqua, motif) => { verifier(); return api.post(`/admin/utilisateurs/${id}/bannir`, { jusqua: jusqua || 'vie', motif: texte(motif) }) }
export const debannirUtilisateur = (id) => { verifier(); return api.post(`/admin/utilisateurs/${id}/debannir`) }
// ---------- Accès fournisseur ----------
// { id, email, statut: 'invite'|'actif', invite_le, derniere_connexion, fournisseur_id }
export const listerAccesFournisseurs = async () => { verifier(); return (await api.get('/admin/acces-fournisseurs')).acces || [] }
/** Envoie un code par e-mail ; { envoye: false, lien } si l'e-mail n'a pas pu partir, { relie: true } si le compte existait */
export const inviterFournisseur = (email, fournisseurId) => { verifier(); return api.post('/admin/acces-fournisseurs', { email, fournisseur_id: fournisseurId }) }
/** Renvoie un code pour choisir le mot de passe */
export const relancerFournisseur = (id) => { verifier(); return api.post(`/admin/acces-fournisseurs/${id}/relancer`) }
/** Page à transmettre soi-même (quand l'e-mail ne part pas) */
export const lienFournisseur = async (id) => { verifier(); return (await api.get(`/admin/acces-fournisseurs/${id}/lien`)).lien }
/** Retire l'accès : compte jamais utilisé supprimé, compte actif redevenu particulier */
export const retirerFournisseur = (id) => { verifier(); return api.post(`/admin/acces-fournisseurs/${id}/retirer`) }

// ---------- Projets --------------------------------------------------------------
/** `frais` : frais de service BTM du devis (null avant les frais) ; `remise` / `code` : code promo utilisé */
export async function listerProjets() {
  verifier()
  return api.get('/admin/projets')
}
export async function lireProjet(id) {
  verifier()
  const p = await api.get(`/projets/${id}`)
  return { ...p, resultat: normaliserResultat(p.resultat) }
}
export const supprimerProjet = async (id) => { verifier(); await api.delete(`/projets/${id}`) }

// ---------- Avis -----------------------------------------------------------------
export async function listerAvis() {
  verifier()
  const [site, surFournisseurs] = await Promise.all([api.get('/admin/avis'), api.get('/admin/avis-fournisseurs').catch(() => [])])
  return [
    ...site,
    ...surFournisseurs.map((a) => ({ ...a, source: 'fournisseur', table: 'avis_fournisseurs', ville: `sur ${a.fournisseur_nom}`, cree_le: a.repondu_le }))
  ].sort((x, y) => new Date(y.cree_le) - new Date(x.cree_le))
}
export const definirAvisVisible = async (id, visible, table = 'avis') => {
  verifier()
  await api.patch(table === 'avis_fournisseurs' ? `/admin/avis-fournisseurs/${id}` : `/admin/avis/${id}`, { visible })
}
export const supprimerAvis = async (id, table = 'avis') => {
  verifier()
  await api.delete(table === 'avis_fournisseurs' ? `/admin/avis-fournisseurs/${id}` : `/admin/avis/${id}`)
}

/** Avis Trustpilot recopié depuis la page Trustpilot de BTM (migration 0028) : création ou correction */
export async function enregistrerAvisTrustpilot(a) {
  verifier()
  const champs = { nom: a.nom.trim(), note: Number(a.note), commentaire: a.commentaire.trim(), lien: texte(a.lien), ...(a.date ? { date: a.date } : {}) }
  return a.id ? api.patch(`/admin/avis/${a.id}`, champs) : api.post('/admin/avis', champs)
}

// ---------- Réalisations (accueil, migration 0025) ------------------------------------------
export async function listerRealisations() {
  verifier()
  return api.get('/admin/realisations')
}
const CHAMPS_REALISATION = ['titre', 'type_projet', 'auteur', 'commune', 'quartier', 'fournisseur_id', 'fournisseur_nom', 'detail', 'annee', 'photo_url', 'photo_chemin']
const champsRealisation = (r) => Object.fromEntries(CHAMPS_REALISATION.map((c) => [c, c === 'annee' ? (Number(r.annee) || null) : texte(r[c])]))

/** Proposition à un utilisateur de mettre en ligne l'un de ses projets */
export async function proposerRealisation(p) {
  verifier()
  const { commune: _commune, ...champs } = champsRealisation(p)
  return api.post('/admin/realisations/propositions', {
    ...champs, utilisateur_id: p.utilisateur_id, projet_id: p.projet_id || null, message_admin: texte(p.message_admin)
  })
}
/** Relance d'une proposition déclinée par l'utilisateur : elle réapparaît dans « Mes projets » */
export async function relancerRealisation(id, message) {
  verifier()
  return api.post(`/admin/realisations/${id}/relancer`, { message: texte(message) })
}
/** Création (saisie directe par l'admin, puis publiée) ou modification d'une réalisation */
export async function enregistrerRealisation(r) {
  verifier()
  const champs = { ...champsRealisation(r), titre: r.titre.trim(), auteur: r.auteur.trim(), commune: r.commune.trim() }
  return r.id ? api.patch(`/admin/realisations/${r.id}`, champs) : api.post('/admin/realisations', champs)
}
/** Met en ligne ; au-delà de 10, la plus ancienne est supprimée (avec sa photo). Renvoie le nombre de réalisations retirées. */
export async function publierRealisation(id) {
  verifier()
  const { photos_retirees: chemins = [] } = await api.post(`/admin/realisations/${id}/publier`)
  return chemins.length
}
export async function refuserRealisation(id, motif) {
  verifier()
  return api.post(`/admin/realisations/${id}/refuser`, { motif: texte(motif) })
}
export async function supprimerRealisation(r) {
  verifier()
  await api.delete(`/admin/realisations/${r.id}`) // la photo part avec elle
}
export const televerserPhotoRealisation = (fichier) => { verifier(); return televerserPhoto(fichier) }

// ---------- Fournisseurs et catégories ---------------------------------------------
export async function listerFournisseurs() {
  verifier()
  return api.get('/admin/fournisseurs')
}
export const definirFournisseurActif = async (id, actif) => { verifier(); await api.patch(`/admin/fournisseurs/${id}`, { actif }) }
export const supprimerFournisseur = async (id) => { verifier(); await api.delete(`/admin/fournisseurs/${id}`) }

export const slugifier = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Crée ou met à jour un fournisseur (id présent = mise à jour ; le slug est généré par l'API) */
export async function enregistrerFournisseur(f) {
  verifier()
  const champs = {
    nom: f.nom.trim(),
    categorie_id: f.categorie_id,
    commune: f.commune.trim(),
    adresse: texte(f.adresse),
    telephone: f.telephone.trim(),
    email: texte(f.email),
    site_web: texte(f.site_web),
    description: texte(f.description),
    horaires: texte(f.horaires),
    logo_url: texte(f.logo_url),
    livraison: !!f.livraison,
    demonstration: !!f.demonstration,
    actif: f.actif !== false
  }
  return f.id ? api.patch(`/admin/fournisseurs/${f.id}`, champs) : api.post('/admin/fournisseurs', champs)
}

export async function listerCategories() {
  verifier()
  return api.get('/admin/categories')
}
/** Nouvelle catégorie : l'identifiant est dérivé du libellé par l'API et ne change plus ensuite (clé étrangère) */
export async function enregistrerCategorie(c, creation) {
  verifier()
  const champs = { libelle: c.libelle.trim(), icone: texte(c.icone), ordre: Number(c.ordre) || 0 }
  return creation ? api.post('/admin/categories', champs) : api.patch(`/admin/categories/${encodeURIComponent(c.id)}`, champs)
}
export const supprimerCategorie = async (id) => { verifier(); await api.delete(`/admin/categories/${encodeURIComponent(id)}`) }

// ---------- Calculateur : matériaux et types de projets ---------------------------
export async function listerMateriaux() {
  verifier()
  return api.get('/admin/materiaux')
}
export async function enregistrerMateriau(m) {
  verifier()
  const champs = { libelle: m.libelle.trim(), unite: m.unite.trim(), prix_unitaire: Number(m.prix_unitaire), source: texte(m.source) }
  return api.patch(`/admin/materiaux/${encodeURIComponent(m.id)}`, champs)
}

export async function listerTypesProjets() {
  verifier()
  return api.get('/admin/types-projets')
}
export async function enregistrerTypeProjet(t) {
  verifier()
  const champs = {
    libelle: t.libelle.trim(),
    description: texte(t.description),
    accroche: texte(t.accroche),
    hypotheses: texte(t.hypotheses),
    parametres: t.parametres
  }
  return api.patch(`/admin/types-projets/${encodeURIComponent(t.id)}`, champs)
}

// ---------- Contenus du site ------------------------------------------------------
export async function listerContenus() {
  verifier()
  return api.get('/admin/contenus')
}
/** L'auteur de la modification est l'admin connecté (déduit du jeton par l'API) */
export async function enregistrerContenu(cle, valeur, _auteurId) {
  verifier()
  return api.put(`/admin/contenus/${encodeURIComponent(cle)}`, { valeur })
}

// ---------- Codes promo ---------------------------------------------------------
export async function listerCodes() {
  verifier()
  return api.get('/admin/codes-promo')
}
/** Crée ou met à jour un code (id présent = mise à jour) ; l'API l'enregistre en majuscules */
export async function enregistrerCode(c) {
  verifier()
  const champs = {
    code: String(c.code).toUpperCase().replace(/\s+/g, ''),
    type: c.type,
    valeur: Number(c.valeur),
    portee: c.portee,
    expire_le: c.expire_le || null,
    actif: c.actif !== false,
    note: texte(c.note)
  }
  return c.id ? api.patch(`/admin/codes-promo/${c.id}`, champs) : api.post('/admin/codes-promo', champs)
}
export const definirCodeActif = async (id, actif) => { verifier(); await api.patch(`/admin/codes-promo/${id}`, { actif }) }
export const supprimerCode = async (id) => { verifier(); await api.delete(`/admin/codes-promo/${id}`) }

// ---------- Paiements : revenus encaissés -----------------------------------------------
export async function listerPaiements() {
  verifier()
  return (await api.get('/admin/paiements')).map((p) => ({ ...p, montant_devis: Number(p.montant_devis), revenu_btm: Number(p.revenu_btm) }))
}
// Confirmation des paiements : uniquement par le fournisseur, depuis son espace (serviceEspaceFournisseur.js)

/** Relie un compte à une fiche fournisseur (null = délier) ; le rôle suit automatiquement */
export async function lierCompteFournisseur(profilId, fournisseurId) {
  verifier()
  await api.post(`/admin/profils/${profilId}/fournisseur`, { fournisseur_id: fournisseurId || null })
}

// ---------- RIB de BTM (communiqué aux fournisseurs pour leurs reversements) ----------------
export async function lireParametresVersement() {
  verifier()
  return api.get('/admin/parametres-versement')
}
/** L'auteur de la modification est l'admin connecté (déduit du jeton par l'API) */
export async function enregistrerParametresVersement(p, _auteurId) {
  verifier()
  return api.put('/admin/parametres-versement', {
    titulaire: texte(p.titulaire),
    iban: p.iban ? p.iban.toUpperCase().replace(/\s+/g, '') : null,
    bic: p.bic ? p.bic.toUpperCase().replace(/\s+/g, '') : null,
    banque: texte(p.banque),
    frequence: p.frequence,
    jour: Number(p.jour),
    seuil_minimum: Number(p.seuil_minimum) || 0
  })
}
// ---------- Reversements des fournisseurs à BTM (migration 0014) ----------
// Le fournisseur encaisse tout et reverse les frais de service BTM ; pris en compte dès sa déclaration.
export async function listerReversements() {
  verifier()
  return (await api.get('/admin/reversements')).map((r) => ({ ...r, montant: Number(r.montant) }))
}
/** RIB des fournisseurs (saisis par eux) : { [fournisseur_id]: { titulaire, iban, bic, banque, mis_a_jour_le } } */
export const listerRibsFournisseurs = () => { verifier(); return api.get('/admin/ribs-fournisseurs') }
/** Virement de BTM vers un fournisseur : rembourse les codes promo BTM qui ont dépassé sa commission */
export const verserAuFournisseur = (fournisseurId, montant, reference) => {
  verifier()
  return api.post('/admin/reversements', { fournisseur_id: fournisseurId, montant, reference })
}

// ---------- Comptes professionnels : vérification (migration 0011) ----------------------
/** decision : 'verifie' | 'refuse' (motif obligatoire, affiché à l'utilisateur) */
export async function statuerVerificationPro(profilId, decision, motif) {
  verifier()
  await api.post(`/admin/profils/${profilId}/verification-pro`, { decision, motif: texte(motif) })
}

// ---------- Profil d'un compte, tel que l'admin le choisit -----------------------------------
/**
 * Quatre profils, chacun avec ses pages : utilisateur (site public et « Mes projets »), professionnel (en plus le devis
 * pro, plusieurs ouvrages réunis), fournisseur (espace fournisseur), administrateur (administration). Dans l'admin, ce choix unique
 * règle le rôle, le type de profil, la fiche fournisseur liée et le statut professionnel de la base.
 */
export const ROLES_COMPTE = {
  particulier: { label: 'Particulier', icone: 'fa-solid fa-user', classe: '', aide: 'Site public : calculateur, devis et « Mes projets ».' },
  professionnel: { label: 'Professionnel', icone: 'fa-solid fa-helmet-safety', classe: 'adm-badge-violet', aide: 'Comme un utilisateur, avec en plus le devis pro : plusieurs ouvrages réunis dans un même devis.' },
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
  // statut professionnel posé par l'API (migration 0031, avec repli sur la vérification des demandes pro)
  if (choix === 'professionnel' && profil.pro_statut !== 'verifie') await api.post(`/admin/profils/${profil.id}/pro`, { pro: true })
  if (choix === 'particulier' && profil.pro_statut) await api.post(`/admin/profils/${profil.id}/pro`, { pro: false })
}

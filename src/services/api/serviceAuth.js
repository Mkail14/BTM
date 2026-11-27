/**
 * Authentification par l'API BTM (BACK : /api/auth/…).
 * - Inscription : le compte est créé, un code à 6 chiffres part par e-mail ; sa saisie ouvre la session.
 * - Connexion : e-mail + mot de passe, ou bouton Google (jeton d'identité vérifié par l'API).
 * - Mot de passe oublié : un code reçu par e-mail, puis le nouveau mot de passe.
 *
 * Le compte renvoyé garde la forme qu'attendaient les composants (id, email, user_metadata…) :
 * les données d'identité viennent maintenant de la table utilisateurs de l'API.
 */
import { api, apiConfiguree, enregistrerJeton, oublierJeton, lireJeton, surChangementJeton, ErreurApi } from './client.js'

const NON_CONFIGUREE = 'L’API BTM n’est pas configurée (VITE_API_URL).'
const verifier = () => { if (!apiConfiguree) throw new Error(NON_CONFIGUREE) }

/** Compte de l'API -> objet utilisé par le site (mêmes clés qu'avant, user_metadata compris) */
export function versCompte(u) {
  if (!u) return null
  return {
    ...u,
    // activité du compte, sous les noms qu'utilisaient les écrans
    email_confirmed_at: u.emailVerifie ? (u.creeLe || true) : null,
    last_sign_in_at: u.derniereConnexion || null,
    created_at: u.creeLe || null,
    app_metadata: { providers: [...(u.aMotDePasse ? ['email'] : []), ...(u.googleRelie ? ['google'] : [])] },
    user_metadata: {
      pseudo: u.nomAffiche, civilite: u.civilite, nom: u.nom, prenom: u.prenom, telephone: u.telephone,
      type_profil: u.typeProfil, pro_siret: u.pro?.siret, pro_raison_sociale: u.pro?.raisonSociale
    }
  }
}

/** Rôle et type du compte, sous la forme lue par le routeur et useAuth */
export function roleDe(compte) {
  if (!compte) return { role: null, fournisseur_id: null, type_profil: null, pro: null, banni: false }
  const p = compte.pro
  return {
    role: compte.role,
    fournisseur_id: compte.fournisseurId || null,
    type_profil: compte.typeProfil || 'particulier',
    banni: false, // un compte banni ne reçoit plus de réponse de l'API : sa session est fermée
    // compte d'une entreprise pas encore validée par BTM (page « Compte en cours de validation »)
    demandeFournisseur: compte.demandeFournisseur || null,
    pro: p ? { statut: p.statut, raisonSociale: p.raisonSociale, siret: p.siret, motif: p.motifRefus, demandeLe: p.demandeLe } : null
  }
}

// ---------- Compte courant (gardé en mémoire, relu au besoin) ----------
let courant = null
let lecture = null
const abonnes = new Set()
const prevenir = () => abonnes.forEach((cb) => cb(courant))

function ouvrirSession({ jeton, utilisateur }, { durable = true } = {}) {
  courant = versCompte(utilisateur)
  enregistrerJeton(jeton, { durable })
  return courant
}

// Session fermée (expirée, autre onglet, compte banni) : le compte n'est plus affiché
surChangementJeton((jeton) => {
  if (!jeton) { courant = null; prevenir() }
  else if (!courant) utilisateurCourant({ relire: true }).then(prevenir)
})

/** Compte connecté, ou null. `relire` : redemande le compte à l'API (rôle changé, demande pro validée…) */
export async function utilisateurCourant({ relire = false } = {}) {
  if (!apiConfiguree || !lireJeton()) return null
  if (courant && !relire) return courant
  lecture ||= api.get('/auth/moi')
    .then((u) => { courant = versCompte(u) })
    .catch((e) => { if (e.statut === 401) courant = null })
    .finally(() => { lecture = null })
  await lecture
  return courant
}

export function surChangementAuth(callback) {
  abonnes.add(callback)
  return () => abonnes.delete(callback)
}

// ---------- Connexion ----------

/**
 * Erreurs particulières (err.code) : EMAIL_NON_VERIFIE (un nouveau code vient de partir),
 * COMPTE_SUSPENDU (err.details : { jusqua, motif }).
 */
export async function connexion(email, motDePasse, { resterConnecte = true } = {}) {
  verifier()
  const session = await api.post('/auth/connexion', { email, motDePasse })
  ouvrirSession(session, { durable: resterConnecte })
  prevenir()
  return courant
}

/** Jeton d'identité Google (bouton Google Identity Services) + nonce en clair -> session */
export async function connexionGoogleJeton(jeton, nonce) {
  verifier()
  ouvrirSession(await api.post('/auth/google', { jeton, nonce }))
  prevenir()
  return courant
}

/** Redirection vers Google : plus utilisée (seul le bouton officiel de Google est pris en charge) */
export async function connexionExterne() {
  throw new Error('Le bouton Google n’a pas pu se charger : rechargez la page ou utilisez votre e-mail.')
}

// ---------- Inscription ----------

/**
 * `identite` : { civilite, nom, prenom, pseudo, telephone, type_profil, pro_siret, pro_raison_sociale, fournisseur }
 * type_profil « fournisseur » : `fournisseur` porte les informations de l'entreprise (demande « Devenir partenaire »)
 */
export async function inscription(email, motDePasse, identite = {}) {
  verifier()
  const pro = identite.type_profil === 'professionnel'
  const partenaire = identite.type_profil === 'fournisseur'
  const r = await api.post('/auth/inscription', {
    email, motDePasse, cguAcceptees: true,
    nomAffiche: identite.pseudo, civilite: identite.civilite, prenom: identite.prenom, nom: identite.nom,
    telephone: identite.telephone || undefined, typeProfil: identite.type_profil || 'particulier',
    ...(pro ? { siret: identite.pro_siret, raisonSociale: identite.pro_raison_sociale } : {}),
    ...(partenaire ? { fournisseur: identite.fournisseur } : {})
  })
  return { user: null, confirmationRequise: true, emailEnvoye: r.emailEnvoye }
}

/** Code à 6 chiffres reçu par e-mail : l'adresse est vérifiée, la session s'ouvre */
export async function verifierCode(email, code) {
  verifier()
  ouvrirSession(await api.post('/auth/verifier-email', { email, code }))
  prevenir()
  return courant
}

export async function renvoyerConfirmation(email) {
  verifier()
  await api.post('/auth/renvoyer-code', { email })
}

// ---------- Déconnexion ----------

export async function deconnexion() {
  oublierJeton()
  courant = null
  prevenir()
}
/** Ferme la session de cet appareil seulement (inactivité) */
export const deconnexionAppareil = deconnexion

/** Ferme la session sur tous les appareils du compte, celui-ci compris */
export async function deconnexionPartout() {
  verifier()
  try { await api.post('/auth/deconnexion-partout') } finally { await deconnexion() }
}

// ---------- Mot de passe ----------

/** Envoie un code de réinitialisation (même réponse que l'adresse ait un compte ou non) */
export async function envoyerCodeMotDePasse(email) {
  verifier()
  await api.post('/auth/mot-de-passe-oublie', { email })
}
// ancien nom (lien par e-mail) : c'est désormais un code
export const envoyerLienMotDePasse = envoyerCodeMotDePasse

/** Code reçu + nouveau mot de passe : la session s'ouvre (les autres appareils sont déconnectés) */
export async function reinitialiserMotDePasse(email, code, nouveauMotDePasse) {
  verifier()
  ouvrirSession(await api.post('/auth/reinitialiser-mot-de-passe', { email, code, nouveauMotDePasse }))
  prevenir()
  return courant
}

/** Compte connecté : nouveau mot de passe (l'actuel est demandé s'il en a un) */
export async function changerMotDePasse(nouveauMotDePasse, motDePasseActuel) {
  verifier()
  ouvrirSession(await api.post('/auth/changer-mot-de-passe', { nouveauMotDePasse, motDePasseActuel }))
  prevenir()
  return courant
}
export const definirMotDePasse = (motDePasse) => changerMotDePasse(motDePasse)

// ---------- Profil ----------

/**
 * Pseudo et téléphone ; mot de passe (l'actuel est demandé) ; e-mail : un code part vers la NOUVELLE adresse,
 * l'adresse ne change qu'avec ce code (confirmerNouvelEmail). Renvoie le compte à jour.
 */
export async function mettreAJourProfil({ pseudo, telephone, email, ancienMotDePasse, motDePasse } = {}) {
  verifier()
  if (motDePasse) {
    if (!ancienMotDePasse) throw new Error('Vous devez renseigner votre ancien mot de passe.')
    await changerMotDePasse(motDePasse, ancienMotDePasse)
  }
  if (pseudo !== undefined || telephone !== undefined) {
    courant = versCompte(await api.patch('/auth/profil', {
      ...(pseudo !== undefined ? { nomAffiche: pseudo || null } : {}),
      ...(telephone !== undefined ? { telephone: telephone || null } : {})
    }))
  }
  const nouvel = email?.trim().toLowerCase()
  if (nouvel && nouvel !== courant?.email) {
    await api.post('/auth/changer-email', { email: nouvel })
    courant = { ...courant, emailEnAttente: nouvel }
  }
  prevenir()
  return courant
}

/** Code reçu sur la nouvelle adresse : elle devient l'adresse du compte */
export async function confirmerNouvelEmail(code) {
  verifier()
  courant = versCompte(await api.post('/auth/confirmer-email', { code }))
  prevenir()
  return courant
}

/**
 * Suppression de son propre compte (RG08). Client : le crédit fidélité doit être utilisé.
 * Fournisseur : `verification` = { motDePasse, confirmation: « Je supprime mon compte <nom> » }.
 */
export async function supprimerCompte(verification = {}) {
  verifier()
  const r = await api.delete('/auth/compte', verification)
  await deconnexion()
  return r
}

/** Demande de compte professionnel : l'entreprise est vérifiée par BTM */
export async function demanderVerificationPro(raisonSociale, siret) {
  verifier()
  courant = versCompte(await api.post('/auth/pro', { raisonSociale, siret }))
  prevenir()
}

export async function passerParticulier() {
  verifier()
  courant = versCompte(await api.delete('/auth/pro'))
  prevenir()
}

/** La suspension arrive maintenant avec l'erreur de connexion (err.details) */
export async function lireSuspension() { return null }

export { ErreurApi }

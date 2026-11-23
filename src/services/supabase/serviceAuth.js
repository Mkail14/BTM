/** Authentification Supabase (email + mot de passe) */
import { supabase, supabaseConfigure, SITE_PUBLIC } from './client.js'
import { controlerEmailReel, MESSAGE_EMAIL_JETABLE } from '../validation.js'

// Le déclencheur `trg_refuser_email_jetable` (migration 0019) fait échouer l'écriture dans auth.users :
// Supabase ne renvoie alors qu'un « Database error … » générique
const erreurAuth = (error) => (/database error (saving|updating)/i.test(error?.message || '') ? new Error(MESSAGE_EMAIL_JETABLE) : error)

export async function connexion(email, motDePasse) {
  if (!supabaseConfigure) throw new Error('Backend Supabase non configuré')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: motDePasse })
  if (error) throw error
  return data.user
}

/**
 * Connexion ou création de compte avec Google ou Apple : le navigateur part chez le fournisseur, puis revient
 * sur `retour` (page du site) avec la session, lue automatiquement par le client Supabase.
 * Le fournisseur doit être activé dans Supabase (Authentication → Providers) et l'adresse du site autorisée
 * dans Authentication → URL Configuration (Redirect URLs).
 */
export async function connexionExterne(fournisseur, retour = '') {
  if (!supabaseConfigure) throw new Error('Backend Supabase non configuré')
  const redirectTo = window.location.origin + (retour.startsWith('/') ? retour : window.location.pathname)
  const { error } = await supabase.auth.signInWithOAuth({ provider: fournisseur, options: { redirectTo } })
  if (error) throw error
}

/** Jeton d'identité Google (bouton Google Identity Services) → session Supabase, sans quitter la page */
export async function connexionGoogleJeton(jeton, nonce) {
  if (!supabaseConfigure) throw new Error('Backend Supabase non configuré')
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: jeton, nonce })
  if (error) throw erreurAuth(error)
  return data.user
}

/**
 * `retour` : page où ramène le lien de confirmation (ex. « /resultats » pour retrouver le devis en cours).
 * Renvoie `{ user, confirmationRequise }` : sans session, Supabase attend que l'adresse soit confirmée par e-mail.
 */
export async function inscription(email, motDePasse, identite = {}, retour = '') {
  if (!supabaseConfigure) throw new Error('Backend Supabase non configuré')
  await controlerEmailReel(email)
  const emailRedirectTo = window.location.origin + (retour.startsWith('/') ? retour : '')
  const { data, error } = await supabase.auth.signUp({ email, password: motDePasse, options: { data: identite, emailRedirectTo } })
  if (error) throw erreurAuth(error)
  // adresse déjà inscrite : Supabase répond sans erreur (anti-énumération), mais sans aucune identité
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error('User already registered')
  return { user: data.user, confirmationRequise: !data.session }
}

/** Renvoie l'e-mail de confirmation d'inscription (même lien de retour que le premier envoi) */
export async function renvoyerConfirmation(email) {
  if (!supabaseConfigure) throw new Error('Backend Supabase non configuré')
  const { error } = await supabase.auth.resend({ type: 'signup', email })
  if (error) throw error
}

export async function deconnexion() {
  if (!supabaseConfigure) return
  await supabase.auth.signOut()
}
/** Ferme la session de cet appareil seulement (déconnexion après inactivité : les autres appareils restent connectés) */
export async function deconnexionAppareil() {
  if (!supabaseConfigure) return
  await supabase.auth.signOut({ scope: 'local' })
}
/** Ferme la session sur tous les appareils du compte (téléphone perdu, ordinateur prêté), celui-ci compris */
export async function deconnexionPartout() {
  if (!supabaseConfigure) return
  const { error } = await supabase.auth.signOut({ scope: 'global' })
  if (error) throw error
}

export async function mettreAJourProfil({ pseudo, telephone, email, ancienMotDePasse, motDePasse }) {
  if (!supabaseConfigure) throw new Error('Backend Supabase non configuré')
  if (motDePasse) {
    if (!ancienMotDePasse) throw new Error('Vous devez renseigner votre ancien mot de passe.')
    const utilisateur = await supabase.auth.getUser()
    const { error: verificationErreur } = await supabase.auth.signInWithPassword({
      email: utilisateur.data.user?.email,
      password: ancienMotDePasse
    })
    if (verificationErreur) throw new Error('Ancien mot de passe incorrect.')
  }
  if (email) {
    const { data: actuel } = await supabase.auth.getUser()
    if (email.trim().toLowerCase() !== actuel?.user?.email?.toLowerCase()) await controlerEmailReel(email)
  }
  const { data, error } = await supabase.auth.updateUser({
    email: email || undefined,
    password: motDePasse || undefined,
    data: { pseudo: pseudo || undefined, telephone: telephone || undefined }
  })
  if (error) throw erreurAuth(error)
  return data.user
}

/**
 * Connexion refusée pour bannissement : fin et motif de la suspension, rendus par la fonction SQL suspension_compte
 * (supabase/suspension_compte.sql) contre l'e-mail et le mot de passe du compte. null si la fonction n'est pas
 * installée ou ne répond pas : la page « Compte suspendu » s'affiche alors sans date ni motif.
 */
export async function lireSuspension(email, motDePasse) {
  if (!supabaseConfigure) return null
  try {
    const { data, error } = await supabase.rpc('suspension_compte', { p_email: email, p_mot_de_passe: motDePasse })
    const ligne = error ? null : data?.[0]
    return ligne ? { jusqua: ligne.jusqua || 'vie', motif: ligne.motif || null } : null
  } catch {
    return null
  }
}

// ---------- Mot de passe oublié : lien reçu par e-mail ----------------------------------
/**
 * Envoie l'e-mail « Reset Password » (gabarit emails/mot-de-passe-oublie.html) : il contient un lien vers
 * /nouveau-mot-de-passe du site public (même demandé depuis localhost : il s'ouvre souvent sur un téléphone),
 * qui ouvre la session du compte. Supabase répond pareil que l'adresse ait un compte ou non.
 */
export async function envoyerLienMotDePasse(email) {
  if (!supabaseConfigure) throw new Error('Backend Supabase non configuré')
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${SITE_PUBLIC}/nouveau-mot-de-passe` })
  if (error) throw error
}
/** Nouveau mot de passe du compte dont la session vient d'être ouverte par le lien de l'e-mail */
export async function definirMotDePasse(motDePasse) {
  if (!supabaseConfigure) throw new Error('Backend Supabase non configuré')
  const { error } = await supabase.auth.updateUser({ password: motDePasse })
  if (error) throw error
}

/** Fournisseur : { motDePasse, confirmation } vérifiés par la fonction (supabase/functions/supprimer-compte) */
export async function supprimerCompte(verification) {
  if (!supabaseConfigure) throw new Error('Backend Supabase non configuré')
  const { data, error } = await supabase.functions.invoke('supprimer-compte', verification ? { body: verification } : undefined)
  if (error) {
    let message = error.message
    try { message = (await error.context.json()).erreur || message } catch { /* corps non JSON */ }
    throw new Error(message)
  }
  return data
}

export async function utilisateurCourant() {
  if (!supabaseConfigure) return null
  const { data } = await supabase.auth.getUser()
  return data?.user || null
}

export function surChangementAuth(callback) {
  if (!supabaseConfigure) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_evt, session) => callback(session?.user || null))
  return () => data.subscription.unsubscribe()
}

// ---------- Compte professionnel (migration 0011) ------------------------------------
/** Demande (ou redemande après un refus) la vérification professionnelle du compte connecté */
export async function demanderVerificationPro(raisonSociale, siret) {
  if (!supabaseConfigure) throw new Error('Backend Supabase non configuré')
  const { error } = await supabase.rpc('demander_verification_pro', { p_raison_sociale: raisonSociale, p_siret: siret })
  if (error) throw new Error(error.message)
}
/** Abandonne la demande : le compte redevient particulier */
export async function passerParticulier() {
  if (!supabaseConfigure) throw new Error('Backend Supabase non configuré')
  const { error } = await supabase.rpc('passer_particulier')
  if (error) throw new Error(error.message)
  // le choix « professionnel » fait à l'inscription ne doit plus redéposer la demande à la prochaine connexion (useAuth)
  await supabase.auth.updateUser({ data: { type_profil: 'particulier' } }).catch(() => {})
}

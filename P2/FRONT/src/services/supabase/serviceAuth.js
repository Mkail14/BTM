/** Authentification Supabase (email + mot de passe) */
import { supabase, supabaseConfigure } from './client.js'
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

/** `retour` : page où ramène le lien de confirmation (ex. « /resultats » pour retrouver le devis en cours) */
export async function inscription(email, motDePasse, identite = {}, retour = '') {
  if (!supabaseConfigure) throw new Error('Backend Supabase non configuré')
  await controlerEmailReel(email)
  const emailRedirectTo = window.location.origin + (retour.startsWith('/') ? retour : '')
  const { data, error } = await supabase.auth.signUp({ email, password: motDePasse, options: { data: identite, emailRedirectTo } })
  if (error) throw erreurAuth(error)
  return data.user
}

export async function deconnexion() {
  if (!supabaseConfigure) return
  await supabase.auth.signOut()
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

// ---------- Mot de passe oublié : code reçu par e-mail ----------------------------------
/**
 * Envoie l'e-mail « Reset Password » (gabarit emails/mot-de-passe-oublie.html, à coller dans Supabase) : il contient
 * le code, et un lien de secours vers /nouveau-mot-de-passe. Supabase répond pareil que l'adresse ait un compte ou non.
 */
export async function demanderCodeMotDePasse(email) {
  if (!supabaseConfigure) throw new Error('Backend Supabase non configuré')
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/nouveau-mot-de-passe` })
  if (error) throw error
}
/** Vérifie le code : ouvre la session du compte, sans laquelle le mot de passe ne peut pas être changé */
export async function verifierCodeMotDePasse(email, code) {
  if (!supabaseConfigure) throw new Error('Backend Supabase non configuré')
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' })
  if (error) throw error
}
/** Nouveau mot de passe du compte dont la session vient d'être ouverte par le code */
export async function definirMotDePasse(motDePasse) {
  if (!supabaseConfigure) throw new Error('Backend Supabase non configuré')
  const { error } = await supabase.auth.updateUser({ password: motDePasse })
  if (error) throw error
}

export async function supprimerCompte() {
  if (!supabaseConfigure) throw new Error('Backend Supabase non configuré')
  const { data, error } = await supabase.functions.invoke('supprimer-compte')
  if (error) throw error
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

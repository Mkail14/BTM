/** Authentification Supabase (email + mot de passe) */
import { supabase, supabaseConfigure } from './client.js'

export async function connexion(email, motDePasse) {
  if (!supabaseConfigure) throw new Error('Backend Supabase non configuré')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: motDePasse })
  if (error) throw error
  return data.user
}

export async function inscription(email, motDePasse, identite = {}) {
  if (!supabaseConfigure) throw new Error('Backend Supabase non configuré')
  const { data, error } = await supabase.auth.signUp({ email, password: motDePasse, options: { data: identite, emailRedirectTo: window.location.origin } })
  if (error) throw error
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
  const { data, error } = await supabase.auth.updateUser({
    email: email || undefined,
    password: motDePasse || undefined,
    data: { pseudo: pseudo || undefined, telephone: telephone || undefined }
  })
  if (error) throw error
  return data.user
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
}

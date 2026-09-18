/** Authentification Supabase (email + mot de passe) */
import { supabase, supabaseConfigure } from './client.js'

export async function connexion(email, motDePasse) {
  if (!supabaseConfigure) throw new Error('Backend Supabase non configuré')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: motDePasse })
  if (error) throw error
  return data.user
}

export async function inscription(email, motDePasse) {
  if (!supabaseConfigure) throw new Error('Backend Supabase non configuré')
  const { data, error } = await supabase.auth.signUp({ email, password: motDePasse })
  if (error) throw error
  return data.user
}

export async function deconnexion() {
  if (!supabaseConfigure) return
  await supabase.auth.signOut()
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

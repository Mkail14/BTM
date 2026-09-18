/**
 * Client Supabase (backend BTM).
 * Si les variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY sont absentes,
 * l'application fonctionne en mode « hors-ligne » avec les données locales.
 */
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const cle = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigure = Boolean(url && cle && !url.includes('xxxxxxxx'))

export const supabase = supabaseConfigure
  ? createClient(url, cle, { auth: { persistSession: true, autoRefreshToken: true } })
  : null

/**
 * Client Supabase (backend BTM).
 * Si les variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY sont absentes,
 * l'application fonctionne en mode « hors-ligne » avec les données locales.
 */
import { createClient } from '@supabase/supabase-js'
import { oublierSessionSiSiteFerme, suivreOnglet } from '@/services/session.js'

const url = import.meta.env.VITE_SUPABASE_URL
const cle = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigure = Boolean(url && cle && !url.includes('xxxxxxxx'))

/**
 * Les liens envoyés par e-mail (mot de passe oublié, invitation) s'ouvrent souvent ailleurs (téléphone, autre personne) :
 * ils pointent toujours vers le site public, jamais vers localhost ou une prévisualisation Vercel protégée.
 */
export const SITE_PUBLIC = 'https://www.btm.yt'

// Site fermé depuis la visite précédente : la session restée sur l'appareil est oubliée avant que le client la lise
oublierSessionSiSiteFerme()
suivreOnglet()

export const supabase = supabaseConfigure
  ? createClient(url, cle, { auth: { persistSession: true, autoRefreshToken: true } })
  : null

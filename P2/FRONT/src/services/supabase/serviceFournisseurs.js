/** Accès aux fournisseurs : Supabase si configuré, sinon données locales */
import { supabase, supabaseConfigure } from './client.js'
import { fournisseurs as locaux, normaliserFournisseur } from '@/donnees/fournisseurs.js'

export async function chargerFournisseurs() {
  if (!supabaseConfigure) return { donnees: locaux, source: 'local' }
  try {
    const { data, error } = await supabase.from('fournisseurs').select('*').eq('actif', true).order('nom')
    if (error) throw error
    if (!data?.length) return { donnees: locaux, source: 'local' }
    return { donnees: data.map(normaliserFournisseur), source: 'supabase' }
  } catch (e) {
    console.warn('Supabase indisponible, repli local', e)
    return { donnees: locaux, source: 'local' }
  }
}

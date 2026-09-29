/** Catalogue de prix : Supabase (table materiaux) avec repli local */
import { supabase, supabaseConfigure } from './client.js'
import { materiaux as locaux, indexerMateriaux } from '@/donnees/materiaux.js'

export async function chargerCatalogue() {
  if (!supabaseConfigure) return { catalogue: locaux, source: 'local' }
  try {
    const { data, error } = await supabase.from('materiaux').select('*')
    if (error) throw error
    if (!data?.length) return { catalogue: locaux, source: 'local' }
    return { catalogue: { ...locaux, ...indexerMateriaux(data) }, source: 'supabase' }
  } catch (e) {
    console.warn('Supabase indisponible, prix locaux', e)
    return { catalogue: locaux, source: 'local' }
  }
}

/** Catalogue de prix : API BTM (BACK, /api/materiaux) quand VITE_API_URL est réglé, sinon Supabase directement */
import { apiConfiguree } from './client.js'
import * as rest from './rest/serviceMateriaux.js'
import * as supa from '@/services/supabase/serviceMateriaux.js'

export * from '@/services/supabase/serviceMateriaux.js'

export async function chargerCatalogue(...a) {
  if (!apiConfiguree) return supa.chargerCatalogue(...a)
  const r = await rest.chargerCatalogue(...a)
  return r.source === 'api' ? r : supa.chargerCatalogue(...a)
}

/** Fournisseurs : API BTM (BACK, /api/fournisseurs) quand VITE_API_URL est réglé, sinon Supabase directement */
import { apiConfiguree } from './client.js'
import * as rest from './rest/serviceFournisseurs.js'
import * as supa from '@/services/supabase/serviceFournisseurs.js'
import { avisParFournisseur } from '@/services/supabase/serviceAvisFournisseurs.js'

export async function chargerFournisseurs() {
  if (!apiConfiguree) return supa.chargerFournisseurs()
  const r = await rest.chargerFournisseurs()
  if (r.source !== 'api') return supa.chargerFournisseurs() // API injoignable : Supabase avant les données locales
  // avis des clients sur chaque fournisseur (Supabase, vides si la migration n'est pas appliquée)
  const avis = await avisParFournisseur().catch(() => ({}))
  return { ...r, donnees: r.donnees.map((f) => ({ ...f, avis: avis[f.id] || null })) }
}
export const chargerCategories = () => (apiConfiguree ? rest.chargerCategories() : supa.chargerCategories())

/** Types de projets : API BTM (BACK, /api/types-projets) quand VITE_API_URL est réglé, sinon Supabase directement */
import { apiConfiguree } from './client.js'
import * as rest from './rest/serviceTypesProjets.js'
import * as supa from '@/services/supabase/serviceTypesProjets.js'

export * from '@/services/supabase/serviceTypesProjets.js'

export const chargerTypesProjets = (...a) => (apiConfiguree ? rest : supa).chargerTypesProjets(...a)

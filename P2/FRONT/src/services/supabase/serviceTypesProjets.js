/** Types de projets : textes et constantes de calcul modifiés dans l'admin (table types_projets) */
import { supabase, supabaseConfigure } from './client.js'
import { appliquerTypesDistants } from '@/donnees/typesProjets.js'

let chargement = null

export function chargerTypesProjets() {
  if (chargement) return chargement
  chargement = (async () => {
    if (!supabaseConfigure) return
    try {
      const { data, error } = await supabase.from('types_projets').select('*')
      if (error) throw error
      appliquerTypesDistants(data || [])
    } catch (e) {
      console.warn('Types de projets distants indisponibles, constantes locales', e)
    }
  })()
  return chargement
}

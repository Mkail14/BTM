/** Types de projets : textes et constantes de calcul modifiés dans l'admin (/api/types-projets) */
import { api, apiConfiguree } from '../client.js'
import { appliquerTypesDistants } from '@/donnees/typesProjets.js'

let chargement = null

export function chargerTypesProjets() {
  if (chargement) return chargement
  chargement = (async () => {
    if (!apiConfiguree) return
    try {
      appliquerTypesDistants((await api.get('/types-projets')) || [])
    } catch (e) {
      console.warn('Types de projets distants indisponibles, constantes locales', e)
    }
  })()
  return chargement
}

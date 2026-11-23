/** Catalogue de prix : API BTM (/api/materiaux) avec repli local */
import { api, apiConfiguree } from '../client.js'
import { materiaux as locaux, indexerMateriaux } from '@/donnees/materiaux.js'

export async function chargerCatalogue() {
  if (!apiConfiguree) return { catalogue: locaux, source: 'local' }
  try {
    const data = await api.get('/materiaux')
    if (!data?.length) return { catalogue: locaux, source: 'local' }
    return { catalogue: { ...locaux, ...indexerMateriaux(data) }, source: 'api' }
  } catch (e) {
    console.warn('API indisponible, prix locaux', e)
    return { catalogue: locaux, source: 'local' }
  }
}

/** Crédit fidélité du compte connecté (RG35) : solde et mouvements récents */
import { api, apiConfiguree } from './client.js'

export async function lireCreditFidelite() {
  if (!apiConfiguree) return { solde: 0, mouvements: [] }
  try {
    return await api.get('/credit-fidelite')
  } catch {
    return { solde: 0, mouvements: [] }
  }
}

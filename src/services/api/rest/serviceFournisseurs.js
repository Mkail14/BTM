/** Accès aux fournisseurs : API BTM si configurée, sinon données locales */
import { api, apiConfiguree } from '../client.js'
import { fournisseurs as locaux, categories as categoriesLocales, normaliserFournisseur } from '@/donnees/fournisseurs.js'

// l'annuaire change rarement : gardé une minute en mémoire (retour sur la page sans nouvel appel ni attente)
const DUREE_CACHE = 60_000
let cacheFournisseurs = null

export function chargerFournisseurs() {
  if (cacheFournisseurs && Date.now() - cacheFournisseurs.le < DUREE_CACHE) return cacheFournisseurs.promesse
  const promesse = lireFournisseurs()
  cacheFournisseurs = { le: Date.now(), promesse }
  // repli local (réseau en panne) : pas gardé, retenté à la prochaine visite
  promesse.then((r) => { if (r.source !== 'api' && cacheFournisseurs?.promesse === promesse) cacheFournisseurs = null })
  return promesse
}

async function lireFournisseurs() {
  if (!apiConfiguree) return { donnees: locaux, source: 'local' }
  try {
    const data = await api.get('/fournisseurs') // actifs uniquement, triés par nom
    if (!data?.length) return { donnees: locaux, source: 'local' }
    return { donnees: data.map(normaliserFournisseur), source: 'api' }
  } catch (e) {
    console.warn('API indisponible, repli local', e)
    return { donnees: locaux, source: 'local' }
  }
}

/** Catégories de l'annuaire, gérées par l'admin (sans l'entrée « toutes ») ; repli sur la liste locale */
export async function chargerCategories() {
  const locales = categoriesLocales.filter((c) => c.id)
  if (!apiConfiguree) return locales
  try {
    const data = await api.get('/categories')
    return data?.length ? data : locales
  } catch {
    return locales
  }
}

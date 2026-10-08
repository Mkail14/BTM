/** Accès aux fournisseurs : Supabase si configuré, sinon données locales */
import { supabase, supabaseConfigure } from './client.js'
import { fournisseurs as locaux, categories as categoriesLocales, normaliserFournisseur } from '@/donnees/fournisseurs.js'

// colonnes lues par normaliserFournisseur : inutile de rapatrier le reste de la table
const COLONNES = 'id, slug, nom, categorie_id, commune, adresse, telephone, email, site_web, description, livraison, horaires, logo_url, latitude, longitude'
// l'annuaire change rarement : gardé une minute en mémoire (retour sur la page sans nouvel appel ni attente)
const DUREE_CACHE = 60_000
let cacheFournisseurs = null

export function chargerFournisseurs() {
  if (cacheFournisseurs && Date.now() - cacheFournisseurs.le < DUREE_CACHE) return cacheFournisseurs.promesse
  const promesse = lireFournisseurs()
  cacheFournisseurs = { le: Date.now(), promesse }
  // repli local (réseau en panne) : pas gardé, retenté à la prochaine visite
  promesse.then((r) => { if (r.source !== 'supabase' && cacheFournisseurs?.promesse === promesse) cacheFournisseurs = null })
  return promesse
}

async function lireFournisseurs() {
  if (!supabaseConfigure) return { donnees: locaux, source: 'local' }
  try {
    const { data, error } = await supabase.from('fournisseurs').select(COLONNES).eq('actif', true).order('nom')
    if (error) throw error
    if (!data?.length) return { donnees: locaux, source: 'local' }
    return { donnees: data.map(normaliserFournisseur), source: 'supabase' }
  } catch (e) {
    console.warn('Supabase indisponible, repli local', e)
    return { donnees: locaux, source: 'local' }
  }
}

/** Catégories de l'annuaire, gérées par l'admin (sans l'entrée « toutes ») ; repli sur la liste locale */
export async function chargerCategories() {
  const locales = categoriesLocales.filter((c) => c.id)
  if (!supabaseConfigure) return locales
  try {
    const { data, error } = await supabase.from('categories_fournisseurs').select('id, libelle, icone, ordre').order('ordre')
    if (error) throw error
    return data?.length ? data : locales
  } catch {
    return locales
  }
}

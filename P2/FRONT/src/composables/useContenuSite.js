/**
 * useContenuSite — textes éditables du site (table `contenus_site`).
 * État partagé : chargé une seule fois, puis mis à jour en direct par l'admin.
 * Chaque section fusionne la base sur les valeurs par défaut : un champ vide en base
 * ne casse jamais l'affichage.
 */
import { reactive } from 'vue'
import { supabase, supabaseConfigure } from '@/services/supabase/client.js'
import { contenusParDefaut } from '@/donnees/contenusSite.js'

const copie = (o) => JSON.parse(JSON.stringify(o))
const contenu = reactive(copie(contenusParDefaut))
let chargement = null

/** Remplace une section par « défauts + valeurs fournies » */
export function appliquerSection(cle, valeur = {}) {
  if (!contenusParDefaut[cle]) return
  const fusion = { ...contenusParDefaut[cle] }
  for (const [k, v] of Object.entries(valeur || {})) {
    if (!(k in fusion) || v === null || v === undefined) continue
    if (typeof v === 'string' && !v.trim() && fusion[k]) continue // texte effacé : on garde le défaut
    fusion[k] = v
  }
  contenu[cle] = fusion
}

export function chargerContenus() {
  if (chargement) return chargement
  chargement = (async () => {
    if (!supabaseConfigure) return
    try {
      const { data, error } = await supabase.from('contenus_site').select('cle, valeur')
      if (error) throw error
      for (const ligne of data || []) appliquerSection(ligne.cle, ligne.valeur)
    } catch (e) {
      console.warn('Contenus du site indisponibles, textes par défaut', e)
    }
  })()
  return chargement
}

export function useContenuSite() {
  chargerContenus()
  return contenu
}

/**
 * useOuverture — trois versions du même site :
 *  - en ligne (btm.yt, production Vercel) : la page « Bientôt en ligne » remplace le site public tant que
 *    moins de SEUIL_FOURNISSEURS fournisseurs partenaires sont prêts (visibles et hors démonstration).
 *    Les espaces admin et fournisseur, et les pages légales, restent accessibles ;
 *  - develop (prévisualisation Vercel) et local (ordinateur) : le site complet, avec un repère discret
 *    indiquant la version. « ?bientot » y affiche la page d'attente pour la vérifier.
 * L'ouverture est automatique : dès le 3e partenaire réel, btm.yt affiche le site sans redéploiement.
 * L'admin peut forcer l'état (Compte BTM → Mise en ligne) : ligne « ouverture » de contenus_site,
 * { mode: 'auto' | 'en-ligne' | 'maintenance' }. « maintenance » ferme le site même avec assez de partenaires.
 */
import { computed, ref } from 'vue'
import { supabase, supabaseConfigure } from '@/services/supabase/client.js'

export const SEUIL_FOURNISSEURS = 3
export const MODES_OUVERTURE = ['auto', 'en-ligne', 'maintenance']
export const CLE_OUVERTURE = 'ouverture'

/* global __ENVIRONNEMENT__ */
const construit = typeof __ENVIRONNEMENT__ === 'string' ? __ENVIRONNEMENT__ : 'local'
// le domaine fait foi : un build local servi sur btm.yt reste « en ligne »
const domaineEnLigne = typeof window !== 'undefined' && /(^|\.)btm\.yt$/i.test(window.location.hostname)
export const environnement = domaineEnLigne ? 'en-ligne' : construit
export const LIBELLES_ENVIRONNEMENT = { 'en-ligne': 'En ligne', develop: 'Develop', local: 'Locale' }

/** Pages toujours accessibles, même avant l'ouverture */
export const PAGES_LIBRES = ['admin', 'espace-fournisseur', 'nouveau-mot-de-passe', 'compte-suspendu', 'conditions', 'confidentialite']

const partenaires = ref(null) // null = en cours de vérification
const mode = ref('auto')
const apercuDemande = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('bientot')

/** Nombre de fournisseurs partenaires réels : visibles dans l'annuaire et hors démonstration (prix réels) */
export async function compterPartenaires() {
  if (!supabaseConfigure) return 0
  const { count, error } = await supabase.from('fournisseurs').select('id', { count: 'exact', head: true }).eq('actif', true).eq('demonstration', false)
  if (error) throw error
  return count || 0
}

/** Mode choisi par l'admin ; illisible ou absent : automatique */
export async function lireModeOuverture() {
  if (!supabaseConfigure) return 'auto'
  const { data, error } = await supabase.from('contenus_site').select('valeur').eq('cle', CLE_OUVERTURE).maybeSingle()
  if (error) throw error
  return MODES_OUVERTURE.includes(data?.valeur?.mode) ? data.valeur.mode : 'auto'
}

let verification = null
export function verifierOuverture() {
  verification ||= Promise.all([
    lireModeOuverture().catch(() => 'auto').then((m) => { mode.value = m }),
    compterPartenaires().then((n) => { partenaires.value = n })
  ]).catch((e) => { console.warn('Ouverture du site : vérification impossible', e); partenaires.value = 0 })
  return verification
}

/** Après un changement dans l'admin : l'onglet en cours suit sans recharger */
export function appliquerModeOuverture(m, n = partenaires.value) {
  mode.value = m
  partenaires.value = n
}

/** Le site public est-il ouvert pour ce mode et ce nombre de partenaires ? */
export const siteOuvert = (m, n) => m === 'en-ligne' || (m !== 'maintenance' && n >= SEUIL_FOURNISSEURS)

export function useOuverture() {
  if (environnement === 'en-ligne' || apercuDemande) verifierOuverture()
  return {
    environnement,
    partenaires,
    mode,
    /** la page d'attente doit-elle remplacer le site public ? (null : on ne sait pas encore) */
    enAttente: computed(() => {
      if (apercuDemande) return partenaires.value === null ? null : true
      if (environnement !== 'en-ligne') return false
      return partenaires.value === null ? null : !siteOuvert(mode.value, partenaires.value)
    })
  }
}

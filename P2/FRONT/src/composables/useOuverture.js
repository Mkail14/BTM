/**
 * useOuverture — trois versions du même site :
 *  - en ligne (btm.yt, production Vercel) : la page « Bientôt en ligne » remplace le site public tant que
 *    moins de SEUIL_FOURNISSEURS fournisseurs partenaires sont prêts (visibles et hors démonstration).
 *    Les espaces admin et fournisseur, et les pages légales, restent accessibles ;
 *  - develop (prévisualisation Vercel) et local (ordinateur) : le site complet, avec un repère discret
 *    indiquant la version. « ?bientot » y affiche la page d'attente pour la vérifier.
 * L'ouverture est automatique : dès le 2e partenaire réel, btm.yt affiche le site sans redéploiement.
 */
import { computed, ref } from 'vue'
import { supabase, supabaseConfigure } from '@/services/supabase/client.js'

export const SEUIL_FOURNISSEURS = 2

/* global __ENVIRONNEMENT__ */
const construit = typeof __ENVIRONNEMENT__ === 'string' ? __ENVIRONNEMENT__ : 'local'
// le domaine fait foi : un build local servi sur btm.yt reste « en ligne »
const domaineEnLigne = typeof window !== 'undefined' && /(^|\.)btm\.yt$/i.test(window.location.hostname)
export const environnement = domaineEnLigne ? 'en-ligne' : construit
export const LIBELLES_ENVIRONNEMENT = { 'en-ligne': 'En ligne', develop: 'Develop', local: 'Locale' }

/** Pages toujours accessibles, même avant l'ouverture */
export const PAGES_LIBRES = ['admin', 'espace-fournisseur', 'nouveau-mot-de-passe', 'compte-suspendu', 'conditions', 'confidentialite']

const partenaires = ref(null) // null = en cours de vérification
const apercuDemande = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('bientot')

/** Nombre de fournisseurs partenaires réels : visibles dans l'annuaire et hors démonstration (prix réels) */
async function compterPartenaires() {
  if (!supabaseConfigure) return 0
  const { count, error } = await supabase.from('fournisseurs').select('id', { count: 'exact', head: true }).eq('actif', true).eq('demonstration', false)
  if (error) throw error
  return count || 0
}

let verification = null
export function verifierOuverture() {
  verification ||= compterPartenaires()
    .then((n) => { partenaires.value = n })
    .catch((e) => { console.warn('Ouverture du site : vérification impossible', e); partenaires.value = 0 })
  return verification
}

export function useOuverture() {
  if (environnement === 'en-ligne' || apercuDemande) verifierOuverture()
  const ouvert = computed(() => partenaires.value !== null && partenaires.value >= SEUIL_FOURNISSEURS)
  return {
    environnement,
    partenaires,
    /** la page d'attente doit-elle remplacer le site public ? (null : on ne sait pas encore) */
    enAttente: computed(() => {
      if (apercuDemande) return partenaires.value === null ? null : true
      if (environnement !== 'en-ligne') return false
      return partenaires.value === null ? null : !ouvert.value
    })
  }
}

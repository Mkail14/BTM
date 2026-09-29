import { createRouter, createWebHistory } from 'vue-router'
import { lireRoleCompte } from '@/services/supabase/serviceAdmin.js'
import { supabase, supabaseConfigure } from '@/services/supabase/client.js'
import { modeSite } from '@/composables/useModeSite.js'

const routes = [
  { path: '/', name: 'accueil', component: () => import('@/vues/AccueilVue.vue'), meta: { titre: 'Accueil' } },
  { path: '/calculateur', name: 'calculateur', component: () => import('@/vues/CalculateurVue.vue'), meta: { titre: 'Calculateur' } },
  { path: '/resultats', name: 'resultats', component: () => import('@/vues/ResultatsVue.vue'), meta: { titre: 'Résultats' } },
  { path: '/fournisseurs', name: 'fournisseurs', component: () => import('@/vues/FournisseursVue.vue'), meta: { titre: 'Fournisseurs' } },
  { path: '/dashboard', name: 'dashboard', component: () => import('@/vues/TableauDeBordVue.vue'), meta: { titre: 'Mes projets', necessiteConnexion: true } },
  { path: '/connexion', name: 'connexion', component: () => import('@/vues/AuthentificationVue.vue'), props: { mode: 'connexion' }, meta: { titre: 'Connexion' } },
  { path: '/inscription', name: 'inscription', component: () => import('@/vues/AuthentificationVue.vue'), props: { mode: 'inscription' }, meta: { titre: 'Inscription' } },
  { path: '/admin/:section?', name: 'admin', component: () => import('@/vues/AdminVue.vue'), meta: { titre: 'Administration', necessiteConnexion: true, necessiteAdmin: true, pleinEcran: true } },
  { path: '/espace-fournisseur/:section?', name: 'espace-fournisseur', component: () => import('@/vues/EspaceFournisseurVue.vue'), meta: { titre: 'Espace fournisseur', necessiteConnexion: true, necessiteFournisseur: true, pleinEcran: true } },
  { path: '/nouveau-mot-de-passe', name: 'nouveau-mot-de-passe', component: () => import('@/vues/NouveauMotDePasseVue.vue'), meta: { titre: 'Nouveau mot de passe' } },
  { path: '/conditions', name: 'conditions', component: () => import('@/vues/ConditionsVue.vue'), meta: { titre: 'Conditions générales d’utilisation' } },
  { path: '/:pathMatch(.*)*', name: 'introuvable', component: () => import('@/vues/IntrouvableVue.vue'), meta: { titre: 'Page introuvable' } }
]

const routeur = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, position) {
    if (position) return position
    if (to.hash) return { el: to.hash, behavior: 'smooth', top: 80 }
    return { top: 0, behavior: 'smooth' }
  }
})

/**
 * Rôle du compte de la session en cours, mis en cache par compte (évite une requête à chaque page).
 * getSession() lit la session locale : pas d'appel réseau pour un visiteur non connecté.
 */
let cacheRole = { id: null, role: null, fournisseur_id: null }
async function roleSession() {
  if (!supabaseConfigure) return null
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user?.id
  if (!id) return null
  if (cacheRole.id === id) return cacheRole
  const lu = { id, ...(await lireRoleCompte(id)) }
  if (lu.role) cacheRole = lu // lecture ratée (réseau) : pas mise en cache, retentée à la page suivante
  return lu
}

// Pages qu'un compte admin ou fournisseur peut ouvrir : son espace, le choix d'un nouveau mot de passe, et la connexion
// (si la session locale est périmée, son espace renvoie vers la connexion : sans elle, les deux se renverraient sans fin)
export const PAGES_ESPACE = { admin: ['admin', 'nouveau-mot-de-passe', 'connexion'], fournisseur: ['espace-fournisseur', 'nouveau-mot-de-passe', 'connexion'] }

routeur.beforeEach(async (to, from) => {
  // Session locale + rôle en cache : aucun appel réseau à la navigation (la base revérifie tout par la RLS)
  const compte = await roleSession()
  // Les comptes admin et fournisseur n'utilisent pas le site public (ni accueil, ni devis, ni projets) :
  // toujours ramenés à leur espace.
  if (compte?.role === 'admin' && !PAGES_ESPACE.admin.includes(to.name)) return { name: 'admin' }
  // … sauf un fournisseur en mode « Voir le site » (il navigue comme un professionnel ; pas d'admin, ni de page d'un autre rôle)
  if (compte?.role === 'fournisseur' && compte.fournisseur_id && !PAGES_ESPACE.fournisseur.includes(to.name) && !(modeSite.value && !to.meta.necessiteAdmin)) return { name: 'espace-fournisseur' }

  if (!to.meta.necessiteConnexion) return true
  if (!compte) return { name: 'connexion', query: { redirect: to.fullPath } }
  if (from.name === to.name) return true // autre section du même espace : déjà vérifié
  // on évite seulement d'afficher une page vide à un compte qui n'a pas le rôle
  if (to.meta.necessiteAdmin && compte.role !== 'admin') return { name: 'accueil' }
  if (to.meta.necessiteFournisseur && (compte.role !== 'fournisseur' || !compte.fournisseur_id)) return { name: 'accueil' }
  return true
})

routeur.afterEach((to) => {
  document.title = to.meta.titre ? `${to.meta.titre} — BTM Mayotte` : 'BTM — Bâtiment & Travaux Mayotte'
})

export default routeur

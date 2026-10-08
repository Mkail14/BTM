import { createRouter, createWebHistory } from 'vue-router'
import { lireRoleCompte } from '@/services/supabase/serviceAdmin.js'
import { supabase, supabaseConfigure } from '@/services/supabase/client.js'
import { modeSite } from '@/composables/useModeSite.js'
import { ouvrirAuth } from '@/composables/useFenetreAuth.js'

const routes = [
  { path: '/', name: 'accueil', component: () => import('@/vues/AccueilVue.vue'), meta: { titre: 'Accueil' } },
  { path: '/calculateur', name: 'calculateur', component: () => import('@/vues/CalculateurVue.vue'), meta: { titre: 'Calculateur' } },
  { path: '/resultats', name: 'resultats', component: () => import('@/vues/ResultatsVue.vue'), meta: { titre: 'Résultats' } },
  { path: '/fournisseurs', name: 'fournisseurs', component: () => import('@/vues/FournisseursVue.vue'), meta: { titre: 'Fournisseurs' } },
  { path: '/projet-pro', name: 'projet-pro', component: () => import('@/vues/ProjetProVue.vue'), meta: { titre: 'Projet pro' } },
  { path: '/dashboard', name: 'dashboard', component: () => import('@/vues/TableauDeBordVue.vue'), meta: { titre: 'Mes projets', necessiteConnexion: true } },
  { path: '/admin/:section?', name: 'admin', component: () => import('@/vues/AdminVue.vue'), meta: { titre: 'Administration', necessiteConnexion: true, necessiteAdmin: true, pleinEcran: true } },
  { path: '/espace-fournisseur/:section?', name: 'espace-fournisseur', component: () => import('@/vues/EspaceFournisseurVue.vue'), meta: { titre: 'Espace fournisseur', necessiteConnexion: true, necessiteFournisseur: true, pleinEcran: true } },
  { path: '/nouveau-mot-de-passe', name: 'nouveau-mot-de-passe', component: () => import('@/vues/NouveauMotDePasseVue.vue'), meta: { titre: 'Nouveau mot de passe' } },
  { path: '/compte-suspendu', name: 'compte-suspendu', component: () => import('@/vues/CompteSuspenduVue.vue'), meta: { titre: 'Compte suspendu' } },
  { path: '/conditions', name: 'conditions', component: () => import('@/vues/ConditionsVue.vue'), meta: { titre: 'Conditions générales d’utilisation' } },
  { path: '/confidentialite', name: 'confidentialite', component: () => import('@/vues/ConfidentialiteVue.vue'), meta: { titre: 'Cookies et confidentialité' } },
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
export async function roleSession() {
  if (!supabaseConfigure) return null
  // Une session périmée fait renouveler le jeton par le réseau : sans réponse en 4 s, on navigue comme un visiteur
  // plutôt que de laisser le clic sans effet (la RLS protège les données quoi qu'il arrive)
  const { data } = await Promise.race([
    supabase.auth.getSession(),
    new Promise((r) => setTimeout(() => r({ data: { session: null } }), 4000))
  ])
  const id = data.session?.user?.id
  if (!id) return null
  if (cacheRole.id === id) return cacheRole
  const lu = { id, ...(await lireRoleCompte(id)) }
  if (lu.role) cacheRole = lu // lecture ratée (réseau) : pas mise en cache, retentée à la page suivante
  return lu
}

// Pages qu'un compte admin ou fournisseur peut ouvrir : son espace et le choix d'un nouveau mot de passe
// (la connexion n'est pas une page : c'est une fenêtre superposée, ouverte par useFenetreAuth)
export const PAGES_ESPACE = { admin: ['admin', 'nouveau-mot-de-passe'], fournisseur: ['espace-fournisseur', 'nouveau-mot-de-passe'] }

/**
 * Lien de l'e-mail « mot de passe oublié » : Supabase ramène sur le site avec « type=recovery » dans l'adresse (ou une
 * erreur si le lien a expiré), parfois sur l'accueil quand l'adresse de retour n'est pas autorisée. Où qu'il arrive,
 * le compte est conduit une fois à la page du nouveau mot de passe. Lu au chargement, avant que Supabase nettoie l'adresse.
 */
const ARRIVEE = typeof window === 'undefined' ? '' : window.location.hash + window.location.search
let lienMotDePasse = /[#&?]type=recovery\b/.test(ARRIVEE) || /[#&?]error_code=otp_expired\b/.test(ARRIVEE)

routeur.beforeEach(async (to, from) => {
  // Session locale + rôle en cache : aucun appel réseau à la navigation (la base revérifie tout par la RLS)
  const compte = await roleSession()
  // après la lecture de la session : Supabase a déjà lu le jeton dans l'adresse, la redirection ne le lui retire pas
  if (lienMotDePasse) {
    lienMotDePasse = false
    if (to.name !== 'nouveau-mot-de-passe') return { name: 'nouveau-mot-de-passe', query: to.query }
  }
  // Les comptes admin et fournisseur n'utilisent pas le site public (ni accueil, ni devis, ni projets) :
  // toujours ramenés à leur espace.
  if (compte?.role === 'admin' && !PAGES_ESPACE.admin.includes(to.name)) return { name: 'admin' }
  // … sauf un fournisseur en mode « Voir le site » (il navigue comme un professionnel ; pas d'admin, ni de page d'un autre rôle)
  if (compte?.role === 'fournisseur' && compte.fournisseur_id && !PAGES_ESPACE.fournisseur.includes(to.name) && !(modeSite.value && !to.meta.necessiteAdmin)) return { name: 'espace-fournisseur' }

  if (!to.meta.necessiteConnexion) return true
  if (!compte) {
    // page réservée aux comptes : la fenêtre de connexion s'ouvre et ramène ici une fois connecté.
    // Déjà sur le site : on reste sur la page en cours ; arrivée directe (lien, favori, rafraîchissement) : l'accueil en fond.
    ouvrirAuth('connexion', { redirect: to.fullPath })
    return from.matched.length ? false : { name: 'accueil' }
  }
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

import { createRouter, createWebHistory } from 'vue-router'
import { apiConfiguree } from '@/services/api/client.js'
import { utilisateurCourant, roleDe } from '@/services/api/serviceAuth.js'
import { modeSite } from '@/composables/useModeSite.js'
import { ouvrirAuth } from '@/composables/useFenetreAuth.js'
// Accueil livré avec le code principal : première page vue, son titre s'affiche sans attendre un second téléchargement
import AccueilVue from '@/vues/AccueilVue.vue'

const routes = [
  { path: '/', name: 'accueil', component: AccueilVue, meta: { titre: 'Accueil' } },
  { path: '/calculateur', name: 'calculateur', component: () => import('@/vues/CalculateurVue.vue'), meta: { titre: 'Calculateur' } },
  { path: '/resultats', name: 'resultats', component: () => import('@/vues/ResultatsVue.vue'), meta: { titre: 'Résultats' } }, // prix visible sans compte : le compte sert à enregistrer et au code de retrait
  { path: '/fournisseurs', name: 'fournisseurs', component: () => import('@/vues/FournisseursVue.vue'), meta: { titre: 'Fournisseurs' } },
  { path: '/projet-pro', redirect: '/calculateur' }, // ancienne page 3D retirée : les pros réunissent leurs ouvrages depuis le calculateur
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
 * Rôle du compte de la session en cours. Le compte est lu une fois auprès de l'API (/auth/moi) puis gardé en
 * mémoire : pas d'appel réseau à chaque page, ni pour un visiteur sans jeton. L'API revérifie tout à chaque requête.
 */
export async function roleSession({ premiere = false } = {}) {
  if (!apiConfiguree) return null
  // API lente : sans réponse en 4 s, on navigue comme un visiteur plutôt que de laisser le clic sans effet.
  // Première page (rechargement, lien) : on attend bien plus longtemps — sinon l'admin rechargé passait par l'accueil.
  const compte = await Promise.race([
    utilisateurCourant(),
    new Promise((r) => setTimeout(() => r(null), premiere ? 15000 : 4000))
  ])
  return compte ? { id: compte.id, ...roleDe(compte) } : null
}

// Pages qu'un compte admin ou fournisseur peut ouvrir : son espace et le choix d'un nouveau mot de passe
// (la connexion n'est pas une page : c'est une fenêtre superposée, ouverte par useFenetreAuth)
export const PAGES_ESPACE = { admin: ['admin', 'nouveau-mot-de-passe'], fournisseur: ['espace-fournisseur', 'nouveau-mot-de-passe'] }

routeur.beforeEach(async (to, from) => {
  // Compte en mémoire : aucun appel réseau à la navigation (l'API revérifie tout à chaque requête)
  const compte = await roleSession({ premiere: !from.matched.length })
  // Les comptes admin et fournisseur n'utilisent pas le site public (ni accueil, ni devis, ni projets) :
  // toujours ramenés à leur espace.
  if (compte?.role === 'admin' && !PAGES_ESPACE.admin.includes(to.name)) return { name: 'admin' }
  // … sauf un fournisseur en mode « Voir le site » (il navigue comme un professionnel ; pas d'admin, ni de page d'un autre rôle)
  if (compte?.role === 'fournisseur' && compte.fournisseur_id && !PAGES_ESPACE.fournisseur.includes(to.name) && !(modeSite.value && !to.meta.necessiteAdmin)) return { name: 'espace-fournisseur' }

  if (!to.meta.necessiteConnexion) return true
  if (!compte) {
    // page réservée aux comptes : la fenêtre de connexion s'ouvre et ramène ici une fois connecté.
    // Déjà sur le site : on reste sur la page en cours ; arrivée directe (lien, favori, rafraîchissement) : l'accueil en fond.
    ouvrirAuth(to.meta.fenetre || 'connexion', { redirect: to.fullPath, message: to.meta.message })
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

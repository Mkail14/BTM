import { createRouter, createWebHistory } from 'vue-router'
import { utilisateurCourant } from '@/services/supabase/serviceAuth.js'
import { estAdmin } from '@/services/supabase/serviceAdmin.js'

const routes = [
  { path: '/', name: 'accueil', component: () => import('@/vues/AccueilVue.vue'), meta: { titre: 'Accueil' } },
  { path: '/calculateur', name: 'calculateur', component: () => import('@/vues/CalculateurVue.vue'), meta: { titre: 'Calculateur' } },
  { path: '/resultats', name: 'resultats', component: () => import('@/vues/ResultatsVue.vue'), meta: { titre: 'Résultats' } },
  { path: '/fournisseurs', name: 'fournisseurs', component: () => import('@/vues/FournisseursVue.vue'), meta: { titre: 'Fournisseurs' } },
  { path: '/dashboard', name: 'dashboard', component: () => import('@/vues/TableauDeBordVue.vue'), meta: { titre: 'Mes projets', necessiteConnexion: true } },
  { path: '/connexion', name: 'connexion', component: () => import('@/vues/AuthentificationVue.vue'), props: { mode: 'connexion' }, meta: { titre: 'Connexion' } },
  { path: '/inscription', name: 'inscription', component: () => import('@/vues/AuthentificationVue.vue'), props: { mode: 'inscription' }, meta: { titre: 'Inscription' } },
  { path: '/admin', name: 'admin', component: () => import('@/vues/AdminVue.vue'), meta: { titre: 'Administration', necessiteConnexion: true, necessiteAdmin: true } },
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

routeur.beforeEach(async (to) => {
  if (!to.meta.necessiteConnexion) return true
  const utilisateur = await utilisateurCourant()
  if (!utilisateur) return { name: 'connexion', query: { redirect: to.fullPath } }
  // le rôle est revérifié côté base (RLS) ; ici on évite seulement d'afficher une page vide aux non-admins
  if (to.meta.necessiteAdmin && !(await estAdmin(utilisateur.id))) return { name: 'accueil' }
  return true
})

routeur.afterEach((to) => {
  document.title = to.meta.titre ? `${to.meta.titre} — BTM Mayotte` : 'BTM — Bâtiment & Travaux Mayotte'
})

export default routeur

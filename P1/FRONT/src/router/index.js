import { createRouter, createWebHistory } from 'vue-router'

const isAdmin = () => {
  try {
    const raw = localStorage.getItem('btm.currentUser')
    if (!raw) return false
    const user = JSON.parse(raw)
    return user?.role === 'admin' || user?.email === 'admin@btm.local'
  } catch {
    return false
  }
}

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('../views/HomeView.vue'),
    meta: { title: 'Accueil' }
  },
  {
    path: '/calculateur',
    name: 'calculator',
    component: () => import('../views/CalculatorView.vue'),
    meta: { title: 'Calculateur' }
  },
  {
    path: '/resultats',
    name: 'results',
    component: () => import('../views/ResultsView.vue'),
    meta: { title: 'Résultats' }
  },
  {
    path: '/fournisseurs',
    name: 'suppliers',
    component: () => import('../views/SuppliersView.vue'),
    meta: { title: 'Fournisseurs' }
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('../views/DashboardView.vue'),
    meta: { title: 'Mes projets' }
  },
  {
    path: '/connexion',
    name: 'login',
    component: () => import('../views/AuthView.vue'),
    props: { mode: 'login' },
    meta: { title: 'Connexion' }
  },
  {
    path: '/inscription',
    name: 'register',
    component: () => import('../views/AuthView.vue'),
    props: { mode: 'register' },
    meta: { title: 'Inscription' }
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('../views/AdminView.vue'),
    meta: { title: 'Administration', requiresAdmin: true }
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('../views/NotFoundView.vue'),
    meta: { title: 'Page introuvable' }
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    return { top: 0 }
  }
})

router.beforeEach((to, from, next) => {
  if (!to.meta?.requiresAdmin) {
    return next()
  }

  if (isAdmin()) {
    return next()
  }

  return next({ name: 'login' })
})

router.afterEach((to) => {
  const base = 'BTM — Bâtiment & Travaux Mayotte'
  document.title = to.meta?.title
    ? `${to.meta.title} · ${base}`
    : base
})

export default router
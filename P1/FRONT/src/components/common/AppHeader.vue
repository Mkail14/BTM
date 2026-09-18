<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth.js'

const route = useRoute()
const router = useRouter()
const { currentUser, logout } = useAuth()

const isAdminPage = computed(() => route.path.startsWith('/admin'))
const isMenuOpen = ref(false)
const hasScrolled = ref(false)
const isHomePage = computed(() => route.path === '/')

const isAdminUser = computed(() => {
  const user = currentUser.value
  return user?.role === 'admin' || user?.email === 'admin@btm.local'
})

const navLinks = computed(() => {
  const links = [
    { to: '/', label: 'Accueil' },
    { to: '/calculateur', label: 'Calculateur' },
    { to: '/fournisseurs', label: 'Fournisseurs' },
    { to: '/dashboard', label: 'Mes projets' }
  ]

  if (isAdminUser.value) {
    links.push({ to: '/admin', label: 'Admin' })
  }

  return links
})

function closeMenu() {
  isMenuOpen.value = false
}

function handleLogout() {
  logout()
  closeMenu()
  router.push('/')
}

function updateHeaderState() {
  hasScrolled.value = window.scrollY > 8
}

watch(
  () => route.path,
  () => {
    closeMenu()
    updateHeaderState()
  }
)

onMounted(() => {
  updateHeaderState()
  window.addEventListener('scroll', updateHeaderState, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', updateHeaderState)
})
</script>

<template>
  <header
    v-if="!isAdminPage"
    class="app-header"
    :class="{ 'app-header--transparent': isHomePage && !hasScrolled }"
  >
    <div class="container header-bar">
      <router-link to="/" class="brand" @click="closeMenu">
        <span class="brand-mark" aria-hidden="true">
          <span class="brand-mark__bar brand-mark__bar--y" />
          <span class="brand-mark__bar brand-mark__bar--r" />
        </span>
        <span class="brand-text">
          <strong>BTM</strong>
          <small>Bâtiment &amp; Travaux Mayotte</small>
        </span>
      </router-link>

      <nav class="nav" :class="{ 'nav--open': isMenuOpen }" aria-label="Menu principal">
        <router-link
          v-for="link in navLinks"
          :key="link.to"
          :to="link.to"
          class="nav-link"
          @click="closeMenu"
        >
          {{ link.label }}
        </router-link>

        <div class="nav-auth">
          <template v-if="currentUser">
            <span class="nav-user">{{ currentUser.name }}</span>
            <button type="button" class="btn btn--outline-light btn--sm" @click="handleLogout">
              Déconnexion
            </button>
          </template>
          <template v-else>
            <router-link to="/connexion" class="btn btn--outline-light btn--sm" @click="closeMenu">
              Connexion
            </router-link>
            <router-link to="/inscription" class="btn btn--primary btn--sm" @click="closeMenu">
              S'inscrire
            </router-link>
          </template>
        </div>
      </nav>

      <button
        type="button"
        class="menu-toggle"
        :aria-expanded="isMenuOpen"
        aria-label="Ouvrir le menu"
        @click="isMenuOpen = !isMenuOpen"
      >
        <span />
        <span />
        <span />
      </button>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background: rgba(15, 23, 42, 0.32);
  backdrop-filter: blur(18px) saturate(1.5) brightness(0.9);
  -webkit-backdrop-filter: blur(18px) saturate(1.5) brightness(0.9);
  border: 0;
  box-shadow: 0 8px 30px rgba(15, 23, 42, 0.18);
  transition: background 0.22s ease, box-shadow 0.22s ease, backdrop-filter 0.22s ease;
}

.app-header--transparent {
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: none;
}

.header-bar {
  height: var(--header-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  position: relative;
  z-index: 1;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.brand-mark {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: var(--text-on-dark);
  position: relative;
  display: flex;
  overflow: hidden;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.2);
}

.brand-mark__bar {
  width: 33%;
  height: 100%;
}

.brand-mark__bar--y {
  background: var(--color-yellow);
  margin-left: auto;
}

.brand-mark__bar--r {
  background: var(--color-red);
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
  color: var(--text-on-dark);
}

.brand-text strong {
  font-family: var(--font-display);
  font-size: 1.15rem;
  letter-spacing: 0.02em;
}

.brand-text small {
  font-size: 0.68rem;
  color: var(--text-on-dark-dim);
  font-family: var(--font-mono);
  letter-spacing: 0.02em;
}

.nav {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  justify-content: flex-end;
}

.nav-link {
  color: var(--text-on-dark-dim);
  font-weight: 600;
  font-size: 0.92rem;
  padding: 8px 14px;
  border-radius: 999px;
  transition: color 0.18s ease, background 0.18s ease, transform 0.18s ease;
}

.nav-link:hover {
  color: var(--text-on-dark);
  background: transparent;
}

.nav-link:focus {
  color: var(--text-on-dark-dim);
  background: transparent;
  box-shadow: none;
  outline: none;
}

.nav-link:focus-visible {
  color: var(--text-on-dark);
  outline: 2px solid var(--color-yellow);
  outline-offset: 2px;
  box-shadow: none;
}

.nav-auth {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: 14px;
  padding-left: 14px;
  border-left: 1px solid rgba(244, 243, 239, 0.14);
}

.nav-user {
  color: var(--text-on-dark);
  font-family: var(--font-mono);
  font-size: 0.85rem;
}

.menu-toggle {
  display: none;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  width: 38px;
  height: 38px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
}

.menu-toggle span {
  height: 2px;
  background: var(--text-on-dark);
  border-radius: 2px;
}

@media (max-width: 900px) {
  .nav {
    position: fixed;
    top: var(--header-h);
    left: 0;
    right: 0;
    background: rgba(15, 23, 42, 0.94);
    backdrop-filter: blur(16px);
    flex-direction: column;
    align-items: stretch;
    padding: 12px 20px 24px;
    gap: 4px;
    border-bottom: 1px solid rgba(244, 243, 239, 0.1);
    transform: translateY(-140%);
    opacity: 0;
    pointer-events: none;
    transition: transform 0.25s ease, opacity 0.25s ease;
  }

  .nav--open {
    transform: translateY(0);
    opacity: 1;
    pointer-events: auto;
  }

  .nav-auth {
    margin: 10px 0 0;
    padding: 14px 0 0;
    border-left: none;
    border-top: 1px solid rgba(244, 243, 239, 0.14);
    justify-content: flex-start;
  }

  .menu-toggle {
    display: flex;
  }
}
</style>

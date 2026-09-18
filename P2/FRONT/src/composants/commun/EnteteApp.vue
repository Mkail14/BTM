<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth.js'
import LogoBtm from './LogoBtm.vue'

const AuthentificationVue = defineAsyncComponent(() => import('@/vues/AuthentificationVue.vue'))

const route = useRoute()
const { connecte, utilisateur, deconnexion, backendDisponible } = useAuth()
const defile = ref(false)
const menuOuvert = ref(false)
const authModalOuverte = ref(false)
const authModalMode = ref('connexion')

const liens = [
  { to: '/', label: 'Accueil', icone: 'fa-solid fa-house' },
  { to: '/calculateur', label: 'Calculateur', icone: 'fa-solid fa-calculator' },
  { to: '/fournisseurs', label: 'Fournisseurs', icone: 'fa-solid fa-truck' },
  { to: '/dashboard', label: 'Mes projets', icone: 'fa-solid fa-folder-open' }
]
const liensVisibles = computed(() => liens.filter((l) => l.to !== '/dashboard' || connecte.value))

const surScroll = () => { defile.value = window.scrollY > 24 }
onMounted(() => { surScroll(); window.addEventListener('scroll', surScroll, { passive: true }) })
onBeforeUnmount(() => window.removeEventListener('scroll', surScroll))
watch(() => route.path, () => { menuOuvert.value = false; authModalOuverte.value = false })
watch([menuOuvert, authModalOuverte], ([menu, modal]) => { document.body.style.overflow = menu || modal ? 'hidden' : '' })

function ouvrirAuth(mode = 'connexion') {
  authModalMode.value = mode
  authModalOuverte.value = true
  menuOuvert.value = false
}

function fermerAuth() {
  authModalOuverte.value = false
}
</script>

<template>
  <header id="entete-app" class="entete" :class="{ 'entete-defile': defile || route.path !== '/', 'entete-menu-ouvert': menuOuvert }">
    <div class="conteneur entete-inner">
      <router-link to="/" class="entete-logo" aria-label="BTM — Accueil">
        <LogoBtm :taille="42" />
        <span class="entete-marque">
          <strong>BTM</strong>
          <small>Bâtiment & Travaux Mayotte</small>
        </span>
      </router-link>

      <div class="entete-droit">
        <nav class="nav-principale" aria-label="Navigation principale">
          <ul>
            <li v-for="l in liensVisibles" :key="l.to">
              <router-link :to="l.to" class="nav-lien" active-class="actif" :data-label="l.label">
                <i :class="l.icone" aria-hidden="true"></i><span>{{ l.label }}</span>
              </router-link>
            </li>
          </ul>
        </nav>

        <div class="entete-actions">
          <template v-if="connecte">
            <div class="entete-compte">
              <span class="entete-utilisateur" :title="utilisateur?.email"><i class="fa-solid fa-circle-user"></i> {{ utilisateur?.email?.split('@')[0] }}</span>
              <button class="btn btn-ghost btn-sm" @click="deconnexion">Déconnexion</button>
            </div>
          </template>
          <template v-else>
            <button v-if="backendDisponible && route.path === '/'" class="btn btn-ghost btn-sm" type="button" @click="ouvrirAuth()">Connexion</button>
            <router-link v-else-if="backendDisponible" to="/connexion" class="btn btn-ghost btn-sm">Connexion</router-link>
            <router-link to="/calculateur" class="btn btn-primaire btn-sm">Estimer <i class="fa-solid fa-arrow-right"></i></router-link>
          </template>
        </div>
      </div>

      <button class="burger" :aria-expanded="menuOuvert" aria-controls="menu-mobile" aria-label="Ouvrir le menu" @click="menuOuvert = !menuOuvert">
        <span></span><span></span><span></span>
      </button>
    </div>

    <transition name="glisser">
      <nav v-if="menuOuvert" id="menu-mobile" class="menu-mobile" aria-label="Menu mobile">
        <router-link v-for="l in liensVisibles" :key="l.to" :to="l.to" class="menu-mobile-lien" active-class="actif">
          <i :class="l.icone" aria-hidden="true"></i>{{ l.label }}
        </router-link>
        <div class="menu-mobile-actions">
          <button v-if="!connecte && backendDisponible && route.path === '/'" type="button" class="btn btn-secondaire btn-bloc" @click="ouvrirAuth()">Connexion</button>
          <router-link v-else-if="!connecte && backendDisponible" to="/connexion" class="btn btn-secondaire btn-bloc">Connexion</router-link>
          <button v-else-if="connecte" class="btn btn-secondaire btn-bloc" @click="deconnexion">Déconnexion</button>
          <router-link to="/calculateur" class="btn btn-primaire btn-bloc">Commencer une estimation</router-link>
        </div>
      </nav>
    </transition>
  </header>

  <AuthentificationVue
    v-if="authModalOuverte"
    :mode="authModalMode"
    modal
    @fermer="fermerAuth"
    @changer-mode="authModalMode = $event"
  />
</template>

<style scoped>
.entete {
  position: fixed; inset: 0 0 auto 0; z-index: 100; height: var(--hauteur-entete);
  transition: background var(--transition), box-shadow var(--transition), backdrop-filter var(--transition);
  color: #fff;
}
.entete-defile {
  background: rgba(255, 255, 255, .86); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  box-shadow: 0 1px 0 rgba(11,58,77,.08), 0 6px 24px rgba(11,58,77,.06); color: var(--ardoise);
}
/* Menu ouvert : fond opaque SANS backdrop-filter (sinon il devient le bloc conteneur du menu fixed) */
.entete-menu-ouvert {
  background: #fff; backdrop-filter: none; -webkit-backdrop-filter: none;
  box-shadow: 0 1px 0 rgba(11,58,77,.08); color: var(--ardoise);
}
.entete-inner { height: 100%; display: flex; align-items: center; gap: 24px; position: relative; }
.entete-logo { display: flex; align-items: center; gap: 12px; }
.entete-marque { display: flex; flex-direction: column; line-height: 1; }
.entete-marque strong { font-family: var(--font-display); font-size: 1.45rem; font-weight: 700; letter-spacing: .06em; }
.entete-marque small { font-size: .66rem; opacity: .75; font-weight: 500; letter-spacing: .04em; text-transform: uppercase; }

.nav-principale { display: none; margin-left: auto; }
.nav-principale ul { display: flex; gap: 4px; }
.nav-lien {
  position: relative; display: inline-flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: var(--rayon-sm);
  font-weight: 500; font-size: .92rem; opacity: .85; transition: opacity var(--transition), background var(--transition);
}
.nav-lien i { display: none; }
.nav-lien:hover { opacity: 1; background: rgba(255,255,255,.08); }
.entete-defile .nav-lien:hover { background: var(--gris-100); }
.nav-lien.actif { opacity: 1; font-weight: 600; }
.nav-lien.actif::after { content: ''; position: absolute; left: 14px; right: 14px; bottom: 4px; height: 2px; background: var(--lagon-400); }
.entete-defile .nav-lien.actif::after { background: var(--lagon-700); }

.entete-actions { display: none; align-items: center; gap: 8px; margin-left: 0; }
.entete-droit { display: contents; }
.entete-compte { display: flex; align-items: center; gap: 4px; padding: 4px 5px 4px 10px; border: 1px solid rgba(255,255,255,.2); border-radius: 10px; background: rgba(5, 22, 38, .5); }
.entete-utilisateur { font-size: .9rem; font-weight: 500; display: inline-flex; gap: 6px; align-items: center; }
.entete:not(.entete-defile) .btn-ghost { color: #fff; }
.entete:not(.entete-defile) .btn-ghost:hover { background: rgba(255,255,255,.15); }
.entete-actions .btn-ghost { border: 0; font: inherit; cursor: pointer; }
.entete-defile .entete-compte { border-color: transparent; background: transparent; }

.burger {
  margin-left: auto; width: 44px; height: 44px; border: none; background: transparent; display: flex;
  flex-direction: column; justify-content: center; gap: 5px; padding: 8px; border-radius: 10px;
}
.burger span { display: block; height: 2.5px; border-radius: 2px; background: currentColor; transition: transform .3s, opacity .3s; }
.entete-menu-ouvert .burger span:nth-child(1) { transform: translateY(7.5px) rotate(45deg); }
.entete-menu-ouvert .burger span:nth-child(2) { opacity: 0; }
.entete-menu-ouvert .burger span:nth-child(3) { transform: translateY(-7.5px) rotate(-45deg); }

.menu-mobile {
  position: fixed; top: var(--hauteur-entete); left: 0; right: 0; height: calc(100dvh - var(--hauteur-entete)); background: rgba(255,255,255,.98);
  padding: 24px 20px; display: flex; flex-direction: column; gap: 6px; color: var(--ardoise); overflow-y: auto;
}
.menu-mobile-lien {
  display: flex; align-items: center; gap: 14px; padding: 16px 18px; border-radius: 12px;
  font-family: var(--font-display); font-size: 1.35rem; font-weight: 600;
}
.menu-mobile-lien i { width: 24px; color: var(--lagon-600); }
.menu-mobile-lien.actif { background: var(--gris-100); color: var(--lagon-800); }
.menu-mobile-actions { margin-top: auto; display: flex; flex-direction: column; gap: 10px; padding-top: 24px; }

@media (min-width: 900px) {
  .entete-inner {max-width: 1000px; }
  .entete-logo { position: static;  }
  .entete-droit { position: static; display: flex; align-items: center; gap: 20px; margin-left: auto; }
  .nav-principale { display: flex; margin-left: 0; padding: 5px; border: 1px solid rgba(255,255,255,.2); border-radius: 10px; background: rgba(5, 22, 38, .5); box-shadow: 0 8px 24px rgba(0,0,0,.16); }
  .entete-actions { display: flex; }
  .nav-principale ul { gap: 4px; }
  .nav-lien { width: 42px; height: 42px; justify-content: center; padding: 0; border-radius: 50%; font-size: 1rem; opacity: .78; }
  .nav-lien i { display: block; }
  .nav-lien span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .nav-lien:hover, .nav-lien:focus-visible { opacity: 1; background: rgba(255,255,255,.13); outline: none; }
  .nav-lien.actif { background: #062b1a; color: #22c55e; opacity: 1; }
  .nav-lien.actif::after { display: none; }
  .nav-lien::before { content: attr(data-label); position: absolute; left: 50%; top: calc(100% + 12px); z-index: 10; width: max-content; padding: 7px 10px; border: 1px solid rgba(255,255,255,.14); border-radius: 7px; background: #071522; color: #fff; font-size: .76rem; font-weight: 600; opacity: 0; pointer-events: none; transform: translate(-50%, -4px); transition: opacity .18s ease, transform .18s ease; }
  .nav-lien:hover::before, .nav-lien:focus-visible::before { opacity: 1; transform: translate(-50%, 0); }
  .entete-defile .nav-principale { border-color: transparent; background: transparent; box-shadow: none; }
  .entete-defile .nav-lien:hover, .entete-defile .nav-lien:focus-visible { background: var(--gris-100); }
  .entete-defile .nav-lien::before { border-color: var(--gris-300); background: var(--ardoise); }
  .burger, .menu-mobile { display: none; }
}
</style>

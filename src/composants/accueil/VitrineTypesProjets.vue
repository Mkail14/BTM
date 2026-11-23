<script setup>
import { defineAsyncComponent, ref } from 'vue'
import { typesProjets } from '@/donnees/typesProjets.js'
import { useContenuSite } from '@/composables/useContenuSite.js'
// three.js n'est téléchargé que si une maquette s'affiche : un téléphone (vitrine masquée) ouvre l'accueil sans lui
const Maquette3D = defineAsyncComponent(() => import('./Maquette3D.vue'))

const contenu = useContenuSite()
const survol = ref(null)
const telephone = window.matchMedia('(max-width: 639px)').matches
</script>

<template>
  <section id="types-projets" class="section section-nuit vitrine" aria-labelledby="vitrine-titre">
    <div class="conteneur">
      <header class="section-entete reveal">
        <span class="section-surtitre">{{ contenu.ouvrages.surtitre }}</span>
        <h2 id="vitrine-titre" class="section-titre">{{ contenu.ouvrages.titre }}</h2>
      </header>

      <div class="ouvrages">
        <router-link
          v-for="(t, i) in typesProjets" :key="t.id"
          :to="{ path: '/calculateur', query: { type: t.id } }"
          class="ouvrage reveal" :data-delai="i + 1"
          :aria-label="`Estimer : ${t.libelle}`"
          @mouseenter="survol = t.id" @mouseleave="survol = null"
          @focus="survol = t.id" @blur="survol = null"
        >
          <span class="ouvrage-num">0{{ i + 1 }}</span>
          <div class="ouvrage-scene"><Maquette3D v-if="!telephone" :type="t.id" :actif="survol === t.id" /></div>
          <div class="ouvrage-pied">
            <div>
              <h3>{{ t.libelle }}</h3>
              <p>{{ t.accroche }}</p>
            </div>
            <span class="ouvrage-fleche"><i class="fa-solid fa-arrow-right"></i></span>
          </div>
        </router-link>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* fond de nuit dans la continuité du héros ; cartes à peine plus claires, comme celles des avis */
.vitrine { background: var(--fond-nuit); }
.ouvrages { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; }
@media (max-width: 1280px) { .ouvrages { grid-template-columns: repeat(3, 1fr); } }

.ouvrage {
  position: relative; display: flex; flex-direction: column; overflow: hidden;
  background: rgba(255, 255, 255, .05); border: 1px solid rgba(255, 255, 255, .09); border-radius: 22px; color: #fff;
  transition: background var(--transition), border-color var(--transition);
}
.ouvrage:hover { background: rgba(255, 255, 255, .09); border-color: rgba(255, 255, 255, .16); }
.ouvrage:focus-visible { outline: 2px solid #f7c77a; outline-offset: 3px; }

.ouvrage-num {
  position: absolute; top: 18px; left: 22px; z-index: 1;
  font-family: var(--font-mono); font-size: .75rem; letter-spacing: .1em; color: rgba(255, 255, 255, .4);
}
.ouvrage-scene { position: relative; aspect-ratio: 1 / 1.05; }

.ouvrage-pied { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; padding: 0 22px 22px; }
.ouvrage h3 { font-size: 1.85rem; font-weight: 700; color: #fff; }
.ouvrage p { margin: 4px 0 0; font-size: .86rem; color: rgba(255, 255, 255, .6); }

.ouvrage-fleche {
  flex-shrink: 0; display: grid; place-items: center; width: 42px; height: 42px; border-radius: 50%;
  background: #fff; color: var(--encre); font-size: .85rem; /* accueil : toujours sur la nuit */
  transition: background var(--transition), color var(--transition), transform var(--transition);
}
.ouvrage:hover .ouvrage-fleche, .ouvrage:focus-visible .ouvrage-fleche { background: var(--lagon-600); color: var(--sur-primaire); transform: rotate(-45deg); }

@media (max-width: 1080px) { .ouvrages { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 560px) {
  .ouvrages { grid-template-columns: 1fr; }
  .ouvrage-scene { aspect-ratio: 4 / 3; }
}
/* Téléphone : les ouvrages sont déjà listés dans le héros, on ne les répète pas */
@media (max-width: 639px) { .vitrine { display: none; } }

/* Thème clair : cartes blanches sur le fond clair du site */
:global(html[data-theme="clair"] .ouvrage) { background: #fff; border-color: var(--bordure); color: var(--ardoise); box-shadow: var(--ombre-sm); }
:global(html[data-theme="clair"] .ouvrage:hover) { background: #fff; border-color: var(--gris-300); box-shadow: var(--ombre); }
:global(html[data-theme="clair"] .ouvrage:focus-visible) { outline-color: var(--lagon-600); }
:global(html[data-theme="clair"] .ouvrage-num) { color: var(--gris-400); }
:global(html[data-theme="clair"] .ouvrage h3) { color: var(--ardoise); }
:global(html[data-theme="clair"] .ouvrage p) { color: var(--gris-500); }
:global(html[data-theme="clair"] .ouvrage-fleche) { background: var(--gris-100); }
</style>

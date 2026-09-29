<script setup>
import { ref } from 'vue'
import { typesProjets } from '@/donnees/typesProjets.js'
import { useContenuSite } from '@/composables/useContenuSite.js'
import Maquette3D from './Maquette3D.vue'

const contenu = useContenuSite()
const survol = ref(null)
</script>

<template>
  <section id="types-projets" class="section vitrine" aria-labelledby="vitrine-titre">
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
          :aria-label="`Faire le devis : ${t.libelle}`"
          @mouseenter="survol = t.id" @mouseleave="survol = null"
          @focus="survol = t.id" @blur="survol = null"
        >
          <span class="ouvrage-num">0{{ i + 1 }}</span>
          <div class="ouvrage-scene"><Maquette3D :type="t.id" :actif="survol === t.id" /></div>
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
.vitrine { background: #fff; }
.ouvrages { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }

.ouvrage {
  position: relative; display: flex; flex-direction: column; overflow: hidden;
  background: #f2f0eb; border-radius: 22px; color: inherit;
  transition: background var(--transition);
}
.ouvrage:hover { background: #ebe7df; }
.ouvrage:focus-visible { outline: 2px solid var(--lagon-600); outline-offset: 3px; }

.ouvrage-num {
  position: absolute; top: 18px; left: 22px; z-index: 1;
  font-family: var(--font-mono); font-size: .75rem; letter-spacing: .1em; color: var(--gris-400);
}
.ouvrage-scene { position: relative; aspect-ratio: 1 / 1.05; }

.ouvrage-pied { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; padding: 0 22px 22px; }
.ouvrage h3 { font-size: 1.85rem; font-weight: 700; color: var(--ardoise); }
.ouvrage p { margin: 4px 0 0; font-size: .86rem; color: var(--gris-500); }

.ouvrage-fleche {
  flex-shrink: 0; display: grid; place-items: center; width: 42px; height: 42px; border-radius: 50%;
  background: #fff; color: var(--ardoise); font-size: .85rem;
  transition: background var(--transition), color var(--transition), transform var(--transition);
}
.ouvrage:hover .ouvrage-fleche, .ouvrage:focus-visible .ouvrage-fleche { background: var(--lagon-600); color: #fff; transform: rotate(-45deg); }

@media (max-width: 1080px) { .ouvrages { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 560px) {
  .ouvrages { grid-template-columns: 1fr; }
  .ouvrage-scene { aspect-ratio: 4 / 3; }
}
</style>

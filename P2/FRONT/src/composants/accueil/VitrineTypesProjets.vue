<script setup>
import { typesProjets } from '@/donnees/typesProjets.js'
import Objet3D from './Objet3D.vue'
const details = {
  mur: ['Parpaings 20×20×40', 'Ciment & sable', 'Ouvertures déduites'],
  dalle: ['Béton 2,4 t/m³', 'Treillis soudé', 'Hérisson de gravier'],
  fondation: ['Semelles filantes', 'Béton armé', 'Armatures acier HA'],
  terrasse: ['Base dalle béton', 'Carrelage ou béton lissé', 'Usage extérieur']
}
</script>

<template>
  <section id="types-projets" class="section vitrine" aria-labelledby="vitrine-titre">
    <div class="conteneur">
      <header class="section-entete reveal">
        <span class="section-surtitre">Quatre types de projets</span>
        <h2 id="vitrine-titre" class="section-titre">Les ouvrages les plus courants, modélisés.</h2>
        <p class="section-sous-titre">Chaque type de projet applique ses propres règles de calcul : quantités, marges, main-d’œuvre et frais de livraison.</p>
      </header>

      <div class="grille grille-4">
        <router-link
          v-for="(t, i) in typesProjets" :key="t.id"
          :to="{ path: '/calculateur', query: { type: t.id } }"
          class="vitrine-carte objet3d-hote reveal" :data-delai="i + 1"
        >
          <div class="vitrine-visuel fond-plan"><Objet3D :type="t.id" :taille="150" /></div>
          <div class="vitrine-corps">
            <h3>{{ t.libelle }}</h3>
            <p>{{ t.description }}</p>
            <ul class="vitrine-details">
              <li v-for="d in details[t.id]" :key="d"><i class="fa-solid fa-check"></i>{{ d }}</li>
            </ul>
            <span class="vitrine-cta">Estimer ce projet <i class="fa-solid fa-arrow-right"></i></span>
          </div>
        </router-link>
      </div>
    </div>
  </section>
</template>

<style scoped>
.vitrine { background: #fff; border-top: 1px solid var(--bordure); border-bottom: 1px solid var(--bordure); }
.vitrine-carte {
  display: flex; flex-direction: column; background: #fff; border: 1px solid var(--bordure); border-radius: var(--rayon-lg); overflow: hidden;
  transition: transform var(--transition), box-shadow var(--transition), border-color var(--transition);
}
.vitrine-carte:hover { transform: translateY(-4px); box-shadow: var(--ombre-lg); border-color: var(--gris-300); }
.vitrine-visuel { display: grid; place-items: center; height: 190px; background-size: 24px 24px; }
.vitrine-corps { padding: 22px 22px 24px; display: flex; flex-direction: column; gap: 10px; flex: 1; }
.vitrine-corps h3 { font-size: 1.6rem; font-weight: 700; color: var(--ardoise); }
.vitrine-corps p { color: var(--texte-secondaire); font-size: .92rem; line-height: 1.55; }
.vitrine-details { display: flex; flex-direction: column; gap: 6px; margin: 6px 0 10px; font-size: .86rem; color: var(--gris-700); flex: 1; }
.vitrine-details li { display: flex; gap: 8px; align-items: center; }
.vitrine-details i { color: var(--lagon-600); font-size: .7rem; }
.vitrine-cta { font-weight: 600; font-size: .9rem; color: var(--lagon-700); display: inline-flex; gap: 8px; align-items: center; }
.vitrine-cta i { transition: transform var(--transition); }
.vitrine-carte:hover .vitrine-cta i { transform: translateX(4px); }
</style>

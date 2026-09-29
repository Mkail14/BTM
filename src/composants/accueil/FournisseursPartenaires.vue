<script setup>
import { fournisseurs } from '@/donnees/fournisseurs.js'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
</script>

<template>
  <section id="partenaires" class="section partenaires" aria-labelledby="partenaires-titre">
    <div class="conteneur">
      <header class="section-entete reveal partenaires-entete">
        <div>
          <span class="section-surtitre">Annuaire fournisseurs</span>
          <h2 id="partenaires-titre" class="section-titre">Les acteurs du matériau à Mayotte.</h2>
          <p class="section-sous-titre">Béton, granulats, parpaings, ciment, ferraillage : des entreprises implantées de Koungou à Mamoudzou, avec leurs coordonnées directes.</p>
        </div>
        <BoutonBase to="/fournisseurs" variante="secondaire" icone-droite="fa-solid fa-arrow-right">Tout l’annuaire</BoutonBase>
      </header>

      <div class="partenaires-liste">
        <article v-for="(f, i) in fournisseurs" :key="f.id" class="partenaire reveal" :data-delai="i + 1">
          <img :src="f.logo" :alt="`Logo ${f.nom}`" width="56" height="56" loading="lazy" />
          <div class="partenaire-corps">
            <div class="partenaire-titre">
              <h3>{{ f.nom }}</h3>
              <span class="badge">{{ f.categorie }}</span>
              <span v-if="f.livraison" class="badge badge-vert">Livraison</span>
            </div>
            <p>{{ f.description }}</p>
            <p class="partenaire-adresse"><i class="fa-solid fa-location-dot"></i> {{ f.adresse }}</p>
          </div>
          <div class="partenaire-actions">
            <a :href="`tel:${f.telephone.replace(/\s/g, '')}`" class="btn btn-primaire btn-sm mono"><i class="fa-solid fa-phone"></i> {{ f.telephone }}</a>
            <a v-if="f.site_web" :href="f.site_web" target="_blank" rel="noopener noreferrer" class="btn btn-secondaire btn-sm">Site web</a>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.partenaires { background: var(--fond); }
.partenaires-entete { display: flex; flex-wrap: wrap; gap: 20px; justify-content: space-between; align-items: flex-end; max-width: none; }
.partenaires-entete > div { max-width: 680px; }
.partenaires-liste { display: flex; flex-direction: column; border-top: 1px solid var(--gris-300); }
.partenaire { display: grid; grid-template-columns: 56px 1fr; gap: 20px; padding: 26px 0; border-bottom: 1px solid var(--gris-300); align-items: start; }
@media (min-width: 900px) { .partenaire { grid-template-columns: 56px 1fr auto; align-items: center; } }
.partenaire img { width: 56px; height: 56px; border-radius: var(--rayon-sm); }
.partenaire-titre { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.partenaire-titre h3 { font-size: 1.5rem; color: var(--ardoise); margin-right: 4px; }
.partenaire-corps p { color: var(--texte-secondaire); font-size: .93rem; margin-top: 8px; max-width: 640px; }
.partenaire-adresse { font-size: .85rem !important; color: var(--gris-500) !important; display: flex; gap: 8px; align-items: center; }
.partenaire-actions { display: flex; flex-wrap: wrap; gap: 8px; grid-column: 2; }
@media (min-width: 900px) { .partenaire-actions { grid-column: auto; } }
.mono { font-family: var(--font-mono) !important; }
</style>

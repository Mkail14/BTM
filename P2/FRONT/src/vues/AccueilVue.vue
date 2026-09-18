<script setup>
import SectionHero from '@/composants/accueil/SectionHero.vue'
import VitrineTypesProjets from '@/composants/accueil/VitrineTypesProjets.vue'
import AvisClients from '@/composants/accueil/AvisClients.vue'
import BandeauAvertissement from '@/composants/commun/BandeauAvertissement.vue'
import { useReveal } from '@/composables/useReveal.js'

useReveal()
</script>

<template>
  <div id="page-accueil">
    <SectionHero />
    <VitrineTypesProjets />
    <AvisClients />
    <section class="section section-disclaimer" aria-label="Avertissement légal">
      <div class="conteneur reveal"><BandeauAvertissement /></div>
    </section>
  </div>
</template>

<style scoped>
.section-disclaimer { padding: 0 0 80px; background: var(--fond); }
</style>

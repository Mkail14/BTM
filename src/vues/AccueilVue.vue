<script setup>
import SectionHero from '@/composants/accueil/SectionHero.vue'
import VitrineTypesProjets from '@/composants/accueil/VitrineTypesProjets.vue'
import AvisClients from '@/composants/accueil/AvisClients.vue'
import SectionRealisations from '@/composants/accueil/SectionRealisations.vue'
import { useReveal } from '@/composables/useReveal.js'

defineOptions({ name: 'AccueilVue' }) // gardée en mémoire par <keep-alive include="AccueilVue"> (App.vue)
useReveal()
</script>

<template>
  <div id="page-accueil">
    <SectionHero />
    <VitrineTypesProjets />
    <AvisClients />
    <SectionRealisations />
  </div>
</template>

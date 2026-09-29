<script setup>
import SectionHero from '@/composants/accueil/SectionHero.vue'
import VitrineTypesProjets from '@/composants/accueil/VitrineTypesProjets.vue'
import AvisClients from '@/composants/accueil/AvisClients.vue'
import { useReveal } from '@/composables/useReveal.js'

useReveal()
</script>

<template>
  <div id="page-accueil">
    <SectionHero />
    <VitrineTypesProjets />
    <AvisClients />
  </div>
</template>

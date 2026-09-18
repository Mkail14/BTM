<script setup>
import HeroSection from '../components/home/HeroSection.vue'
import HowItWorks from '../components/home/HowItWorks.vue'
import ProjectTypesShowcase from '../components/home/ProjectTypesShowcase.vue'
</script>

<template>
  <div class="home-page">
    <HeroSection />
    <HowItWorks />
    <ProjectTypesShowcase />
  </div>
</template>

<style scoped>
.home-page {
  margin-top: calc(-1 * var(--header-h));
  overflow-x: hidden;
}

.home-page > :deep(section) {
  min-height: calc(100vh - var(--header-h));
}
</style>

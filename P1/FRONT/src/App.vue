<script setup>
import AppHeader from './components/common/AppHeader.vue'
import AppFooter from './components/common/AppFooter.vue'
</script>

<template>
  <div class="app-shell">
    <AppHeader />
    <main class="app-main">
      <router-view v-slot="{ Component, route }">
        <transition name="route-fade" mode="out-in">
          <component :is="Component" :key="route.path" />
        </transition>
      </router-view>
    </main>
    <AppFooter />
  </div>
</template>

<style scoped>
.app-shell {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: rgba(15, 23, 42, 0.12);
}

.app-main {
  position: relative;
  z-index: 1;
  flex: 1;
  padding-top: var(--header-h);
}

.route-fade-enter-active,
.route-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.route-fade-enter-from,
.route-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.route-fade-enter-to,
.route-fade-leave-from {
  opacity: 1;
  transform: translateY(0);
}
</style>

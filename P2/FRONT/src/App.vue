<script setup>
import EnteteApp from '@/composants/commun/EnteteApp.vue'
import PiedDePage from '@/composants/commun/PiedDePage.vue'
</script>

<template>
  <a class="lien-evitement" href="#contenu-principal">Aller au contenu</a>
  <EnteteApp />
  <main id="contenu-principal">
    <router-view v-slot="{ Component }">
      <transition name="fondu" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </main>
  <PiedDePage />
</template>

<style>
.lien-evitement {
  position: absolute; left: 16px; top: -60px; z-index: 1000; padding: 10px 16px;
  background: var(--ardoise); color: #fff; border-radius: 8px; transition: top .2s;
}
.lien-evitement:focus { top: 12px; }
</style>

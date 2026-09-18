<script setup>
defineProps({ interactive: Boolean, titre: { type: String, default: '' }, icone: { type: String, default: '' } })
</script>

<template>
  <article class="carte" :class="{ 'carte-interactive': interactive }">
    <header v-if="titre || $slots.entete" class="carte-entete">
      <slot name="entete">
        <span v-if="icone" class="carte-icone"><i :class="icone" aria-hidden="true"></i></span>
        <h3 class="carte-titre">{{ titre }}</h3>
      </slot>
    </header>
    <slot />
  </article>
</template>

<style scoped>
.carte-entete { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
.carte-icone {
  width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center;
  background: var(--lagon-100); color: var(--lagon-700); font-size: 1.05rem; flex-shrink: 0;
}
.carte-titre { font-size: 1.35rem; font-weight: 700; color: var(--ardoise); }
</style>

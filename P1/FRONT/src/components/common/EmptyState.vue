<script setup>
defineProps({
  title: { type: String, required: true },
  message: { type: String, default: '' }
})
</script>

<template>
  <div class="empty-state">
    <div class="empty-state__mark" aria-hidden="true" />
    <h3>{{ title }}</h3>
    <p v-if="message">{{ message }}</p>
    <slot />
  </div>
</template>

<style scoped>
.empty-state {
  text-align: center;
  padding: 56px 24px;
  border: 2px dashed var(--color-concrete-light);
  border-radius: var(--radius-md);
  color: var(--text-on-light-dim);
}

.empty-state__mark {
  width: 44px;
  height: 44px;
  margin: 0 auto 18px;
  border-radius: 50%;
  background: repeating-linear-gradient(
    -45deg,
    var(--color-yellow),
    var(--color-yellow) 6px,
    var(--color-black) 6px,
    var(--color-black) 12px
  );
  opacity: 0.85;
}

.empty-state h3 {
  color: var(--text-on-light);
  font-size: 1.1rem;
  margin-bottom: 8px;
}

.empty-state p {
  max-width: 380px;
  margin: 0 auto;
  font-size: 0.92rem;
}
</style>

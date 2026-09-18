<script setup>
defineProps({
  padded: { type: Boolean, default: true }
})
</script>

<template>
  <div class="card" :class="{ 'card--pad': padded }">
    <slot />
  </div>
</template>

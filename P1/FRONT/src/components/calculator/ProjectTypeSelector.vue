<script setup>
import { PROJECT_TYPES } from '../../data/projectTypes.js'

defineProps({
  modelValue: { type: String, required: true }
})

defineEmits(['update:modelValue'])
</script>

<template>
  <div class="type-selector" role="tablist" aria-label="Type de projet">
    <button
      v-for="type in PROJECT_TYPES"
      :key="type.id"
      type="button"
      role="tab"
      class="type-tab"
      :class="{ 'type-tab--active': modelValue === type.id }"
      :aria-selected="modelValue === type.id"
      @click="$emit('update:modelValue', type.id)"
    >
      {{ type.label }}
    </button>
  </div>
</template>

<style scoped>
.type-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 6px;
  background: var(--color-paper-dim);
  border-radius: var(--radius-md);
  border: 1px solid rgba(15, 23, 42, 0.06);
}

.type-tab {
  flex: 1;
  min-width: 120px;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--text-on-light-dim);
  font-weight: 600;
  font-size: 0.92rem;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.type-tab:hover {
  color: var(--text-on-light);
}

.type-tab--active {
  background: var(--color-black);
  color: var(--color-yellow);
}
</style>

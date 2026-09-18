<script setup>
import { SUPPLIER_CATEGORIES } from '../../data/suppliers.js'

defineProps({
  search: { type: String, required: true },
  category: { type: String, required: true }
})

defineEmits(['update:search', 'update:category'])
</script>

<template>
  <div class="filters">
    <div class="field filters__search">
      <label for="supplier-search">Rechercher</label>
      <input
        id="supplier-search"
        type="text"
        placeholder="Nom, commune, matériau…"
        :value="search"
        @input="$emit('update:search', $event.target.value)"
      />
    </div>

    <div class="filters__categories" role="group" aria-label="Filtrer par catégorie">
      <button
        type="button"
        class="filter-chip"
        :class="{ 'filter-chip--active': category === 'Toutes' }"
        @click="$emit('update:category', 'Toutes')"
      >
        Toutes
      </button>
      <button
        v-for="cat in SUPPLIER_CATEGORIES"
        :key="cat"
        type="button"
        class="filter-chip"
        :class="{ 'filter-chip--active': category === cat }"
        @click="$emit('update:category', cat)"
      >
        {{ cat }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 32px;
}

.filters__search {
  max-width: 360px;
  margin-bottom: 0;
}

.filters__categories {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-chip {
  padding: 8px 16px;
  border-radius: 999px;
  border: 1.5px solid var(--color-concrete-light);
  background: var(--color-white);
  color: var(--text-on-light-dim);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.filter-chip:hover {
  border-color: var(--color-violet);
  color: var(--color-violet-dark);
}

.filter-chip--active {
  background: var(--color-violet);
  border-color: var(--color-violet);
  color: var(--text-on-dark);
}
</style>

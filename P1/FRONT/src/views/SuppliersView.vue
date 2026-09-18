<script setup>
import { computed, ref } from 'vue'
import { SUPPLIERS } from '../data/suppliers.js'
import SupplierCard from '../components/suppliers/SupplierCard.vue'
import SupplierFilters from '../components/suppliers/SupplierFilters.vue'
import EmptyState from '../components/common/EmptyState.vue'

const search = ref('')
const category = ref('Toutes')

const filteredSuppliers = computed(() => {
  const term = search.value.trim().toLowerCase()
  return SUPPLIERS.filter((supplier) => {
    const matchesCategory = category.value === 'Toutes' || supplier.category === category.value
    const matchesSearch =
      !term ||
      supplier.name.toLowerCase().includes(term) ||
      supplier.commune.toLowerCase().includes(term) ||
      supplier.description.toLowerCase().includes(term)
    return matchesCategory && matchesSearch
  })
})
</script>

<template>
  <div class="section suppliers-page">
    <div class="container">
      <span class="eyebrow">Annuaire</span>
      <h1 class="section-title">Fournisseurs à Mayotte</h1>
      <p class="section-sub">
        Comparez les négociants en matériaux, centrales à béton et loueurs de matériel de l'île.
      </p>

      <div class="suppliers-controls">
        <SupplierFilters v-model:search="search" v-model:category="category" />
      </div>

      <p class="results-count">{{ filteredSuppliers.length }} fournisseur(s) trouvé(s)</p>

      <div v-if="filteredSuppliers.length" class="suppliers-grid">
        <SupplierCard v-for="supplier in filteredSuppliers" :key="supplier.id" :supplier="supplier" />
      </div>
      <EmptyState
        v-else
        title="Aucun fournisseur ne correspond"
        message="Essayez une autre recherche ou réinitialisez les filtres."
      />
    </div>
  </div>
</template>

<style scoped>
.suppliers-controls {
  margin-top: 32px;
}

.results-count {
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: var(--color-concrete);
  margin: -6px 0 20px;
}

.suppliers-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

@media (max-width: 760px) {
  .suppliers-grid {
    grid-template-columns: 1fr;
  }
}
</style>

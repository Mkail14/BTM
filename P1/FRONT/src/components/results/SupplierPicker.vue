<script setup>
import { SUPPLIERS } from '../../data/suppliers.js'

const props = defineProps({
  modelValue: { type: String, default: null }, // id d'un fournisseur, 'autre', ou null
  customName: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue', 'update:customName'])
</script>

<template>
  <div class="supplier-picker">
    <div class="supplier-picker__options">
      <button
        v-for="supplier in SUPPLIERS"
        :key="supplier.id"
        type="button"
        class="supplier-option"
        :class="{ 'supplier-option--active': props.modelValue === supplier.id }"
        @click="emit('update:modelValue', supplier.id)"
      >
        <span class="supplier-option__name">{{ supplier.name }}</span>
        <span class="supplier-option__meta">{{ supplier.commune }}</span>
      </button>

      <button
        type="button"
        class="supplier-option"
        :class="{ 'supplier-option--active': props.modelValue === 'autre' }"
        @click="emit('update:modelValue', 'autre')"
      >
        <span class="supplier-option__name">Autre fournisseur</span>
        <span class="supplier-option__meta">Acteur local de votre choix</span>
      </button>
    </div>

    <div v-if="props.modelValue === 'autre'" class="field supplier-picker__custom">
      <label for="supplier-custom-name">Nom du fournisseur</label>
      <input
        id="supplier-custom-name"
        type="text"
        placeholder="Ex : un dépôt de matériaux près de chez vous"
        :value="props.customName"
        @input="emit('update:customName', $event.target.value)"
      />
      <p class="field-hint">Indiquez un fournisseur mahorais réel — les tarifs affichés restent une estimation indépendante du fournisseur choisi.</p>
    </div>

    <div v-else-if="props.modelValue" class="supplier-picker__detail">
      <template v-for="supplier in SUPPLIERS" :key="supplier.id">
        <p v-if="supplier.id === props.modelValue" class="supplier-picker__contact">
          <span class="mono">{{ supplier.phone }}</span>
          <a :href="supplier.website" target="_blank" rel="noopener noreferrer">{{ supplier.website.replace('https://www.', '') }}</a>
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.supplier-picker__options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.supplier-option {
  text-align: left;
  background: var(--color-white);
  border: 1.5px solid var(--color-concrete-light);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.supplier-option:hover {
  border-color: var(--color-violet);
}

.supplier-option--active {
  border-color: var(--color-violet);
  background: rgba(124, 58, 237, 0.06);
}

.supplier-option__name {
  font-weight: 600;
  font-size: 0.92rem;
  color: var(--text-on-light);
}

.supplier-option__meta {
  font-size: 0.78rem;
  color: var(--text-on-light-dim);
}

.supplier-picker__custom {
  margin-top: 16px;
  margin-bottom: 0;
}

.supplier-picker__detail {
  margin-top: 14px;
}

.supplier-picker__contact {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
  margin: 0;
  padding: 10px 14px;
  background: var(--color-paper-dim);
  border-radius: var(--radius-sm);
}

.supplier-picker__contact a {
  color: var(--color-violet-dark);
  font-weight: 600;
}

.mono {
  font-family: var(--font-mono);
}
</style>

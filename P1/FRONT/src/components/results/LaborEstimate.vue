<script setup>
defineProps({
  labor: { type: Object, required: true }
})

const formatEur = (value) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)
</script>

<template>
  <div class="labor">
    <div class="labor__row">
      <span>Durée estimée</span>
      <strong class="mono">{{ labor.days }} jour{{ labor.days > 1 ? 's' : '' }}</strong>
    </div>
    <div class="labor__row">
      <span>Taux journalier moyen</span>
      <strong class="mono">{{ formatEur(labor.dailyRate) }} / jour</strong>
    </div>
    <div class="labor__row labor__row--total">
      <span>Coût main-d'œuvre</span>
      <strong class="mono">{{ formatEur(labor.total) }}</strong>
    </div>
  </div>
</template>

<style scoped>
.labor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.labor__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
  color: var(--text-on-light-dim);
}

.labor__row--total {
  padding-top: 10px;
  border-top: 1px dashed var(--color-concrete-light);
  color: var(--text-on-light);
}

.mono {
  font-family: var(--font-mono);
}
</style>

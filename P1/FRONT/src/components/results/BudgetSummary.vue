<script setup>
defineProps({
  materialsCost: { type: Number, required: true },
  laborCost: { type: Number, required: true },
  delivery: { type: Number, required: true },
  totalCost: { type: Number, required: true }
})

const formatEur = (value) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)
</script>

<template>
  <div class="budget">
    <span class="budget__eyebrow">Budget total estimé</span>
    <div class="budget__total">{{ formatEur(totalCost) }}</div>

    <ul class="budget__breakdown">
      <li>
        <span>Matériaux</span>
        <span class="mono">{{ formatEur(materialsCost) }}</span>
      </li>
      <li>
        <span>Main-d'œuvre</span>
        <span class="mono">{{ formatEur(laborCost) }}</span>
      </li>
      <li>
        <span>Livraison estimée</span>
        <span class="mono">{{ formatEur(delivery) }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.budget {
  background: var(--color-black);
  border-radius: var(--radius-lg);
  padding: 32px 28px;
  color: var(--text-on-dark);
  position: relative;
  overflow: hidden;
}

.budget::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 10px;
  background-image: repeating-linear-gradient(
    -45deg,
    var(--color-yellow),
    var(--color-yellow) 8px,
    var(--color-black) 8px,
    var(--color-black) 16px
  );
}

.budget__eyebrow {
  display: block;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-on-dark-dim);
  margin-bottom: 8px;
}

.budget__total {
  font-family: var(--font-display);
  font-size: clamp(2.2rem, 5vw, 2.8rem);
  color: var(--color-yellow);
  margin-bottom: 24px;
}

.budget__breakdown {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.budget__breakdown li {
  display: flex;
  justify-content: space-between;
  font-size: 0.92rem;
  color: var(--text-on-dark-dim);
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(244, 243, 239, 0.1);
}

.budget__breakdown li:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.mono {
  font-family: var(--font-mono);
  color: var(--text-on-dark);
}
</style>

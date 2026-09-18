<script setup>
defineProps({
  materials: { type: Array, required: true }
})

const formatQty = (value) => {
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2)
}

const formatEur = (value) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)
</script>

<template>
  <div class="materials-list">
    <table>
      <thead>
        <tr>
          <th scope="col">Matériau</th>
          <th scope="col">Quantité</th>
          <th scope="col">Prix unitaire</th>
          <th scope="col">Sous-total</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in materials" :key="item.key">
          <td class="material-label">{{ item.label }}</td>
          <td class="mono">{{ formatQty(item.quantity) }} {{ item.unit }}</td>
          <td class="mono">{{ formatEur(item.unitPrice) }}</td>
          <td class="mono subtotal">{{ formatEur(item.subtotal) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.materials-list {
  overflow-x: auto;
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: var(--radius-md);
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 480px;
}

thead {
  background: var(--color-black);
}

th {
  text-align: left;
  padding: 12px 16px;
  color: var(--color-yellow);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
}

td {
  padding: 13px 16px;
  border-top: 1px solid rgba(15, 23, 42, 0.08);
  font-size: 0.92rem;
}

tbody tr:nth-child(even) {
  background: var(--color-paper-dim);
}

.material-label {
  font-weight: 500;
}

.mono {
  font-family: var(--font-mono);
  font-size: 0.88rem;
}

.subtotal {
  font-weight: 600;
  color: var(--color-violet-dark);
}
</style>

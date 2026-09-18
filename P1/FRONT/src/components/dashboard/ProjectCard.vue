<script setup>
import { getProjectType } from '../../data/projectTypes.js'
import { getSupplierById } from '../../data/suppliers.js'

const props = defineProps({
  project: { type: Object, required: true }
})

defineEmits(['view', 'delete'])

const formatEur = (value) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })

const typeInfo = getProjectType(props.project.projectType)
const supplier = props.project.supplierId ? getSupplierById(props.project.supplierId) : null
const supplierLabel = supplier?.name || props.project.customSupplierName || ''
</script>

<template>
  <article class="project-card">
    <div class="project-card__top">
      <span class="tag tag--violet">{{ typeInfo?.label || project.projectType }}</span>
      <span class="project-card__date">{{ formatDate(project.createdAt) }}</span>
    </div>

    <h3>{{ project.name }}</h3>
    <div class="project-card__total">{{ formatEur(project.result.totalCost) }}</div>
    <span v-if="supplierLabel" class="tag tag--concrete project-card__supplier">Fournisseur : {{ supplierLabel }}</span>

    <div class="project-card__actions">
      <button type="button" class="btn btn--outline btn--sm" @click="$emit('view', project)">
        Voir le détail
      </button>
      <button type="button" class="btn btn--danger btn--sm" @click="$emit('delete', project)">
        Supprimer
      </button>
    </div>
  </article>
</template>

<style scoped>
.project-card {
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.project-card__top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.project-card__date {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: rgba(244, 243, 239, 0.72);
}

.project-card h3 {
  font-size: 1.05rem;
  margin: 2px 0 0;
  color: var(--text-on-dark);
}

.project-card__total {
  font-family: var(--font-display);
  font-size: 1.5rem;
  color: var(--color-yellow);
}

.project-card__actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}

.project-card__supplier {
  align-self: flex-start;
}
</style>

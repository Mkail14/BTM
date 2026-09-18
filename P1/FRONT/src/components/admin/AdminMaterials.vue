<script setup>
import { computed, ref } from 'vue'
import BaseCard from '../common/BaseCard.vue'

const materials = ref([
  { id: 1, label: 'Ciment (sac 25 kg)', category: 'liant', unit: 'sac', unit_price: 9.5, is_active: true },
  { id: 2, label: 'Parpaing creux 20 cm', category: 'maçonnerie', unit: 'unité', unit_price: 1.25, is_active: true },
  { id: 3, label: 'Gravier / gravillon', category: 'granulat', unit: 'tonne', unit_price: 60, is_active: true },
  { id: 4, label: 'Treillis soudé', category: 'ferraillage', unit: 'panneau', unit_price: 28, is_active: true },
  { id: 5, label: 'Revêtement terrasse', category: 'finition', unit: 'm²', unit_price: 25, is_active: true },
  { id: 6, label: 'Sable de construction', category: 'granulat', unit: 'tonne', unit_price: 55, is_active: true },
  { id: 7, label: 'Fer à béton HA12', category: 'ferraillage', unit: 'barre', unit_price: 9, is_active: true },
  { id: 8, label: 'Fil de ligature', category: 'ferraillage', unit: 'bobine', unit_price: 6.5, is_active: false }
])

const search = ref('')
const currentPage = ref(1)
const pageSize = 5

const filteredMaterials = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return materials.value

  return materials.value.filter((item) =>
    item.label.toLowerCase().includes(q) ||
    item.category.toLowerCase().includes(q)
  )
})

const pageCount = computed(() => Math.max(1, Math.ceil(filteredMaterials.value.length / pageSize)))

const paginatedMaterials = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredMaterials.value.slice(start, start + pageSize)
})

function updatePrice(material) {
  material.unit_price = Number(material.unit_price).toFixed(2)
  console.info('Prix mis à jour', material)
}

function addMaterial() {
  materials.value.unshift({
    id: Date.now(),
    label: 'Nouveau matériau',
    category: 'liant',
    unit: 'unité',
    unit_price: 0,
    is_active: true
  })
  currentPage.value = 1
}

function removeMaterial(id) {
  materials.value = materials.value.filter((material) => material.id !== id)
}

function nextPage() {
  currentPage.value = Math.min(currentPage.value + 1, pageCount.value)
}

function prevPage() {
  currentPage.value = Math.max(currentPage.value - 1, 1)
}
</script>

<template>
  <div class="materials-page">
    <BaseCard class="toolbar-card">
      <div class="toolbar">
        <div class="search-box">
          <span>🔎</span>
          <input v-model="search" type="search" placeholder="Rechercher un matériau..." />
        </div>
        <button class="primary-btn" type="button" @click="addMaterial">+ Ajouter</button>
      </div>
    </BaseCard>

    <BaseCard class="table-card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Matériau</th>
              <th>Catégorie</th>
              <th>Unité</th>
              <th>Prix</th>
              <th>Statut</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="material in paginatedMaterials" :key="material.id">
              <td>
                <input v-model="material.label" type="text" class="input-inline" />
              </td>
              <td>
                <select v-model="material.category" class="input-inline">
                  <option value="liant">liant</option>
                  <option value="maçonnerie">maçonnerie</option>
                  <option value="granulat">granulat</option>
                  <option value="ferraillage">ferraillage</option>
                  <option value="finition">finition</option>
                </select>
              </td>
              <td>
                <input v-model="material.unit" type="text" class="input-inline" />
              </td>
              <td>
                <input v-model.number="material.unit_price" type="number" step="0.01" min="0" class="input-inline" />
              </td>
              <td>
                <span class="pill" :class="material.is_active ? 'active' : 'inactive'">
                  {{ material.is_active ? 'Actif' : 'Inactif' }}
                </span>
              </td>
              <td class="actions-cell">
                <button class="secondary-btn" type="button" @click="updatePrice(material)">Enregistrer</button>
                <button class="danger-btn" type="button" @click="removeMaterial(material.id)">Supprimer</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pagination">
        <button type="button" :disabled="currentPage === 1" @click="prevPage">Précédent</button>
        <span>Page {{ currentPage }} / {{ pageCount }}</span>
        <button type="button" :disabled="currentPage >= pageCount" @click="nextPage">Suivant</button>
      </div>
    </BaseCard>
  </div>
</template>

<style scoped>
.materials-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.toolbar-card,
.table-card {
  padding: 18px 20px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  background: #f8fafc;
  border: 1px solid #dfe7f1;
  border-radius: 10px;
  padding: 10px 12px;
}

.search-box input {
  border: 0;
  background: transparent;
  width: 100%;
  color: #0f172a;
}

.primary-btn,
.secondary-btn,
.danger-btn,
.pagination button {
  border: 0;
  border-radius: 10px;
  padding: 10px 14px;
  font-weight: 600;
  cursor: pointer;
}

.primary-btn {
  background: #111827;
  color: white;
}

.secondary-btn {
  background: #e0e7ff;
  color: #312e81;
}

.danger-btn {
  background: #fee2e2;
  color: #991b1b;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 760px;
}

th,
td {
  padding: 14px 10px;
  border-bottom: 1px solid #e2e8f0;
  text-align: left;
  vertical-align: middle;
}

th {
  color: #475569;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.input-inline {
  width: 100%;
  border: 1px solid #dfe7f1;
  border-radius: 8px;
  padding: 8px 10px;
  background: white;
  color: #0f172a;
}

.pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
}

.pill.active {
  background: #dcfce7;
  color: #166534;
}

.pill.inactive {
  background: #f1f5f9;
  color: #475569;
}

.actions-cell {
  display: flex;
  gap: 8px;
  align-items: center;
}

.pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding-top: 18px;
  color: #475569;
}

.pagination button {
  background: #f8fafc;
  color: #0f172a;
}

.pagination button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (max-width: 720px) {
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>

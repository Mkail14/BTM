<script setup>
import { ref } from 'vue'
import BaseCard from '../common/BaseCard.vue'

const suppliers = ref([
  { id: 1, name: 'Batimax', category: 'Béton', phone: '+262 000 000', active: true },
  { id: 2, name: 'ETPC', category: 'Terrasse', phone: '+262 000 001', active: true },
  { id: 3, name: 'IBS', category: 'Matériaux', phone: '+262 000 002', active: false }
])

const form = ref({
  name: '',
  category: 'Matériaux',
  phone: ''
})

function toggleSupplier(id) {
  const supplier = suppliers.value.find((item) => item.id === id)
  if (supplier) supplier.active = !supplier.active
}

function addSupplier() {
  if (!form.value.name.trim()) return

  suppliers.value.push({
    id: Date.now(),
    name: form.value.name,
    category: form.value.category,
    phone: form.value.phone || '—',
    active: true
  })

  form.value = { name: '', category: 'Matériaux', phone: '' }
}
</script>

<template>
  <div class="suppliers-page">
    <BaseCard class="add-card">
      <div class="form-grid">
        <div>
          <label>Nom fournisseur</label>
          <input v-model="form.name" type="text" placeholder="Ex : Groupe BTP" />
        </div>
        <div>
          <label>Catégorie</label>
          <select v-model="form.category">
            <option value="Matériaux">Matériaux</option>
            <option value="Béton">Béton</option>
            <option value="Terrasse">Terrasse</option>
            <option value="Ciment">Ciment</option>
          </select>
        </div>
        <div>
          <label>Téléphone</label>
          <input v-model="form.phone" type="text" placeholder="+262 ..." />
        </div>
        <div class="actions-cell">
          <button type="button" class="primary-btn" @click="addSupplier">Ajouter</button>
        </div>
      </div>
    </BaseCard>

    <div class="supplier-grid">
      <BaseCard v-for="supplier in suppliers" :key="supplier.id" class="supplier-card">
        <div class="supplier-header">
          <div>
            <h4>{{ supplier.name }}</h4>
            <span>{{ supplier.category }}</span>
          </div>
          <button type="button" class="status-btn" :class="supplier.active ? 'active' : 'inactive'" @click="toggleSupplier(supplier.id)">
            {{ supplier.active ? 'Actif' : 'Désactivé' }}
          </button>
        </div>
        <p>{{ supplier.phone }}</p>
        <div class="supplier-meta">
          <span>Prix</span>
          <strong>Standard</strong>
        </div>
      </BaseCard>
    </div>
  </div>
</template>

<style scoped>
.suppliers-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.add-card,
.supplier-card {
  padding: 20px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1.5fr 1fr 1fr auto;
  gap: 14px;
  align-items: end;
}

label {
  display: block;
  margin-bottom: 8px;
  color: #475569;
  font-size: 0.8rem;
  font-weight: 600;
}

input,
select {
  width: 100%;
  border: 1px solid #dfe7f1;
  background: white;
  border-radius: 10px;
  padding: 10px 12px;
}

.primary-btn,
.status-btn {
  border: 0;
  border-radius: 10px;
  padding: 10px 14px;
  font-weight: 700;
  cursor: pointer;
}

.primary-btn {
  background: #111827;
  color: white;
}

.status-btn.active {
  background: #dcfce7;
  color: #166534;
}

.status-btn.inactive {
  background: #e2e8f0;
  color: #475569;
}

.supplier-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(220px, 1fr));
  gap: 18px;
}

.supplier-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.supplier-header h4 {
  margin: 0;
  color: #0f172a;
}

.supplier-header span,
.supplier-card p,
.supplier-meta {
  color: #64748b;
}

.supplier-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 18px;
  padding-top: 12px;
  border-top: 1px solid #e2e8f0;
}

.supplier-meta strong {
  color: #0f172a;
}

@media (max-width: 920px) {
  .form-grid,
  .supplier-grid {
    grid-template-columns: 1fr;
  }
}
</style>

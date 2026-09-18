<script setup>
import { ref } from 'vue'
import BaseCard from '../common/BaseCard.vue'

const clients = ref([
  {
    id: 1,
    name: 'Sonia Martin',
    email: 'sonia@example.com',
    role: 'Client',
    createdAt: '2026-08-12',
    projects: [
      { name: 'Dalle béton', budget: 12450, type: 'dalle' },
      { name: 'Mur de soutènement', budget: 8600, type: 'mur' }
    ]
  },
  {
    id: 2,
    name: 'Nicolas Dupont',
    email: 'nicolas@example.com',
    role: 'Client',
    createdAt: '2026-08-09',
    projects: [
      { name: 'Terrasse carrelée', budget: 9750, type: 'terrasse' }
    ]
  }
])
</script>

<template>
  <div class="clients-page">
    <BaseCard v-for="client in clients" :key="client.id" class="client-card">
      <div class="client-header">
        <div>
          <h4>{{ client.name }}</h4>
          <small>{{ client.email }}</small>
        </div>
        <span class="badge">{{ client.role }}</span>
      </div>

      <div class="meta-row">
        <span>Inscrit le</span>
        <strong>{{ client.createdAt }}</strong>
      </div>

      <div class="projects-block">
        <h5>Projets générés</h5>
        <ul>
          <li v-for="project in client.projects" :key="project.name">
            <div>
              <strong>{{ project.name }}</strong>
              <small>{{ project.type }}</small>
            </div>
            <span>{{ project.budget.toLocaleString() }} €</span>
          </li>
        </ul>
      </div>
    </BaseCard>
  </div>
</template>

<style scoped>
.clients-page {
  display: grid;
  grid-template-columns: repeat(2, minmax(280px, 1fr));
  gap: 18px;
}

.client-card {
  padding: 20px;
}

.client-header {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
}

.client-header h4 {
  margin: 0;
  color: #0f172a;
}

.client-header small {
  color: #64748b;
}

.badge {
  background: #eef2ff;
  color: #4338ca;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 0.74rem;
  font-weight: 700;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20px;
  color: #475569;
}

.projects-block {
  margin-top: 18px;
  border-top: 1px solid #e2e8f0;
  padding-top: 16px;
}

.projects-block h5 {
  margin: 0 0 12px;
  color: #0f172a;
}

.projects-block ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.projects-block li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  background: #f8fafc;
  padding: 10px 12px;
  border-radius: 10px;
}

.projects-block strong,
.projects-block span {
  color: #0f172a;
}

.projects-block small {
  display: block;
  color: #64748b;
  text-transform: capitalize;
}

@media (max-width: 760px) {
  .clients-page {
    grid-template-columns: 1fr;
  }
}
</style>

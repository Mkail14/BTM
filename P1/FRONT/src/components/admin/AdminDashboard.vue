<script setup>
import BaseCard from '../common/BaseCard.vue'

const stats = [
  { label: 'Projets calculés', value: '186', trend: '+12.4%' },
  { label: 'Clients inscrits', value: '54', trend: '+8.1%' },
  { label: 'Matériaux actifs', value: '18', trend: '+3' },
  { label: 'Fournisseurs', value: '12', trend: '+2' }
]

const topMaterials = [
  { label: 'Ciment 25kg', usage: 132 },
  { label: 'Parpaing 20 cm', usage: 118 },
  { label: 'Gravier', usage: 94 },
  { label: 'Treillis soudé', usage: 76 }
]

const recentActivity = [
  { label: 'Moteur de calcul ajusté', time: 'Il y a 2 h' },
  { label: 'Nouveau client inscrit', time: 'Il y a 4 h' },
  { label: 'Prix matériau mis à jour', time: 'Aujourd’hui' }
]
</script>

<template>
  <div class="dashboard-page">
    <div class="stats-grid">
      <BaseCard v-for="item in stats" :key="item.label" class="stat-card">
        <div class="stat-head">
          <span>{{ item.label }}</span>
          <span class="trend">{{ item.trend }}</span>
        </div>
        <strong>{{ item.value }}</strong>
      </BaseCard>
    </div>

    <div class="two-column">
      <BaseCard class="panel-card">
        <div class="panel-header">
          <h3>Matériaux les plus consultés</h3>
        </div>

        <ul class="bars-list">
          <li v-for="material in topMaterials" :key="material.label">
            <div class="bar-label-row">
              <span>{{ material.label }}</span>
              <strong>{{ material.usage }}</strong>
            </div>
            <div class="bar-track">
              <span :style="{ width: `${(material.usage / 132) * 100}%` }" />
            </div>
          </li>
        </ul>
      </BaseCard>

      <BaseCard class="panel-card">
        <div class="panel-header">
          <h3>Activité récente</h3>
        </div>

        <ul class="activity-list">
          <li v-for="item in recentActivity" :key="item.label">
            <span class="dot" />
            <div>
              <strong>{{ item.label }}</strong>
              <small>{{ item.time }}</small>
            </div>
          </li>
        </ul>
      </BaseCard>
    </div>
  </div>
</template>

<style scoped>
.dashboard-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(180px, 1fr));
  gap: 18px;
}

.stat-card {
  padding: 22px;
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.08), rgba(15, 23, 42, 0.06));
}

.stat-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  color: #64748b;
  font-size: 0.82rem;
}

.trend {
  color: #16a34a;
  font-weight: 700;
}

.stat-card strong {
  display: block;
  margin-top: 16px;
  font-size: clamp(1.8rem, 3vw, 2.5rem);
  color: #0f172a;
}

.two-column {
  display: grid;
  grid-template-columns: 1.35fr 1fr;
  gap: 20px;
}

.panel-card {
  padding: 20px;
}

.panel-header h3 {
  margin: 0;
  color: #0f172a;
}

.bars-list,
.activity-list {
  list-style: none;
  margin: 18px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.bar-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.95rem;
  color: #334155;
  margin-bottom: 8px;
}

.bar-track {
  width: 100%;
  height: 10px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}

.bar-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #8b5cf6, #a78bfa);
}

.activity-list li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #e2e8f0;
}

.dot {
  width: 10px;
  height: 10px;
  margin-top: 6px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 0 6px rgba(34, 197, 94, 0.12);
}

.activity-list strong {
  display: block;
  color: #0f172a;
}

.activity-list small {
  color: #64748b;
}

@media (max-width: 980px) {
  .stats-grid,
  .two-column {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 720px) {
  .stats-grid,
  .two-column {
    grid-template-columns: 1fr;
  }
}
</style>

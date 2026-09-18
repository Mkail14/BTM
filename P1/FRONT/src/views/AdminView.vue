<script setup>
import { computed, onMounted, ref } from 'vue'
import BaseCard from '../components/common/BaseCard.vue'
import AdminDashboard from '../components/admin/AdminDashboard.vue'
import AdminMaterials from '../components/admin/AdminMaterials.vue'
import AdminSuppliers from '../components/admin/AdminSuppliers.vue'
import AdminClients from '../components/admin/AdminClients.vue'

const activeTab = ref('dashboard')
const isPreviewOpen = ref(false)
const stats = ref({
  totalProjects: 0,
  totalClients: 0,
  activeSuppliers: 0,
  totalMaterials: 0
})
const loading = ref(true)

const tabLabels = {
  dashboard: 'Vue d’ensemble',
  materials: 'Matériaux & Prix',
  suppliers: 'Fournisseurs',
  clients: 'Clients & Projets'
}

const kpis = computed(() => [
  { label: 'Projets calculés', value: stats.value.totalProjects, icon: '📐' },
  { label: 'Clients inscrits', value: stats.value.totalClients, icon: '👥' },
  { label: 'Fournisseurs actifs', value: stats.value.activeSuppliers, icon: '🏭' },
  { label: 'Matériaux', value: stats.value.totalMaterials, icon: '📦' }
])

async function loadDashboardStats() {
  loading.value = true

  try {
    const token = localStorage.getItem('btm.jwt') || ''
    const response = await fetch('/api/admin/stats', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      }
    })

    if (!response.ok) {
      throw new Error('Accès admin refusé')
    }

    const payload = await response.json()
    stats.value = {
      totalProjects: payload.totalProjects || 0,
      totalClients: payload.totalClients || 0,
      activeSuppliers: payload.activeSuppliers || 0,
      totalMaterials: payload.totalMaterials || 0
    }
  } catch (error) {
    console.error(error)
    stats.value = {
      totalProjects: 0,
      totalClients: 0,
      activeSuppliers: 0,
      totalMaterials: 0
    }
  } finally {
    loading.value = false
  }
}

function openSitePreview() {
  isPreviewOpen.value = true
}

function closeSitePreview() {
  isPreviewOpen.value = false
}

onMounted(() => {
  loadDashboardStats()
})
</script>

<template>
  <div class="admin-page">
    <aside class="sidebar">
      <div class="brand-block">
        <div class="brand-mark">BTM</div>
        <div>
          <strong>Admin</strong>
          <span>Centre de pilotage</span>
        </div>
      </div>

      <nav class="nav-menu">
        <button
          type="button"
          class="nav-item"
          :class="{ active: activeTab === 'dashboard' }"
          @click="activeTab = 'dashboard'"
        >
          📊 Vue d’ensemble
        </button>
        <button
          type="button"
          class="nav-item"
          :class="{ active: activeTab === 'materials' }"
          @click="activeTab = 'materials'"
        >
          🧱 Matériaux & Prix
        </button>
        <button
          type="button"
          class="nav-item"
          :class="{ active: activeTab === 'suppliers' }"
          @click="activeTab = 'suppliers'"
        >
          🏭 Fournisseurs
        </button>
        <button
          type="button"
          class="nav-item"
          :class="{ active: activeTab === 'clients' }"
          @click="activeTab = 'clients'"
        >
          👥 Clients & Projets
        </button>
      </nav>
    </aside>

    <main class="content-panel">
      <header class="topbar">
        <div>
          <p class="eyebrow">Administration</p>
          <h1>{{ tabLabels[activeTab] }}</h1>
        </div>
        <div class="admin-actions">
          <button type="button" class="preview-button" @click="openSitePreview">Afficher le site</button>
          <div class="user-pill">Admin connecté</div>
        </div>
      </header>

      <section v-if="loading" class="loading-panel">
        Chargement du tableau de bord...
      </section>

      <template v-else>
        <div v-if="activeTab === 'dashboard'">
          <div class="kpi-grid">
            <BaseCard v-for="kpi in kpis" :key="kpi.label" class="kpi-card">
              <div class="kpi-row">
                <span class="kpi-icon">{{ kpi.icon }}</span>
                <span class="kpi-label">{{ kpi.label }}</span>
              </div>
              <strong>{{ kpi.value }}</strong>
            </BaseCard>
          </div>

          <AdminDashboard />
        </div>

        <AdminMaterials v-else-if="activeTab === 'materials'" />
        <AdminSuppliers v-else-if="activeTab === 'suppliers'" />
        <AdminClients v-else />
      </template>
    </main>

    <div v-if="isPreviewOpen" class="preview-overlay" @click.self="closeSitePreview">
      <div class="preview-modal" role="dialog" aria-modal="true" aria-label="Prévisualisation du site">
        <div class="preview-header">
          <strong>Prévisualisation du site</strong>
          <button type="button" class="close-preview" @click="closeSitePreview">Fermer</button>
        </div>
        <iframe src="/" title="Aperçu du site" class="preview-frame" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-page {
  min-height: calc(100vh - var(--header-h));
  display: flex;
  background: linear-gradient(180deg, #f8fafc 0%, #eef4ff 100%);
  color: #0f172a;
}

.sidebar {
  width: 260px;
  background: linear-gradient(180deg, #0f172a 0%, #111827 100%);
  color: #f8fafc;
  padding: 26px 18px;
  border-right: 1px solid rgba(148, 163, 184, 0.18);
}

.brand-block {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px 22px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  margin-bottom: 18px;
}

.brand-mark {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  font-weight: 800;
  color: white;
  background: linear-gradient(135deg, #7c3aed 0%, #f59e0b 100%);
  box-shadow: 0 12px 25px rgba(124, 58, 237, 0.35);
}

.brand-block strong,
.brand-block span {
  display: block;
}

.brand-block strong {
  font-size: 1.05rem;
}

.brand-block span {
  font-size: 0.76rem;
  color: #94a3b8;
}

.nav-menu {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nav-item {
  border: 0;
  background: transparent;
  border-radius: 12px;
  color: #dfe7f1;
  padding: 12px 14px;
  text-align: left;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s ease;
}

.nav-item:hover,
.nav-item.active {
  background: rgba(148, 163, 184, 0.12);
  color: white;
  transform: translateX(2px);
}

.content-panel {
  flex: 1;
  padding: 30px;
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  padding: 22px 24px;
  margin-bottom: 24px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.18);
  backdrop-filter: blur(8px);
}

.topbar h1 {
  margin: 0;
  font-size: clamp(2rem, 2.4vw, 2.8rem);
  line-height: 1.1;
}

.eyebrow {
  margin: 0 0 10px;
  text-transform: uppercase;
  letter-spacing: 0.13em;
  font-size: 0.7rem;
  font-weight: 800;
  color: #7c3aed;
}

.admin-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.preview-button,
.close-preview {
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  font-weight: 700;
  transition: transform 0.18s ease, opacity 0.18s ease;
}

.preview-button {
  background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%);
  color: white;
  padding: 10px 16px;
  box-shadow: 0 12px 28px rgba(124, 58, 237, 0.2);
}

.preview-button:hover,
.close-preview:hover {
  transform: translateY(-1px);
}

.user-pill {
  background: linear-gradient(135deg, #ffffff 0%, #eef2ff 100%);
  border: 1px solid #dbeafe;
  color: #1e293b;
  border-radius: 999px;
  padding: 10px 16px;
  font-weight: 700;
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.08);
}

.preview-overlay {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(15, 23, 42, 0.6);
  z-index: 200;
  padding: 20px;
}

.preview-modal {
  width: min(1200px, 92vw);
  height: min(82vh, 820px);
  background: white;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.25);
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 16px 18px;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}

.preview-header strong {
  color: #0f172a;
}

.close-preview {
  background: #e2e8f0;
  color: #0f172a;
  padding: 8px 12px;
}

.preview-frame {
  width: 100%;
  height: calc(100% - 68px);
  border: 0;
  background: white;
}

.loading-panel {
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 18px;
  padding: 28px;
  color: #475569;
  font-weight: 600;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(160px, 1fr));
  gap: 18px;
  margin-bottom: 22px;
}

.kpi-card {
  padding: 20px;
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.08), rgba(59, 130, 246, 0.06));
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.kpi-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.76rem;
  color: #64748b;
}

.kpi-icon {
  font-size: 1.1rem;
}

.kpi-card strong {
  display: block;
  margin-top: 14px;
  font-size: clamp(1.7rem, 2vw, 2.4rem);
  color: #0f172a;
}

@media (max-width: 980px) {
  .admin-page {
    flex-direction: column;
  }

  .sidebar {
    width: 100%;
  }

  .nav-menu {
    display: grid;
    grid-template-columns: repeat(2, minmax(180px, 1fr));
  }

  .kpi-grid {
    grid-template-columns: repeat(2, minmax(180px, 1fr));
  }
}

@media (max-width: 640px) {
  .content-panel {
    padding: 18px 14px 30px;
  }

  .topbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .nav-menu,
  .kpi-grid {
    grid-template-columns: 1fr;
  }
}
</style>
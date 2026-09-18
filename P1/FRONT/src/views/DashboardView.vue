<script setup>
import { useRouter } from 'vue-router'
import { useProjects } from '../composables/useProjects.js'
import { useAuth } from '../composables/useAuth.js'
import { setCurrentCalculation } from '../services/storage/calculationStore.js'
import ProjectCard from '../components/dashboard/ProjectCard.vue'
import EmptyState from '../components/common/EmptyState.vue'

const router = useRouter()
const { projects, remove } = useProjects()
const { currentUser } = useAuth()

function viewProject(project) {
  setCurrentCalculation(project.result)
  router.push('/resultats')
}

function deleteProject(project) {
  const confirmed = window.confirm(`Supprimer le projet "${project.name}" ?`)
  if (confirmed) {
    remove(project.id)
  }
}
</script>

<template>
  <div class="section dashboard-page">
    <div class="container">
      <div class="dashboard-header">
        <div>
          <span class="eyebrow">Mes projets</span>
          <h1 class="section-title">
            {{ currentUser ? `Bonjour ${currentUser.name}` : 'Vos projets sauvegardés' }}
          </h1>
          <p class="section-sub">
            Ces projets sont enregistrés dans votre navigateur (localStorage). Ils ne sont pas partagés entre appareils pour le moment.
          </p>
        </div>
        <router-link to="/calculateur" class="btn btn--primary">Nouveau calcul</router-link>
      </div>

      <div v-if="projects.length" class="dashboard-grid">
        <ProjectCard
          v-for="project in projects"
          :key="project.id"
          :project="project"
          @view="viewProject"
          @delete="deleteProject"
        />
      </div>

      <EmptyState
        v-else
        title="Aucun projet sauvegardé"
        message="Calculez une estimation puis cliquez sur « Enregistrer » pour la retrouver ici."
      >
        <router-link to="/calculateur" class="btn btn--primary" style="margin-top: 18px;">
          Lancer un calcul
        </router-link>
      </EmptyState>
    </div>
  </div>
</template>

<style scoped>
.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 36px;
}

.dashboard-header .section-title {
  margin-bottom: 6px;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
}

@media (max-width: 900px) {
  .dashboard-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 600px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
}
</style>

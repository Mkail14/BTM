<script setup>
import { computed, ref } from 'vue'
import { calculationStore } from '../services/storage/calculationStore.js'
import { useProjects } from '../composables/useProjects.js'
import { getProjectType } from '../data/projectTypes.js'
import BudgetSummary from '../components/results/BudgetSummary.vue'
import MaterialsList from '../components/results/MaterialsList.vue'
import LaborEstimate from '../components/results/LaborEstimate.vue'
import SupplierPicker from '../components/results/SupplierPicker.vue'
import DisclaimerBanner from '../components/common/DisclaimerBanner.vue'
import EmptyState from '../components/common/EmptyState.vue'

const { save } = useProjects()

const result = computed(() => calculationStore.result)
const typeInfo = computed(() => (result.value ? getProjectType(result.value.projectType) : null))

const saveName = ref('')
const isSaved = ref(false)
const selectedSupplierId = ref(null)
const customSupplierName = ref('')

function handleSave() {
  if (!result.value) return
  save(saveName.value, result.value, selectedSupplierId.value, customSupplierName.value)
  isSaved.value = true
}

function handlePrint() {
  window.print()
}
</script>

<template>
  <div class="section results-page">
    <div class="container">
      <EmptyState
        v-if="!result"
        title="Aucun résultat à afficher"
        message="Lancez d'abord un calcul depuis la page Calculateur pour voir une estimation ici."
      >
        <router-link to="/calculateur" class="btn btn--primary" style="margin-top: 18px;">
          Aller au calculateur
        </router-link>
      </EmptyState>

      <template v-else>
        <div class="results-header">
          <div>
            <span class="eyebrow">Résultat · {{ typeInfo?.label }}</span>
            <h1 class="section-title">Votre estimation</h1>
            <ul class="results-recap">
              <li v-for="item in result.inputsSummary" :key="item.label">
                <span>{{ item.label }}</span><strong>{{ item.value }}</strong>
              </li>
            </ul>
          </div>
          <div class="results-header__quantity">
            <span>{{ result.quantityLabel }}</span>
            <strong>{{ result.quantityValue }} {{ result.quantityUnit }}</strong>
          </div>
        </div>

        <div class="results-layout">
          <div class="results-main">
            <h2 class="results-section-title">Liste des matériaux</h2>
            <MaterialsList :materials="result.materials" />

            <h2 class="results-section-title">Main-d'œuvre</h2>
            <div class="card card--pad">
              <LaborEstimate :labor="result.labor" />
            </div>

            <DisclaimerBanner />
          </div>

          <aside class="results-sidebar">
            <BudgetSummary
              :materials-cost="result.materialsCost"
              :labor-cost="result.labor.total"
              :delivery="result.delivery"
              :total-cost="result.totalCost"
            />

            <div class="card card--pad">
              <h3 class="supplier-card-title">Fournisseur conseillé</h3>
              <p class="supplier-card-sub">Choisissez un acteur mahorais pour obtenir un devis réaliste.</p>
              <SupplierPicker
                v-model="selectedSupplierId"
                v-model:custom-name="customSupplierName"
              />
            </div>

            <div class="card card--pad save-card">
              <h3>Sauvegarder ce projet</h3>
              <div v-if="!isSaved" class="field">
                <label for="project-name">Nom du projet</label>
                <input
                  id="project-name"
                  v-model="saveName"
                  type="text"
                  :placeholder="`${typeInfo?.label} du ${new Date().toLocaleDateString('fr-FR')}`"
                />
              </div>
              <p v-if="isSaved" class="save-card__confirm">
                Projet enregistré. Retrouvez-le dans
                <router-link to="/dashboard">Mes projets</router-link>.
              </p>
              <button v-else type="button" class="btn btn--violet btn--block" @click="handleSave">
                Enregistrer
              </button>
              <button type="button" class="btn btn--outline btn--block print-btn" @click="handlePrint">
                Imprimer / Exporter PDF
              </button>
            </div>
          </aside>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.results-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 36px;
  padding-bottom: 28px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
}

.results-header .section-title {
  margin-bottom: 14px;
}

.results-recap {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 24px;
}

.results-recap li {
  display: flex;
  flex-direction: column;
  font-size: 0.85rem;
  color: var(--text-on-light-dim);
}

.results-recap strong {
  font-family: var(--font-mono);
  color: var(--text-on-light);
  font-size: 0.95rem;
}

.results-header__quantity {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
}

.results-header__quantity span {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-concrete);
}

.results-header__quantity strong {
  font-family: var(--font-display);
  font-size: 1.8rem;
  color: var(--color-violet-dark);
}

.results-layout {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 36px;
  align-items: start;
}

.results-section-title {
  font-size: 1.05rem;
  margin: 28px 0 14px;
}

.results-section-title:first-child {
  margin-top: 0;
}

.results-sidebar {
  display: flex;
  flex-direction: column;
  gap: 20px;
  position: sticky;
  top: calc(var(--header-h) + 24px);
}

.save-card h3 {
  font-size: 1rem;
  margin-bottom: 16px;
}

.supplier-card-title {
  font-size: 1rem;
  margin-bottom: 4px;
}

.supplier-card-sub {
  font-size: 0.85rem;
  color: var(--text-on-light-dim);
  margin-bottom: 16px;
}

.save-card__confirm {
  font-size: 0.9rem;
  color: var(--text-on-light-dim);
  margin: 0;
}

.save-card__confirm a {
  color: var(--color-violet-dark);
  font-weight: 600;
}

.print-btn {
  margin-top: 10px;
}

@media (max-width: 900px) {
  .results-layout {
    grid-template-columns: 1fr;
  }

  .results-sidebar {
    position: static;
  }
}

@media print {
  .app-header,
  .app-footer,
  .save-card {
    display: none !important;
  }
}
</style>

<script setup>
import { reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ProjectTypeSelector from '../components/calculator/ProjectTypeSelector.vue'
import WallForm from '../components/calculator/WallForm.vue'
import SlabForm from '../components/calculator/SlabForm.vue'
import FoundationForm from '../components/calculator/FoundationForm.vue'
import TerraceForm from '../components/calculator/TerraceForm.vue'
import DisclaimerBanner from '../components/common/DisclaimerBanner.vue'
import { useCalculator } from '../composables/useCalculator.js'
import { getProjectType } from '../data/projectTypes.js'

const route = useRoute()
const router = useRouter()
const { isCalculating, generalError, fieldError, calculate } = useCalculator()

const DEFAULTS = {
  mur: { length: '', height: '', thickness: '20', openings: '0' },
  dalle: { length: '', width: '', thickness: '15' },
  fondation: { length: '', width: '40', depth: '0.6' },
  terrasse: { length: '', width: '', thickness: '10', finish: 'carrelage' }
}

const validTypes = Object.keys(DEFAULTS)
const initialType = validTypes.includes(route.query.type) ? route.query.type : 'mur'

const projectType = ref(initialType)
const formData = reactive({ ...DEFAULTS[initialType] })

watch(projectType, (newType) => {
  Object.keys(formData).forEach((key) => delete formData[key])
  Object.assign(formData, DEFAULTS[newType])
})

function updateFormData(newValue) {
  Object.assign(formData, newValue)
}

async function handleSubmit() {
  const result = await calculate(projectType.value, { ...formData })
  if (result) {
    router.push('/resultats')
  }
}

const typeInfo = getProjectType(projectType.value)
</script>

<template>
  <div class="section calculator-page">
    <div class="container calculator-layout">
      <div class="calculator-intro">
        <span class="eyebrow">Calculateur</span>
        <h1 class="section-title">Estimez votre projet</h1>
        <p class="section-sub">Choisissez le type de projet, renseignez les dimensions, et laissez le moteur de calcul faire le reste.</p>
      </div>

      <ProjectTypeSelector v-model="projectType" />

      <form class="card card--pad calculator-form" @submit.prevent="handleSubmit">
        <h2 class="calculator-form__title">{{ getProjectType(projectType)?.shortLabel }}</h2>
        <p class="calculator-form__desc">{{ getProjectType(projectType)?.description }}</p>

        <WallForm v-if="projectType === 'mur'" :model-value="formData" :field-error="fieldError" @update:model-value="updateFormData" />
        <SlabForm v-else-if="projectType === 'dalle'" :model-value="formData" :field-error="fieldError" @update:model-value="updateFormData" />
        <FoundationForm v-else-if="projectType === 'fondation'" :model-value="formData" :field-error="fieldError" @update:model-value="updateFormData" />
        <TerraceForm v-else-if="projectType === 'terrasse'" :model-value="formData" :field-error="fieldError" @update:model-value="updateFormData" />

        <p v-if="generalError" class="field-error calculator-form__error">{{ generalError }}</p>

        <button type="submit" class="btn btn--primary" :disabled="isCalculating">
          {{ isCalculating ? 'Calcul en cours…' : "Calculer l'estimation" }}
        </button>
      </form>

      <DisclaimerBanner />
    </div>
  </div>
</template>

<style scoped>
.calculator-layout {
  max-width: 760px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.calculator-intro .section-title {
  margin-bottom: 6px;
}

.calculator-form__title {
  font-size: 1.2rem;
  margin-bottom: 4px;
  color: var(--text-on-dark);
}

.calculator-form__desc {
  color: rgba(244, 243, 239, 0.8);
  font-size: 0.9rem;
  margin-bottom: 26px;
}

.calculator-form__error {
  margin-bottom: 16px;
  color: var(--color-red-dark);
}

.calculator-form :deep(label),
.calculator-form :deep(.field label),
.calculator-form :deep(.field .field-hint),
.calculator-form :deep(.field-error) {
  color: rgba(244, 243, 239, 0.9);
}

.calculator-form :deep(.field .field-hint) {
  color: rgba(244, 243, 239, 0.7);
}

.calculator-form :deep(.field label) {
  letter-spacing: 0.04em;
}
</style>

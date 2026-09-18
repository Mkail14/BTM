import { ref } from 'vue'
import { calculateProject, CalculationError } from '../services/calculations/calculationEngine.js'
import { setCurrentCalculation } from '../services/storage/calculationStore.js'

/**
 * Composable utilisé par la vue Calculateur : encapsule l'appel au moteur de
 * calcul et expose un état réactif (erreurs par champ, erreur générale,
 * chargement) directement exploitable par les formulaires.
 */
export function useCalculator() {
  const isCalculating = ref(false)
  const fieldErrors = ref([])
  const generalError = ref('')

  function fieldError(fieldName) {
    return fieldErrors.value.find((error) => error.field === fieldName)?.message || ''
  }

  async function calculate(projectTypeId, formData) {
    generalError.value = ''
    fieldErrors.value = []
    isCalculating.value = true

    try {
      const result = await calculateProject(projectTypeId, formData)
      setCurrentCalculation(result)
      return result
    } catch (error) {
      if (error instanceof CalculationError) {
        fieldErrors.value = error.fieldErrors
      } else {
        generalError.value = error.message || 'Une erreur est survenue pendant le calcul.'
      }
      return null
    } finally {
      isCalculating.value = false
    }
  }

  return { isCalculating, fieldErrors, generalError, fieldError, calculate }
}

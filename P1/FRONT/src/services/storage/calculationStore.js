import { reactive, readonly } from 'vue'

/**
 * Petit store réactif (pas besoin de Pinia pour un seul état partagé) qui
 * conserve le dernier résultat calculé le temps de la session, pour pouvoir
 * naviguer Calculateur → Résultats, et retrouver le résultat après un
 * rafraîchissement de page (sessionStorage, pas de vraie persistance serveur).
 */
const SESSION_KEY = 'btm.currentCalculation'

const state = reactive({
  result: loadFromSession()
})

function loadFromSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setCurrentCalculation(result) {
  state.result = result
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(result))
  } catch {
    // sessionStorage indisponible (navigation privée, quota...) — on continue
    // sans persistance, le résultat reste disponible pour la session en cours.
  }
}

export function clearCurrentCalculation() {
  state.result = null
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // ignoré
  }
}

export const calculationStore = readonly(state)

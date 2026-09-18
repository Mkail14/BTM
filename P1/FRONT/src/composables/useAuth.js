import { ref } from 'vue'
import * as authService from '../services/auth/authService.js'

// État module-level : partagé par tous les composants qui appellent useAuth(),
// pour que le header reflète l'état de connexion sans store dédié (Pinia).
const currentUser = ref(authService.getCurrentUser())

export function useAuth() {
  function login(credentials) {
    const user = authService.login(credentials)
    currentUser.value = user
    return user
  }

  function register(data) {
    const user = authService.register(data)
    currentUser.value = user
    return user
  }

  function logout() {
    authService.logout()
    currentUser.value = null
  }

  return { currentUser, login, register, logout }
}

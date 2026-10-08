/**
 * useThemeAdmin — thème clair / sombre de l'espace admin, mémorisé sur l'appareil.
 * Le thème sombre redéfinit les jetons --adm-* (admin.css) ; le site public n'est pas concerné.
 */
import { ref } from 'vue'

const CLE = 'btm-admin-theme'
// stockage indisponible (navigation privée, réglages) : le thème reste clair et le choix vaut pour la visite
const lire = () => { try { return localStorage.getItem(CLE) } catch { return null } }

const sombre = ref(lire() === 'sombre')

function basculer() {
  sombre.value = !sombre.value
  try { localStorage.setItem(CLE, sombre.value ? 'sombre' : 'clair') } catch { /* choix non mémorisé */ }
}

export function useThemeAdmin() {
  return { sombre, basculer }
}

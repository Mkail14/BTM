/**
 * useTheme — thème clair / sombre de tout le site (bouton lune / soleil de l'en-tête), mémorisé sur l'appareil.
 * Le thème est posé sur <html data-theme="sombre"> : style.css y redéfinit les jetons de couleur du site,
 * admin.css ceux de l'admin et de l'espace fournisseur (classe .adm-sombre).
 * Sans choix enregistré : thème clair (le visiteur passe en sombre s'il le souhaite). public/theme.js pose le thème avant
 * le premier affichage, pour éviter un éclair blanc au chargement.
 */
import { ref, watch } from 'vue'

const CLE = 'btm-theme'
const ANCIENNE_CLE = 'btm-admin-theme' // thème de l'admin, avant le thème du site
// stockage indisponible (navigation privée, réglages) : le choix vaut pour la visite
const lire = () => { try { return localStorage.getItem(CLE) || localStorage.getItem(ANCIENNE_CLE) } catch { return null } }

const choix = lire()
const sombre = ref(choix === 'sombre') // par défaut : clair

function appliquer(v) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = v ? 'sombre' : 'clair'
  document.documentElement.style.colorScheme = v ? 'dark' : 'light'
}
appliquer(sombre.value)
watch(sombre, appliquer)

function basculer() {
  sombre.value = !sombre.value
  try { localStorage.setItem(CLE, sombre.value ? 'sombre' : 'clair') } catch { /* choix non mémorisé */ }
}

export function useTheme() {
  return { sombre, basculer }
}

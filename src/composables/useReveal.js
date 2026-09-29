/** useReveal — animations d'apparition au défilement via IntersectionObserver */
import { onMounted, onBeforeUnmount } from 'vue'

export function useReveal(selecteur = '.reveal', racine = null) {
  let observateur
  onMounted(() => {
    const cible = racine?.value || document
    const elements = cible.querySelectorAll(selecteur)
    if (!('IntersectionObserver' in window)) { elements.forEach((e) => e.classList.add('visible')); return }
    observateur = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('visible'); observateur.unobserve(e.target) } })
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' })
    elements.forEach((e) => observateur.observe(e))
  })
  onBeforeUnmount(() => observateur?.disconnect())
}

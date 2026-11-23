/**
 * useReveal — animations d'apparition au défilement via IntersectionObserver.
 * Un élément apparu reçoit la classe .visible et l'attribut data-vu. Vue réécrit les classes des liens
 * (router-link : classe « actif » à chaque changement de page) et effacerait .visible : l'attribut, lui,
 * n'est jamais touché, et style.css l'affiche aussi. Sans lui, les cartes de l'accueil disparaissaient au retour
 * depuis une autre page (accueil gardé en mémoire).
 */
import { onMounted, onBeforeUnmount } from 'vue'

const reveler = (el) => { el.classList.add('visible'); el.setAttribute('data-vu', '') }

export function useReveal(selecteur = '.reveal', racine = null) {
  let observateur
  onMounted(() => {
    const cible = racine?.value || document
    const elements = cible.querySelectorAll(selecteur)
    if (!('IntersectionObserver' in window)) { elements.forEach(reveler); return }
    observateur = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { reveler(e.target); observateur.unobserve(e.target) } })
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' })
    elements.forEach((e) => observateur.observe(e))
  })
  onBeforeUnmount(() => observateur?.disconnect())
}

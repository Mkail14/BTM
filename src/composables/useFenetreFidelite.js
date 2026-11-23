/**
 * useFenetreFidelite — fenêtre « Fidélité BTM » (FenetreFidelite.vue, affichée par App.vue),
 * ouverte d'un clic sur le crédit à côté du nom dans l'entête.
 */
import { reactive } from 'vue'

const etat = reactive({ ouverte: false })

export function ouvrirFidelite() {
  etat.ouverte = true
}
export function fermerFidelite() {
  etat.ouverte = false
}
export function useFenetreFidelite() {
  return { etat, ouvrirFidelite, fermerFidelite }
}

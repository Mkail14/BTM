/**
 * useInscriptionFournisseur — fenêtre « Devenir partenaire » (InscriptionFournisseur.vue, affichée par App.vue).
 * Ouverte depuis la page d'attente, le pied de page… ; en mode « correction », elle reprend la demande du compte
 * connecté (après une demande de rectification de BTM) sans repasser par la création du compte.
 */
import { reactive } from 'vue'

const etat = reactive({ ouverte: false, correction: null })

export function ouvrirInscriptionFournisseur(demande = null) {
  Object.assign(etat, { ouverte: true, correction: demande })
}
export function fermerInscriptionFournisseur() {
  etat.ouverte = false
}
export function useInscriptionFournisseur() {
  return { etat, ouvrirInscriptionFournisseur, fermerInscriptionFournisseur }
}

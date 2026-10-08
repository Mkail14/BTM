/**
 * useCreditFidelite — crédit fidélité du compte connecté, partagé entre l'entête (à côté du nom)
 * et « Mes projets » (détail des derniers mouvements). Rechargé à chaque changement de compte.
 */
import { ref } from 'vue'
import { lireCreditFidelite } from '@/services/supabase/serviceProjets.js'
import { useAuth, surChangementCompte } from '@/composables/useAuth.js'

const VIDE = { solde: 0, mouvements: [] }
const credit = ref(VIDE)
let enCours = null

function charger() {
  if (!useAuth().utilisateur.value) { credit.value = VIDE; return Promise.resolve() }
  // plusieurs demandes rapprochées (entête + page) : une seule lecture
  enCours ??= lireCreditFidelite().then((c) => { credit.value = c }).finally(() => { enCours = null })
  return enCours
}

surChangementCompte(() => charger())

export function useCreditFidelite() {
  return { credit, charger }
}

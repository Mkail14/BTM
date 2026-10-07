/**
 * useMesRealisations — propositions de publication reçues par l'utilisateur connecté (réalisations de l'accueil).
 * État partagé : l'en-tête affiche une pastille sur « Mes projets » tant qu'une proposition attend sa réponse.
 */
import { computed, ref } from 'vue'
import { mesRealisations } from '@/services/supabase/serviceRealisations.js'
import { surChangementCompte } from '@/composables/useAuth.js'

const liste = ref([])
let enCours = null

surChangementCompte(() => { liste.value = [] })

async function charger() {
  enCours ||= mesRealisations().then((l) => { liste.value = l }).finally(() => { enCours = null })
  return enCours
}
/** remplace une ligne après une réponse (envoi, refus) */
function remplacer(ligne) {
  liste.value = liste.value.map((r) => (r.id === ligne.id ? ligne : r))
}

const enAttente = computed(() => liste.value.filter((r) => r.statut === 'proposee').length)

export function useMesRealisations() {
  return { liste, charger, remplacer, enAttente }
}

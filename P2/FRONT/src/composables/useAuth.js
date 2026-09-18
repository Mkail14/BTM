/** useAuth — état d'authentification Supabase (optionnel) */
import { ref, computed } from 'vue'
import { supabaseConfigure } from '@/services/supabase/client.js'
import * as auth from '@/services/supabase/serviceAuth.js'

const utilisateur = ref(null)
const pret = ref(false)
let initialise = false

export function useAuth() {
  if (!initialise) {
    initialise = true
    auth.utilisateurCourant().then((u) => { utilisateur.value = u; pret.value = true })
    auth.surChangementAuth((u) => { utilisateur.value = u })
  }
  const connecte = computed(() => !!utilisateur.value)
  return {
    utilisateur, connecte, pret, backendDisponible: supabaseConfigure,
    connexion: auth.connexion, inscription: auth.inscription,
    deconnexion: async () => { await auth.deconnexion(); utilisateur.value = null }
  }
}

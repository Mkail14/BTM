/** useAuth — état d'authentification Supabase (optionnel) */
import { ref, computed, watch } from 'vue'
import { supabaseConfigure } from '@/services/supabase/client.js'
import * as auth from '@/services/supabase/serviceAuth.js'
import { estAdmin } from '@/services/supabase/serviceAdmin.js'

const utilisateur = ref(null)
const pret = ref(false)
const admin = ref(false)
let initialise = false

export function useAuth() {
  if (!initialise) {
    initialise = true
    auth.utilisateurCourant().then((u) => { utilisateur.value = u; pret.value = true })
    auth.surChangementAuth((u) => { utilisateur.value = u })
    // rôle admin (contrôlé côté base : ce booléen ne sert qu'à afficher le lien)
    watch(utilisateur, async (u) => { admin.value = u ? await estAdmin(u.id) : false }, { immediate: true })
  }
  const connecte = computed(() => !!utilisateur.value)
  return {
    utilisateur, connecte, pret, admin, backendDisponible: supabaseConfigure,
    connexion: auth.connexion, inscription: auth.inscription,
    mettreAJourProfil: auth.mettreAJourProfil, supprimerCompte: auth.supprimerCompte,
    deconnexion: async () => { await auth.deconnexion(); utilisateur.value = null }
  }
}

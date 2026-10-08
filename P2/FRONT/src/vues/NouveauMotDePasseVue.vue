<script setup>
/**
 * Arrivée par le lien de l'e-mail « réinitialiser le mot de passe » (lien de secours, ou envoyé par un admin).
 * Pas de page à part : Supabase ouvre une session temporaire à partir du lien, puis la fenêtre de connexion du site
 * s'ouvre par-dessus l'accueil sur « Nouveau mot de passe » — la même fenêtre que le parcours par code.
 * Lien expiré ou déjà utilisé : la fenêtre propose de recevoir un nouveau code.
 * Deux formes de lien sont acceptées : celle de Supabase (#access_token=…) et un lien direct « ?token_hash=… ».
 */
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase, supabaseConfigure } from '@/services/supabase/client.js'
import { ouvrirAuth } from '@/composables/useFenetreAuth.js'

const route = useRoute()
const router = useRouter()

onMounted(async () => {
  let session = null
  if (supabaseConfigure) {
    // lien direct d'un gabarit d'e-mail personnalisé : le jeton est échangé ici contre la session
    const jeton = typeof route.query.token_hash === 'string' ? route.query.token_hash : ''
    if (jeton) await supabase.auth.verifyOtp({ token_hash: jeton, type: 'recovery' }).catch(() => {})
    // laisse à Supabase le temps de lire le lien (#access_token=…) et d'ouvrir la session
    for (let i = 0; i < 10 && !session; i++) {
      session = (await supabase.auth.getSession()).data.session
      if (!session) await new Promise((r) => setTimeout(r, 300))
    }
  }
  ouvrirAuth('connexion', session ? { parLien: true } : { lienExpire: true })
  // le site en fond (un admin est conduit à son espace par le routeur) ; la fenêtre reste ouverte par-dessus
  router.replace('/')
})
</script>

<template>
  <div class="nmdp-attente" role="status" aria-live="polite">
    <span class="spinner spinner-grand" aria-hidden="true"></span>
    <p>Ouverture de votre lien…</p>
  </div>
</template>

<style scoped>
.nmdp-attente { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; min-height: 70vh; color: var(--texte-secondaire); }
</style>

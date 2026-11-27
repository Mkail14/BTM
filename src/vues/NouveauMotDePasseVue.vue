<script setup>
/**
 * Ancienne adresse des liens « réinitialiser le mot de passe » (e-mails déjà envoyés, favoris).
 * La réinitialisation se fait maintenant par un code à 6 chiffres : la fenêtre de connexion s'ouvre
 * sur « Mot de passe oublié », par-dessus l'accueil.
 */
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ouvrirAuth } from '@/composables/useFenetreAuth.js'

const router = useRouter()

onMounted(() => {
  ouvrirAuth('connexion', { oubli: true })
  router.replace('/')
})
</script>

<template>
  <div></div>
</template>

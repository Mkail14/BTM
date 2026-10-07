<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FenetreConnexion from '@/composants/commun/FenetreConnexion.vue'

const props = defineProps({
  mode: { type: String, default: 'connexion' },
  redirect: { type: String, default: null },
  suspendu: { type: String, default: null },
  profil: { type: String, default: null }
})

const route = useRoute()
const router = useRouter()

const mode = computed(() => props.mode || (route.name === 'inscription' ? 'inscription' : 'connexion'))
const redirection = computed(() => props.redirect ?? (typeof route.query.redirect === 'string' ? route.query.redirect : null))
const suspendu = computed(() => props.suspendu ?? (typeof route.query.suspendu === 'string' ? route.query.suspendu : null))
const profil = computed(() => props.profil ?? (typeof route.query.profil === 'string' ? route.query.profil : null))

function fermer() {
  if (window.history.length > 1) {
    router.back()
    return
  }
  router.push(redirection.value || '/')
}

function changerMode(nouveauMode) {
  const routeCible = nouveauMode === 'inscription' ? 'inscription' : 'connexion'
  const query = { ...route.query }
  delete query.connexion
  delete query.inscription
  const cible = { name: routeCible }

  if (redirection.value) query.redirect = redirection.value
  if (suspendu.value) query.suspendu = suspendu.value
  if (profil.value) query.profil = profil.value

  if (Object.keys(query).length) cible.query = query
  router.push(cible)
}
</script>

<template>
  <FenetreConnexion
    :mode="mode"
    :redirect="redirection"
    :suspendu="suspendu"
    :profil="profil"
    @fermer="fermer"
    @changer-mode="changerMode"
  />
</template>

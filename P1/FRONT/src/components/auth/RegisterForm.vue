<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth.js'
import { AuthError } from '../../services/auth/authService.js'

const router = useRouter()
const { register } = useAuth()

const form = reactive({ name: '', email: '', password: '', confirmPassword: '' })
const errorMessage = ref('')
const isSubmitting = ref(false)

function handleSubmit() {
  errorMessage.value = ''

  if (!form.name || !form.email || !form.password) {
    errorMessage.value = 'Merci de remplir tous les champs.'
    return
  }
  if (form.password.length < 6) {
    errorMessage.value = 'Le mot de passe doit contenir au moins 6 caractères.'
    return
  }
  if (form.password !== form.confirmPassword) {
    errorMessage.value = 'Les mots de passe ne correspondent pas.'
    return
  }

  isSubmitting.value = true
  try {
    const user = register({ name: form.name, email: form.email, password: form.password })
    const isAdmin = user?.role === 'admin' || user?.email === 'admin@btm.local'
    router.push(isAdmin ? '/admin' : '/dashboard')
  } catch (error) {
    errorMessage.value = error instanceof AuthError ? error.message : 'Inscription impossible.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <form class="auth-form" @submit.prevent="handleSubmit">
    <div class="field">
      <label for="register-name">Nom</label>
      <input id="register-name" v-model="form.name" type="text" autocomplete="name" placeholder="Votre nom" />
    </div>

    <div class="field">
      <label for="register-email">E-mail</label>
      <input id="register-email" v-model="form.email" type="email" autocomplete="email" placeholder="vous@exemple.com" />
    </div>

    <div class="field">
      <label for="register-password">Mot de passe</label>
      <input id="register-password" v-model="form.password" type="password" autocomplete="new-password" placeholder="6 caractères minimum" />
    </div>

    <div class="field">
      <label for="register-confirm">Confirmer le mot de passe</label>
      <input id="register-confirm" v-model="form.confirmPassword" type="password" autocomplete="new-password" placeholder="••••••••" />
    </div>

    <p v-if="errorMessage" class="field-error">{{ errorMessage }}</p>

    <button type="submit" class="btn btn--primary btn--block" :disabled="isSubmitting">
      {{ isSubmitting ? 'Création du compte…' : 'Créer mon compte' }}
    </button>
  </form>
</template>

<style scoped>
.auth-form {
  display: flex;
  flex-direction: column;
}
</style>

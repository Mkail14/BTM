<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth.js'
import { AuthError } from '../../services/auth/authService.js'

const router = useRouter()
const { login } = useAuth()

const form = reactive({ email: '', password: '' })
const errorMessage = ref('')
const isSubmitting = ref(false)

function handleSubmit() {
  errorMessage.value = ''

  if (!form.email || !form.password) {
    errorMessage.value = 'Merci de renseigner votre e-mail et votre mot de passe.'
    return
  }

  isSubmitting.value = true
  try {
    const user = login({ email: form.email, password: form.password })
    const isAdmin = user?.role === 'admin' || user?.email === 'admin@btm.local'
    router.push(isAdmin ? '/admin' : '/dashboard')
  } catch (error) {
    errorMessage.value = error instanceof AuthError ? error.message : 'Connexion impossible.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <form class="auth-form" @submit.prevent="handleSubmit">
    <div class="field">
      <label for="login-email">E-mail</label>
      <input id="login-email" v-model="form.email" type="email" autocomplete="email" placeholder="vous@exemple.com" />
    </div>

    <div class="field">
      <label for="login-password">Mot de passe</label>
      <input id="login-password" v-model="form.password" type="password" autocomplete="current-password" placeholder="••••••••" />
    </div>

    <p v-if="errorMessage" class="field-error">{{ errorMessage }}</p>

    <button type="submit" class="btn btn--primary btn--block" :disabled="isSubmitting">
      {{ isSubmitting ? 'Connexion…' : 'Se connecter' }}
    </button>
  </form>
</template>

<style scoped>
.auth-form {
  display: flex;
  flex-direction: column;
}
</style>

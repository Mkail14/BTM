<script setup>
import LoginForm from '../components/auth/LoginForm.vue'
import RegisterForm from '../components/auth/RegisterForm.vue'

const props = defineProps({
  mode: { type: String, default: 'login' }
})
</script>

<template>
  <div class="section auth-page">
    <div class="container auth-container">
      <div class="card card--pad auth-card">
        <div class="auth-tabs" role="tablist">
          <router-link
            to="/connexion"
            class="auth-tab"
            :class="{ 'auth-tab--active': props.mode === 'login' }"
          >
            Connexion
          </router-link>
          <router-link
            to="/inscription"
            class="auth-tab"
            :class="{ 'auth-tab--active': props.mode === 'register' }"
          >
            Inscription
          </router-link>
        </div>

        <h1 class="auth-title">
          {{ props.mode === 'login' ? 'Content de vous revoir' : 'Créer un compte' }}
        </h1>
        <p class="auth-sub">
          {{
            props.mode === 'login'
              ? 'Connectez-vous pour retrouver vos projets sauvegardés.'
              : 'Un compte vous permet de sauvegarder vos estimations d\'un appareil à l\'autre.'
          }}
        </p>

        <LoginForm v-if="props.mode === 'login'" />
        <RegisterForm v-else />

        <p class="auth-note">
          Compte local à cette application — aucune donnée n'est envoyée à un serveur pour le moment.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-container {
  display: flex;
  justify-content: center;
}

.auth-card {
  width: 100%;
  max-width: 420px;
}

.auth-tabs {
  display: flex;
  gap: 4px;
  background: var(--color-paper-dim);
  padding: 4px;
  border-radius: var(--radius-sm);
  margin-bottom: 26px;
}

.auth-tab {
  flex: 1;
  text-align: center;
  padding: 9px;
  border-radius: 4px;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-on-light-dim);
}

.auth-tab--active {
  background: var(--color-black);
  color: var(--color-yellow);
}

.auth-title {
  font-size: 1.4rem;
  margin-bottom: 6px;
}

.auth-sub {
  color: var(--text-on-light-dim);
  font-size: 0.9rem;
  margin-bottom: 24px;
}

.auth-note {
  margin: 18px 0 0;
  font-size: 0.78rem;
  color: var(--color-concrete);
  text-align: center;
}
</style>

<script setup>
/**
 * Mot de passe temporaire (compte créé ou réinitialisé par le script « npm run admin:reset ») :
 * l'API refuse toute autre action tant qu'un nouveau mot de passe n'est pas choisi (MOT_DE_PASSE_A_CHANGER).
 * Cette fenêtre recouvre le site et ne se ferme qu'une fois le mot de passe changé (ou en se déconnectant).
 */
import { computed, ref } from 'vue'
import { changerMotDePasse } from '@/services/api/serviceAuth.js'
import { useAuth } from '@/composables/useAuth.js'
import SaisieMotDePasse from './SaisieMotDePasse.vue'

const { utilisateur, deconnexion } = useAuth()
const actuel = ref('')
const nouveau = ref('')
const confirmation = ref('')
const erreur = ref('')
const envoi = ref(false)

// RG02 : 8 caractères au moins, une majuscule, une minuscule et un chiffre
const robuste = computed(() => nouveau.value.length >= 8 && /\p{Lu}/u.test(nouveau.value) && /\p{Ll}/u.test(nouveau.value) && /[0-9]/.test(nouveau.value))

async function valider() {
  erreur.value = !actuel.value ? 'Saisissez le mot de passe temporaire.'
    : !robuste.value ? 'Le nouveau mot de passe doit contenir au moins 8 caractères, dont une majuscule, une minuscule et un chiffre.'
      : nouveau.value !== confirmation.value ? 'Les deux mots de passe ne correspondent pas.'
        : nouveau.value === actuel.value ? 'Choisissez un mot de passe différent du mot de passe temporaire.' : ''
  if (erreur.value) return
  envoi.value = true
  try {
    await changerMotDePasse(nouveau.value, actuel.value)
    // les pages déjà ouvertes avaient été refusées par l'API : on les recharge avec le nouveau mot de passe
    window.location.reload()
  } catch (e) {
    erreur.value = e?.message || 'Changement impossible.'
    envoi.value = false
  }
}
</script>

<template>
  <div class="mdp-obligatoire" role="dialog" aria-modal="true" aria-labelledby="mdp-obligatoire-titre">
    <form class="carte" novalidate @submit.prevent="valider">
      <span class="icone" aria-hidden="true"><i class="fa-solid fa-key"></i></span>
      <h2 id="mdp-obligatoire-titre">Choisissez votre mot de passe</h2>
      <p>
        Vous êtes connecté à <strong>{{ utilisateur?.email }}</strong> avec un mot de passe temporaire.
        Choisissez votre propre mot de passe pour continuer.
      </p>
      <label for="mdp-temporaire">Mot de passe temporaire</label>
      <SaisieMotDePasse id="mdp-temporaire" v-model="actuel" autocomplete="current-password" />
      <label for="mdp-nouveau">Nouveau mot de passe</label>
      <SaisieMotDePasse id="mdp-nouveau" v-model="nouveau" autocomplete="new-password" />
      <small :class="{ ok: robuste }">8 caractères au moins, avec une majuscule, une minuscule et un chiffre.</small>
      <label for="mdp-confirmation">Confirmez le nouveau mot de passe</label>
      <SaisieMotDePasse id="mdp-confirmation" v-model="confirmation" autocomplete="new-password" />
      <p v-if="erreur" class="erreur" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ erreur }}</p>
      <button type="submit" class="valider" :disabled="envoi">{{ envoi ? 'Enregistrement…' : 'Enregistrer mon mot de passe' }}</button>
      <button type="button" class="sortir" :disabled="envoi" @click="deconnexion">Se déconnecter</button>
    </form>
  </div>
</template>

<style scoped>
.mdp-obligatoire {
  position: fixed; inset: 0; z-index: 2000; display: grid; place-items: center; padding: 20px;
  background: rgba(13, 13, 13, .72); backdrop-filter: blur(4px);
}
.carte {
  width: min(440px, 100%); max-height: calc(100dvh - 40px); overflow-y: auto; /* petit écran : la fenêtre défile */
  display: flex; flex-direction: column; gap: 8px; padding: 28px;
  background: #fff; color: #1f2933; border-radius: 16px; box-shadow: 0 20px 60px rgba(0, 0, 0, .35);
}
.icone { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 50%; background: #f1ede4; font-size: 20px; }
h2 { margin: 4px 0 0; font-size: 1.35rem; }
p { margin: 0 0 8px; line-height: 1.5; }
label { margin-top: 6px; font-weight: 600; font-size: .92rem; }
:deep(input) { width: 100%; padding: 12px 14px; border: 1px solid #d6d1c6; border-radius: 10px; font-size: 1rem; }
small { color: #6b7280; }
small.ok { color: #2f7d32; }
.erreur { margin: 6px 0 0; color: #b42318; }
.valider { margin-top: 12px; padding: 13px; border: 0; border-radius: 10px; background: #111; color: #fff; font-weight: 700; cursor: pointer; }
.sortir { padding: 10px; border: 0; background: transparent; color: #6b7280; cursor: pointer; text-decoration: underline; }
.valider:disabled, .sortir:disabled { opacity: .6; cursor: wait; }
</style>

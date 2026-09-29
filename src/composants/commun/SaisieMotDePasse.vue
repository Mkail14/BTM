<script setup>
/** Champ mot de passe avec bouton « afficher / masquer ». Les attributs (id, autocomplete, …) passent à l'input. */
import { ref } from 'vue'

defineOptions({ inheritAttrs: false })
defineProps({ modelValue: { type: String, default: '' } })
defineEmits(['update:modelValue'])

const visible = ref(false)
</script>

<template>
  <div class="mdp">
    <input v-bind="$attrs" :type="visible ? 'text' : 'password'" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />
    <button type="button" class="mdp-oeil" :aria-label="visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'" :aria-pressed="visible" @click="visible = !visible">
      <i :class="visible ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'" aria-hidden="true"></i>
    </button>
  </div>
</template>

<style scoped>
.mdp { position: relative; display: flex; align-items: center; width: 100%; }
.mdp input { padding-right: 48px; font-family: var(--font-corps); }
.mdp-oeil {
  position: absolute; right: 4px; top: 50%; transform: translateY(-50%); width: 40px; height: 40px; display: grid; place-items: center;
  border: 0; border-radius: var(--rayon-sm); background: transparent; color: var(--gris-400); cursor: pointer; transition: color var(--transition), background var(--transition);
}
.mdp-oeil:hover { color: var(--lagon-600); background: rgba(6, 182, 212, .1); }
.mdp-oeil:focus-visible { outline: 2px solid var(--lagon-500); outline-offset: -2px; }
</style>

<script setup>
import { typesProjets } from '@/donnees/typesProjets.js'
import Maquette3D from './Maquette3D.vue'
defineProps({ modelValue: { type: String, default: '' } })
const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <fieldset class="selecteur" id="selecteur-type-projet">
    <legend class="visually-hidden">Type de projet</legend>
    <div class="selecteur-grille">
      <label
        v-for="t in typesProjets" :key="t.id"
        class="selecteur-option" :class="{ actif: modelValue === t.id }"
      >
        <input type="radio" name="type-projet" :value="t.id" :checked="modelValue === t.id" class="visually-hidden" @click="emit('update:modelValue', t.id)" />
        <span class="selecteur-scene"><Maquette3D :type="t.id" compacte /></span>
        <span class="selecteur-libelle">{{ t.libelle }}</span>
        <span class="selecteur-desc">{{ t.description }}</span>
        <i class="fa-solid fa-circle-check selecteur-coche" aria-hidden="true"></i>
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.selecteur { border: none; padding: 0; margin: 0; min-width: 0; }
.selecteur-grille { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
.selecteur-option {
  position: relative; display: flex; flex-direction: column; gap: 6px; padding: 14px 16px 20px; cursor: pointer;
  background: var(--blanc); border: 2px solid var(--bordure); border-radius: var(--rayon-lg); text-align: center;
  transition: transform var(--transition), border-color var(--transition), box-shadow var(--transition);
}
.selecteur-option:hover { transform: translateY(-4px); border-color: var(--lagon-300); box-shadow: var(--ombre); }
.selecteur-option:has(input:focus-visible) { outline: 3px solid var(--lagon-400); outline-offset: 2px; }
.selecteur-option.actif { border-color: var(--lagon-600); box-shadow: var(--ombre); }
.selecteur-scene { display: block; height: 170px; margin: 0 -6px 4px; border-radius: var(--rayon); background: radial-gradient(circle at 50% 60%, var(--lagon-50), transparent 70%); }
.selecteur-libelle { font-family: var(--font-display); font-size: 1.5rem; font-weight: 700; color: var(--ardoise); }
.selecteur-desc { font-size: .88rem; color: var(--texte-secondaire); line-height: 1.45; }
.selecteur-coche { position: absolute; top: 12px; right: 12px; color: var(--lagon-700); font-size: 1.3rem; opacity: 0; transform: scale(.5); transition: all var(--transition); }
.actif .selecteur-coche { opacity: 1; transform: scale(1); }
</style>

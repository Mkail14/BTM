<script setup>
import { typesProjets } from '@/donnees/typesProjets.js'
const props = defineProps({ modelValue: { type: String, default: '' } })
const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <fieldset class="selecteur" id="selecteur-type-projet">
    <legend class="selecteur-legende">1. Choisissez votre type de projet</legend>
    <div class="grille grille-4">
      <label
        v-for="t in typesProjets" :key="t.id"
        class="selecteur-option" :class="{ actif: modelValue === t.id }" :style="{ '--couleur': t.couleur }"
      >
        <input type="radio" name="type-projet" :value="t.id" :checked="modelValue === t.id" class="visually-hidden" @change="emit('update:modelValue', t.id)" />
        <span class="selecteur-icone"><i :class="t.icone" aria-hidden="true"></i></span>
        <span class="selecteur-libelle">{{ t.libelle }}</span>
        <span class="selecteur-desc">{{ t.description }}</span>
        <i class="fa-solid fa-circle-check selecteur-coche" aria-hidden="true"></i>
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.selecteur { border: none; padding: 0; margin: 0; }
.selecteur-legende { font-family: var(--font-display); font-size: 1.5rem; font-weight: 700; color: var(--ardoise); margin-bottom: 18px; }
.selecteur-option {
  position: relative; display: flex; flex-direction: column; gap: 8px; padding: 22px 20px; cursor: pointer;
  background: var(--blanc); border: 2px solid var(--bordure); border-radius: var(--rayon-lg);
  transition: transform var(--transition), border-color var(--transition), box-shadow var(--transition);
}
.selecteur-option:hover { transform: translateY(-3px); border-color: var(--lagon-300); box-shadow: var(--ombre); }
.selecteur-option:has(input:focus-visible) { outline: 3px solid var(--lagon-400); outline-offset: 2px; }
.selecteur-option.actif { border-color: var(--ardoise); box-shadow: var(--ombre); }
.selecteur-icone {
  width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; font-size: 1.4rem;
  background: var(--beton-clair); color: var(--ardoise-3); transition: background var(--transition), color var(--transition);
}
.actif .selecteur-icone { background: var(--ardoise); color: var(--lagon-300); }
.selecteur-libelle { font-family: var(--font-display); font-size: 1.4rem; font-weight: 700; color: var(--ardoise); }
.selecteur-desc { font-size: .85rem; color: var(--texte-secondaire); line-height: 1.45; }
.selecteur-coche { position: absolute; top: 14px; right: 14px; color: var(--lagon-700); font-size: 1.3rem; opacity: 0; transform: scale(.5); transition: all var(--transition); }
.actif .selecteur-coche { opacity: 1; transform: scale(1); }
</style>

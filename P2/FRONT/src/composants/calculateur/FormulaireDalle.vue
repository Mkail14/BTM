<script setup>
/** Formulaire Dalle — champs définis dans donnees/typesProjets.js ('dalle') */
import ChampDimension from './ChampDimension.vue'
import { trouverTypeProjet } from '@/donnees/typesProjets.js'
const props = defineProps({ dimensions: { type: Object, required: true }, erreurs: { type: Object, default: () => ({}) } })
const emit = defineEmits(['update', 'blur'])
const type = trouverTypeProjet('dalle')
</script>

<template>
  <div class="formulaire-grille formulaire-dalle">
    <ChampDimension
      v-for="c in type.champs" :key="c.nom" :champ="c"
      :model-value="dimensions[c.nom] ?? ''" :erreur="erreurs[c.nom]"
      @update:model-value="emit('update', { [c.nom]: $event })" @blur="emit('blur', $event)"
    />
  </div>
</template>

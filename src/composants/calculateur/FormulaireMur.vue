<script setup>
/** Formulaire Mur — champs définis dans donnees/typesProjets.js ('mur'), un bloc par mur ajouté */
import { computed } from 'vue'
import ChampDimension from './ChampDimension.vue'
import { trouverTypeProjet } from '@/donnees/typesProjets.js'
const props = defineProps({ dimensions: { type: Object, required: true }, erreurs: { type: Object, default: () => ({}) } })
const emit = defineEmits(['update', 'blur', 'retirer-mur'])
const type = trouverTypeProjet('mur')
const autresMurs = computed(() => props.dimensions.autresMurs || [])

function modifierAutreMur(index, nom, valeur) {
  const murs = autresMurs.value.map((m, i) => (i === index ? { ...m, [nom]: valeur } : m))
  emit('update', { autresMurs: murs })
}
</script>

<template>
  <div class="formulaire-murs">
    <fieldset class="formulaire-mur-bloc" :class="{ 'formulaire-mur-multiple': autresMurs.length }">
      <legend v-if="autresMurs.length">Mur 1</legend>
      <div class="formulaire-grille formulaire-mur">
        <ChampDimension
          v-for="c in type.champs" :key="c.nom" :champ="c"
          :model-value="dimensions[c.nom] ?? ''" :erreur="erreurs[c.nom]"
          @update:model-value="emit('update', { [c.nom]: $event })" @blur="emit('blur', $event)"
        />
      </div>
    </fieldset>

    <fieldset v-for="(mur, index) in autresMurs" :key="index" class="formulaire-mur-bloc formulaire-mur-multiple">
      <legend>Mur {{ index + 2 }}</legend>
      <button type="button" class="formulaire-mur-retirer" :aria-label="`Retirer le mur ${index + 2}`" @click="emit('retirer-mur', index)">
        <i class="fa-solid fa-trash-can" aria-hidden="true"></i> Retirer
      </button>
      <div class="formulaire-grille formulaire-mur">
        <ChampDimension
          v-for="c in type.champs" :key="c.nom" :champ="c" :cle="`autresMurs.${index}.${c.nom}`"
          :model-value="mur[c.nom] ?? ''" :erreur="erreurs[`autresMurs.${index}.${c.nom}`]"
          @update:model-value="modifierAutreMur(index, c.nom, $event)" @blur="emit('blur', $event)"
        />
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.formulaire-murs { display: flex; flex-direction: column; gap: 16px; }
.formulaire-mur-bloc { position: relative; min-width: 0; margin: 0; padding: 0; border: 0; }
.formulaire-mur-multiple { padding: 18px; border: 1px solid var(--gris-200); border-radius: var(--rayon); background: var(--gris-50); }
.formulaire-mur-bloc legend { padding: 0 6px; margin-left: -6px; color: var(--ardoise); font-weight: 700; }
.formulaire-mur-retirer { position: absolute; top: 12px; right: 14px; padding: 4px 8px; border: 0; border-radius: var(--rayon-sm); background: transparent; color: var(--erreur); font-size: .82rem; font-weight: 600; cursor: pointer; }
.formulaire-mur-retirer:hover { background: var(--erreur-clair); }
</style>

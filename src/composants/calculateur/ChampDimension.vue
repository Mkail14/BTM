<script setup>
/** Champ numérique ou select générique, avec label, unité, aide et message d'erreur (BNF05) */
const props = defineProps({
  champ: { type: Object, required: true },
  modelValue: { type: [String, Number], default: '' },
  erreur: { type: String, default: '' },
  cle: { type: String, default: '' } // clé d'erreur si différente du nom (ex. « autresMurs.0.longueur »)
})
const emit = defineEmits(['update:modelValue', 'blur'])
const cleChamp = props.cle || props.champ.nom
const id = `champ-${cleChamp}`
</script>

<template>
  <div class="champ">
    <label :for="id">{{ champ.label }} <span v-if="champ.optionnel" class="texte-secondaire">(optionnel)</span></label>
    <div class="champ-saisie">
      <select v-if="champ.type === 'select'" :id="id" :value="modelValue" :aria-invalid="!!erreur" @change="emit('update:modelValue', $event.target.value)">
        <option v-for="o in champ.options" :key="o.valeur" :value="o.valeur">{{ o.label }}</option>
      </select>
      <template v-else>
        <input
          :id="id" type="number" inputmode="decimal" :min="champ.min" :max="champ.max" :step="champ.pas"
          :placeholder="champ.placeholder" :value="modelValue" :aria-invalid="!!erreur"
          :aria-describedby="erreur ? `${id}-erreur` : champ.aide ? `${id}-aide` : undefined"
          :required="!champ.optionnel"
          @input="emit('update:modelValue', $event.target.value)" @blur="emit('blur', cleChamp)"
        />
        <span class="champ-unite">{{ champ.unite }}</span>
      </template>
    </div>
    <transition name="glisser">
      <p v-if="erreur" :id="`${id}-erreur`" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreur }}</p>
      <p v-else-if="champ.aide" :id="`${id}-aide`" class="champ-aide">{{ champ.aide }}</p>
    </transition>
  </div>
</template>

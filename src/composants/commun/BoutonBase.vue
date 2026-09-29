<script setup>
/**
 * BoutonBase — bouton ou lien (router-link / a) avec variantes du design system.
 * variantes : primaire | secondaire | ghost | sable | danger | blanc
 */
import { computed } from 'vue'

const props = defineProps({
  variante: { type: String, default: 'primaire' },
  taille: { type: String, default: '' },          // '' | 'sm'
  to: { type: [String, Object], default: null },   // router-link
  href: { type: String, default: null },           // lien externe
  type: { type: String, default: 'button' },
  bloc: Boolean,
  chargement: Boolean,
  disabled: Boolean,
  icone: { type: String, default: '' },
  iconeDroite: { type: String, default: '' }
})

// Seuls les attributs propres à chaque élément sont transmis : un `href: undefined` passé à
// router-link écraserait l'adresse qu'il calcule (lien sans href = ni clavier, ni nouvel onglet).
const attributs = computed(() => {
  if (props.to) return { to: props.to }
  if (props.href) return { href: props.href, target: '_blank', rel: 'noopener noreferrer' }
  return { type: props.type, disabled: props.disabled || props.chargement }
})
</script>

<template>
  <component
    :is="to ? 'router-link' : href ? 'a' : 'button'"
    v-bind="attributs"
    :aria-busy="chargement || undefined"
    class="btn"
    :class="[`btn-${variante}`, taille && `btn-${taille}`, { 'btn-bloc': bloc }]"
  >
    <span v-if="chargement" class="spinner" aria-hidden="true"></span>
    <i v-else-if="icone" :class="icone" aria-hidden="true"></i>
    <slot />
    <i v-if="iconeDroite && !chargement" :class="iconeDroite" aria-hidden="true"></i>
  </component>
</template>

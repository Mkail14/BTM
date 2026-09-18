<script setup>
/**
 * BoutonBase — bouton ou lien (router-link / a) avec variantes du design system.
 * variantes : primaire | secondaire | ghost | sable | danger | blanc
 */
defineProps({
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
</script>

<template>
  <component
    :is="to ? 'router-link' : href ? 'a' : 'button'"
    :to="to || undefined"
    :href="href || undefined"
    :target="href ? '_blank' : undefined"
    :rel="href ? 'noopener noreferrer' : undefined"
    :type="!to && !href ? type : undefined"
    :disabled="!to && !href ? disabled || chargement : undefined"
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

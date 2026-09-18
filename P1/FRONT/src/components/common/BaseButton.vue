<script setup>
defineProps({
  variant: { type: String, default: 'primary' }, // primary | violet | outline | outline-light | danger
  size: { type: String, default: 'md' }, // md | sm
  block: { type: Boolean, default: false },
  type: { type: String, default: 'button' },
  disabled: { type: Boolean, default: false },
  to: { type: String, default: null }
})

defineEmits(['click'])
</script>

<template>
  <component
    :is="to ? 'router-link' : 'button'"
    :to="to || undefined"
    :type="to ? undefined : type"
    :disabled="!to && disabled"
    class="btn"
    :class="[`btn--${variant}`, size === 'sm' && 'btn--sm', block && 'btn--block']"
    @click="$emit('click', $event)"
  >
    <slot />
  </component>
</template>

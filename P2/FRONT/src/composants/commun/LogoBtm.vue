<script setup>
defineProps({ taille: { type: Number, default: 40 } })
</script>

<template>
  <svg :width="taille" :height="taille" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" class="logo-btm">
    <rect x="2" y="2" width="60" height="60" rx="8" fill="#0f172a" />
    <!-- Mur de parpaings stylisé -->
    <g fill="#e2e8f0">
      <rect x="12" y="38" width="14" height="8" /><rect x="28" y="38" width="14" height="8" /><rect x="44" y="38" width="8" height="8" />
      <rect x="12" y="28" width="7" height="8" /><rect x="21" y="28" width="14" height="8" /><rect x="37" y="28" width="15" height="8" />
      <rect x="12" y="18" width="14" height="8" /><rect x="28" y="18" width="14" height="8" /><rect x="44" y="18" width="8" height="8" />
    </g>
    <!-- Niveau / ligne d'accent -->
    <rect x="10" y="48" width="44" height="3" fill="#0891b2" />
    <rect x="10" y="12" width="12" height="3" fill="#22d3ee" />
  </svg>
</template>

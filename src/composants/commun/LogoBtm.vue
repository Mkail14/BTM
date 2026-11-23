<script setup>
defineProps({ taille: { type: Number, default: 40 } })
</script>

<template>
  <!-- le « b » de BTM en noir (carte de Mayotte ajourée), sur un seul carré crème : lisible sur fond clair comme sur fond sombre -->
  <span class="logo-btm" :style="{ width: `${taille}px`, height: `${taille}px` }" aria-hidden="true">
    <img src="/logo-b-noir.png" alt="" />
  </span>
</template>

<style scoped>
.logo-btm { display: inline-grid; place-items: center; flex: none; border-radius: 26%; background: #f4e9db; }
.logo-btm img { width: 74%; height: 74%; object-fit: contain; }
</style>

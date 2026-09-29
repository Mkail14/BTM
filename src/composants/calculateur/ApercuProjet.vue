<script setup>
/** Petit schéma SVG animé du type de projet, pour rendre le formulaire plus concret */
defineProps({ type: { type: String, required: true } })
</script>

<template>
  <figure class="apercu" aria-hidden="true">
    <svg v-if="type === 'mur'" viewBox="0 0 200 120">
      <g fill="#cffafe" stroke="#0e7490" stroke-width="1.5">
        <rect v-for="r in 5" :key="'r'+r" x="10" :y="10 + (r-1)*20" width="180" height="20" />
        <line v-for="c in 4" :key="'c'+c" :x1="10 + c*36" y1="10" :x2="10 + c*36" y2="30" />
        <line v-for="c in 4" :key="'d'+c" :x1="28 + c*36" y1="30" :x2="28 + c*36" y2="50" />
        <line v-for="c in 4" :key="'e'+c" :x1="10 + c*36" y1="50" :x2="10 + c*36" y2="70" />
        <line v-for="c in 4" :key="'f'+c" :x1="28 + c*36" y1="70" :x2="28 + c*36" y2="90" />
        <line v-for="c in 4" :key="'g'+c" :x1="10 + c*36" y1="90" :x2="10 + c*36" y2="110" />
      </g>
      <rect x="70" y="30" width="60" height="50" fill="#0b3a4d" opacity=".85" rx="2" />
      <rect x="75" y="35" width="50" height="40" fill="#67e8f9" opacity=".6" />
      <text x="100" y="60" text-anchor="middle" fill="#fff" font-size="10" font-family="Inter">ouverture</text>
    </svg>
    <svg v-else-if="type === 'dalle'" viewBox="0 0 200 120">
      <polygon points="20,70 100,40 180,70 100,100" fill="#a5f3fc" stroke="#0e7490" stroke-width="1.5" />
      <polygon points="20,70 100,100 100,112 20,82" fill="#67e8f9" stroke="#0e7490" stroke-width="1.5" />
      <polygon points="100,100 180,70 180,82 100,112" fill="#22d3ee" stroke="#0e7490" stroke-width="1.5" />
      <g stroke="#0e7490" stroke-dasharray="3 3" stroke-width="1"><line x1="40" y1="62" x2="160" y2="62" /><line x1="60" y1="55" x2="140" y2="85" /><line x1="140" y1="55" x2="60" y2="85" /></g>
      <text x="100" y="30" text-anchor="middle" fill="#0e7490" font-size="10" font-family="Inter">ferraillage + béton</text>
    </svg>
    <svg v-else-if="type === 'fondation'" viewBox="0 0 200 120">
      <rect x="0" y="40" width="200" height="80" fill="#fde68a" opacity=".7" />
      <path d="M40 40 v50 h120 v-50" fill="#a5f3fc" stroke="#0e7490" stroke-width="1.5" />
      <g stroke="#0e7490" stroke-width="2"><line x1="55" y1="55" x2="145" y2="55" /><line x1="55" y1="75" x2="145" y2="75" /><line x1="70" y1="50" x2="70" y2="80" /><line x1="100" y1="50" x2="100" y2="80" /><line x1="130" y1="50" x2="130" y2="80" /></g>
      <text x="100" y="28" text-anchor="middle" fill="#0e7490" font-size="10" font-family="Inter">tranchée × profondeur</text>
    </svg>
    <svg v-else viewBox="0 0 200 120">
      <polygon points="20,70 100,40 180,70 100,100" fill="#fef3c7" stroke="#b45309" stroke-width="1.5" />
      <g stroke="#b45309" stroke-width="1" opacity=".7"><line x1="40" y1="62.5" x2="140" y2="100" /><line x1="60" y1="55" x2="160" y2="92" /><line x1="80" y1="47.5" x2="180" y2="85" /><line x1="60" y1="85" x2="140" y2="55" /><line x1="80" y1="92" x2="160" y2="62" /><line x1="40" y1="78" x2="120" y2="48" /></g>
      <polygon points="20,70 100,100 100,110 20,80" fill="#67e8f9" stroke="#0e7490" stroke-width="1.5" />
      <polygon points="100,100 180,70 180,80 100,110" fill="#22d3ee" stroke="#0e7490" stroke-width="1.5" />
      <circle cx="165" cy="22" r="10" fill="#fbbf24" /><path d="M150 25 q6 -8 14 0" stroke="#fff" fill="none" stroke-width="2" />
      <text x="100" y="30" text-anchor="middle" fill="#b45309" font-size="10" font-family="Inter">dalle + finition</text>
    </svg>
  </figure>
</template>

<style scoped>
.apercu { margin: 0; background: linear-gradient(180deg, var(--lagon-50), #fff); border: 1px solid var(--lagon-100); border-radius: var(--rayon); padding: 12px; }
.apercu svg { width: 100%; height: auto; animation: apparaitre .5s ease; }
</style>

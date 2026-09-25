<script setup>
import { computed } from 'vue'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'
const props = defineProps({ resultat: { type: Object, required: true } })
const parts = computed(() => {
  const t = props.resultat.total || 1
  return [
    { label: 'Matériaux', valeur: props.resultat.totalMateriaux, couleur: 'var(--lagon-500)' },
    { label: 'Main-d’œuvre', valeur: props.resultat.mainOeuvre.total, couleur: 'var(--sable-fonce)' },
    { label: 'Livraison', valeur: props.resultat.livraison, couleur: 'var(--lagon-800)' }
  ].map((p) => ({ ...p, pct: Math.round((p.valeur / t) * 100) }))
})
</script>

<template>
  <section class="budget" id="resume-budget" aria-labelledby="budget-titre">
    <div class="budget-halo" aria-hidden="true"></div>
    <p class="budget-surtitre" id="budget-titre"><i class="fa-solid fa-coins"></i> Coût total</p>
    <p class="budget-total prix">{{ formaterEuros(resultat.total) }}</p>
    <p class="budget-note">TTC — hors terrassement et études.</p>

    <div class="budget-barre" role="img" :aria-label="parts.map(p => `${p.label} ${p.pct} %`).join(', ')">
      <span v-for="p in parts" :key="p.label" :style="{ width: p.pct + '%', background: p.couleur }"></span>
    </div>
    <ul class="budget-legende">
      <li v-for="p in parts" :key="p.label">
        <span class="budget-puce" :style="{ background: p.couleur }"></span>
        <span class="budget-legende-label">{{ p.label }}</span>
        <span class="mono budget-legende-val">{{ formaterEuros(p.valeur) }} <small>({{ p.pct }} %)</small></span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.budget {
  position: relative; overflow: hidden; color: #fff; border-radius: var(--rayon-lg); padding: 28px;
  background: var(--ardoise); border: 1px solid var(--ardoise-2); box-shadow: var(--ombre);
}
.budget-halo { display: none; }
.budget-surtitre { display: flex; gap: 8px; align-items: center; text-transform: uppercase; letter-spacing: .1em; font-size: .8rem; font-weight: 600; color: var(--lagon-300); }
.budget-total { font-size: clamp(2.4rem, 6vw, 3.6rem); font-weight: 700; margin: 8px 0 4px; line-height: 1; letter-spacing: -.02em; }
.budget-note { font-size: .82rem; opacity: .8; }
.budget-barre { display: flex; height: 12px; border-radius: 999px; overflow: hidden; background: rgba(255,255,255,.15); margin: 22px 0 14px; }
.budget-barre span { transition: width .8s cubic-bezier(.22,.61,.36,1); }
.budget-legende { display: flex; flex-direction: column; gap: 8px; font-size: .9rem; }
.budget-legende li { display: flex; align-items: center; gap: 10px; }
.budget-puce { width: 12px; height: 12px; border-radius: 4px; flex-shrink: 0; }
.budget-legende-label { flex: 1; opacity: .9; }
.budget-legende-val small { opacity: .7; }
</style>

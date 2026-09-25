<script setup>
import { formaterEuros, formaterNombre } from '@/services/calculs/moteurCalculs.js'
import CarteBase from '@/composants/commun/CarteBase.vue'
defineProps({ mainOeuvre: { type: Object, required: true }, livraison: { type: Number, required: true } })
</script>

<template>
  <CarteBase titre="Main-d’œuvre & livraison" icone="fa-solid fa-helmet-safety" id="estimation-main-oeuvre">
    <ul class="mo-liste">
      <li>
        <span class="mo-label"><i class="fa-regular fa-clock"></i> Temps de travail</span>
        <strong class="mono">{{ formaterNombre(mainOeuvre.heures, 1) }} h</strong>
      </li>
      <li>
        <span class="mo-label"><i class="fa-solid fa-euro-sign"></i> Taux horaire</span>
        <strong class="mono">{{ formaterEuros(mainOeuvre.tauxHoraire) }}/h</strong>
      </li>
      <li class="mo-total">
        <span class="mo-label"><i class="fa-solid fa-person-digging"></i> Main-d’œuvre</span>
        <strong class="prix">{{ formaterEuros(mainOeuvre.total) }}</strong>
      </li>
      <li class="mo-total">
        <span class="mo-label"><i class="fa-solid fa-truck-fast"></i> Livraison</span>
        <strong class="prix">{{ formaterEuros(livraison) }}</strong>
      </li>
    </ul>
  </CarteBase>
</template>

<style scoped>
.mo-liste { display: flex; flex-direction: column; }
.mo-liste li { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--bordure); gap: 12px; }
.mo-liste li:last-child { border-bottom: none; }
.mo-label { display: inline-flex; gap: 10px; align-items: center; color: var(--texte-secondaire); font-size: .95rem; }
.mo-label i { color: var(--lagon-600); width: 18px; text-align: center; }
.mo-total strong { color: var(--lagon-700); font-size: 1.05rem; }
</style>

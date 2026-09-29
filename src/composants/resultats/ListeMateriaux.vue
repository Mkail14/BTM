<script setup>
import { formaterEuros, formaterNombre } from '@/services/calculs/moteurCalculs.js'
import CarteBase from '@/composants/commun/CarteBase.vue'
defineProps({ lignes: { type: Array, required: true }, total: { type: Number, required: true } })
const icones = { parpaing: 'fa-solid fa-cube', ciment: 'fa-solid fa-sack-dollar', sable: 'fa-solid fa-mound', beton: 'fa-solid fa-truck-pickup', beton_arme: 'fa-solid fa-truck-pickup', ferraillage: 'fa-solid fa-grip-lines', acier: 'fa-solid fa-bars', gravier: 'fa-solid fa-hill-rockslide', carrelage: 'fa-solid fa-border-all', beton_lisse: 'fa-solid fa-brush' }
</script>

<template>
  <CarteBase titre="Matériaux nécessaires" icone="fa-solid fa-boxes-stacked" id="liste-materiaux">
    <div class="tableau-scroll">
      <table class="tableau">
        <thead><tr><th>Matériau</th><th class="num">Quantité</th><th class="num">Prix unitaire</th><th class="num">Sous-total</th></tr></thead>
        <tbody>
          <tr v-for="l in lignes" :key="l.id">
            <td><span class="mat-nom"><i :class="icones[l.id] || 'fa-solid fa-box'" aria-hidden="true"></i>{{ l.libelle }}</span></td>
            <td class="num mono">{{ formaterNombre(l.quantite, 2) }} <small>{{ l.unite }}</small></td>
            <td class="num mono">{{ formaterEuros(l.prixUnitaire) }}<small>/{{ l.unite }}</small></td>
            <td class="num prix">{{ formaterEuros(l.sousTotal) }}</td>
          </tr>
        </tbody>
        <tfoot><tr><td colspan="3">Total matériaux</td><td class="num prix total">{{ formaterEuros(total) }}</td></tr></tfoot>
      </table>
    </div>
  </CarteBase>
</template>

<style scoped>
.mat-nom { display: inline-flex; gap: 10px; align-items: center; font-weight: 500; }
.mat-nom i { color: var(--lagon-600); width: 18px; text-align: center; }
small { color: var(--gris-400); font-size: .78rem; margin-left: 2px; }
.total { color: var(--lagon-700); font-size: 1.1rem; }
</style>

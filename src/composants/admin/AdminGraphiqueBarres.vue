<script setup>
/**
 * AdminGraphiqueBarres — histogramme d'une seule série (une teinte, pas de légende :
 * le titre de la carte nomme la mesure). Survol ou focus clavier : infobulle avec la valeur exacte.
 * Une table masquée reprend les données pour les lecteurs d'écran.
 */
import { computed, ref } from 'vue'

const props = defineProps({
  points: { type: Array, required: true },      // [{ cle, libelle, libelleLong, valeur }]
  formater: { type: Function, default: (v) => String(v) },
  formaterAxe: { type: Function, default: null },
  titre: { type: String, default: 'Graphique' }
})

const survol = ref(null)

// Graduation « ronde » : 1, 2, 2,5 ou 5 × 10^n, quatre intervalles
const echelle = computed(() => {
  const max = Math.max(0, ...props.points.map((p) => p.valeur))
  if (!max) return { max: 4, pas: 1 }
  const brut = max / 4
  const puissance = 10 ** Math.floor(Math.log10(brut))
  const pas = [1, 2, 2.5, 5, 10].map((m) => m * puissance).find((p) => p >= brut)
  return { max: pas * 4, pas }
})
const graduations = computed(() => [4, 3, 2, 1, 0].map((i) => i * echelle.value.pas))
const hauteur = (v) => `${(v / echelle.value.max) * 100}%`
const libelleAxe = (v) => (props.formaterAxe || props.formater)(v)
// Au-delà de 14 barres, un libellé sur deux (ou trois) pour éviter les collisions
const pasLibelles = computed(() => Math.ceil(props.points.length / 14))
</script>

<template>
  <div class="graphe">
    <div class="graphe-axe" aria-hidden="true">
      <span v-for="g in graduations" :key="g">{{ libelleAxe(g) }}</span>
    </div>
    <div class="graphe-zone">
      <div class="graphe-grille" aria-hidden="true"><span v-for="g in graduations" :key="g"></span></div>
      <div class="graphe-barres" :style="{ '--n': points.length }">
        <div
          v-for="(p, i) in points" :key="p.cle" class="graphe-colonne" :class="{ actif: survol === i }"
          tabindex="0" :aria-label="`${p.libelleLong || p.libelle} : ${formater(p.valeur)}`"
          @mouseenter="survol = i" @mouseleave="survol = null" @focus="survol = i" @blur="survol = null"
        >
          <div class="graphe-piste">
            <span class="graphe-barre" :class="{ nulle: !p.valeur }" :style="{ height: p.valeur ? hauteur(p.valeur) : '3px' }">
              <span v-if="survol === i" class="graphe-bulle" :class="{ gauche: i > points.length - 3, droite: i < 2 }" role="tooltip">
                <small>{{ p.libelleLong || p.libelle }}</small>
                <strong>{{ formater(p.valeur) }}</strong>
              </span>
            </span>
          </div>
          <span class="graphe-libelle" :class="{ cache: i % pasLibelles !== 0 && i !== points.length - 1 }">{{ p.libelle }}</span>
        </div>
      </div>
    </div>

    <!-- un <table> ignore la hauteur de 1px de .visually-hidden : on masque son conteneur -->
    <div class="visually-hidden">
      <table>
        <caption>{{ titre }}</caption>
        <tbody><tr v-for="p in points" :key="p.cle"><th scope="row">{{ p.libelleLong || p.libelle }}</th><td>{{ formater(p.valeur) }}</td></tr></tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.graphe { display: grid; grid-template-columns: auto 1fr; gap: 12px; height: 260px; }
.graphe-axe { display: flex; flex-direction: column; justify-content: space-between; padding-bottom: 30px; text-align: right; }
.graphe-axe span { font-size: .75rem; line-height: 1; color: var(--adm-muet); font-variant-numeric: tabular-nums; transform: translateY(-50%); }
.graphe-axe span:last-child { transform: translateY(50%); }
.graphe-zone { position: relative; min-width: 0; }
.graphe-grille { position: absolute; inset: 0 0 30px; display: flex; flex-direction: column; justify-content: space-between; pointer-events: none; }
.graphe-grille span { height: 1px; background: var(--adm-ligne-2); }
.graphe-grille span:last-child { background: var(--adm-ligne); }

.graphe-barres { position: relative; height: 100%; display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 2px; }
.graphe-colonne { display: flex; flex-direction: column; min-width: 0; outline: none; cursor: default; }
.graphe-piste { position: relative; flex: 1; display: flex; align-items: flex-end; justify-content: center; }
.graphe-barre {
  position: relative; width: min(44px, 72%); min-width: 4px; border-radius: 8px 8px 4px 4px; background: var(--adm-noir);
  transition: height .5s cubic-bezier(.22, .61, .36, 1), background var(--transition);
}
.graphe-barre.nulle { background: var(--adm-ligne); }
.graphe-colonne.actif .graphe-barre { background: var(--adm-accent); }
.graphe-colonne:focus-visible .graphe-barre { outline: 2px solid var(--adm-accent); outline-offset: 2px; }
.graphe-libelle { height: 30px; padding-top: 10px; text-align: center; font-size: .75rem; color: var(--adm-muet); white-space: nowrap; overflow: visible; }
.graphe-colonne.actif .graphe-libelle { color: var(--adm-encre); font-weight: 600; }
.graphe-libelle.cache { visibility: hidden; }
.graphe-colonne.actif .graphe-libelle.cache { visibility: visible; }

.graphe-bulle {
  position: absolute; bottom: calc(100% + 8px); left: 50%; z-index: 2; transform: translateX(-50%);
  display: flex; flex-direction: column; gap: 2px; padding: 8px 12px; border-radius: 12px; background: var(--adm-noir); color: #fff;
  white-space: nowrap; box-shadow: 0 10px 24px rgba(15, 23, 42, .22); pointer-events: none;
}
/* bords du graphique : l'infobulle s'ouvre vers l'intérieur */
.graphe-bulle.gauche { left: auto; right: 0; transform: none; }
.graphe-bulle.droite { left: 0; transform: none; }
.graphe-bulle small { font-size: .74rem; color: rgba(255, 255, 255, .65); }
.graphe-bulle strong { font-size: .95rem; font-variant-numeric: tabular-nums; }
@media (max-width: 640px) { .graphe { height: 220px; } }
</style>

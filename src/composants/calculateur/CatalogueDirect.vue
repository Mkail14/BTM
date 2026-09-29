<script setup>
/**
 * « Je sais ce qu'il me faut » : le client choisit ses matériaux et ses quantités, sans aucune mesure.
 * Pour chaque matériau : le meilleur prix BTM chez les fournisseurs et combien le proposent en stock.
 * Valider mène aux résultats, où l'on compare le prix exact chez chaque fournisseur.
 */
import { computed, onMounted, ref } from 'vue'
import { chargerCatalogue } from '@/services/supabase/serviceMateriaux.js'
import { chargerOffres, meilleuresOffres } from '@/services/supabase/serviceOffres.js'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'

const props = defineProps({ initial: { type: Array, default: () => [] } }) // lignes d'un achat déjà composé
const emit = defineEmits(['valider'])

const ICONES = { parpaing: 'fa-solid fa-cube', ciment: 'fa-solid fa-sack-xmark', sable: 'fa-solid fa-mound', beton: 'fa-solid fa-truck-droplet', beton_arme: 'fa-solid fa-truck-droplet', ferraillage: 'fa-solid fa-border-all', acier: 'fa-solid fa-bars', gravier: 'fa-solid fa-hill-rockslide', carrelage: 'fa-solid fa-table-cells', beton_lisse: 'fa-solid fa-brush' }
const PAS = { u: 10, sac: 1, t: 0.5, 'm³': 0.5, 'm²': 1, kg: 10 }
const uniteLisible = (u) => ({ u: 'unité', sac: 'sac', t: 'tonne' }[u] || u)

const materiaux = ref([])
const offres = ref({})
const chargement = ref(true)
const quantites = ref(Object.fromEntries(props.initial.map((l) => [l.id, String(l.quantite).replace('.', ',')])))
const recherche = ref('')

onMounted(async () => {
  const [{ catalogue }, liste] = await Promise.all([chargerCatalogue(), chargerOffres()])
  materiaux.value = Object.entries(catalogue).map(([id, m]) => ({ id, libelle: m.libelle, unite: m.unite, prixUnitaire: m.prixUnitaire }))
    .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'))
  offres.value = meilleuresOffres(liste)
  chargement.value = false
})

const lire = (t) => { const n = Number(String(t ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0 }
const prixDe = (m) => offres.value[m.id]?.min ?? m.prixUnitaire
function ajuster(m, sens) {
  const pas = PAS[m.unite] || 1
  const q = Math.max(0, Math.round((lire(quantites.value[m.id]) + sens * pas) * 1000) / 1000)
  quantites.value = { ...quantites.value, [m.id]: q ? String(q).replace('.', ',') : '' }
}

const normaliser = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const liste = computed(() => { const q = normaliser(recherche.value.trim()); return q ? materiaux.value.filter((m) => normaliser(m.libelle).includes(q)) : materiaux.value })
const choisis = computed(() => materiaux.value.filter((m) => lire(quantites.value[m.id]) > 0).map((m) => ({ ...m, quantite: lire(quantites.value[m.id]) })))
const estimation = computed(() => choisis.value.reduce((s, m) => s + m.quantite * prixDe(m), 0))

const valider = () => { if (choisis.value.length) emit('valider', choisis.value) }
</script>

<template>
  <div class="cd">
    <div class="cd-tete">
      <div>
        <h2 class="assistant-question assistant-focus" tabindex="-1">De quoi avez-vous besoin ?</h2>
        <p class="assistant-aide">Indiquez vos quantités : vous verrez le prix exact et la disponibilité chez chaque fournisseur.</p>
      </div>
      <label class="cd-recherche">
        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
        <input v-model="recherche" type="search" placeholder="Rechercher un matériau" aria-label="Rechercher un matériau" />
      </label>
    </div>

    <div v-if="chargement" class="cd-chargement"><span class="spinner spinner-grand"></span></div>
    <ul v-else class="cd-liste">
      <li v-for="m in liste" :key="m.id" class="cd-materiau" :class="{ choisi: lire(quantites[m.id]) > 0 }">
        <span class="cd-icone"><i :class="ICONES[m.id] || 'fa-solid fa-box'" aria-hidden="true"></i></span>
        <span class="cd-texte">
          <strong>{{ m.libelle }}</strong>
          <small v-if="offres[m.id]">Dès <b>{{ formaterEuros(offres[m.id].min) }}</b> / {{ uniteLisible(m.unite) }} · {{ offres[m.id].fournisseurs }} fournisseur{{ offres[m.id].fournisseurs > 1 ? 's' : '' }} en stock</small>
          <small v-else>Prix de référence {{ formaterEuros(m.prixUnitaire) }} / {{ uniteLisible(m.unite) }}</small>
        </span>
        <span class="cd-quantite">
          <button type="button" :aria-label="`Moins de ${m.libelle}`" :disabled="!lire(quantites[m.id])" @click="ajuster(m, -1)"><i class="fa-solid fa-minus"></i></button>
          <input v-model="quantites[m.id]" inputmode="decimal" placeholder="0" :aria-label="`Quantité de ${m.libelle} (${m.unite})`" />
          <span class="cd-unite">{{ m.unite }}</span>
          <button type="button" :aria-label="`Plus de ${m.libelle}`" @click="ajuster(m, 1)"><i class="fa-solid fa-plus"></i></button>
        </span>
      </li>
    </ul>

    <div class="cd-pied" :class="{ actif: choisis.length }">
      <span>
        <strong>{{ choisis.length }} matériau{{ choisis.length > 1 ? 'x' : '' }}</strong>
        <small v-if="choisis.length">à partir de {{ formaterEuros(estimation) }} · 0 € de frais</small>
        <small v-else>Choisissez au moins un matériau</small>
      </span>
      <button type="button" class="btn btn-primaire" :disabled="!choisis.length" @click="valider">Comparer les fournisseurs <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
    </div>
  </div>
</template>

<style scoped>
.cd { display: flex; flex-direction: column; gap: 16px; }
.cd-tete { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; }
.cd-recherche { position: relative; flex: 0 1 300px; }
.cd-recherche i { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--gris-500); }
.cd-recherche input { width: 100%; min-height: 44px; padding: 0 14px 0 38px; border: 1px solid var(--gris-300); border-radius: 999px; font: inherit; }
.cd-chargement { display: grid; place-items: center; min-height: 200px; }
.cd-liste { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 10px; margin: 0; padding: 0; list-style: none; }
.cd-materiau { display: flex; align-items: center; gap: 12px; padding: 14px; border: 1.5px solid var(--gris-200); border-radius: var(--rayon); background: #fff; transition: border-color var(--transition), background var(--transition); }
.cd-materiau.choisi { border-color: var(--lagon-600); background: var(--lagon-50); }
.cd-icone { width: 42px; height: 42px; flex: none; display: grid; place-items: center; border-radius: 12px; background: var(--gris-100); color: var(--ardoise); }
.cd-materiau.choisi .cd-icone { background: var(--lagon-600); color: #fff; }
.cd-texte { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.cd-texte strong { color: var(--ardoise); font-size: .95rem; }
.cd-texte small { color: var(--texte-secondaire); font-size: .8rem; }
.cd-texte b { color: #047857; }
.cd-quantite { position: relative; display: inline-flex; align-items: center; gap: 4px; }
.cd-quantite button { width: 34px; height: 34px; border: 1px solid var(--gris-300); border-radius: 10px; background: #fff; color: var(--ardoise); cursor: pointer; }
.cd-quantite button:disabled { opacity: .4; cursor: default; }
.cd-quantite input { width: 78px; min-height: 36px; padding: 0 30px 0 8px; border: 1px solid var(--gris-300); border-radius: 10px; font: inherit; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }
.cd-quantite input:focus { outline: none; border-color: var(--lagon-500); box-shadow: 0 0 0 3px rgba(6, 182, 212, .15); }
.cd-unite { position: absolute; right: 44px; font-size: .72rem; color: var(--gris-500); pointer-events: none; }
.cd-pied {
  position: sticky; bottom: 16px; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px;
  padding: 14px 18px; border-radius: var(--rayon-lg); background: #fff; box-shadow: 0 12px 40px rgba(15, 23, 42, .15);
}
.cd-pied.actif { background: var(--ardoise); color: #fff; }
.cd-pied span { display: flex; flex-direction: column; }
.cd-pied small { opacity: .75; font-size: .82rem; }
@media (max-width: 420px) { .cd-liste { grid-template-columns: 1fr; } .cd-materiau { flex-wrap: wrap; } .cd-quantite { margin-left: auto; } }
</style>

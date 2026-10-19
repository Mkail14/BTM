<script setup>
/**
 * SelecteurCarreau — choix du modèle de carreaux (calculateur, carrelage) : cartes qui défilent,
 * une par modèle mis en ligne par un fournisseur pour le format choisi, avec son prix à l'unité.
 * La première carte garde le « modèle standard » (prix moyen du catalogue BTM).
 * La valeur émise est 'standard' ou un instantané du modèle (prix compris) : le devis ne dépend pas
 * d'un rechargement de la liste ; le prix exact est relu par le fournisseur à l'encaissement.
 */
import { computed, onMounted, ref } from 'vue'
import { listerCarreauxPublics, libelleFormat, prixAuM2 } from '@/services/supabase/serviceCarreaux.js'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'

const props = defineProps({
  format: { type: String, required: true },
  modelValue: { type: [String, Object], default: 'standard' }
})
const emit = defineEmits(['choisir'])

const tous = ref([])
const chargement = ref(true)
onMounted(async () => {
  tous.value = await listerCarreauxPublics()
  chargement.value = false
})
const modeles = computed(() => tous.value.filter((c) => c.format === props.format))
const choisiId = computed(() => (props.modelValue && typeof props.modelValue === 'object' ? props.modelValue.id : 'standard'))

function choisir(c) {
  if (!c) return emit('choisir', 'standard')
  if (c.rupture) return
  emit('choisir', {
    id: c.id, nom: c.nom, format: c.format, finition: c.finition || '', couleur: c.couleur, photo_url: c.photo_url || '',
    prix: c.prix_unitaire, fournisseur: c.fournisseur, fournisseurId: c.fournisseur_id
  })
}

// Flèches (ordinateur) : une carte à la fois
const piste = ref(null)
function defiler(sens) {
  const el = piste.value
  const pas = el?.querySelector('.sc-carte')?.offsetWidth || 220
  el?.scrollBy({ left: sens * (pas + 14), behavior: 'smooth' })
}
</script>

<template>
  <div class="sc">
    <div class="sc-cadre">
      <button type="button" class="sc-fleche gauche" aria-label="Modèles précédents" @click="defiler(-1)"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
      <ul ref="piste" class="sc-piste" role="listbox" :aria-label="`Modèles de carreaux ${libelleFormat(format)}`">
        <li>
          <button type="button" role="option" class="sc-carte" :class="{ actif: choisiId === 'standard' }" :aria-selected="choisiId === 'standard'" @click="choisir(null)">
            <span class="sc-visuel sc-standard" aria-hidden="true"><i class="fa-solid fa-table-cells"></i></span>
            <span class="sc-texte">
              <strong>Modèle standard</strong>
              <small>Je choisirai en magasin</small>
              <span class="sc-prix"><b>Prix moyen</b><small>du catalogue BTM</small></span>
            </span>
          </button>
        </li>
        <li v-for="c in modeles" :key="c.id">
          <button
            type="button" role="option" class="sc-carte" :class="{ actif: choisiId === c.id, rupture: c.rupture }"
            :aria-selected="choisiId === c.id" :aria-disabled="c.rupture || undefined" @click="choisir(c)"
          >
            <span class="sc-visuel" :style="{ '--teinte': c.couleur }" aria-hidden="true">
              <img v-if="c.photo_url" :src="c.photo_url" alt="" loading="lazy" decoding="async" />
              <em v-if="c.rupture" class="sc-badge">Rupture</em>
            </span>
            <span class="sc-texte">
              <strong>{{ c.nom }}</strong>
              <small>{{ [c.finition, libelleFormat(c.format)].filter(Boolean).join(' · ') }}</small>
              <small class="sc-fournisseur"><i class="fa-solid fa-store" aria-hidden="true"></i> {{ c.fournisseur }}<template v-if="c.commune"> · {{ c.commune }}</template></small>
              <span class="sc-prix"><b>{{ formaterEuros(c.prix_unitaire) }}</b><small>le carreau · ≈ {{ formaterEuros(prixAuM2(c)) }} / m²</small></span>
            </span>
          </button>
        </li>
      </ul>
      <button type="button" class="sc-fleche droite" aria-label="Modèles suivants" @click="defiler(1)"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
    </div>
    <p v-if="chargement" class="sc-note"><span class="spinner" aria-hidden="true"></span> Chargement des modèles…</p>
    <p v-else-if="!modeles.length" class="sc-note">Aucun modèle {{ libelleFormat(format) }} n’est encore proposé par un fournisseur : le devis utilisera le prix moyen du catalogue.</p>
    <p v-else class="sc-note">{{ modeles.length }} modèle{{ modeles.length > 1 ? 's' : '' }} en {{ libelleFormat(format) }}. Le devis compte des carreaux entiers, coupes et casse comprises.</p>
  </div>
</template>

<style scoped>
.sc { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.sc-cadre { position: relative; min-width: 0; }
.sc-piste {
  display: flex; gap: 14px; margin: 0; padding: 4px 2px 10px; list-style: none;
  overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: thin; overscroll-behavior-x: contain;
}
.sc-piste > li { flex: 0 0 200px; scroll-snap-align: start; }
.sc-carte {
  display: flex; flex-direction: column; width: 100%; height: 100%; padding: 0; overflow: hidden;
  border: 1.5px solid var(--gris-200); border-radius: var(--rayon); background: #fff;
  font: inherit; color: inherit; text-align: left; cursor: pointer; transition: border-color var(--transition), box-shadow var(--transition);
}
.sc-carte:hover { border-color: var(--lagon-500); }
.sc-carte.actif { border-color: var(--lagon-600); box-shadow: 0 0 0 3px rgba(6, 182, 212, .18); }
.sc-carte.rupture { cursor: not-allowed; opacity: .55; }
/* aperçu : la teinte du modèle, quadrillée comme un sol carrelé (ou sa photo) */
.sc-visuel {
  position: relative; display: grid; place-items: center; height: 110px;
  background-color: var(--teinte, #e9e5de);
  background-image: linear-gradient(rgba(255,255,255,.55) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,.55) 2px, transparent 2px);
  background-size: 36px 36px;
}
.sc-visuel img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.sc-standard { background-color: var(--gris-100); color: var(--gris-500); font-size: 2rem; }
.sc-badge { position: absolute; top: 8px; left: 8px; padding: 2px 8px; border-radius: 999px; background: #fee2e2; color: #991b1b; font-style: normal; font-size: .7rem; font-weight: 800; text-transform: uppercase; }
.sc-texte { display: flex; flex-direction: column; gap: 3px; padding: 12px 14px 14px; flex: 1; }
.sc-texte strong { color: var(--ardoise); line-height: 1.25; }
.sc-texte small { color: var(--texte-secondaire); font-size: .8rem; }
.sc-fournisseur i { color: var(--lagon-600); margin-right: 2px; }
.sc-prix { display: flex; flex-direction: column; margin-top: auto; padding-top: 8px; }
.sc-prix b { color: var(--lagon-700); font-size: 1.15rem; font-variant-numeric: tabular-nums; }
.sc-fleche {
  position: absolute; top: 50%; z-index: 1; width: 36px; height: 36px; display: grid; place-items: center; transform: translateY(-50%);
  border: 1px solid var(--gris-200); border-radius: 50%; background: #fff; color: var(--ardoise); box-shadow: var(--ombre-sm, 0 2px 6px rgba(0,0,0,.12)); cursor: pointer;
}
.sc-fleche.gauche { left: -14px; }
.sc-fleche.droite { right: -14px; }
.sc-note { display: flex; align-items: center; gap: 8px; margin: 0; color: var(--texte-secondaire); font-size: .84rem; line-height: 1.45; }
.sc-note .spinner { width: 14px; height: 14px; border-width: 2px; }
@media (max-width: 899px) {
  .sc-fleche { display: none; } /* au doigt, la piste défile toute seule */
  .sc-piste > li { flex-basis: 170px; }
}
</style>

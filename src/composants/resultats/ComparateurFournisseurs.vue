<script setup>
/**
 * Comparateur des fournisseurs (résultats) : pour chaque fournisseur de l'annuaire, le prix exact du devis
 * à SES prix BTM (avec le code de retrait) et ce qu'il a en stock.
 * On peut en choisir plusieurs (gros chantier, devis pro) : le même code BTM marche chez chacun, et chaque
 * matériau est compté au prix du fournisseur choisi le moins cher qui l'a en stock.
 */
import { computed, onMounted, ref } from 'vue'
import { chargerFournisseurs } from '@/services/supabase/serviceFournisseurs.js'
import { chargerOffres, parFournisseur, chiffrerChez } from '@/services/supabase/serviceOffres.js'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'

const props = defineProps({
  lignes: { type: Array, required: true },       // lignes du devis (quantités)
  modelValue: { type: Array, default: () => [] } // ids des fournisseurs choisis, dans l'ordre du choix
})
const emit = defineEmits(['update:modelValue', 'fournisseurs'])

const annuaire = ref([])
const groupes = ref([])
const chargement = ref(true)
const tousVisibles = ref(false)
onMounted(async () => {
  const [{ donnees }, offres] = await Promise.all([chargerFournisseurs(), chargerOffres()])
  annuaire.value = donnees
  groupes.value = parFournisseur(offres)
  chargement.value = false
  emit('fournisseurs', choisis(props.modelValue))
})

// Prix de référence (sans fournisseur) : on compare toujours les mêmes quantités
const quantites = computed(() => props.lignes.map((l) => ({ ...l, prixUnitaire: l.prixReference ?? l.prixUnitaire })))

// Seuls les fournisseurs qui ont au moins un matériau du devis en stock (un devis carrelage ne montre que les vendeurs de ses carreaux)
const liste = computed(() => annuaire.value.map((fiche) => {
  const groupe = groupes.value.find((g) => g.id === fiche.id) || null
  const chiffrage = groupe ? chiffrerChez(groupe, quantites.value) : null
  return { fiche, groupe, chiffrage, complet: !!chiffrage && chiffrage.disponibles === quantites.value.length }
}).filter((f) => f.chiffrage?.disponibles > 0)
  .sort((a, b) => b.chiffrage.disponibles - a.chiffrage.disponibles
  || a.chiffrage.total - b.chiffrage.total))
const meilleur = computed(() => liste.value.find((f) => f.complet) || null)
// les fournisseurs choisis restent visibles même au-delà des 3 premiers
const affiches = computed(() => (tousVisibles.value ? liste.value : liste.value.filter((f, i) => i < 3 || props.modelValue.includes(f.fiche.id))))
const choisis = (ids) => ids.map((id) => liste.value.find((f) => f.fiche.id === id)).filter(Boolean).map((f) => ({ fiche: f.fiche, groupe: f.groupe }))
const estChoisi = (f) => props.modelValue.includes(f.fiche.id)

// Matériaux qu'aucun fournisseur choisi n'a en stock
const nonCouverts = computed(() => {
  if (props.modelValue.length < 2) return 0
  const groupesChoisis = choisis(props.modelValue).map((c) => c.groupe).filter(Boolean)
  return quantites.value.filter((l) => !groupesChoisis.some((g) => g.materiaux[l.id]?.disponible)).length
})

function choisir(f) {
  const ids = estChoisi(f) ? props.modelValue.filter((id) => id !== f.fiche.id) : [...props.modelValue, f.fiche.id]
  emit('update:modelValue', ids)
  emit('fournisseurs', choisis(ids))
}
</script>

<template>
  <section class="carte cf" aria-labelledby="cf-titre">
    <div class="cf-tete">
      <div>
        <h2 id="cf-titre"><i class="fa-solid fa-store" aria-hidden="true"></i> Où acheter ?</h2>
        <p>Prix BTM, sans frais. Gros chantier : choisissez plusieurs fournisseurs, votre code marche chez chacun.</p>
      </div>
    </div>

    <div v-if="chargement" class="cf-chargement"><span class="spinner spinner-grand"></span></div>
    <p v-else-if="!liste.length" class="cf-vide"><i class="fa-solid fa-box-open" aria-hidden="true"></i> Aucun fournisseur n’a encore ces matériaux en stock sur BTM.</p>
    <ul v-else class="cf-liste">
      <li v-for="f in affiches" :key="f.fiche.id">
        <button type="button" class="cf-carte" :class="{ actif: estChoisi(f) }" :aria-pressed="estChoisi(f)" @click="choisir(f)">
          <span class="cf-choix" aria-hidden="true"><i v-if="estChoisi(f)" class="fa-solid fa-check"></i></span>
          <span class="cf-identite">
            <strong>{{ f.fiche.nom }}<em v-if="meilleur && meilleur.fiche.id === f.fiche.id" class="cf-meilleur">Meilleur prix</em></strong>
            <small>{{ f.fiche.commune }}<template v-if="f.fiche.livraison"> · livraison</template></small>
            <!-- seulement quand il manque quelque chose : « tout est disponible » est le cas normal -->
            <small v-if="!f.complet" class="cf-dispo">
              <i class="fa-solid fa-circle-half-stroke" aria-hidden="true"></i> {{ f.chiffrage.disponibles }} / {{ quantites.length }} matériaux disponibles
            </small>
          </span>
          <span v-if="f.chiffrage && f.chiffrage.disponibles" class="cf-prix">
            <strong>{{ formaterEuros(f.chiffrage.total) }}</strong>
          </span>
        </button>
      </li>
    </ul>
    <p v-if="modelValue.length > 1" class="cf-plusieurs">
      <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
      {{ modelValue.length }} fournisseurs choisis : chaque matériau est compté chez le moins cher qui l’a en stock.
      Chaque fournisseur encaisse seulement ce qu’il vous remet.
      <template v-if="nonCouverts"> {{ nonCouverts }} matériau{{ nonCouverts > 1 ? 'x' : '' }} disponible{{ nonCouverts > 1 ? 's' : '' }} chez aucun d’eux.</template>
    </p>
    <button v-if="liste.length > 3" type="button" class="cf-plus" @click="tousVisibles = !tousVisibles">
      {{ tousVisibles ? 'Voir moins' : `Voir les ${liste.length} fournisseurs` }}
    </button>
  </section>
</template>

<style scoped>
.cf { display: flex; flex-direction: column; gap: 14px; }
.cf-tete h2 { display: flex; align-items: center; gap: 10px; margin: 0; font-size: 1.25rem; color: var(--ardoise); }
.cf-tete h2 i { color: var(--lagon-600); }
.cf-tete p { margin: 6px 0 0; color: var(--texte-secondaire); font-size: .92rem; line-height: 1.55; }
.cf-tete strong { color: var(--ardoise); }
.cf-chargement { display: grid; place-items: center; min-height: 120px; }
.cf-vide { display: flex; align-items: center; gap: 10px; margin: 0; padding: 18px 16px; border: 1.5px dashed var(--gris-200); border-radius: var(--rayon); color: var(--texte-secondaire); font-size: .9rem; }
.cf-vide i { color: var(--gris-400); font-size: 1.1rem; }
.cf-liste { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.cf-carte {
  display: flex; align-items: center; gap: 14px; width: 100%; padding: 14px 16px; border: 1.5px solid var(--gris-200); border-radius: var(--rayon);
  background: var(--carte); font: inherit; color: inherit; text-align: left; cursor: pointer; transition: border-color var(--transition), box-shadow var(--transition);
}
.cf-carte:hover { border-color: var(--lagon-500); }
.cf-carte.actif { border-color: var(--lagon-600); background: var(--lagon-50); box-shadow: 0 0 0 3px rgba(6, 182, 212, .15); }
/* case à cocher (plusieurs choix possibles) */
.cf-choix { width: 24px; height: 24px; flex: none; display: grid; place-items: center; border: 2px solid var(--gris-300); border-radius: 7px; font-size: .72rem; }
.cf-carte.actif .cf-choix { border-color: var(--lagon-600); background: var(--lagon-600); color: #fff; }
.cf-identite { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cf-identite strong { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; color: var(--ardoise); }
.cf-identite small { color: var(--texte-secondaire); font-size: .8rem; }
.cf-meilleur { padding: 1px 8px; border-radius: 999px; background: var(--succes-pastille); color: var(--succes-texte); font-style: normal; font-size: .7rem; font-weight: 800; letter-spacing: .03em; text-transform: uppercase; }
.cf-dispo { font-weight: 600; color: #b45309 !important; }
.cf-prix { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; text-align: right; }
.cf-prix strong { font-size: 1.15rem; color: var(--ardoise); font-variant-numeric: tabular-nums; }
.cf-plusieurs { display: flex; gap: 8px; margin: 0; padding: 12px 14px; border-radius: var(--rayon); background: var(--lagon-50); color: var(--lagon-800); font-size: .85rem; line-height: 1.5; }
.cf-plusieurs i { margin-top: 3px; }
.cf-plus { align-self: center; border: 0; background: none; color: var(--lagon-700); font: inherit; font-weight: 700; cursor: pointer; }
@media (max-width: 560px) {
  .cf-carte { flex-wrap: wrap; }
  .cf-prix { width: 100%; flex-direction: row; flex-wrap: wrap; align-items: baseline; justify-content: flex-end; gap: 8px; }
}
</style>

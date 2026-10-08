<script setup>
/**
 * Comparateur des fournisseurs (résultats) : pour chaque fournisseur de l'annuaire, le prix exact du devis
 * à SES prix BTM (avec le code de retrait), le prix au comptoir sans code, l'économie, et ce qu'il a en stock.
 * Choisir un fournisseur applique ses prix au devis (PDF, enregistrement) et l'ajoute au PDF.
 */
import { computed, onMounted, ref } from 'vue'
import { chargerFournisseurs } from '@/services/supabase/serviceFournisseurs.js'
import { chargerOffres, parFournisseur, chiffrerChez } from '@/services/supabase/serviceOffres.js'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'

const props = defineProps({
  lignes: { type: Array, required: true },       // lignes du devis (quantités)
  modelValue: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'fournisseur'])

const annuaire = ref([])
const groupes = ref([])
const chargement = ref(true)
const tousVisibles = ref(false)
onMounted(async () => {
  const [{ donnees }, offres] = await Promise.all([chargerFournisseurs(), chargerOffres()])
  annuaire.value = donnees
  groupes.value = parFournisseur(offres)
  chargement.value = false
  const f = liste.value.find((x) => x.fiche.id === props.modelValue)
  if (f) emit('fournisseur', { fiche: f.fiche, groupe: f.groupe })
})

// Prix de référence (sans fournisseur) : on compare toujours les mêmes quantités
const quantites = computed(() => props.lignes.map((l) => ({ ...l, prixUnitaire: l.prixReference ?? l.prixUnitaire })))

const liste = computed(() => annuaire.value.map((fiche) => {
  const groupe = groupes.value.find((g) => g.id === fiche.id) || null
  const chiffrage = groupe ? chiffrerChez(groupe, quantites.value) : null
  return { fiche, groupe, chiffrage, complet: !!chiffrage && chiffrage.disponibles === quantites.value.length }
}).sort((a, b) => (b.chiffrage ? 1 : 0) - (a.chiffrage ? 1 : 0)
  || (b.chiffrage?.disponibles || 0) - (a.chiffrage?.disponibles || 0)
  || (a.chiffrage?.total || 0) - (b.chiffrage?.total || 0)))
const meilleur = computed(() => liste.value.find((f) => f.complet) || null)
const affiches = computed(() => (tousVisibles.value ? liste.value : liste.value.slice(0, 4)))

function choisir(f) {
  const nouveau = props.modelValue === f.fiche.id ? '' : f.fiche.id
  emit('update:modelValue', nouveau)
  emit('fournisseur', nouveau ? { fiche: f.fiche, groupe: f.groupe } : null)
}
</script>

<template>
  <section class="carte cf" aria-labelledby="cf-titre">
    <div class="cf-tete">
      <div>
        <h2 id="cf-titre"><i class="fa-solid fa-store" aria-hidden="true"></i> Où acheter ?</h2>
        <p>Comparez les prix exacts. Avec votre code de retrait, vous payez le <strong>prix BTM</strong>, plus bas qu’au comptoir, <strong>sans aucun frais</strong>.</p>
      </div>
    </div>

    <div v-if="chargement" class="cf-chargement"><span class="spinner spinner-grand"></span></div>
    <ul v-else class="cf-liste">
      <li v-for="f in affiches" :key="f.fiche.id">
        <button type="button" class="cf-carte" :class="{ actif: modelValue === f.fiche.id }" :aria-pressed="modelValue === f.fiche.id" @click="choisir(f)">
          <span class="cf-choix" aria-hidden="true"><i v-if="modelValue === f.fiche.id" class="fa-solid fa-check"></i></span>
          <span class="cf-identite">
            <strong>{{ f.fiche.nom }}<em v-if="meilleur && meilleur.fiche.id === f.fiche.id" class="cf-meilleur">Meilleur prix</em></strong>
            <small>{{ f.fiche.categorie }} · {{ f.fiche.commune }}<template v-if="f.fiche.livraison"> · livraison</template></small>
            <small v-if="f.chiffrage" class="cf-dispo" :class="{ complet: f.complet }">
              <i :class="f.complet ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-half-stroke'" aria-hidden="true"></i>
              {{ f.complet ? 'Tout est disponible' : `${f.chiffrage.disponibles} / ${quantites.length} matériaux disponibles` }}
            </small>
            <small v-else class="cf-dispo inconnu"><i class="fa-regular fa-circle-question" aria-hidden="true"></i> Prix non communiqués sur BTM</small>
          </span>
          <span v-if="f.chiffrage && f.chiffrage.disponibles" class="cf-prix">
            <strong>{{ formaterEuros(f.chiffrage.total) }}</strong>
            <s v-if="f.chiffrage.economie > 0">{{ formaterEuros(f.chiffrage.totalComptoir) }} au comptoir</s>
            <em v-if="f.chiffrage.economie > 0" class="cf-economie">−{{ formaterEuros(f.chiffrage.economie) }} avec votre code</em>
          </span>
        </button>
      </li>
    </ul>
    <button v-if="liste.length > 4" type="button" class="cf-plus" @click="tousVisibles = !tousVisibles">
      {{ tousVisibles ? 'Voir moins' : `Voir les ${liste.length} fournisseurs` }}
    </button>
    <p class="cf-note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Le prix BTM s’applique chez le fournisseur sur présentation du code de retrait de votre devis enregistré. Chaque achat vous rapporte aussi du crédit fidélité.</p>
  </section>
</template>

<style scoped>
.cf { display: flex; flex-direction: column; gap: 14px; }
.cf-tete h2 { display: flex; align-items: center; gap: 10px; margin: 0; font-size: 1.25rem; color: var(--ardoise); }
.cf-tete h2 i { color: var(--lagon-600); }
.cf-tete p { margin: 6px 0 0; color: var(--texte-secondaire); font-size: .92rem; line-height: 1.55; }
.cf-tete strong { color: var(--ardoise); }
.cf-chargement { display: grid; place-items: center; min-height: 120px; }
.cf-liste { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.cf-carte {
  display: flex; align-items: center; gap: 14px; width: 100%; padding: 14px 16px; border: 1.5px solid var(--gris-200); border-radius: var(--rayon);
  background: #fff; font: inherit; color: inherit; text-align: left; cursor: pointer; transition: border-color var(--transition), box-shadow var(--transition);
}
.cf-carte:hover { border-color: var(--lagon-500); }
.cf-carte.actif { border-color: var(--lagon-600); background: var(--lagon-50); box-shadow: 0 0 0 3px rgba(6, 182, 212, .15); }
.cf-choix { width: 24px; height: 24px; flex: none; display: grid; place-items: center; border: 2px solid var(--gris-300); border-radius: 50%; font-size: .72rem; }
.cf-carte.actif .cf-choix { border-color: var(--lagon-600); background: var(--lagon-600); color: #fff; }
.cf-identite { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cf-identite strong { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; color: var(--ardoise); }
.cf-identite small { color: var(--texte-secondaire); font-size: .8rem; }
.cf-meilleur { padding: 1px 8px; border-radius: 999px; background: #dcfce7; color: #166534; font-style: normal; font-size: .7rem; font-weight: 800; letter-spacing: .03em; text-transform: uppercase; }
.cf-dispo { font-weight: 600; color: #b45309 !important; }
.cf-dispo.complet { color: #047857 !important; }
.cf-dispo.inconnu { color: var(--gris-500) !important; font-weight: 500; }
.cf-prix { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; text-align: right; }
.cf-prix strong { font-size: 1.15rem; color: var(--ardoise); font-variant-numeric: tabular-nums; }
.cf-prix s { color: var(--gris-500); font-size: .78rem; }
.cf-economie { color: #047857; font-style: normal; font-size: .78rem; font-weight: 700; }
.cf-plus { align-self: center; border: 0; background: none; color: var(--lagon-700); font: inherit; font-weight: 700; cursor: pointer; }
.cf-note { display: flex; gap: 8px; margin: 0; color: var(--texte-secondaire); font-size: .82rem; line-height: 1.5; }
.cf-note i { margin-top: 3px; color: var(--lagon-600); }
@media (max-width: 560px) {
  .cf-carte { flex-wrap: wrap; }
  .cf-prix { width: 100%; flex-direction: row; flex-wrap: wrap; align-items: baseline; justify-content: flex-end; gap: 8px; }
}
</style>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { chargerFournisseurs } from '@/services/supabase/serviceFournisseurs.js'
import CarteFournisseur from '@/composants/fournisseurs/CarteFournisseur.vue'
import FiltresFournisseurs from '@/composants/fournisseurs/FiltresFournisseurs.vue'

const route = useRoute()
const router = useRouter()
const liste = ref([])
const chargement = ref(true)
const recherche = ref(String(route.query.q || ''))
const categorie = ref(String(route.query.categorie || ''))

const normaliser = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const resultats = computed(() => {
  const q = normaliser(recherche.value.trim())
  return liste.value.filter((f) => {
    if (categorie.value && f.categorie_id !== categorie.value) return false
    if (!q) return true
    return [f.nom, f.commune, f.description, f.categorie].some((v) => normaliser(v).includes(q))
  })
})

onMounted(async () => {
  const r = await chargerFournisseurs()
  liste.value = r.donnees
  chargement.value = false
})

watch([recherche, categorie], ([q, c]) => {
  const query = {}
  if (q) query.q = q
  if (c) query.categorie = c
  router.replace({ query })
})

function reinitialiser() { recherche.value = ''; categorie.value = '' }
</script>

<template>
  <div id="page-fournisseurs" class="page">
    <div class="conteneur annuaire">
      <header class="annuaire-entete">
        <h1 class="annuaire-titre">Fournisseurs</h1>
        <p>Les entreprises de matériaux de Mayotte, à contacter directement.</p>
      </header>

      <FiltresFournisseurs v-model:recherche="recherche" v-model:categorie="categorie" />

      <div v-if="chargement" class="annuaire-vide" role="status"><span class="spinner spinner-grand"></span></div>

      <template v-else-if="resultats.length">
        <p class="annuaire-compteur" role="status" aria-live="polite">{{ resultats.length }} fournisseur{{ resultats.length > 1 ? 's' : '' }}</p>
        <ul class="annuaire-liste">
          <CarteFournisseur v-for="f in resultats" :key="f.id" :fournisseur="f" />
        </ul>
      </template>

      <div v-else class="annuaire-vide" role="status">
        <p>Aucun fournisseur ne correspond à votre recherche.</p>
        <button type="button" class="annuaire-lien" @click="reinitialiser">Tout afficher</button>
      </div>

      <p class="annuaire-pied">
        Vous êtes fournisseur ? <a href="mailto:contact@btm-mayotte.yt" class="annuaire-lien">Être référencé</a>
      </p>
    </div>
  </div>
</template>

<style scoped>
.annuaire { max-width: 820px; }
.annuaire-entete { margin-bottom: 32px; }
.annuaire-titre { font-size: clamp(2.2rem, 5vw, 3rem); font-weight: 700; color: var(--ardoise); }
.annuaire-entete p { margin: 8px 0 0; color: var(--gris-500); font-size: 1.02rem; }

.annuaire-compteur { margin: 20px 0 0; font-size: .82rem; color: var(--gris-400); }
.annuaire-liste { list-style: none; margin: 0; padding: 0; }

.annuaire-vide { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 72px 20px; color: var(--gris-500); text-align: center; }
.annuaire-vide p { margin: 0; }

.annuaire-lien { border: 0; background: none; padding: 0; font: inherit; font-weight: 600; color: var(--lagon-700); cursor: pointer; }
.annuaire-lien:hover { text-decoration: underline; }

.annuaire-pied { margin: 48px 0 0; font-size: .88rem; color: var(--gris-500); }
</style>

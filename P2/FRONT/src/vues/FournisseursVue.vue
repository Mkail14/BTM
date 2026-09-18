<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { chargerFournisseurs } from '@/services/supabase/serviceFournisseurs.js'
import CarteFournisseur from '@/composants/fournisseurs/CarteFournisseur.vue'
import FiltresFournisseurs from '@/composants/fournisseurs/FiltresFournisseurs.vue'
import EtatVide from '@/composants/commun/EtatVide.vue'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import BandeauAvertissement from '@/composants/commun/BandeauAvertissement.vue'

const route = useRoute()
const router = useRouter()
const liste = ref([])
const chargement = ref(true)
const source = ref('local')
const recherche = ref(String(route.query.q || ''))
const categorie = ref(String(route.query.categorie || ''))

const normaliser = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

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
  source.value = r.source
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
    <div class="conteneur">
      <header class="page-entete">
        <span class="section-surtitre"><i class="fa-solid fa-truck"></i> Annuaire BTP</span>
        <h1 class="page-titre">Fournisseurs de Mayotte</h1>
        <p class="page-sous-titre">Trouvez et contactez directement les entreprises de matériaux de l’île : béton, granulats, parpaings, ciment, carrelage…</p>
      </header>

      <FiltresFournisseurs v-model:recherche="recherche" v-model:categorie="categorie" :nb-resultats="resultats.length" @reinitialiser="reinitialiser" />

      <div v-if="chargement" class="fournisseurs-chargement" role="status"><span class="spinner spinner-grand"></span><p>Chargement de l’annuaire…</p></div>

      <transition-group v-else-if="resultats.length" name="liste" tag="div" class="grille grille-3">
        <CarteFournisseur v-for="f in resultats" :key="f.id" :fournisseur="f" />
      </transition-group>

      <EtatVide v-else icone="fa-solid fa-magnifying-glass" titre="Aucun résultat"
        :message="`Aucun fournisseur ne correspond à « ${recherche || 'ces filtres'} ». Essayez un autre mot-clé ou une autre catégorie.`">
        <BoutonBase variante="secondaire" icone="fa-solid fa-rotate-left" @click="reinitialiser">Réinitialiser les filtres</BoutonBase>
      </EtatVide>

      <BandeauAvertissement type="info" compact class="fournisseurs-note">
        Les informations des fournisseurs sont enregistrées dans l’application{{ source === 'supabase' ? ' (base Supabase BTM)' : '' }} et doivent être vérifiées avant toute commande. Vous êtes fournisseur ? <a href="mailto:contact@btm-mayotte.yt" class="lien-inline">Contactez-nous</a> pour être référencé.
      </BandeauAvertissement>
    </div>
  </div>
</template>

<style scoped>
.fournisseurs-chargement { display: grid; place-items: center; gap: 12px; padding: 60px 0; color: var(--texte-secondaire); }
.fournisseurs-note { margin-top: 40px; }
.lien-inline { font-weight: 700; text-decoration: underline; }
.liste-enter-active, .liste-leave-active { transition: all .35s ease; }
.liste-enter-from, .liste-leave-to { opacity: 0; transform: translateY(14px) scale(.98); }
.liste-move { transition: transform .35s ease; }
</style>

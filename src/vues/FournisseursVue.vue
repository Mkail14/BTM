<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { chargerFournisseurs, chargerCategories } from '@/services/supabase/serviceFournisseurs.js'
import CarteFournisseur from '@/composants/fournisseurs/CarteFournisseur.vue'
import FiltresFournisseurs from '@/composants/fournisseurs/FiltresFournisseurs.vue'

const route = useRoute()
const router = useRouter()
const liste = ref([])
const categories = ref([])
const chargement = ref(true)
const recherche = ref(String(route.query.q || ''))
const categorie = ref(String(route.query.categorie || ''))
const livraison = ref(route.query.livraison === '1')

const normaliser = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
// texte de recherche de chaque fournisseur, préparé une fois (pas à chaque frappe)
const indexes = computed(() => liste.value.map((f) => ({ f, texte: normaliser([f.nom, f.commune, f.adresse, f.description, f.categorie].join(' ')) })))

// recherche et livraison d'abord : les compteurs des catégories reflètent ce qui est réellement trouvable
const avantCategorie = computed(() => {
  const mots = normaliser(recherche.value).split(/\s+/).filter(Boolean)
  return indexes.value.filter(({ f, texte }) => (!livraison.value || f.livraison) && mots.every((m) => texte.includes(m))).map(({ f }) => f)
})
const resultats = computed(() => (categorie.value ? avantCategorie.value.filter((f) => f.categorie_id === categorie.value) : avantCategorie.value))

// seules les catégories qui ont des fournisseurs sont proposées (plus la catégorie choisie, pour pouvoir la quitter)
const onglets = computed(() => {
  const nombres = {}
  for (const f of avantCategorie.value) nombres[f.categorie_id] = (nombres[f.categorie_id] || 0) + 1
  const presentes = categories.value
    .filter((c) => nombres[c.id] || c.id === categorie.value)
    .map((c) => ({ ...c, nombre: nombres[c.id] || 0 }))
  return [{ id: '', libelle: 'Tous', icone: null, nombre: avantCategorie.value.length }, ...presentes]
})
const filtreActif = computed(() => !!(recherche.value.trim() || categorie.value || livraison.value))

onMounted(async () => {
  const [r, c] = await Promise.all([chargerFournisseurs(), chargerCategories()])
  liste.value = r.donnees
  categories.value = c
  chargement.value = false
})

// filtres gardés dans l'adresse (lien partageable, retour arrière) sans empiler l'historique
watch([recherche, categorie, livraison], ([q, c, l]) => {
  const query = {}
  if (q.trim()) query.q = q.trim()
  if (c) query.categorie = c
  if (l) query.livraison = '1'
  router.replace({ query })
})

function reinitialiser() { recherche.value = ''; categorie.value = ''; livraison.value = false }
</script>

<template>
  <div id="page-fournisseurs" class="page">
    <div class="conteneur annuaire">
      <header class="annuaire-entete">
        <span class="section-surtitre">Annuaire</span>
        <h1 class="page-titre">Fournisseurs de Mayotte</h1>
        <p class="page-sous-titre">Les entreprises de matériaux de l’île, à contacter directement : appel, itinéraire ou e-mail en un geste.</p>
      </header>

      <FiltresFournisseurs v-model:recherche="recherche" v-model:categorie="categorie" v-model:livraison="livraison" :onglets="onglets" />

      <!-- squelette : la mise en page ne saute pas à l'arrivée des données -->
      <ul v-if="chargement" class="annuaire-liste" aria-busy="true" aria-label="Chargement des fournisseurs">
        <li v-for="n in 4" :key="n" class="annuaire-squelette" aria-hidden="true"><span></span><span><span></span><span></span></span></li>
      </ul>

      <template v-else-if="resultats.length">
        <div class="annuaire-barre">
          <p class="annuaire-compteur" role="status" aria-live="polite">
            <strong>{{ resultats.length }}</strong> fournisseur{{ resultats.length > 1 ? 's' : '' }}<template v-if="filtreActif"> trouvé{{ resultats.length > 1 ? 's' : '' }}</template>
          </p>
          <button v-if="filtreActif" type="button" class="annuaire-lien" @click="reinitialiser">Effacer les filtres</button>
        </div>
        <ul class="annuaire-liste">
          <CarteFournisseur v-for="f in resultats" :key="f.id" :fournisseur="f" />
        </ul>
      </template>

      <div v-else class="annuaire-vide" role="status">
        <span class="annuaire-vide-icone" aria-hidden="true"><i class="fa-solid fa-magnifying-glass"></i></span>
        <p><strong>Aucun fournisseur trouvé</strong></p>
        <p>Essayez un autre mot (nom, commune, matériau) ou retirez un filtre.</p>
        <button type="button" class="btn btn-secondaire btn-sm" @click="reinitialiser">Voir tous les fournisseurs</button>
      </div>

      <aside class="annuaire-pied">
        <span class="annuaire-pied-icone" aria-hidden="true"><i class="fa-solid fa-handshake"></i></span>
        <div>
          <strong>Vous êtes fournisseur de matériaux ?</strong>
          <p>Faites connaître votre entreprise aux particuliers et professionnels qui chiffrent leur chantier sur BTM.</p>
        </div>
        <a href="mailto:contact@btm.yt?subject=Référencement%20dans%20l’annuaire%20BTM" class="btn btn-primaire btn-sm">Être référencé</a>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.annuaire-entete { margin-bottom: 28px; }

.annuaire-barre { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 24px 0 10px; }
.annuaire-compteur { margin: 0; font-size: .86rem; color: var(--gris-500); }
.annuaire-compteur strong { color: var(--ardoise); }
.annuaire-liste { margin: 0; padding: 0; list-style: none; overflow: hidden; border: 1px solid var(--gris-200); border-radius: var(--rayon-lg); background: #fff; }
.annuaire-barre + .annuaire-liste { margin-top: 0; }
ul.annuaire-liste[aria-busy] { margin-top: 24px; }

.annuaire-squelette { display: flex; align-items: center; gap: 16px; padding: 18px 16px; border-bottom: 1px solid var(--gris-100); }
.annuaire-squelette:last-child { border-bottom: 0; }
.annuaire-squelette > span:first-child { width: 52px; height: 52px; flex-shrink: 0; border-radius: 14px; }
.annuaire-squelette > span:last-child { display: flex; flex: 1; flex-direction: column; gap: 8px; }
.annuaire-squelette > span:last-child span { height: 12px; border-radius: 6px; }
.annuaire-squelette > span:last-child span:first-child { width: 40%; height: 14px; }
.annuaire-squelette > span:last-child span:last-child { width: 65%; }
.annuaire-squelette > span:first-child, .annuaire-squelette > span:last-child span {
  background: linear-gradient(90deg, var(--gris-100) 25%, var(--gris-50) 50%, var(--gris-100) 75%); background-size: 200% 100%; animation: annuaire-reflet 1.4s linear infinite;
}
@keyframes annuaire-reflet { to { background-position: -200% 0; } }

.annuaire-vide { display: flex; flex-direction: column; align-items: center; gap: 8px; margin-top: 24px; padding: 56px 20px; border: 1px dashed var(--gris-300); border-radius: var(--rayon-lg); color: var(--gris-500); text-align: center; }
.annuaire-vide p { margin: 0; }
.annuaire-vide p strong { color: var(--ardoise); font-size: 1.05rem; }
.annuaire-vide .btn { margin-top: 10px; }
.annuaire-vide-icone { width: 52px; height: 52px; display: grid; place-items: center; margin-bottom: 6px; border-radius: 50%; background: var(--gris-100); color: var(--gris-400); font-size: 1.2rem; }

.annuaire-lien { border: 0; background: none; padding: 6px 0; font: inherit; font-size: .86rem; font-weight: 600; color: var(--lagon-700); cursor: pointer; }
.annuaire-lien:hover { text-decoration: underline; text-underline-offset: 3px; }

.annuaire-pied { display: flex; align-items: center; gap: 16px; margin-top: 40px; padding: 20px 22px; border-radius: var(--rayon-lg); background: var(--gris-50); }
.annuaire-pied-icone { width: 44px; height: 44px; flex-shrink: 0; display: grid; place-items: center; border-radius: 12px; background: var(--lagon-100); color: var(--lagon-700); }
.annuaire-pied > div { flex: 1; min-width: 0; }
.annuaire-pied strong { display: block; font-family: var(--font-display); font-size: 1.3rem; font-weight: 700; color: var(--ardoise); }
.annuaire-pied p { margin: 4px 0 0; color: var(--gris-500); font-size: .88rem; line-height: 1.5; }
.annuaire-pied .btn { flex-shrink: 0; }

/* grand écran : la page occupe toute la largeur du gabarit, les fournisseurs passent sur deux colonnes de cartes */
@media (min-width: 1200px) {
  .annuaire-liste { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 12px; overflow: visible; border: 0; border-radius: 0; background: none; }
  .annuaire-liste > :deep(li), .annuaire-liste > :deep(li:last-child) { overflow: hidden; border: 1px solid var(--gris-200); border-radius: var(--rayon-lg); background: #fff; }
  .annuaire-squelette:last-child { border-bottom: 1px solid var(--gris-200); }
}
@media (prefers-reduced-motion: reduce) {
  .annuaire-squelette > span:first-child, .annuaire-squelette > span:last-child span { animation: none; }
}
@media (max-width: 600px) {
  .annuaire-entete { margin-bottom: 20px; }
  .annuaire-liste { margin-left: calc(-1 * var(--gouttiere)); margin-right: calc(-1 * var(--gouttiere)); border-width: 1px 0; border-radius: 0; }
  .annuaire-pied { flex-direction: column; align-items: flex-start; text-align: left; }
  .annuaire-pied .btn { width: 100%; justify-content: center; }
}
</style>

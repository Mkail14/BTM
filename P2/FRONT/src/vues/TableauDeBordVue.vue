<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useProjets } from '@/composables/useProjets.js'
import { useCalculateur } from '@/composables/useCalculateur.js'
import { useAuth } from '@/composables/useAuth.js'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'
import CarteProjet from '@/composants/tableau-de-bord/CarteProjet.vue'
import EtatVide from '@/composants/commun/EtatVide.vue'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import BandeauAvertissement from '@/composants/commun/BandeauAvertissement.vue'

const router = useRouter()
const { projets, vide, chargement, erreur, rafraichir, supprimer } = useProjets()
const calc = useCalculateur()
const { connecte, backendDisponible } = useAuth()

const aSupprimer = ref(null)
const suppressionEnCours = ref(false)
const tri = ref('recent')

const projetsTries = computed(() => {
  const l = [...projets.value]
  if (tri.value === 'cout') return l.sort((a, b) => (b.cout_total ?? b.resultat?.total ?? 0) - (a.cout_total ?? a.resultat?.total ?? 0))
  if (tri.value === 'nom') return l.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
  return l.sort((a, b) => new Date(b.cree_le) - new Date(a.cree_le))
})
const totalCumule = computed(() => projets.value.reduce((s, p) => s + (p.cout_total ?? p.resultat?.total ?? 0), 0))

onMounted(rafraichir)
watch(connecte, rafraichir)

function voir(p) { calc.afficherResultat(p); router.push('/resultats') }
function dupliquer(p) { calc.chargerDepuisProjet(p); router.push({ path: '/calculateur', query: { type: p.type } }) }
async function confirmerSuppression() {
  suppressionEnCours.value = true
  try { await supprimer(aSupprimer.value.id); aSupprimer.value = null } finally { suppressionEnCours.value = false }
}
</script>

<template>
  <div id="page-dashboard" class="page">
    <div class="conteneur">
      <header class="page-entete tdb-entete">
        <div>
          <span class="section-surtitre"><i class="fa-solid fa-folder-open"></i> Tableau de bord</span>
          <h1 class="page-titre">Mes projets</h1>
          <p class="page-sous-titre">Retrouvez, dupliquez et gérez toutes vos estimations sauvegardées.</p>
        </div>
        <BoutonBase to="/calculateur" icone="fa-solid fa-plus">Nouvelle estimation</BoutonBase>
      </header>

      <BandeauAvertissement v-if="!connecte" type="info" compact class="tdb-note">
        <template v-if="backendDisponible">Vos projets sont enregistrés sur cet appareil. <router-link to="/connexion" class="lien-inline">Connectez-vous</router-link> pour les synchroniser dans le cloud.</template>
        <template v-else>Vos projets sont enregistrés dans ce navigateur (localStorage) et ne sont pas synchronisés entre appareils.</template>
      </BandeauAvertissement>
      <BandeauAvertissement v-if="erreur" type="erreur" compact class="tdb-note">{{ erreur }}</BandeauAvertissement>

      <template v-if="!vide">
        <section class="tdb-stats" aria-label="Statistiques">
          <div class="tdb-stat"><span class="tdb-stat-val mono">{{ projets.length }}</span><span>projet{{ projets.length > 1 ? 's' : '' }}</span></div>
          <div class="tdb-stat"><span class="tdb-stat-val mono">{{ formaterEuros(totalCumule) }}</span><span>budget cumulé</span></div>
          <label class="tdb-tri champ">
            <span class="visually-hidden">Trier par</span>
            <select v-model="tri"><option value="recent">Plus récents</option><option value="cout">Coût décroissant</option><option value="nom">Nom A→Z</option></select>
          </label>
        </section>

        <transition-group name="liste" tag="div" class="grille grille-3">
          <CarteProjet v-for="p in projetsTries" :key="p.id" :projet="p" @voir="voir" @dupliquer="dupliquer" @supprimer="aSupprimer = $event" />
        </transition-group>
      </template>

      <div v-else-if="chargement" class="tdb-chargement"><span class="spinner spinner-grand"></span></div>

      <EtatVide v-else icone="fa-regular fa-folder-open" titre="Aucun projet" message="Vous n’avez pas encore sauvegardé d’estimation. Lancez un calcul pour créer votre premier projet.">
        <BoutonBase to="/calculateur" icone="fa-solid fa-calculator">Créer une estimation</BoutonBase>
      </EtatVide>

      <!-- Confirmation suppression (BF31) -->
      <transition name="fondu">
        <div v-if="aSupprimer" class="modale-fond" @click.self="aSupprimer = null">
          <div class="modale" role="alertdialog" aria-modal="true" aria-labelledby="suppr-titre" aria-describedby="suppr-desc">
            <span class="modale-icone"><i class="fa-regular fa-trash-can"></i></span>
            <h2 id="suppr-titre">Supprimer ce projet ?</h2>
            <p id="suppr-desc" class="texte-secondaire">« {{ aSupprimer.nom }} » sera définitivement supprimé. Cette action est irréversible.</p>
            <div class="modale-actions">
              <BoutonBase variante="ghost" @click="aSupprimer = null">Annuler</BoutonBase>
              <BoutonBase variante="danger" icone="fa-regular fa-trash-can" :chargement="suppressionEnCours" @click="confirmerSuppression">Supprimer</BoutonBase>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<style scoped>
.tdb-entete { display: flex; flex-wrap: wrap; gap: 20px; justify-content: space-between; align-items: flex-end; }
.tdb-note { margin-bottom: 20px; }
.lien-inline { font-weight: 700; text-decoration: underline; }
.tdb-stats { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; margin-bottom: 26px; }
.tdb-stat { display: flex; flex-direction: column; padding: 12px 20px; background: #fff; border: 1px solid var(--bordure); border-radius: var(--rayon); font-size: .82rem; color: var(--texte-secondaire); }
.tdb-stat-val { font-size: 1.4rem; font-weight: 700; color: var(--lagon-700); }
.tdb-tri { margin-left: auto; min-width: 190px; }
.tdb-chargement { display: grid; place-items: center; padding: 60px; }
.modale-fond { position: fixed; inset: 0; z-index: 200; background: rgba(6,32,44,.55); backdrop-filter: blur(4px); display: grid; place-items: center; padding: 20px; }
.modale { background: #fff; border-radius: var(--rayon-lg); padding: 30px; width: 100%; max-width: 440px; box-shadow: var(--ombre-lg); text-align: center; animation: apparaitre .3s ease; }
.modale-icone { width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; margin: 0 auto 16px; background: var(--erreur-clair); color: var(--erreur); font-size: 1.6rem; }
.modale h2 { font-size: 1.7rem; color: var(--ardoise); margin-bottom: 8px; }
.modale-actions { display: flex; justify-content: center; gap: 10px; margin-top: 24px; }
.liste-enter-active, .liste-leave-active { transition: all .35s ease; }
.liste-enter-from, .liste-leave-to { opacity: 0; transform: translateY(14px) scale(.98); }
.liste-move { transition: transform .35s ease; }
</style>

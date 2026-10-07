<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { trouverTypeProjet } from '@/donnees/typesProjets.js'
import { useRouter } from 'vue-router'
import { useProjets } from '@/composables/useProjets.js'
import { useCalculateur } from '@/composables/useCalculateur.js'
import { useAuth } from '@/composables/useAuth.js'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'
import CarteProjet from '@/composants/tableau-de-bord/CarteProjet.vue'
import PropositionsRealisation from '@/composants/tableau-de-bord/PropositionsRealisation.vue'
import BoutonBase from '@/composants/commun/BoutonBase.vue'

const router = useRouter()
const { projets, vide, chargement, erreur, rafraichir, supprimer } = useProjets()
const calc = useCalculateur()
const { connecte, backendDisponible, utilisateur } = useAuth()

const aSupprimer = ref(null)
const suppressionEnCours = ref(false)

const projetsTries = computed(() => [...projets.value].sort((a, b) => new Date(b.cree_le) - new Date(a.cree_le)))
const totalCumule = computed(() => projets.value.reduce((s, p) => s + (p.cout_total ?? p.resultat?.total ?? 0), 0))

onMounted(rafraichir)
// recharge à chaque changement de compte (y compris d'un compte à un autre, sans passer par « déconnecté »)
watch(() => utilisateur.value?.id, () => rafraichir())

function voir(p) { calc.afficherResultat(p); router.push('/resultats') }
// Achat direct et devis pro n'ont pas de formulaire : la copie s'ouvre dans les résultats, sans code de retrait
function dupliquer(p) {
  if (!trouverTypeProjet(p.type)) { calc.afficherResultat({ ...p, code_retrait: '' }); return router.push('/resultats') }
  calc.chargerDepuisProjet(p); router.push({ path: '/calculateur', query: { type: p.type } })
}
async function confirmerSuppression() {
  suppressionEnCours.value = true
  try { await supprimer(aSupprimer.value.id); aSupprimer.value = null } finally { suppressionEnCours.value = false }
}
</script>

<template>
  <div id="page-dashboard" class="page">
    <div class="conteneur tdb">
      <header class="tdb-entete">
        <div>
          <h1 class="page-titre">Mes projets</h1>
          <p v-if="!vide" class="tdb-resume">
            {{ projets.length }} projet{{ projets.length > 1 ? 's' : '' }} · <span class="prix">{{ formaterEuros(totalCumule) }}</span>
          </p>
        </div>
        <BoutonBase to="/calculateur" icone="fa-solid fa-plus">Nouveau</BoutonBase>
      </header>

      <!-- invitation de BTM à mettre un projet en avant sur la page d'accueil -->
      <PropositionsRealisation v-if="connecte" />

      <p v-if="erreur" class="tdb-note" :title="erreur">Synchronisation indisponible — projets de cet appareil uniquement.</p>
      <p v-else-if="!connecte && backendDisponible" class="tdb-note">
        Enregistrés sur cet appareil. <router-link to="/connexion">Se connecter</router-link> pour les retrouver partout.
      </p>

      <transition-group v-if="!vide" name="liste" tag="ul" class="tdb-liste">
        <CarteProjet v-for="p in projetsTries" :key="p.id" :projet="p" @voir="voir" @dupliquer="dupliquer" @supprimer="aSupprimer = $event" />
      </transition-group>

      <div v-else-if="chargement" class="tdb-vide"><span class="spinner spinner-grand"></span></div>

      <div v-else class="tdb-vide">
        <p>Aucun projet pour l’instant.</p>
        <BoutonBase to="/calculateur" variante="secondaire">Faire un devis</BoutonBase>
      </div>

      <transition name="fondu">
        <div v-if="aSupprimer" class="modale-fond" @click.self="aSupprimer = null">
          <div class="modale" role="alertdialog" aria-modal="true" aria-labelledby="suppr-titre">
            <h2 id="suppr-titre">Supprimer « {{ aSupprimer.nom }} » ?</h2>
            <div class="modale-actions">
              <BoutonBase variante="ghost" @click="aSupprimer = null">Annuler</BoutonBase>
              <BoutonBase variante="danger" :chargement="suppressionEnCours" @click="confirmerSuppression">Supprimer</BoutonBase>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<style scoped>
.tdb-entete { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; margin-bottom: 28px; }
.tdb-resume { margin: 6px 0 0; color: var(--gris-500); }

.tdb-note { margin: 0 0 16px; font-size: .88rem; color: var(--gris-500); }
.tdb-note a { color: var(--lagon-700); font-weight: 600; }

.tdb-liste { list-style: none; margin: 0 -12px; padding: 0; display: flex; flex-direction: column; }
.tdb-liste > :deep(li + li) { box-shadow: 0 -1px 0 var(--gris-100); }

.tdb-vide { display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 80px 20px; color: var(--gris-500); text-align: center; }
.tdb-vide p { margin: 0; }

.modale-fond { position: fixed; inset: 0; z-index: 200; background: rgba(6,32,44,.45); backdrop-filter: blur(4px); display: grid; place-items: center; padding: 20px; }
.modale { background: #fff; border-radius: var(--rayon-lg); padding: 28px; width: 100%; max-width: 400px; box-shadow: var(--ombre-lg); animation: apparaitre .25s ease; }
.modale h2 { font-size: 1.4rem; color: var(--ardoise); word-break: break-word; }
.modale-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px; }

.liste-enter-active, .liste-leave-active { transition: all .3s ease; }
.liste-enter-from, .liste-leave-to { opacity: 0; transform: translateY(8px); }
.liste-move { transition: transform .3s ease; }
</style>

<script setup>
/**
 * Espace fournisseur — même cadre que l'espace admin (barre latérale, meta.pleinEcran, notifications partagées).
 * Sections : tableau de bord, validation d'un projet au comptoir (code de retrait → préparation → caisse → reçu),
 * paiements (encaissements, journal, reversement à BTM), promotions, matériaux (prix et stock) et compte.
 * Les sections sont chargées avec la vue (pas de chargement à chaque clic) ; tableau de bord et compte
 * tiennent sur un écran d'ordinateur, sans défilement.
 * La RLS et les fonctions SQL limitent toutes les données à la fiche liée au compte.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth.js'
import { initiales } from '@/composables/useAdmin.js'
import { useEspaceFournisseur } from '@/composables/useEspaceFournisseur.js'
import { activerModeSite } from '@/composables/useModeSite.js'
import LogoBtm from '@/composants/commun/LogoBtm.vue'
import AdminRetours from '@/composants/admin/AdminRetours.vue'
import SectionTableauBord from '@/composants/fournisseur/SectionTableauBord.vue'
import SectionValider from '@/composants/fournisseur/SectionValider.vue'
import SectionPaiements from '@/composants/fournisseur/SectionPaiements.vue'
import SectionPromotions from '@/composants/fournisseur/SectionPromotions.vue'
import SectionMateriaux from '@/composants/fournisseur/SectionMateriaux.vue'
import SectionMaFiche from '@/composants/fournisseur/SectionMaFiche.vue'
import SectionMonCompte from '@/composants/fournisseur/SectionMonCompte.vue'
import '@/composants/admin/admin.css'

const sections = [
  { id: 'apercu', label: 'Tableau de bord', icone: 'fa-solid fa-chart-simple', titre: 'Tableau de bord', sousTitre: 'Votre activité BTM en un coup d’œil.', composant: SectionTableauBord, fixe: true },
  { id: 'valider', label: 'Valider un projet', icone: 'fa-solid fa-ticket', titre: 'Valider un projet', sousTitre: 'Tapez le code de retrait du client, préparez sa commande et encaissez.', composant: SectionValider },
  { id: 'paiements', label: 'Paiements', icone: 'fa-solid fa-receipt', titre: 'Paiements', sousTitre: 'Encaissements, reçus, journal et reversement à BTM.', recherche: 'Rechercher un reçu, un projet, un code…', composant: SectionPaiements },
  { id: 'promotions', label: 'Promotions', icone: 'fa-solid fa-tags', titre: 'Promotions', sousTitre: 'Vos remises et codes promo, appliqués en caisse.', recherche: 'Rechercher une promotion, un code…', composant: SectionPromotions },
  { id: 'materiaux', label: 'Matériaux', icone: 'fa-solid fa-boxes-stacked', titre: 'Matériaux', sousTitre: 'Vos prix et vos stocks, appliqués à chaque encaissement.', recherche: 'Rechercher un matériau…', composant: SectionMateriaux },
  { id: 'compte', label: 'Mon compte', icone: 'fa-solid fa-user-gear', titre: 'Mon compte', sousTitre: 'Votre entreprise dans l’annuaire et vos identifiants de connexion.', fixe: true }
]

const route = useRoute()
const router = useRouter()
const { fournisseurLie, deconnexion } = useAuth()
const { fiche, devis, erreur, enAttente, nomCompte, soldeBtm, charger } = useEspaceFournisseur()

const section = computed(() => sections.find((s) => s.id === route.params.section) || sections[0])
const lienSection = (id) => (id === 'apercu' ? '/espace-fournisseur' : `/espace-fournisseur/${id}`)
const menuOuvert = ref(false)
const recherche = ref('')
const ongletCompte = ref('entreprise')
watch(() => section.value.id, () => { recherche.value = ''; menuOuvert.value = false })
watch(section, (s) => { document.title = `${s.titre} — Espace fournisseur BTM` }, { immediate: true })

onMounted(charger)
watch(fournisseurLie, charger)

// « Voir le site » : le fournisseur parcourt le site public en tant que professionnel
function voirLeSite() {
  activerModeSite()
  router.push('/')
}

async function seDeconnecter() {
  await deconnexion()
  router.push('/') // déconnecté : retour à l'accueil (il n'y a pas de page de connexion)
}
</script>

<template>
  <div class="adm adm-cadre" :class="{ 'ecran-fixe': section.fixe }">
    <!-- Barre latérale -->
    <aside class="adm-lat" :class="{ ouvert: menuOuvert }" aria-label="Navigation de l’espace fournisseur">
      <router-link to="/espace-fournisseur" class="adm-lat-logo" aria-label="Tableau de bord">
        <span class="adm-lat-logo-icone"><LogoBtm :taille="30" /></span>
        <span class="adm-lat-logo-texte"><strong>BTM</strong><small>Espace fournisseur</small></span>
      </router-link>

      <nav class="adm-lat-nav">
        <router-link
          v-for="s in sections" :key="s.id" :to="lienSection(s.id)"
          class="adm-lat-lien" :class="{ actif: section.id === s.id }" :aria-current="section.id === s.id ? 'page' : undefined"
        >
          <i :class="s.icone" aria-hidden="true"></i><span>{{ s.label }}</span>
          <small v-if="s.id === 'valider' && enAttente.length" class="ef-compteur" :title="`${enAttente.length} devis en attente`">{{ enAttente.length }}</small>
          <small v-else-if="s.id === 'paiements' && soldeBtm.reste > 0" class="ef-point" title="Montant à reverser à BTM"></small>
        </router-link>
      </nav>

      <div class="adm-lat-bas">
        <button type="button" class="adm-lat-lien" title="Parcourir le site comme un professionnel" @click="voirLeSite"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i><span>Voir le site</span></button>
        <button type="button" class="adm-lat-lien" @click="seDeconnecter"><i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i><span>Déconnexion</span></button>
      </div>
    </aside>
    <div v-if="menuOuvert" class="adm-lat-voile" @click="menuOuvert = false"></div>

    <!-- Contenu -->
    <div class="adm-principal">
      <header class="adm-haut">
        <button type="button" class="adm-icone-btn adm-icone-btn-bord adm-burger" :aria-expanded="menuOuvert" aria-label="Ouvrir le menu" @click="menuOuvert = true">
          <i class="fa-solid fa-bars"></i>
        </button>
        <div class="adm-haut-titre">
          <h1>{{ section.titre }}</h1>
          <p>{{ section.sousTitre }}</p>
        </div>
        <label v-if="section.recherche" class="adm-haut-recherche">
          <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
          <input v-model="recherche" type="search" :placeholder="section.recherche" :aria-label="section.recherche" />
        </label>
        <router-link :to="lienSection('compte')" class="adm-haut-profil ef-profil" title="Mon compte">
          <span class="adm-avatar rond">{{ initiales(fiche?.nom || nomCompte) }}</span>
          <span><strong>{{ fiche?.nom || nomCompte }}</strong><small>{{ nomCompte }}</small></span>
          <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
        </router-link>
      </header>

      <p v-if="erreur" class="adm-alerte ef-erreur" role="alert">
        <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ erreur }}
        <button type="button" class="adm-btn adm-btn-clair adm-btn-sm" @click="charger">Réessayer</button>
      </p>

      <div v-if="devis === null" class="adm-chargement"><span class="spinner spinner-grand"></span></div>

      <!-- Mon compte : l'entreprise (fiche de l'annuaire) et les identifiants -->
      <div v-else-if="section.id === 'compte'" class="ef-compte">
        <div class="adm-segments" role="tablist" aria-label="Mon compte">
          <button type="button" role="tab" :aria-selected="ongletCompte === 'entreprise'" @click="ongletCompte = 'entreprise'"><i class="fa-solid fa-store" aria-hidden="true"></i> Mon entreprise</button>
          <button type="button" role="tab" :aria-selected="ongletCompte === 'identifiants'" @click="ongletCompte = 'identifiants'"><i class="fa-solid fa-key" aria-hidden="true"></i> Identifiants</button>
        </div>
        <SectionMaFiche v-if="ongletCompte === 'entreprise'" :fiche="fiche" @maj="fiche = $event" />
        <SectionMonCompte v-else />
      </div>

      <component :is="section.composant" v-else :key="section.id" v-bind="section.recherche ? { recherche } : {}" />
    </div>

    <AdminRetours />
  </div>
</template>

<style scoped>
.ef-compteur { margin-left: auto; min-width: 22px; padding: 1px 7px; border-radius: 999px; background: #f59e0b; color: var(--adm-noir); font-size: .74rem; font-weight: 700; text-align: center; }
.ef-profil { text-decoration: none; }
.ef-erreur { align-items: center; }
.ef-erreur .adm-btn { margin-left: auto; }
.ef-point { width: 8px; height: 8px; margin-left: auto; border-radius: 50%; background: #f59e0b; }
.ef-compte { display: flex; flex-direction: column; gap: 18px; }
.ef-compte > .adm-segments { align-self: flex-start; }

/* Tableau de bord et compte : exactement la hauteur de l'écran, sans défilement de la page (ordinateur) */
@media (min-width: 1024px) and (min-height: 640px) {
  .adm-cadre.ecran-fixe { height: 100dvh; grid-template-rows: minmax(0, 1fr); }
  .adm-cadre.ecran-fixe .adm-principal { display: flex; flex-direction: column; min-height: 0; padding-bottom: 0; }
  .adm-cadre.ecran-fixe .adm-haut { flex: none; margin-bottom: 18px; }
  .adm-cadre.ecran-fixe .adm-principal > :not(.adm-haut):not(.ef-erreur) { flex: 1; min-height: 0; }
  .ecran-fixe .ef-compte > :last-child { flex: 1; min-height: 0; }
}
@media (min-width: 1024px) and (max-height: 820px) {
  .adm-cadre.ecran-fixe .adm-haut { margin-bottom: 10px; }
  .adm-cadre.ecran-fixe .adm-haut-titre p { display: none; }
}
</style>

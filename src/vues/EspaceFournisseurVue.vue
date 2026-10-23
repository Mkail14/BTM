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
import { useOuverture } from '@/composables/useOuverture.js'
import { useThemeAdmin } from '@/composables/useThemeAdmin.js'
import LogoBtm from '@/composants/commun/LogoBtm.vue'
import AdminRetours from '@/composants/admin/AdminRetours.vue'
import SectionTableauBord from '@/composants/fournisseur/SectionTableauBord.vue'
import SectionValider from '@/composants/fournisseur/SectionValider.vue'
import SectionPaiements from '@/composants/fournisseur/SectionPaiements.vue'
import SectionPromotions from '@/composants/fournisseur/SectionPromotions.vue'
import SectionMateriaux from '@/composants/fournisseur/SectionMateriaux.vue'
import SectionMesAvis from '@/composants/fournisseur/SectionMesAvis.vue'
import SectionCompte from '@/composants/fournisseur/SectionCompte.vue'
import '@/composants/admin/admin.css'

const sections = [
  { id: 'apercu', label: 'Tableau de bord', icone: 'fa-solid fa-chart-simple', titre: 'Tableau de bord', sousTitre: 'Votre activité BTM en un coup d’œil.', composant: SectionTableauBord, fixe: true, fixeMobile: true },
  { id: 'valider', label: 'Valider un projet', icone: 'fa-solid fa-ticket', titre: 'Valider un projet', sousTitre: 'Tapez le code de retrait du client, préparez sa commande et encaissez.', composant: SectionValider, fixeMobile: true },
  { id: 'paiements', label: 'Paiements', icone: 'fa-solid fa-receipt', titre: 'Paiements', sousTitre: 'Encaissements, reçus, journal et reversement à BTM.', recherche: 'Rechercher un reçu, un projet, un code…', composant: SectionPaiements },
  { id: 'promotions', label: 'Promotions', icone: 'fa-solid fa-tags', titre: 'Promotions', sousTitre: 'Vos remises et codes promo, appliqués en caisse.', recherche: 'Rechercher une promotion, un code…', composant: SectionPromotions },
  { id: 'materiaux', label: 'Catalogue', icone: 'fa-solid fa-boxes-stacked', titre: 'Catalogue', sousTitre: 'Ce que vous vendez, à vos prix et avec vos stocks, appliqués à chaque encaissement.', recherche: 'Rechercher un produit…', composant: SectionMateriaux },
  { id: 'avis', label: 'Avis clients', icone: 'fa-solid fa-star-half-stroke', titre: 'Avis de vos clients', sousTitre: 'Demandez leur avis aux clients venus retirer leur commande : il s’affiche sur votre fiche de l’annuaire.', composant: SectionMesAvis, fixe: true },
  { id: 'compte', label: 'Mon compte', icone: 'fa-solid fa-user-gear', titre: 'Mon compte', sousTitre: 'Votre entreprise dans l’annuaire et vos identifiants de connexion.', fixe: true }
]

const route = useRoute()
const router = useRouter()
const { fournisseurLie, deconnexion } = useAuth()
const { fiche, devis, erreur, enAttente, nomCompte, soldeBtm, vendCarreaux, charger } = useEspaceFournisseur()
const { sombre, basculer: basculerTheme } = useThemeAdmin()

// Vendeur de carrelage : le catalogue a aussi ses carreaux
const sectionsVisibles = computed(() => sections.map((s) => (s.id === 'materiaux' && vendCarreaux.value
  ? { ...s, sousTitre: 'Vos carreaux et vos autres produits, à vos prix et avec vos stocks.' }
  : s)))
// « Mon compte » s'ouvre par le profil en haut (et l'entreprise dans le tiroir) : pas de doublon dans le menu
const sectionsMenu = computed(() => sectionsVisibles.value.filter((s) => s.id !== 'compte'))
// L'ancienne adresse /carreaux mène au catalogue
const section = computed(() => sectionsVisibles.value.find((s) => s.id === (route.params.section === 'carreaux' ? 'materiaux' : route.params.section)) || sections[0])
const lienSection = (id) => (id === 'apercu' ? '/espace-fournisseur' : `/espace-fournisseur/${id}`)
// Téléphone : barre d'onglets en bas pour les gestes du comptoir, le reste dans le menu
const ONGLETS_BAS = [
  { id: 'apercu', label: 'Accueil', icone: 'fa-solid fa-chart-simple' },
  { id: 'valider', label: 'Valider', icone: 'fa-solid fa-ticket' },
  { id: 'paiements', label: 'Paiements', icone: 'fa-solid fa-receipt' },
  { id: 'materiaux', label: 'Catalogue', icone: 'fa-solid fa-boxes-stacked' }
]
const menuOuvert = ref(false)
const recherche = ref('')
watch(() => section.value.id, () => { recherche.value = ''; menuOuvert.value = false })
watch(section, (s) => { document.title = `${s.titre} — Espace fournisseur BTM` }, { immediate: true })

onMounted(charger)
watch(fournisseurLie, charger)

// « Voir le site » : le fournisseur parcourt le site public en tant que professionnel.
// Seulement une fois le site en ligne : en attente de partenaires ou en maintenance, le site public reste fermé à tous.
const { enAttente: siteFerme } = useOuverture()
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
  <div class="adm adm-cadre ef" :class="{ 'adm-sombre': sombre, 'ecran-fixe': section.fixe, 'fixe-mobile': section.fixeMobile }">
    <!-- Barre latérale (ordinateur, tablette) ; tiroir (téléphone) -->
    <aside class="adm-lat" :class="{ ouvert: menuOuvert }" aria-label="Navigation de l’espace fournisseur">
      <div class="ef-lat-tete">
        <router-link to="/espace-fournisseur" class="adm-lat-logo" aria-label="Tableau de bord">
          <span class="adm-lat-logo-icone"><LogoBtm :taille="30" /></span>
          <span class="adm-lat-logo-texte"><strong>BTM</strong><small>Espace fournisseur</small></span>
        </router-link>
        <button type="button" class="ef-lat-fermer" aria-label="Fermer le menu" @click="menuOuvert = false"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      </div>
      <router-link :to="lienSection('compte')" class="ef-lat-entreprise">
        <span class="adm-avatar rond">{{ initiales(fiche?.nom || nomCompte) }}</span>
        <span><strong>{{ fiche?.nom || nomCompte }}</strong><small>{{ nomCompte }}</small></span>
      </router-link>

      <nav class="adm-lat-nav">
        <router-link
          v-for="s in sectionsMenu" :key="s.id" :to="lienSection(s.id)"
          class="adm-lat-lien" :class="{ actif: section.id === s.id }" :aria-current="section.id === s.id ? 'page' : undefined"
        >
          <i :class="s.icone" aria-hidden="true"></i><span>{{ s.label }}</span>
          <small v-if="s.id === 'valider' && enAttente.length" class="ef-compteur" :title="`${enAttente.length} devis en attente`">{{ enAttente.length }}</small>
          <small v-else-if="s.id === 'paiements' && soldeBtm.reste > 0" class="ef-point" title="Montant à reverser à BTM"></small>
        </router-link>
      </nav>

      <div class="adm-lat-bas">
        <button v-if="siteFerme === false" type="button" class="adm-lat-lien" title="Parcourir le site comme un professionnel" @click="voirLeSite"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i><span>Voir le site</span></button>
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
        <div class="adm-haut-outils">
          <button type="button" class="adm-haut-outil" :aria-pressed="sombre" :title="sombre ? 'Passer au thème clair' : 'Passer au thème sombre'" :aria-label="sombre ? 'Passer au thème clair' : 'Passer au thème sombre'" @click="basculerTheme">
            <i :class="sombre ? 'fa-solid fa-sun' : 'fa-solid fa-moon'" aria-hidden="true"></i>
          </button>
        </div>
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
      <SectionCompte v-else-if="section.id === 'compte'" :fiche="fiche" @maj="fiche = $event" />

      <component :is="section.composant" v-else :key="section.id" v-bind="section.recherche ? { recherche } : {}" />
    </div>

    <!-- Téléphone : onglets du comptoir, toujours à portée du pouce -->
    <nav class="ef-onglets" aria-label="Accès rapide">
      <router-link
        v-for="o in ONGLETS_BAS" :key="o.id" :to="lienSection(o.id)"
        :class="{ actif: section.id === o.id }" :aria-current="section.id === o.id ? 'page' : undefined"
      >
        <span class="ef-onglet-icone">
          <i :class="o.icone" aria-hidden="true"></i>
          <small v-if="o.id === 'valider' && enAttente.length" class="ef-onglet-pastille">{{ enAttente.length }}</small>
          <small v-else-if="o.id === 'paiements' && soldeBtm.reste > 0" class="ef-onglet-point"></small>
        </span>
        {{ o.label }}
      </router-link>
      <button type="button" :class="{ actif: !ONGLETS_BAS.some((o) => o.id === section.id) }" :aria-expanded="menuOuvert" @click="menuOuvert = true">
        <span class="ef-onglet-icone"><i class="fa-solid fa-bars" aria-hidden="true"></i></span>
        Menu
      </button>
    </nav>

    <AdminRetours />
  </div>
</template>

<style scoped>
.ef-compteur { margin-left: auto; min-width: 22px; padding: 1px 7px; border-radius: 999px; background: #f59e0b; color: #0f172a; font-size: .74rem; font-weight: 700; text-align: center; }
.ef-profil { text-decoration: none; }
/* Bouton thème clair / sombre, comme dans l'espace admin */
.adm-haut-outils { display: flex; flex: none; gap: 2px; padding: 4px; border-radius: 999px; background: var(--adm-carte); box-shadow: var(--adm-ombre); }
.adm-haut-outil {
  position: relative; width: 38px; height: 38px; flex: none; display: grid; place-items: center; border: 0; border-radius: 50%;
  background: transparent; color: var(--adm-encre-2); cursor: pointer; transition: background var(--transition), color var(--transition);
}
.adm-haut-outil:hover { background: var(--adm-ligne-2); color: var(--adm-encre); }
.adm-haut-outil:focus-visible { outline: 2px solid var(--adm-accent); outline-offset: 2px; }
.ef-erreur { align-items: center; }
.ef-erreur .adm-btn { margin-left: auto; }
.ef-point { width: 8px; height: 8px; margin-left: auto; border-radius: 50%; background: #f59e0b; }

/* Tête du menu et entreprise connectée */
.ef-lat-tete { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ef-lat-fermer { display: none; width: 40px; height: 40px; flex: none; place-items: center; border: 0; border-radius: 50%; background: rgba(255, 255, 255, .08); color: #fff; font-size: 1.05rem; cursor: pointer; }
.ef-lat-entreprise { display: none; align-items: center; gap: 12px; padding: 12px; border-radius: 16px; background: rgba(255, 255, 255, .07); color: #fff; text-decoration: none; }
.ef-lat-entreprise .adm-avatar { width: 40px; height: 40px; background: #fff; color: #0f172a; font-size: .8rem; }
.ef-lat-entreprise > span:last-child { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
.ef-lat-entreprise strong { font-size: .95rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ef-lat-entreprise small { color: rgba(255, 255, 255, .55); font-size: .78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Onglets du bas : téléphone seulement */
.ef-onglets { display: none; }

@media (max-width: 767px) {
  .ef { --ef-bas: calc(66px + env(safe-area-inset-bottom)); padding-bottom: calc(var(--ef-bas) + 12px); }
  .ef-lat-fermer { display: inline-grid; }
  .ef-lat-entreprise { display: flex; }
  .adm-lat { gap: 16px; }

  /* En-tête : titre à gauche, entreprise à droite (le menu est dans les onglets du bas) */
  .adm-haut { flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
  .adm-burger { display: none; }
  .adm-haut-titre { order: 0; flex: 1 1 0; }
  .adm-haut-titre h1 { font-size: 1.45rem; line-height: 1.2; }
  .adm-haut-outils { order: 1; }
  .ef-profil { display: inline-flex; order: 1; padding: 3px; }
  .ef-profil > span:nth-child(2), .ef-profil > i { display: none; }
  .ef-profil .adm-avatar { width: 40px; height: 40px; }
  .adm-haut-recherche { order: 2; flex: 1 1 100%; }

  .ef-onglets {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 240; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr));
    height: var(--ef-bas); padding: 6px 4px env(safe-area-inset-bottom); background: var(--adm-carte);
    border-top: 1px solid var(--adm-ligne); box-shadow: 0 -6px 24px rgba(15, 23, 42, .06);
  }
  .ef-onglets > a, .ef-onglets > button {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; min-width: 0; padding: 0 2px; border: 0; border-radius: 14px;
    background: none; color: var(--adm-muet); font: inherit; font-size: .7rem; font-weight: 600; text-decoration: none; white-space: nowrap; cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .ef-onglet-icone { position: relative; display: grid; place-items: center; width: 52px; height: 30px; border-radius: 999px; font-size: 1.05rem; transition: background var(--transition); }
  .ef-onglets .actif { color: var(--adm-encre); }
  .ef-onglets .actif .ef-onglet-icone { background: var(--adm-noir); color: #fff; }
  .ef-onglet-pastille { position: absolute; top: -4px; right: 4px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: #f59e0b; color: #0f172a; font-size: .66rem; font-weight: 700; line-height: 18px; text-align: center; }
  .ef-onglet-point { position: absolute; top: 1px; right: 10px; width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; box-shadow: 0 0 0 2px var(--adm-carte); }
}

/* Tableau de bord et compte : exactement la hauteur de l'écran, sans défilement de la page (ordinateur) */
@media (min-width: 1024px) and (min-height: 640px) {
  .adm-cadre.ecran-fixe { height: 100dvh; grid-template-rows: minmax(0, 1fr); }
  .adm-cadre.ecran-fixe .adm-principal { display: flex; flex-direction: column; min-height: 0; padding-bottom: 0; }
  .adm-cadre.ecran-fixe .adm-haut { flex: none; margin-bottom: 18px; }
  .adm-cadre.ecran-fixe .adm-principal > :not(.adm-haut):not(.ef-erreur) { flex: 1; min-height: 0; }
}
/* Téléphone : tableau de bord et validation tiennent aussi dans l'écran, au-dessus des onglets (sinon la page défile) */
@media (max-width: 767px) and (min-height: 560px) {
  /* cadre posé sur l'écran et page bloquée : rien ne peut dépasser dessous ni faire défiler */
  :global(html:has(.ef.fixe-mobile)), :global(html:has(.ef.fixe-mobile) body) { overflow: hidden; overscroll-behavior: none; }
  .adm-cadre.fixe-mobile { position: fixed; inset: 0; height: auto; grid-template-rows: minmax(0, 1fr); }
  .adm-cadre.fixe-mobile .adm-principal { display: flex; flex-direction: column; min-height: 0; padding-bottom: 0; }
  .adm-cadre.fixe-mobile .adm-haut { flex: none; margin-bottom: 10px; }
  .adm-cadre.fixe-mobile .adm-haut-titre h1 { font-size: 1.25rem; }
  .adm-cadre.fixe-mobile .ef-erreur { flex: none; }
  .adm-cadre.fixe-mobile .adm-principal > :not(.adm-haut):not(.ef-erreur) { flex: 1; min-height: 0; }
}
@media (min-width: 1024px) and (max-height: 820px) {
  .adm-cadre.ecran-fixe .adm-haut { margin-bottom: 10px; }
  .adm-cadre.ecran-fixe .adm-haut-titre p { display: none; }
}
</style>

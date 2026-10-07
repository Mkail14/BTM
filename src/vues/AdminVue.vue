<script setup>
/**
 * Espace administrateur — pilote tout le site : textes, prix et formules du calculateur,
 * fournisseurs, avis, utilisateurs et projets. Mise en page propre (barre latérale),
 * sans l'en-tête ni le pied du site public (meta.pleinEcran).
 * L'accès est contrôlé par la base (RLS + est_admin()) : un non-admin ne reçoit aucune donnée.
 */
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth.js'
import { useAdmin, initiales } from '@/composables/useAdmin.js'
import LogoBtm from '@/composants/commun/LogoBtm.vue'
import AdminRetours from '@/composants/admin/AdminRetours.vue'
import AdminCompte from '@/composants/admin/AdminCompte.vue'
import { useMessagerie } from '@/composables/useMessagerie.js'
import { useSupport } from '@/composables/useSupport.js'
import { useThemeAdmin } from '@/composables/useThemeAdmin.js'
import '@/composants/admin/admin.css'

const sections = [
  { id: 'apercu', label: 'Tableau de bord', icone: 'fa-solid fa-chart-simple', titre: 'Tableau de bord', sousTitre: 'L’activité de BTM en un coup d’œil.', composant: () => import('@/composants/admin/SectionApercu.vue') },
  { id: 'messagerie', label: 'Messagerie', icone: 'fa-solid fa-envelope', titre: 'Messagerie', sousTitre: 'La boîte contact@btm.yt : lisez, répondez et écrivez sans quitter l’admin.', composant: () => import('@/composants/admin/SectionMessagerie.vue') },
  { id: 'support', label: 'Support', icone: 'fa-solid fa-headset', titre: 'Support', sousTitre: 'Les discussions « Sur le site » : prenez le relais d’Awa quand un client a besoin d’un conseiller.', composant: () => import('@/composants/admin/SectionSupport.vue') },
  { id: 'contenus', label: 'Contenu du site', icone: 'fa-solid fa-pen-nib', titre: 'Contenu du site', sousTitre: 'Modifiez les textes affichés sur le site, sans toucher au code.', composant: () => import('@/composants/admin/SectionContenus.vue') },
  { id: 'calculateur', label: 'Calculateur & prix', icone: 'fa-solid fa-calculator', titre: 'Calculateur & prix', sousTitre: 'Prix des matériaux et constantes utilisées par chaque devis.', composant: () => import('@/composants/admin/SectionCalculateur.vue') },
  { id: 'codes', label: 'Codes promo', icone: 'fa-solid fa-ticket', titre: 'Codes promo', sousTitre: 'Réductions que vos clients saisissent sur leur devis.', recherche: 'Rechercher un code, une note…', composant: () => import('@/composants/admin/SectionCodes.vue') },
  { id: 'fournisseurs', label: 'Fournisseurs', icone: 'fa-solid fa-truck', titre: 'Fournisseurs', sousTitre: 'Annuaire affiché sur la page Fournisseurs et dans les résultats.', recherche: 'Rechercher un fournisseur, une commune…', composant: () => import('@/composants/admin/SectionFournisseurs.vue') },
  { id: 'avis', label: 'Avis', icone: 'fa-solid fa-star', titre: 'Avis clients', sousTitre: 'Modérez les avis affichés sur la page d’accueil.', recherche: 'Rechercher un nom, une ville, un mot…', composant: () => import('@/composants/admin/SectionAvis.vue') },
  { id: 'utilisateurs', label: 'Utilisateurs', icone: 'fa-solid fa-users', titre: 'Utilisateurs', sousTitre: 'Comptes, rôles et accès.', recherche: 'Rechercher un nom, un e-mail…', composant: () => import('@/composants/admin/SectionUtilisateurs.vue') },
  { id: 'projets', label: 'Projets', icone: 'fa-solid fa-folder-open', titre: 'Projets', sousTitre: 'Estimations enregistrées par les utilisateurs.', recherche: 'Rechercher un projet, un propriétaire…', composant: () => import('@/composants/admin/SectionProjets.vue') }
].map((s) => ({ ...s, composant: defineAsyncComponent(s.composant) }))

const route = useRoute()
const router = useRouter()
const { utilisateur, deconnexion } = useAuth()
const { recherche, charger, migrationManquante, compteOuvert } = useAdmin()
const { sombre, basculer: basculerTheme } = useThemeAdmin()
// Vérifie dès l'ouverture que la base contient les tables récentes (contenus 0007, codes promo 0009)
onMounted(() => charger(['contenus', 'codes'], { force: true }))
// Messages non lus de contact@btm.yt : pastille du bouton du haut et du menu, relue toutes les 2 minutes
const { nonLus, suivre: suivreMessagerie, arreter: arreterMessagerie } = useMessagerie()
onMounted(suivreMessagerie)
onBeforeUnmount(arreterMessagerie)
// Demandes d’assistance qui attendent un conseiller : pastille du bouton casque et du menu, relue toutes les 30 s
const { enAttente, suivre: suivreSupport, arreter: arreterSupport } = useSupport()
onMounted(suivreSupport)
onBeforeUnmount(arreterSupport)
const refProjet = (import.meta.env.VITE_SUPABASE_URL || '').match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
const lienSql = refProjet ? `https://supabase.com/dashboard/project/${refProjet}/sql/new` : 'https://supabase.com/dashboard'

const section = computed(() => sections.find((s) => s.id === route.params.section) || sections[0])
const menuOuvert = ref(false)

watch(() => section.value.id, () => { recherche.value = ''; menuOuvert.value = false })
watch(section, (s) => { document.title = `${s.titre} — Administration BTM` }, { immediate: true })

const infos = computed(() => utilisateur.value?.user_metadata || {})
const nomAdmin = computed(() => [infos.value.prenom, infos.value.nom].filter(Boolean).join(' ') || infos.value.pseudo || utilisateur.value?.email?.split('@')[0] || 'Admin')

async function seDeconnecter() {
  await deconnexion()
  router.push('/connexion')
}
</script>

<template>
  <div class="adm adm-cadre" :class="{ 'adm-sombre': sombre, 'ecran-fixe': ['apercu', 'messagerie', 'support', 'contenus', 'utilisateurs', 'calculateur'].includes(section.id) }">
    <!-- Barre latérale -->
    <aside class="adm-lat" :class="{ ouvert: menuOuvert }" aria-label="Navigation de l’administration">
      <router-link to="/admin" class="adm-lat-logo" aria-label="Tableau de bord">
        <span class="adm-lat-logo-icone"><LogoBtm :taille="30" /></span>
        <span class="adm-lat-logo-texte"><strong>BTM</strong><small>Administration</small></span>
      </router-link>

      <nav class="adm-lat-nav">
        <router-link
          v-for="s in sections" :key="s.id" :to="s.id === 'apercu' ? '/admin' : `/admin/${s.id}`"
          class="adm-lat-lien" :class="{ actif: section.id === s.id }" :aria-current="section.id === s.id ? 'page' : undefined"
        >
          <i :class="s.icone" aria-hidden="true"></i><span>{{ s.label }}</span>
          <strong v-if="s.id === 'messagerie' && nonLus" class="adm-lat-pastille" :aria-label="`${nonLus} non lus`">{{ nonLus }}</strong>
          <strong v-if="s.id === 'support' && enAttente" class="adm-lat-pastille adm-lat-pastille-alerte" :aria-label="`${enAttente} en attente`">{{ enAttente }}</strong>
        </router-link>
      </nav>

      <div class="adm-lat-bas">
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
          <router-link to="/admin/support" class="adm-haut-outil" :class="{ actif: section.id === 'support' }" :title="enAttente ? `${enAttente} client${enAttente > 1 ? 's' : ''} attend${enAttente > 1 ? 'ent' : ''} un conseiller` : 'Support : discussions avec les clients'" :aria-label="enAttente ? `Support : ${enAttente} en attente` : 'Support'">
            <i class="fa-solid fa-headset" aria-hidden="true"></i>
            <strong v-if="enAttente" class="adm-haut-outil-pastille alerte">{{ enAttente > 99 ? '99+' : enAttente }}</strong>
          </router-link>
          <router-link to="/admin/messagerie" class="adm-haut-outil" :class="{ actif: section.id === 'messagerie' }" :title="nonLus ? `${nonLus} message${nonLus > 1 ? 's' : ''} non lu${nonLus > 1 ? 's' : ''} — contact@btm.yt` : 'Messagerie contact@btm.yt'" :aria-label="nonLus ? `Messagerie : ${nonLus} non lus` : 'Messagerie'">
            <i class="fa-solid fa-envelope" aria-hidden="true"></i>
            <strong v-if="nonLus" class="adm-haut-outil-pastille">{{ nonLus > 99 ? '99+' : nonLus }}</strong>
          </router-link>
        </div>
        <button type="button" class="adm-haut-profil" aria-haspopup="dialog" title="Compte BTM : reversements, RIB et administrateurs" @click="compteOuvert = true">
          <span class="adm-avatar rond">{{ initiales(nomAdmin) }}</span>
          <span><strong>{{ nomAdmin }}</strong><small>Administrateur</small></span>
          <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
        </button>
      </header>

      <div v-if="migrationManquante" class="adm-carte adm-migration" role="alert">
        <span class="adm-migration-icone"><i class="fa-solid fa-database" aria-hidden="true"></i></span>
        <div>
          <strong>La base Supabase n’est pas à jour</strong>
          <p>
            Les textes du site, les frais de service et la modération des avis ont besoin de nouvelles tables.
            Dans le SQL Editor, exécutez une à une les migrations manquantes du dossier <span class="adm-mono">BACK/supabase/migrations/</span> (0007, 0008, 0009), puis rechargez cette page.
          </p>
        </div>
        <a :href="lienSql" target="_blank" rel="noopener noreferrer" class="adm-btn adm-btn-noir">Ouvrir le SQL Editor <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>
      </div>

      <component :is="section.composant" :key="section.id" />
    </div>

    <AdminCompte v-if="compteOuvert" @fermer="compteOuvert = false" />
    <AdminRetours />
  </div>
</template>

<style scoped>
/* Tableau de bord : exactement la hauteur de l'écran, sans défilement de la page (ordinateur) */
@media (min-width: 1024px) and (min-height: 640px) {
  .adm-cadre.ecran-fixe { height: 100dvh; grid-template-rows: minmax(0, 1fr); }
  .adm-cadre.ecran-fixe .adm-principal { display: flex; flex-direction: column; min-height: 0; padding-bottom: 0; }
  .adm-cadre.ecran-fixe .adm-haut { flex: none; margin-bottom: 16px; }
  .adm-cadre.ecran-fixe .adm-migration { flex: none; margin-bottom: 14px; }
  .adm-cadre.ecran-fixe .adm-principal > .apercu, .adm-cadre.ecran-fixe .adm-principal > .messagerie, .adm-cadre.ecran-fixe .adm-principal > .support, .adm-cadre.ecran-fixe .adm-principal > .contenus, .adm-cadre.ecran-fixe .adm-principal > .utils, .adm-cadre.ecran-fixe .adm-principal > .calc { flex: 1; min-height: 0; padding-bottom: 20px; }
}
@media (min-width: 1024px) and (max-height: 820px) {
  .adm-cadre.ecran-fixe .adm-haut { margin-bottom: 10px; }
  .adm-cadre.ecran-fixe .adm-haut-titre h1 { font-size: 1.5rem; }
  .adm-cadre.ecran-fixe .adm-haut-titre p { display: none; }
}
/* Outils de l'en-tête : thème, support et messagerie dans une capsule de la hauteur du profil ; pastilles des non lus */
.adm-haut-outils { display: flex; flex: none; gap: 2px; padding: 4px; border-radius: 999px; background: var(--adm-carte); box-shadow: var(--adm-ombre); }
.adm-haut-outil {
  position: relative; width: 38px; height: 38px; flex: none; display: grid; place-items: center; border: 0; border-radius: 50%;
  background: transparent; color: var(--adm-encre-2); cursor: pointer; transition: background var(--transition), color var(--transition);
}
.adm-haut-outil:hover { background: var(--adm-ligne-2); color: var(--adm-encre); }
.adm-haut-outil.actif { background: var(--adm-accent-doux); color: var(--adm-info-texte); }
.adm-haut-outil:focus-visible { outline: 2px solid var(--adm-accent); outline-offset: 2px; }
.adm-haut-outil-pastille {
  position: absolute; top: -3px; right: -3px; min-width: 19px; height: 19px; padding: 0 5px; display: grid; place-items: center;
  border: 2px solid var(--adm-carte); border-radius: 999px; background: var(--adm-baisse); color: #fff; font-size: .66rem; font-weight: 700;
}
.adm-haut-outil-pastille.alerte, .adm-sombre .adm-haut-outil-pastille { color: #0b1220; }
.adm-haut-outil-pastille.alerte { background: #f59e0b; }
/* Tablette et téléphone : le profil reste le seul accès au compte BTM, réduit à son avatar */
@media (max-width: 1023px) {
  .adm-haut-profil { display: flex; flex: none; padding: 5px; }
  .adm-haut-profil > span:nth-child(2), .adm-haut-profil > i { display: none; }
}
.adm-lat-pastille-alerte { background: #f59e0b !important; }
.adm-lat-pastille { margin-left: auto; min-width: 22px; padding: 1px 7px; border-radius: 999px; background: var(--adm-accent); color: #fff; font-size: .74rem; text-align: center; }
.adm-migration { display: flex; flex-wrap: wrap; align-items: center; gap: 16px 20px; margin-bottom: 20px; padding: 20px 22px; box-shadow: inset 0 0 0 1px var(--adm-attention-bord), var(--adm-ombre); background: var(--adm-attention-fond); }
.adm-migration > div { flex: 1 1 320px; }
.adm-migration strong { font-size: .98rem; }
.adm-migration p { margin: 4px 0 0; color: var(--adm-attention-texte-2); font-size: .88rem; line-height: 1.55; }
.adm-migration-icone { width: 44px; height: 44px; flex: none; display: grid; place-items: center; border-radius: 14px; background: var(--adm-attention-fond-2); color: var(--adm-attention-texte); }
</style>

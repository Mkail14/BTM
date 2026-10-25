<script setup>
/**
 * Page d'attente de btm.yt : le site est en création et n'ouvre qu'avec au moins SEUIL_FOURNISSEURS
 * fournisseurs partenaires (voir useOuverture et App.vue). Même identité que l'accueil : décor du
 * mont Choungui (HeroPaysage), en-tête BTM, surtitre et titres du héros, boutons et champs du site.
 * Une page fixe, sans défilement.
 * « Devenir partenaire » ouvre la création du compte fournisseur (InscriptionFournisseur).
 * Avec `demande` : la même page devient l'écran du compte fournisseur en attente de validation par BTM
 * (en attente, rectification demandée, ou refusée) ; elle se met à jour seule quand BTM valide le compte.
 */
import { computed, onBeforeUnmount, onMounted } from 'vue'
import LogoBtm from '@/composants/commun/LogoBtm.vue'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import HeroPaysage from '@/composants/accueil/HeroPaysage.vue'
import { defineAsyncComponent } from 'vue'
// scène 3D chargée à part (three.js) : la page s'affiche sans l'attendre
const RobotChantier3D = defineAsyncComponent(() => import('@/composants/commun/RobotChantier3D.vue'))
const ordinateur = typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches
import { useFenetreAuth } from '@/composables/useFenetreAuth.js'
import { SEUIL_FOURNISSEURS } from '@/composables/useOuverture.js'
import { ouvrirInscriptionFournisseur } from '@/composables/useInscriptionFournisseur.js'
import { useAuth } from '@/composables/useAuth.js'

const props = defineProps({
  partenaires: { type: Number, default: 0 },
  maintenance: Boolean,
  demande: { type: Object, default: null } // compte fournisseur en attente de validation
})
const { ouvrirAuth } = useFenetreAuth()
const { deconnexion, rechargerRole } = useAuth()

const prets = computed(() => Math.min(props.partenaires, SEUIL_FOURNISSEURS))
const annee = new Date().getFullYear()

// page fixe : pas de barre de défilement tant qu'elle est affichée
onMounted(() => { document.documentElement.classList.add('page-fixe') })
onBeforeUnmount(() => { document.documentElement.classList.remove('page-fixe') })

// ---------- Compte fournisseur en attente de validation ----------
// la décision de BTM est relue toutes les 30 s (page visible) : validé, le compte rejoint aussitôt son espace
const statut = computed(() => props.demande?.statut || '')
let minuterie = null
onMounted(() => {
  if (!props.demande) return
  minuterie = setInterval(() => { if (document.visibilityState === 'visible') rechargerRole() }, 30000)
})
onBeforeUnmount(() => clearInterval(minuterie))
const ETAPES_VALIDATION = ['Compte créé', 'Vérification par BTM', 'Espace fournisseur ouvert']
const corriger = () => ouvrirInscriptionFournisseur(props.demande)
const seDeconnecter = () => deconnexion()
</script>

<template>
  <div class="bientot">
    <HeroPaysage />

    <!-- même en-tête que le site (logo et marque), réduit à l'accès partenaires -->
    <header class="bientot-entete">
      <div class="conteneur bientot-entete-inner">
        <span class="bientot-logo">
          <LogoBtm :taille="42" />
          <span class="bientot-marque"><strong>BTM</strong><small>Bâtiment &amp; Travaux Mayotte</small></span>
        </span>
        <button v-if="demande" type="button" class="bientot-connexion" @click="seDeconnecter"><i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i> Se déconnecter</button>
        <button v-else type="button" class="bientot-connexion" @click="ouvrirAuth('connexion')">Espace partenaires</button>
      </div>
    </header>

    <main class="conteneur bientot-corps">
      <div class="bientot-texte">
        <p class="bientot-surtitre">{{ demande ? `Espace fournisseur · ${demande.entreprise}` : 'Estimation de matériaux BTP · Mayotte' }}</p>
        <!-- compte fournisseur créé par l'entreprise, en attente de la décision de BTM -->
        <template v-if="demande">
          <template v-if="statut === 'a_corriger'">
            <h1 class="bientot-titre">Quelques corrections à apporter.</h1>
            <p class="bientot-desc">L’équipe BTM a examiné votre demande et vous demande de modifier certaines informations avant d’ouvrir votre espace.</p>
          </template>
          <template v-else-if="statut === 'refusee'">
            <h1 class="bientot-titre">Demande non retenue.</h1>
            <p class="bientot-desc">BTM ne peut pas ouvrir d’espace fournisseur pour {{ demande.entreprise }} pour le moment. Une question ? Écrivez-nous à <a href="mailto:contact@btm.yt">contact@btm.yt</a>.</p>
          </template>
          <template v-else>
            <h1 class="bientot-titre">Votre compte est en cours de validation.</h1>
            <p class="bientot-desc">L’équipe BTM vérifie les informations de {{ demande.entreprise }}. Votre espace fournisseur s’ouvre dès la validation : cette page se met à jour toute seule.</p>
          </template>
          <p v-if="demande.message_admin && statut !== 'en_attente'" class="bientot-message">
            <i class="fa-solid fa-comment-dots" aria-hidden="true"></i>
            <span><strong>Message de BTM</strong>{{ demande.message_admin }}</span>
          </p>
          <ol v-if="statut !== 'refusee'" class="bientot-validation" aria-label="Avancement de votre demande">
            <li v-for="(e, i) in ETAPES_VALIDATION" :key="e" :class="{ fait: i === 0, encours: i === 1 }">
              <span><i :class="i === 0 ? 'fa-solid fa-check' : i === 1 ? (statut === 'a_corriger' ? 'fa-solid fa-pen' : 'fa-solid fa-hourglass-half') : 'fa-solid fa-store'" aria-hidden="true"></i></span>
              {{ i === 1 && statut === 'a_corriger' ? 'Corrections demandées' : e }}
            </li>
          </ol>
        </template>
        <!-- maintenance choisie par l'admin : pas de compteur de partenaires -->
        <template v-else-if="maintenance">
          <h1 class="bientot-titre">Site en maintenance.</h1>
          <p class="bientot-desc">
            Nous améliorons BTM : budget, quantités et fournisseurs pour vos travaux reviennent très vite.
          </p>
        </template>
        <template v-else>
          <h1 class="bientot-titre">Le site ouvre bientôt.</h1>
          <p class="bientot-desc">
            Budget, quantités et fournisseurs pour vos travaux, au même endroit.
            BTM ouvre dès que {{ SEUIL_FOURNISSEURS }} fournisseurs partenaires l’ont rejoint.
          </p>
        </template>

        <div v-if="!maintenance && !demande" class="bientot-avancement" role="progressbar" :aria-valuenow="prets" aria-valuemin="0" :aria-valuemax="SEUIL_FOURNISSEURS" :aria-label="`${prets} fournisseur partenaire sur ${SEUIL_FOURNISSEURS}`">
          <span v-for="n in SEUIL_FOURNISSEURS" :key="n" :class="{ fait: n <= prets }"></span>
          <small>{{ prets }} / {{ SEUIL_FOURNISSEURS }} fournisseurs partenaires</small>
        </div>

        <div class="bientot-actions">
          <template v-if="demande">
            <BoutonBase v-if="statut === 'a_corriger'" variante="primaire" icone="fa-solid fa-pen-to-square" @click="corriger">Corriger mes informations</BoutonBase>
            <BoutonBase v-else-if="statut === 'en_attente'" variante="contour-clair" icone="fa-solid fa-pen-to-square" @click="corriger">Modifier mes informations</BoutonBase>
          </template>
          <BoutonBase v-else variante="primaire" icone-droite="fa-solid fa-arrow-right" @click="ouvrirInscriptionFournisseur()">Devenir partenaire</BoutonBase>
        </div>
      </div>
      <!-- le chantier en cours : un robot BTM monte un mur, en boucle (ordinateur seulement) -->
      <div v-if="ordinateur" class="bientot-scene"><RobotChantier3D /></div>
    </main>

    <footer class="conteneur bientot-pied">
      <span>© {{ annee }} BTM — Bâtiment &amp; Travaux Mayotte · Mamoudzou (976)</span>
      <span><router-link to="/conditions">Conditions</router-link> · <router-link to="/confidentialite">Confidentialité</router-link></span>
    </footer>

  </div>
</template>

<style>
/* page d'attente : fixe, sans défilement */
html.page-fixe, html.page-fixe body { height: 100%; overflow: hidden; }
</style>

<style scoped>
/* même cadre que le héros de l'accueil : fond sombre, décor du Choungui, texte blanc */
.bientot {
  position: relative; height: 100dvh; display: flex; flex-direction: column; overflow: hidden; isolation: isolate;
  background: #0a0f14; color: #fff;
}

/* ---------- En-tête (repris d'EnteteApp) ---------- */
.bientot-entete { flex: none; height: var(--hauteur-entete); }
.bientot-entete-inner { height: 100%; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.bientot-logo { display: flex; align-items: center; gap: 10px; }
.bientot-logo :deep(.logo-btm) { width: 38px; height: 38px; }
.bientot-marque { display: flex; flex-direction: column; gap: 3px; line-height: 1; }
.bientot-marque strong { font-family: var(--font-display); font-size: 1.4rem; font-weight: 700; letter-spacing: .08em; }
.bientot-marque small { font-size: .62rem; color: var(--lagon-200); opacity: .8; font-weight: 500; letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; }
.bientot-connexion {
  height: 40px; padding: 0 16px; border: 1px solid rgba(255, 255, 255, .25); border-radius: 999px; background: transparent;
  color: rgba(255, 255, 255, .85); font: inherit; font-weight: 600; font-size: .9rem; cursor: pointer; transition: color var(--transition), border-color var(--transition);
}
.bientot-connexion:hover { color: #fff; border-color: #fff; }

/* ---------- Texte (repris du héros) ---------- */
.bientot-corps { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr); align-items: center; min-height: 0; }
@media (min-width: 900px) { .bientot-corps { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 3vw; } }
.bientot-scene { height: min(62vh, 560px); min-height: 0; padding-bottom: 6vh; animation: apparaitre .9s .2s ease both; }
.bientot-texte { width: 100%; max-width: 610px; padding-bottom: 8vh; }
.bientot-surtitre {
  display: inline-flex; align-items: center; gap: 10px; margin: 0 0 22px; font-size: .78rem; font-weight: 600; letter-spacing: .14em; text-transform: uppercase;
  color: #f7c77a; animation: apparaitre .6s ease both;
}
.bientot-surtitre::before { content: ''; width: 26px; height: 2px; background: #f59e0b; }
.bientot-titre {
  margin: 0; font-family: var(--font-display); font-size: clamp(2.6rem, 6vw, 4.6rem); font-weight: 700; line-height: 1.02; letter-spacing: -.01em;
  color: #fff; animation: apparaitre .7s .08s ease both;
}
.bientot-desc { margin: 24px 0 0; max-width: 560px; color: var(--beton); font-size: clamp(1rem, 1.4vw, 1.15rem); line-height: 1.65; animation: apparaitre .7s .18s ease both; }

.bientot-avancement { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; margin-top: 28px; animation: apparaitre .7s .24s ease both; }
.bientot-avancement span { width: 56px; height: 4px; border-radius: 2px; background: rgba(255, 255, 255, .2); }
.bientot-avancement span.fait { background: var(--lagon-400); }
.bientot-avancement small { margin-left: 8px; color: var(--beton); font-size: .85rem; }
.bientot-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 30px; animation: apparaitre .7s .28s ease both; }

.bientot-pied {
  flex: none; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 16px; padding-top: 14px; padding-bottom: 16px;
  color: rgba(255, 255, 255, .6); font-size: .78rem;
}
.bientot-pied a { color: rgba(255, 255, 255, .75); }
.bientot-pied a:hover { color: #fff; }

/* ---------- Compte fournisseur en attente de validation ---------- */
.bientot-connexion i { margin-right: 6px; }
.bientot-desc a { color: #fcd34d; font-weight: 600; }
.bientot-message {
  display: flex; gap: 12px; max-width: 560px; margin: 22px 0 0; padding: 14px 16px; border: 1px solid rgba(245, 158, 11, .35); border-radius: 16px;
  background: rgba(245, 158, 11, .1); color: #fde68a; font-size: .95rem; line-height: 1.55; animation: apparaitre .7s .22s ease both;
}
.bientot-message i { margin-top: 4px; color: #f59e0b; }
.bientot-message strong { display: block; color: #fff; font-size: .8rem; letter-spacing: .08em; text-transform: uppercase; }
.bientot-validation { display: flex; flex-wrap: wrap; gap: 10px 22px; margin: 28px 0 0; padding: 0; list-style: none; animation: apparaitre .7s .24s ease both; }
.bientot-validation li { display: flex; align-items: center; gap: 10px; color: rgba(255, 255, 255, .55); font-size: .9rem; font-weight: 600; }
.bientot-validation li span { display: grid; place-items: center; width: 30px; height: 30px; border: 1.5px solid rgba(255, 255, 255, .2); border-radius: 50%; font-size: .78rem; }
.bientot-validation li.fait { color: #fff; }
.bientot-validation li.fait span { border-color: var(--lagon-400); background: var(--lagon-400); color: #0a0f14; }
.bientot-validation li.encours { color: #fcd34d; }
.bientot-validation li.encours span { border-color: #f59e0b; animation: bientot-pouls 2s ease-in-out infinite; }
@keyframes bientot-pouls { 50% { box-shadow: 0 0 0 6px rgba(245, 158, 11, .18); } }
@media (prefers-reduced-motion: reduce) { .bientot-validation li.encours span { animation: none; } }

@media (max-width: 639px) {
  .bientot-surtitre { font-size: .7rem; letter-spacing: .12em; margin-bottom: 14px; }
  .bientot-marque small { display: none; }
  .bientot-validation { flex-direction: column; gap: 8px; }
  .bientot-pied { justify-content: center; text-align: center; }
}
</style>

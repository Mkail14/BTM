<script setup>
/**
 * Page d'attente de btm.yt : le site est en création et n'ouvre qu'avec au moins SEUIL_FOURNISSEURS
 * fournisseurs partenaires (voir useOuverture et App.vue). Même identité que l'accueil : décor du
 * mont Choungui (HeroPaysage), en-tête BTM, surtitre et titres du héros, boutons et champs du site.
 * Une page fixe, sans défilement.
 * « Devenir partenaire » envoie une vraie demande : elle arrive dans Admin → Support (et par e-mail sur
 * contact@btm.yt), avec l'adresse de l'entreprise pour lui répondre — même circuit que l'assistance du site.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import LogoBtm from '@/composants/commun/LogoBtm.vue'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import BandeauAvertissement from '@/composants/commun/BandeauAvertissement.vue'
import ChampTelephone from '@/composants/commun/ChampTelephone.vue'
import HeroPaysage from '@/composants/accueil/HeroPaysage.vue'
import { defineAsyncComponent } from 'vue'
// scène 3D chargée à part (three.js) : la page s'affiche sans l'attendre
const RobotChantier3D = defineAsyncComponent(() => import('@/composants/commun/RobotChantier3D.vue'))
const ordinateur = typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches
import { useFenetreAuth } from '@/composables/useFenetreAuth.js'
import { SEUIL_FOURNISSEURS } from '@/composables/useOuverture.js'
import { demanderConseiller } from '@/services/supabase/serviceSupport.js'
import { erreurEmail } from '@/services/validation.js'

const props = defineProps({ partenaires: { type: Number, default: 0 }, maintenance: Boolean })
const { ouvrirAuth } = useFenetreAuth()

const prets = computed(() => Math.min(props.partenaires, SEUIL_FOURNISSEURS))
const annee = new Date().getFullYear()

// page fixe : pas de barre de défilement tant qu'elle est affichée
onMounted(() => { document.documentElement.classList.add('page-fixe') })
onBeforeUnmount(() => { document.documentElement.classList.remove('page-fixe') })

// ---------- Demande de partenariat ----------
const ouvert = ref(false)
const etat = ref('saisie') // 'saisie' | 'envoi' | 'envoye'
const erreur = ref('')
const vide = () => ({ entreprise: '', nom: '', email: '', telephone: '', commune: '', produits: '' })
const f = ref(vide())
const premierChamp = ref(null)

function ouvrir() {
  ouvert.value = true
  if (etat.value === 'envoye') { etat.value = 'saisie'; f.value = vide() }
  erreur.value = ''
  nextTick(() => premierChamp.value?.focus())
}
function fermer() { if (etat.value !== 'envoi') ouvert.value = false }

async function envoyer() {
  const d = f.value
  erreur.value = !d.entreprise.trim() || !d.nom.trim() ? 'Indiquez le nom de l’entreprise et le vôtre.'
    : erreurEmail(d.email.trim()) || (!d.telephone ? 'Indiquez un numéro de téléphone valide.' : '')
  if (erreur.value) return
  etat.value = 'envoi'
  const contexte = [
    'Demande de partenariat fournisseur',
    `Entreprise : ${d.entreprise.trim()}`,
    `Contact : ${d.nom.trim()} · ${d.telephone} · ${d.email.trim()}`,
    d.commune.trim() && `Commune : ${d.commune.trim()}`,
    d.produits.trim() && `Produits : ${d.produits.trim()}`
  ].filter(Boolean).join('\n')
  try {
    await demanderConseiller({ contexte, email: d.email.trim(), nom: `${d.nom.trim()} (${d.entreprise.trim()})` })
    etat.value = 'envoye'
  } catch (e) {
    etat.value = 'saisie'
    erreur.value = e?.message || 'L’envoi n’a pas abouti. Réessayez, ou écrivez-nous à contact@btm.yt.'
  }
}
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
        <button type="button" class="bientot-connexion" @click="ouvrirAuth('connexion')">Espace partenaires</button>
      </div>
    </header>

    <main class="conteneur bientot-corps">
      <div class="bientot-texte">
        <p class="bientot-surtitre">Estimation de matériaux BTP · Mayotte</p>
        <!-- maintenance choisie par l'admin : pas de compteur de partenaires -->
        <template v-if="maintenance">
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

        <div v-if="!maintenance" class="bientot-avancement" role="progressbar" :aria-valuenow="prets" aria-valuemin="0" :aria-valuemax="SEUIL_FOURNISSEURS" :aria-label="`${prets} fournisseur partenaire sur ${SEUIL_FOURNISSEURS}`">
          <span v-for="n in SEUIL_FOURNISSEURS" :key="n" :class="{ fait: n <= prets }"></span>
          <small>{{ prets }} / {{ SEUIL_FOURNISSEURS }} fournisseurs partenaires</small>
        </div>

        <div class="bientot-actions">
          <button type="button" class="bientot-cta" @click="ouvrir">
            <i class="fa-solid fa-handshake bientot-cta-icone" aria-hidden="true"></i>
            <span>Devenir partenaire</span>
            <span class="bientot-cta-fleche" aria-hidden="true"><i class="fa-solid fa-arrow-right"></i></span>
          </button>
        </div>
      </div>
      <!-- le chantier en cours : un robot BTM monte un mur, en boucle (ordinateur seulement) -->
      <div v-if="ordinateur" class="bientot-scene"><RobotChantier3D /></div>
    </main>

    <footer class="conteneur bientot-pied">
      <span>© {{ annee }} BTM — Bâtiment &amp; Travaux Mayotte · Mamoudzou (976)</span>
      <span><router-link to="/conditions">Conditions</router-link> · <router-link to="/confidentialite">Confidentialité</router-link></span>
    </footer>

    <!-- Demande de partenariat : même voile que la fenêtre de connexion du site -->
    <div v-if="ouvert" class="bientot-voile" @click.self="fermer" @keydown.esc="fermer">
      <section class="carte bientot-fenetre" role="dialog" aria-modal="true" aria-labelledby="partenaire-titre">
        <button type="button" class="bientot-fermer" aria-label="Fermer la fenêtre" @click="fermer"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>

        <template v-if="etat === 'envoye'">
          <span class="bientot-merci-icone" aria-hidden="true"><i class="fa-solid fa-circle-check"></i></span>
          <h2 id="partenaire-titre" class="bientot-fenetre-titre">Demande envoyée</h2>
          <p class="texte-secondaire bientot-fenetre-intro">Merci ! L’équipe BTM vous recontacte à <strong>{{ f.email }}</strong> ou au {{ f.telephone }}.</p>
          <BoutonBase variante="primaire" bloc @click="fermer">Fermer</BoutonBase>
        </template>

        <form v-else novalidate class="bientot-form" @submit.prevent="envoyer">
          <div class="bientot-fenetre-entete">
            <span class="bientot-fenetre-icone" aria-hidden="true"><i class="fa-solid fa-handshake"></i></span>
            <div>
              <h2 id="partenaire-titre" class="bientot-fenetre-titre">Devenir partenaire</h2>
              <p class="texte-secondaire bientot-fenetre-intro">Vous vendez des matériaux à Mayotte ? Nous vous rappelons pour ouvrir votre espace fournisseur.</p>
            </div>
          </div>
          <!-- deux champs par ligne (sur téléphone, seuls commune et nom) : la fenêtre tient dans l'écran, sans défiler -->
          <div class="bientot-champs">
            <div class="champ"><label for="p-ent">Entreprise</label><input id="p-ent" ref="premierChamp" v-model="f.entreprise" maxlength="80" autocomplete="organization" placeholder="Nom de l’entreprise" /></div>
            <div class="champ"><label for="p-com">Commune</label><input id="p-com" v-model="f.commune" maxlength="60" autocomplete="address-level2" placeholder="Mamoudzou" /></div>
            <div class="champ"><label for="p-nom">Votre nom</label><input id="p-nom" v-model="f.nom" maxlength="60" autocomplete="name" placeholder="Prénom Nom" /></div>
            <ChampTelephone id="p-tel" v-model="f.telephone" label="Téléphone" pays-fixe="YT" />
            <div class="champ"><label for="p-mail">E-mail</label><input id="p-mail" v-model="f.email" type="email" maxlength="254" autocomplete="email" placeholder="contact@entreprise.yt" /></div>
            <div class="champ"><label for="p-prod">Vous vendez <small class="texte-secondaire">(facultatif)</small></label><input id="p-prod" v-model="f.produits" maxlength="160" placeholder="Ciment, parpaings…" /></div>
          </div>
          <BandeauAvertissement v-if="erreur" type="erreur" compact>{{ erreur }}</BandeauAvertissement>
          <BoutonBase type="submit" variante="primaire" bloc icone="fa-solid fa-paper-plane" :chargement="etat === 'envoi'">Envoyer ma demande</BoutonBase>
        </form>
      </section>
    </div>
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
.bientot-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 34px; animation: apparaitre .7s .28s ease both; }
/* « Devenir partenaire » : pilule lagon lumineuse, flèche dans une pastille qui glisse au survol */
.bientot-cta {
  position: relative; display: inline-flex; align-items: center; gap: 12px; height: 60px; padding: 0 8px 0 24px; overflow: hidden;
  border: 1px solid rgba(165, 243, 252, .35); border-radius: 999px; cursor: pointer;
  background: linear-gradient(135deg, var(--lagon-400) 0%, var(--lagon-600) 55%, var(--lagon-700) 100%);
  color: #fff; font: 700 1.05rem var(--font-corps); letter-spacing: .01em;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .35), 0 14px 34px -10px rgba(6, 182, 212, .65), 0 0 0 6px rgba(34, 211, 238, .08);
  transition: transform .25s ease, box-shadow .25s ease;
}
/* reflet qui traverse le bouton au survol */
.bientot-cta::before {
  content: ''; position: absolute; inset: 0; transform: translateX(-120%);
  background: linear-gradient(100deg, transparent 30%, rgba(255, 255, 255, .28) 50%, transparent 70%); transition: transform .7s ease;
}
.bientot-cta:hover { transform: translateY(-2px); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .4), 0 20px 40px -12px rgba(6, 182, 212, .8), 0 0 0 8px rgba(34, 211, 238, .12); }
.bientot-cta:hover::before { transform: translateX(120%); }
.bientot-cta:active { transform: translateY(0) scale(.98); }
.bientot-cta:focus-visible { outline: 3px solid #fff; outline-offset: 3px; }
.bientot-cta-icone { font-size: 1.15rem; opacity: .95; }
.bientot-cta-fleche {
  display: grid; place-items: center; width: 44px; height: 44px; margin-left: 6px; border-radius: 50%;
  background: #fff; color: var(--lagon-700); font-size: .95rem; transition: transform .25s ease;
}
.bientot-cta:hover .bientot-cta-fleche { transform: translateX(3px); }

.bientot-pied {
  flex: none; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 16px; padding-top: 14px; padding-bottom: 16px;
  color: rgba(255, 255, 255, .6); font-size: .78rem;
}
.bientot-pied a { color: rgba(255, 255, 255, .75); }
.bientot-pied a:hover { color: #fff; }

/* ---------- Fenêtre « Devenir partenaire » (même voile que la connexion) ---------- */
.bientot-voile {
  position: fixed; inset: 0; z-index: 250; display: grid; place-items: center; padding: 24px;
  background: rgba(6, 32, 44, .58); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
}
.bientot-fenetre { position: relative; width: min(100%, 600px); max-height: calc(100dvh - 48px); overflow: hidden auto; padding: 30px 32px; border-radius: var(--rayon-lg); box-shadow: var(--ombre-lg); }
.bientot-fenetre-entete { display: flex; align-items: flex-start; gap: 14px; padding-right: 36px; }
.bientot-fenetre-icone {
  display: grid; place-items: center; flex: none; width: 48px; height: 48px; border-radius: 14px;
  background: linear-gradient(135deg, var(--lagon-400), var(--lagon-700)); color: #fff; font-size: 1.2rem;
  box-shadow: 0 10px 22px -10px rgba(6, 182, 212, .7);
}
.bientot-fenetre-titre { margin: 0; font-family: var(--font-display); font-size: 1.9rem; line-height: 1.1; color: var(--ardoise); }
.bientot-fenetre-intro { margin: 4px 0 0; font-size: .92rem; line-height: 1.45; }
.bientot-fermer {
  position: absolute; top: 14px; right: 14px; width: 36px; height: 36px; display: grid; place-items: center;
  border: 0; border-radius: 50%; background: var(--gris-100); color: var(--gris-600); cursor: pointer;
}
.bientot-form { display: flex; flex-direction: column; gap: 18px; }
.bientot-champs { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; }
.bientot-champs > * { min-width: 0; }
.bientot-champs input { width: 100%; min-width: 0; font-family: var(--font-corps); } /* comme les champs de la fenêtre de connexion */
.bientot-champs small { font-weight: 400; }
.bientot-merci-icone { display: block; margin-bottom: 10px; color: #047857; font-size: 2.2rem; }
.bientot-fenetre > .btn-bloc { margin-top: 20px; }

@media (max-width: 639px) {
  .bientot-surtitre { font-size: .7rem; letter-spacing: .12em; margin-bottom: 14px; }
  .bientot-marque small { display: none; }
  .bientot-cta { height: 56px; font-size: 1rem; }
  .bientot-cta-fleche { width: 40px; height: 40px; }
  /* téléphone : la fenêtre monte du bas de l'écran, compacte pour tenir sans défiler */
  .bientot-voile { place-items: end center; padding: 0; }
  .bientot-fenetre { width: 100%; max-height: calc(100dvh - 12px); padding: 22px 18px calc(18px + env(safe-area-inset-bottom)); border-radius: 24px 24px 0 0; }
  .bientot-fenetre-icone { width: 42px; height: 42px; border-radius: 12px; font-size: 1.05rem; }
  .bientot-fenetre-titre { font-size: 1.6rem; }
  .bientot-fenetre-intro { font-size: .86rem; }
  .bientot-form { gap: 14px; }
  .bientot-champs { gap: 9px 10px; }
  /* commune et nom côte à côte, le reste en pleine largeur */
  .bientot-champs > :nth-child(1), .bientot-champs > :nth-child(n + 4) { grid-column: 1 / -1; }
  .bientot-champs :deep(label) { margin-bottom: 4px; font-size: .84rem; }
  .bientot-champs :deep(input) { height: 44px; padding-top: 0; padding-bottom: 0; }
  .bientot-pied { justify-content: center; text-align: center; }
}
</style>

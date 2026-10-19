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

const props = defineProps({ partenaires: { type: Number, default: 0 } })
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
        <p class="bientot-surtitre">Plateforme de devis BTP · Mayotte</p>
        <h1 class="bientot-titre">Le site ouvre bientôt.</h1>
        <p class="bientot-desc">
          Budget, quantités et fournisseurs pour vos travaux, au même endroit.
          BTM ouvre dès que {{ SEUIL_FOURNISSEURS }} fournisseurs partenaires l’ont rejoint.
        </p>

        <div class="bientot-avancement" role="progressbar" :aria-valuenow="prets" aria-valuemin="0" :aria-valuemax="SEUIL_FOURNISSEURS" :aria-label="`${prets} fournisseur partenaire sur ${SEUIL_FOURNISSEURS}`">
          <span v-for="n in SEUIL_FOURNISSEURS" :key="n" :class="{ fait: n <= prets }"></span>
          <small>{{ prets }} / {{ SEUIL_FOURNISSEURS }} fournisseurs partenaires</small>
        </div>

        <div class="bientot-actions">
          <BoutonBase variante="primaire" icone-droite="fa-solid fa-arrow-right" @click="ouvrir">Devenir partenaire</BoutonBase>
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
          <div>
            <h2 id="partenaire-titre" class="bientot-fenetre-titre">Devenir partenaire</h2>
            <p class="texte-secondaire bientot-fenetre-intro">Vous vendez des matériaux à Mayotte ? Laissez vos coordonnées : nous vous présentons BTM et ouvrons votre espace fournisseur.</p>
          </div>
          <div class="bientot-champs">
            <div class="champ plein"><label for="p-ent">Entreprise</label><input id="p-ent" ref="premierChamp" v-model="f.entreprise" maxlength="80" autocomplete="organization" placeholder="Nom de l’entreprise" /></div>
            <div class="champ"><label for="p-nom">Votre nom</label><input id="p-nom" v-model="f.nom" maxlength="60" autocomplete="name" placeholder="Prénom Nom" /></div>
            <div class="champ"><label for="p-com">Commune</label><input id="p-com" v-model="f.commune" maxlength="60" autocomplete="address-level2" placeholder="Mamoudzou" /></div>
            <div class="champ plein"><label for="p-mail">Adresse e-mail</label><input id="p-mail" v-model="f.email" type="email" maxlength="254" autocomplete="email" placeholder="contact@entreprise.yt" /></div>
            <ChampTelephone id="p-tel" v-model="f.telephone" class="plein" />
            <div class="champ plein"><label for="p-prod">Ce que vous vendez <small class="texte-secondaire">(facultatif)</small></label><input id="p-prod" v-model="f.produits" maxlength="160" placeholder="Ciment, parpaings, carrelage…" /></div>
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
.bientot-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 30px; animation: apparaitre .7s .28s ease both; }

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
.bientot-fenetre { position: relative; width: min(100%, 520px); max-height: calc(100dvh - 48px); overflow: hidden auto; padding: 32px; border-radius: var(--rayon-lg); box-shadow: var(--ombre-lg); }
.bientot-fenetre-titre { margin: 0; font-family: var(--font-display); font-size: 2.2rem; color: var(--ardoise); }
.bientot-fenetre-intro { margin: 6px 0 0; line-height: 1.5; }
.bientot-fermer {
  position: absolute; top: 14px; right: 14px; width: 36px; height: 36px; display: grid; place-items: center;
  border: 0; border-radius: 50%; background: var(--gris-100); color: var(--gris-600); cursor: pointer;
}
.bientot-form { display: flex; flex-direction: column; gap: 18px; }
.bientot-champs { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.bientot-champs > * { min-width: 0; }
.bientot-champs .plein { grid-column: 1 / -1; }
.bientot-champs input { width: 100%; min-width: 0; font-family: var(--font-corps); } /* comme les champs de la fenêtre de connexion */
.bientot-champs small { font-weight: 400; }
.bientot-merci-icone { display: block; margin-bottom: 10px; color: #047857; font-size: 2.2rem; }
.bientot-fenetre > .btn-bloc { margin-top: 20px; }

@media (max-width: 639px) {
  .bientot-surtitre { font-size: .7rem; letter-spacing: .12em; margin-bottom: 14px; }
  .bientot-marque small { display: none; }
  .bientot-champs { grid-template-columns: 1fr; }
  .bientot-fenetre { padding: 26px 22px; }
  .bientot-voile { padding: 14px; }
  .bientot-pied { justify-content: center; text-align: center; }
}
</style>

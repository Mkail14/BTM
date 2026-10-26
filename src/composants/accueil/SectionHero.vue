<script setup>
import { ref, computed, onMounted, onBeforeUnmount, onActivated, onDeactivated, defineAsyncComponent } from 'vue'
import { useAuth } from '@/composables/useAuth.js'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import { typesProjets } from '@/donnees/typesProjets.js'
import { useContenuSite } from '@/composables/useContenuSite.js'
const Scene3DChantier = defineAsyncComponent(() => import('./Scene3DChantier.vue'))
import HeroPaysage from './HeroPaysage.vue'
import { retenirEcranChargement } from '@/composables/useEcranChargement.js'

const { utilisateur, estPro, demandePro } = useAuth()
const contenu = useContenuSite()

// Surtitre : pour un compte connecté, la fin « · Mayotte » est remplacée par le profil : particulier ou professionnel
const typeCompte = computed(() => {
  if (!utilisateur.value) return null
  if (estPro.value) return { cle: 'pro', libelle: 'Professionnel', icone: 'fa-solid fa-briefcase' }
  // compte pro dont le SIRET n'est pas encore validé : outils pro fermés en attendant
  if (demandePro.value?.statut === 'en_attente') return { cle: 'pro', libelle: 'Pro · en vérification', icone: 'fa-solid fa-hourglass-half' }
  return { cle: 'particulier', libelle: 'Particulier', icone: 'fa-solid fa-user' }
})
const debutSurtitre = computed(() => {
  const texte = contenu.hero.surtitre
  const i = texte.lastIndexOf('·')
  return (i > 0 ? texte.slice(0, i) : texte).trim()
})
// « Bonjour Monsieur Dupont » si la civilité est connue, sinon « Bonjour Prénom Nom » (anciens comptes)
const salutation = computed(() => {
  const infos = utilisateur.value?.user_metadata
  if (!utilisateur.value) return ''
  const civilite = { 'M.': 'Monsieur', Mme: 'Madame' }[infos?.civilite]
  if (civilite && infos?.nom) return `Bonjour ${civilite} ${infos.nom}`
  const nomComplet = [infos?.prenom, infos?.nom].filter(Boolean).join(' ')
  return `Bonjour ${nomComplet || infos?.pseudo || utilisateur.value.email.split('@')[0]}`
})

// Titre : « Chiffrez votre » + un mot qui défile de haut en bas (mur, dalle, terrasse…)
const mots = computed(() => contenu.hero.motsAnimes.split(',').map((m) => m.trim()).filter(Boolean))
const indexMot = ref(0)
let minuterieMot = null
const demarrerMots = () => {
  if (calme || minuterieMot || mots.value.length < 2) return
  minuterieMot = setInterval(() => { indexMot.value = (indexMot.value + 1) % mots.value.length }, 2600)
}
const arreterMots = () => { clearInterval(minuterieMot); minuterieMot = null }

// Téléphone (< 640 px) : la maquette 3D est remplacée par des raccourcis vers les types de devis
const requete = typeof window !== 'undefined' ? window.matchMedia('(max-width: 639px)') : null
const telephone = ref(!!requete?.matches)
const surTaille = (e) => { telephone.value = e.matches }
onMounted(() => requete?.addEventListener('change', surTaille))
// Ordinateur : l'écran de chargement attend la maquette 3D, l'accueil apparaît complet
const libererEcran = telephone.value ? () => {} : retenirEcranChargement()
onBeforeUnmount(() => requete?.removeEventListener('change', surTaille))

// Réduction au défilement : en descendant, le héros rétrécit en entier (comme une fenêtre qu'on réduit) jusqu'à la
// largeur du contenu du site, et ses coins s'arrondissent : il devient une carte alignée sur les sections.
// Léger : un seul transform (scale) mis à jour hors de Vue, rien n'est redessiné ni remis en page.
const heros = ref(null)
const calme = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
let dernier = -1
let raf = null
let proportion = 1 // largeur du contenu (.conteneur sans ses marges) / largeur du héros : la taille réduite
function mesurer() {
  const el = heros.value
  const grille = el?.querySelector('.hero-grille')
  if (!el || !grille) return
  const s = getComputedStyle(grille)
  const contenu = grille.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)
  proportion = el.clientWidth ? Math.min(1, contenu / el.clientWidth) : 1
  dernier = -1
}
function cadrer() {
  raf = null
  const h = window.innerHeight
  if (!heros.value || window.scrollY > h * 1.5 && dernier === 1) return // héros sorti de l'écran : plus rien à faire
  const p = calme ? 0 : Math.min(Math.max(window.scrollY / (h * 0.55), 0), 1)
  const arrondi = Math.round(p * 100) / 100
  if (arrondi === dernier) return
  dernier = arrondi
  heros.value.style.setProperty('--cadre', arrondi)
  heros.value.style.transform = arrondi ? `scale(${1 - arrondi * (1 - proportion)})` : ''
}
const surScroll = () => { if (!raf) raf = requestAnimationFrame(cadrer) }
const surRedimension = () => { mesurer(); surScroll() }
// accueil gardé en mémoire (keep-alive) : le défilement des autres pages ne doit pas recalculer le héros
const brancherScroll = () => {
  window.addEventListener('scroll', surScroll, { passive: true })
  window.addEventListener('resize', surRedimension)
  surRedimension()
}
const debrancherScroll = () => {
  window.removeEventListener('scroll', surScroll); window.removeEventListener('resize', surRedimension)
  if (raf) cancelAnimationFrame(raf); raf = null
}
onMounted(() => { brancherScroll(); demarrerMots() })
onActivated(() => { brancherScroll(); demarrerMots() })
onDeactivated(() => { debrancherScroll(); arreterMots() })
onBeforeUnmount(() => { debrancherScroll(); arreterMots() })

</script>

<template>
  <section id="hero-section" ref="heros" class="hero" aria-labelledby="hero-titre">
    <HeroPaysage />

    <div class="conteneur hero-grille">
      <div class="hero-texte">
        <p v-if="typeCompte" class="hero-surtitre">
          {{ debutSurtitre }}
          <span class="hero-compte" :class="`hero-compte-${typeCompte.cle}`">
            <i :class="typeCompte.icone" aria-hidden="true"></i>{{ typeCompte.libelle }}
          </span>
        </p>
        <p v-else class="hero-surtitre">{{ contenu.hero.surtitre }}</p>
        <h1 id="hero-titre" class="hero-titre" :class="{ 'hero-titre-ligne': !salutation }">
          <template v-if="salutation">{{ salutation }}</template>
          <template v-else>
            {{ contenu.hero.titreDebut }}
            <!-- tous les mots empilés dans la même case : la largeur suit le plus long, rien ne saute -->
            <span class="hero-mots" aria-hidden="true">
              <span
                v-for="(mot, i) in mots" :key="mot" class="hero-mot"
                :class="{ actif: i === indexMot, parti: i === (indexMot - 1 + mots.length) % mots.length }"
              >{{ mot }}</span>
            </span>
            <span class="visually-hidden">{{ mots.join(', ') }}</span>
          </template>
        </h1>
        <p class="hero-desc">
          {{ contenu.hero.description }}
        </p>
        <!-- Téléphone : pas de boutons, « Estimer » et « Fournisseurs » sont déjà dans la barre d'onglets -->
        <div v-if="!telephone" class="hero-actions">
          <BoutonBase to="/calculateur" variante="primaire" icone-droite="fa-solid fa-arrow-right">{{ contenu.hero.boutonPrincipal }}</BoutonBase>
          <BoutonBase to="/fournisseurs" variante="contour-clair">{{ contenu.hero.boutonSecondaire }}</BoutonBase>
        </div>
      </div>

      <div v-if="!telephone" class="hero-visuel">
        <Scene3DChantier @pret="libererEcran" />
      </div>

      <!-- Téléphone : un seul geste, toucher l'ouvrage à chiffrer -->
      <nav v-else class="hero-raccourcis" aria-label="Commencer une estimation">
        <p class="hero-raccourcis-titre">{{ contenu.hero.raccourcisTitre }}</p>
        <ul>
          <li v-for="t in typesProjets" :key="t.id">
            <router-link :to="{ path: '/calculateur', query: { type: t.id } }">
              <i :class="t.icone" aria-hidden="true"></i>
              <span>{{ t.libelle }}</span>
              <i class="fa-solid fa-chevron-right hero-raccourci-fleche" aria-hidden="true"></i>
            </router-link>
          </li>
        </ul>
      </nav>
    </div>
  </section>
</template>

<style scoped>
.hero {
  position: relative; min-height: 100svh; display: flex; flex-direction: column; justify-content: center; overflow: hidden;
  color: #fff; padding: calc(var(--hauteur-entete) + 48px) 0 0; isolation: isolate; background: #0d0d0d;
  /* réduction au défilement (script) : le bas reste en place, le héros rétrécit vers lui ; les coins s'arrondissent */
  transform-origin: 50% 100%; will-change: transform;
  border-radius: calc(var(--cadre, 0) * 44px);
}
@media (max-width: 639px) { .hero { border-radius: calc(var(--cadre, 0) * 26px); } }
/* derrière le héros réduit : le fond des sections de l'accueil */
:global(#page-accueil) { background: var(--fond-nuit); }
.hero-grille {
  display: grid; gap: 32px 56px; grid-template-columns: 1fr; align-items: center; justify-items: center;
  flex: 1; width: 100%; margin: 0 auto; padding: 0 var(--gouttiere) 40px;
}
@media (min-width: 900px) {
  .hero-grille {
    grid-template-columns: minmax(0, 1fr) minmax(460px, 1fr);
    gap: 4vw; justify-items: stretch; align-items: center;
  }
}
@media (min-width: 1200px) {
  .hero-titre { white-space: nowrap; }
  .hero-actions { flex-wrap: nowrap; }
}
.hero-texte {
  display: flex; flex-direction: column; justify-content: center; width: 100%; max-width: 610px; margin-inline: auto;
  text-align: left;
}
@media (min-width: 900px) { .hero-texte { justify-self: end; margin-inline: 0; } }

.hero-surtitre {
  display: inline-flex; align-items: center; gap: 10px; font-size: .78rem; font-weight: 600; letter-spacing: .14em; text-transform: uppercase;
  color: #f7c77a; margin-bottom: 22px; animation: apparaitre .6s ease both;
}
.hero-surtitre::before { content: ''; width: 26px; height: 2px; background: #f59e0b; }
/* Type du compte connecté (à la place de « Mayotte ») */
.hero-compte {
  display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px;
  font-size: .72rem; letter-spacing: .1em; border: 1px solid currentColor;
}
.hero-compte i { font-size: .7rem; }
.hero-compte-particulier { color: #f4e9db; background: rgba(17, 17, 17, .14); }
.hero-compte-pro { color: #fcd34d; background: rgba(245, 158, 11, .14); }
.hero-compte-fournisseur { color: #6ee7b7; background: rgba(16, 185, 129, .14); }
.hero-titre {
  font-size: clamp(2.6rem, 6vw, 4.6rem); font-weight: 700; line-height: 1.02; letter-spacing: -.01em;
  animation: apparaitre .7s .08s ease both;
}
/* Mot qui défile : le nouveau tombe du haut, l'ancien file vers le bas, fondus et légèrement flous en mouvement */
.hero-mots {
  display: inline-grid; vertical-align: bottom; overflow: hidden;
  padding: .06em 0 .32em; margin: -.06em 0 -.46em; /* place pour les jambages (g) sans bouger la ligne : le fondu du bas tombe sous le g */
  -webkit-mask-image: linear-gradient(transparent, #000 10%, #000 90%, transparent);
  mask-image: linear-gradient(transparent, #000 10%, #000 90%, transparent);
}
.hero-mot {
  grid-area: 1 / 1; white-space: nowrap; text-shadow: none; padding-bottom: .14em; /* le dégradé (background-clip) couvre aussi le jambage du g */
  background: linear-gradient(100deg, #fcd34d, #f59e0b 60%, #fb923c); -webkit-background-clip: text; background-clip: text; color: transparent;
  opacity: 0; transform: translateY(-105%); filter: blur(6px);
}
.hero-mot.actif, .hero-mot.parti { transition: transform .7s cubic-bezier(.22, 1, .36, 1), opacity .5s ease, filter .5s ease; }
.hero-mot.actif { opacity: 1; transform: none; filter: none; }
.hero-mot.parti { transform: translateY(105%); }
@media (prefers-reduced-motion: reduce) { .hero-mot { transition: none !important; } }
.hero-desc { margin-top: 24px; font-size: clamp(1rem, 1.4vw, 1.15rem); line-height: 1.65; color: var(--beton); max-width: 560px; animation: apparaitre .7s .18s ease both; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 34px; animation: apparaitre .7s .28s ease both; }
.hero-visuel {
  width: 100%; max-width: 620px; display: flex; align-items: center; justify-content: center; position: relative; top: 48px;
  transform: translateY(18px);
  animation: apparaitre .9s .2s ease both;
}
/* Téléphone : un écran d'application. Titre sur une ligne, puis la liste des ouvrages : un seul geste pour commencer.
   Pas de description ni de boutons (la barre d'onglets porte déjà « Estimer » et « Fournisseurs »). */
@media (max-width: 639px) {
  /* le fond occupe tout l'écran, jusque derrière la barre d'onglets flottante (floutée) : aucune bande blanche ;
     le contenu garde sa place au-dessus de la barre */
  .hero { min-height: 100svh; padding-top: calc(var(--hauteur-entete) + 16px); justify-content: flex-start; }
  .hero-grille { grid-template-columns: minmax(0, 1fr); gap: 28px; padding: 8px var(--gouttiere) calc(24px + var(--barre-onglets, 0px)); align-content: center; }
  .hero-grille > * { min-width: 0; }
  .hero-texte { max-width: none; }
  .hero-surtitre { font-size: .68rem; letter-spacing: .12em; margin-bottom: 12px; }
  .hero-titre { font-size: clamp(1.9rem, 10.5vw, 3rem); overflow-wrap: break-word; }
  /* « Chiffrez votre fondation » tient sur une ligne même avec le mot le plus long */
  .hero-titre-ligne { white-space: nowrap; font-size: min(8vw, 2.6rem); }
  .hero-desc { display: none; }
}
@media (max-width: 360px) {
  .hero-surtitre { font-size: .6rem; letter-spacing: .08em; gap: 8px; }
  .hero-surtitre::before { width: 18px; }
}

/* Raccourcis (téléphone uniquement) : une liste groupée, comme les réglages d'un téléphone */
.hero-raccourcis { width: 100%; animation: apparaitre .8s .2s ease both; }
.hero-raccourcis-titre { margin: 0 0 10px 4px; font-size: .72rem; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: rgba(255, 255, 255, .6); }
.hero-raccourcis ul {
  list-style: none; margin: 0; padding: 0; overflow: hidden; border-radius: 18px;
  background: rgba(255, 255, 255, .08); border: 1px solid rgba(255, 255, 255, .14); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
}
.hero-raccourcis li + li a { border-top: 1px solid rgba(255, 255, 255, .1); }
.hero-raccourcis a {
  display: flex; align-items: center; gap: 14px; min-height: 60px; padding: 0 16px; color: #fff; font-size: 1.02rem; font-weight: 600;
  transition: background var(--transition);
}
.hero-raccourcis a:active { background: rgba(17, 17, 17, .2); }
.hero-raccourcis a span { flex: 1; }
.hero-raccourcis i:first-child { width: 36px; height: 36px; flex: none; display: grid; place-items: center; border-radius: 10px; background: rgba(17, 17, 17, .2); color: #f4e9db; font-size: .95rem; }
.hero-raccourci-fleche { color: rgba(255, 255, 255, .4); font-size: .8rem; }
@media (min-width: 900px) { .hero-texte { justify-self: start; } .hero-visuel { justify-self: end; transform: translateY(26px); } }
@media (min-width: 1800px) {
  .hero-grille { grid-template-columns: minmax(0, 1fr) minmax(720px, 1fr); }
  .hero-visuel, .scene { max-width: 720px; }
}

.hero-titre { text-shadow: 0 2px 30px rgba(10, 15, 20, .5); }
.hero-desc { color: rgba(255, 255, 255, .72); }
</style>

<script setup>
/**
 * Réalisations — projets d'utilisateurs (lieu + fournisseur choisi), en bandeau qui défile en boucle, lentement.
 *  - Un curseur stylé se promène tout seul sur le bandeau et « clique » de temps en temps ;
 *    son étiquette affiche le nom de l'auteur du chantier qu'il survole, et ce chantier dévoile ses détails.
 *  - Quand le visiteur passe sa souris, elle prend la place du curseur automatique (même flèche, même étiquette
 *    au nom de l'auteur du chantier survolé) et le bandeau se met en pause pour qu'il puisse lire et cliquer.
 * Téléphone : bandeau défilant, détails toujours visibles, pas de curseur. Mouvements réduits : simple défilement manuel.
 */
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import { realisations } from '@/donnees/realisations.js'
import { typesProjets } from '@/donnees/typesProjets.js'
import { useContenuSite } from '@/composables/useContenuSite.js'
import BoutonBase from '@/composants/commun/BoutonBase.vue'

const contenu = useContenuSite()
const TYPES = Object.fromEntries(typesProjets.map((t) => [t.id, t]))
const projets = realisations
const n = projets.length
// deux exemplaires à la suite : le bandeau recule d'une moitié puis repart, sans couture visible
const bandeau = [...projets, ...projets].map((p, k) => ({ ...p, k, copie: k >= n }))
const DUREE = `${n * 12}s` // ≈ 12 s par chantier : défilement lent

const galerie = ref(null)
const fleche = ref(null)
const photoAbsente = ref({})
const visee = ref(null) // carte (k) sous la pointe du curseur
const curseur = ref({ x: 0, y: 0, visible: false, clic: false, suivi: false, nom: '' })

const requeteGalerie = typeof window !== 'undefined' ? window.matchMedia('(min-width: 900px) and (hover: hover)') : null
const requeteCalme = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
const modeGalerie = ref(!!requeteGalerie?.matches)
const calme = ref(!!requeteCalme?.matches)
const pilote = computed(() => modeGalerie.value && !calme.value)

// ---------- Qui est sous le curseur ? (le bandeau bouge : vérifié à chaque image) ----------
let raf = null
let image = 0
function viser() {
  raf = requestAnimationFrame(viser)
  if (++image % 4 || !curseur.value.visible || !fleche.value) return // ~15 vérifications par seconde suffisent
  const r = fleche.value.getBoundingClientRect()
  const carte = document.elementFromPoint(r.left + 4, r.top + 4)?.closest?.('.re-carte')
  const k = carte ? Number(carte.dataset.k) : null
  if (k === visee.value) return
  visee.value = k
  if (k !== null) curseur.value = { ...curseur.value, nom: bandeau[k].auteur }
}

// ---------- Pilote automatique ----------
let minuteurs = []
let tour = 0
let survol = false
let visible = false
let reprise = null
const attendre = (ms) => new Promise((r) => minuteurs.push(setTimeout(r, ms)))

const hasard = (min, max) => min + Math.random() * (max - min)
async function boucle() {
  const moi = ++tour
  const enCours = () => moi === tour
  const { width, height } = galerie.value.getBoundingClientRect()
  if (!curseur.value.x) curseur.value = { ...curseur.value, x: width * 0.42, y: height * 0.5 }
  curseur.value = { ...curseur.value, visible: true, suivi: false }
  // gestes « humains » : pauses et vitesses irrégulières, petites corrections avant de cliquer, pas de clic à chaque fois
  while (enCours()) {
    await attendre(hasard(1600, 3800))
    if (!enCours()) return
    const duree = hasard(0.75, 1.4)
    curseur.value = { ...curseur.value, duree, x: width * hasard(0.1, 0.9), y: height * hasard(0.28, 0.72) }
    await attendre(duree * 1000 + hasard(80, 260))
    if (!enCours()) return
    if (Math.random() < 0.45) {
      const ajustement = hasard(0.25, 0.45)
      curseur.value = { ...curseur.value, duree: ajustement, x: curseur.value.x + hasard(-38, 38), y: curseur.value.y + hasard(-22, 22) }
      await attendre(ajustement * 1000 + hasard(120, 380))
      if (!enCours()) return
    }
    if (Math.random() < 0.7) {
      curseur.value = { ...curseur.value, clic: true }
      await attendre(hasard(380, 520))
      if (!enCours()) return
      curseur.value = { ...curseur.value, clic: false }
    }
  }
}
function arreter() {
  tour++
  minuteurs.forEach(clearTimeout)
  minuteurs = []
}
function demarrerVisee() { if (!raf) raf = requestAnimationFrame(viser) }
function arreterVisee() { if (raf) cancelAnimationFrame(raf); raf = null }
function relancer() {
  arreter()
  const actif = pilote.value && visible && !document.hidden
  if (actif) demarrerVisee(); else arreterVisee()
  if (actif && !survol) boucle()
}

// ---------- Vitesse du bandeau : ralentit en douceur sous la souris, ne s'arrête jamais ----------
const piste = ref(null)
let vitesse = 1
let vitesseCible = 1
let rafVitesse = null
function adoucir() {
  rafVitesse = null
  const animation = piste.value?.getAnimations?.()[0]
  if (!animation) return
  vitesse += (vitesseCible - vitesse) * 0.06 // freinage / reprise progressifs, sur environ une seconde
  if (Math.abs(vitesseCible - vitesse) < 0.004) vitesse = vitesseCible
  animation.updatePlaybackRate(vitesse)
  if (vitesse !== vitesseCible) rafVitesse = requestAnimationFrame(adoucir)
}
function changerVitesse(cible) {
  vitesseCible = cible
  if (!rafVitesse) rafVitesse = requestAnimationFrame(adoucir)
}

// ---------- La souris du visiteur remplace le curseur automatique ----------
function suivreSouris(e) {
  if (!pilote.value || !galerie.value) return
  const r = galerie.value.getBoundingClientRect()
  curseur.value = { ...curseur.value, x: e.clientX - r.left, y: e.clientY - r.top, visible: true, suivi: true }
}
function entrer(e) {
  if (!pilote.value) return
  survol = true
  clearTimeout(reprise)
  arreter()
  changerVitesse(0.3)
  suivreSouris(e)
}
function sortir() {
  if (!pilote.value) return
  survol = false
  changerVitesse(1)
  clearTimeout(reprise)
  curseur.value = { ...curseur.value, visible: false, suivi: false, clic: false }
  visee.value = null
  reprise = setTimeout(relancer, 1200)
}
const cliquer = (oui) => { if (curseur.value.suivi) curseur.value = { ...curseur.value, clic: oui } }

// ---------- Cycle de vie (accueil gardé en mémoire par keep-alive) ----------
let observateur = null
const surVisibilite = () => relancer()
const surMedia = () => { modeGalerie.value = !!requeteGalerie?.matches; calme.value = !!requeteCalme?.matches; relancer() }
function brancher() { document.addEventListener('visibilitychange', surVisibilite); relancer() }
function debrancher() {
  document.removeEventListener('visibilitychange', surVisibilite)
  clearTimeout(reprise)
  arreter()
  arreterVisee()
  if (rafVitesse) cancelAnimationFrame(rafVitesse)
  rafVitesse = null
}
onMounted(() => {
  // tout ne tourne que lorsque le bandeau est à l'écran
  observateur = new IntersectionObserver(([e]) => { visible = e.isIntersecting; relancer() }, { threshold: 0.2 })
  if (galerie.value) observateur.observe(galerie.value)
  requeteGalerie?.addEventListener('change', surMedia)
  requeteCalme?.addEventListener('change', surMedia)
  brancher()
})
onActivated(brancher)
onDeactivated(debrancher)
onBeforeUnmount(() => {
  debrancher()
  observateur?.disconnect()
  requeteGalerie?.removeEventListener('change', surMedia)
  requeteCalme?.removeEventListener('change', surMedia)
})

const lieu = (p) => (p.quartier ? `${p.quartier}, ${p.commune}` : p.commune)
</script>

<template>
  <section id="realisations" class="section re" aria-labelledby="re-titre">
    <!-- même en-tête que les autres sections de l'accueil (surtitre, titre, bouton du site) -->
    <div class="conteneur re-entete">
      <header class="section-entete reveal">
        <span class="section-surtitre">{{ contenu.realisations.surtitre }}</span>
        <h2 id="re-titre" class="section-titre">{{ contenu.realisations.titre }}</h2>
      </header>
      <BoutonBase to="/fournisseurs" variante="secondaire" icone-droite="fa-solid fa-arrow-right" class="reveal">{{ contenu.realisations.lien }}</BoutonBase>
    </div>

    <!-- bandeau en boucle : seul élément de la page qui va d'un bord à l'autre de l'écran -->
    <div
      ref="galerie" class="re-galerie" :class="{ pilote, 'souris-visiteur': curseur.suivi, calme }"
      @mouseenter="entrer" @mouseleave="sortir" @mousemove="suivreSouris" @mousedown="cliquer(true)" @mouseup="cliquer(false)"
    >
      <ul ref="piste" class="re-piste" :style="{ '--duree': DUREE }">
        <li
          v-for="p in bandeau" :key="p.k" class="re-carte" :class="{ visee: !pilote || visee === p.k }"
          :data-k="p.k" :aria-hidden="p.copie || undefined"
        >
          <router-link
            :to="{ path: '/fournisseurs', query: { q: p.fournisseur } }" class="re-carte-lien" :tabindex="p.copie ? -1 : undefined"
            :aria-label="`${p.titre} à ${lieu(p)}, par ${p.auteur}, matériaux chez ${p.fournisseur}`"
          >
            <img
              v-if="!photoAbsente[p.id]" :src="p.photo" alt="" loading="lazy" decoding="async" class="re-photo"
              @error="photoAbsente = { ...photoAbsente, [p.id]: true }"
            />
            <span v-else class="re-visuel" aria-hidden="true"><i :class="TYPES[p.type]?.icone"></i></span>
            <span class="re-voile" aria-hidden="true"></span>

            <span class="re-type"><i :class="TYPES[p.type]?.icone" aria-hidden="true"></i>{{ TYPES[p.type]?.libelle }} · {{ p.annee }}</span>
            <div class="re-infos">
              <h3 class="re-nom">{{ p.titre }}</h3>
              <span class="re-lieu"><i class="fa-solid fa-location-dot" aria-hidden="true"></i>{{ lieu(p) }}</span>
              <!-- détails dévoilés sous le curseur (toujours visibles sur téléphone) -->
              <span class="re-details">
                <span><i class="fa-solid fa-store" aria-hidden="true"></i>Matériaux chez <b>{{ p.fournisseur }}</b></span>
                <span class="re-auteur">{{ p.detail }} — par {{ p.auteur }}</span>
              </span>
            </div>
          </router-link>
        </li>
      </ul>

      <!-- Curseur : automatique, ou la souris du visiteur ; étiquette = auteur du chantier survolé -->
      <div
        v-if="pilote" class="re-curseur" :class="{ visible: curseur.visible && curseur.nom, clic: curseur.clic, suivi: curseur.suivi }"
        :style="{ '--x': `${curseur.x}px`, '--y': `${curseur.y}px`, '--d': `${curseur.duree || 1}s` }" aria-hidden="true"
      >
        <span ref="fleche" class="re-curseur-y">
          <span class="re-onde"></span>
          <svg width="26" height="28" viewBox="0 0 26 28"><path d="M3 2.5 22.5 13l-8.6 2.3L9.6 24 3 2.5Z" /></svg>
          <span class="re-etiquette">{{ curseur.nom }}</span>
        </span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.re { overflow: hidden; background: #fff; }

/* ---------- En-tête : styles communs du site (.section-entete, .section-surtitre, .section-titre) ---------- */
.re-entete { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px 40px; margin-bottom: 44px; }
.re-entete .section-entete { margin: 0; }

/* ---------- Bandeau en boucle ---------- */
.re-galerie { position: relative; overflow: hidden; }
.re-galerie.pilote { padding: 6px 0; }
.re-piste { display: flex; width: max-content; margin: 0; padding: 0; list-style: none; animation: re-boucle var(--duree) linear infinite; }
@keyframes re-boucle { to { transform: translate3d(-50%, 0, 0); } }

/* marge à droite de chaque carte (plutôt qu'un gap) : les deux moitiés du bandeau ont exactement la même largeur */
.re-carte { flex: none; width: clamp(260px, 21vw, 380px); height: clamp(340px, 27vw, 470px); margin-right: 16px; }
.re-carte-lien { position: relative; display: block; height: 100%; overflow: hidden; border-radius: 22px; color: #fff; background: var(--ardoise); isolation: isolate; }
.re-carte-lien:focus-visible { outline: 3px solid var(--lagon-500); outline-offset: 3px; }

.re-photo {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transform: scale(1.06);
  filter: saturate(.8) brightness(.85); transition: transform 1.2s cubic-bezier(.2, .7, .2, 1), filter .6s ease;
}
.re-carte.visee .re-photo { transform: scale(1); filter: none; }
.re-visuel { position: absolute; inset: 0; display: grid; place-items: center; background: linear-gradient(160deg, var(--lagon-700), var(--ardoise)); font-size: 4rem; color: rgba(255,255,255,.85); }
.re-voile { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.3) 0%, transparent 24%, transparent 42%, rgba(4,12,18,.6) 66%, rgba(4,12,18,.92) 100%); }

.re-type {
  position: absolute; top: 16px; left: 16px; display: inline-flex; align-items: center; gap: 8px; padding: 5px 12px; border-radius: 999px;
  background: rgba(255,255,255,.16); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); font-size: .76rem; font-weight: 600; letter-spacing: .04em;
}
.re-infos { position: absolute; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; gap: 6px; padding: 22px; }
/* même titre de carte que « Que construisez-vous ? » (.ouvrage h3) */
.re-nom { margin: 0; font-size: 1.85rem; font-weight: 700; color: #fff; }
.re-lieu, .re-details > span:first-child { font-size: .9rem; color: rgba(255,255,255,.88); }
.re-infos i { margin-right: 7px; color: rgba(255,255,255,.6); }
.re-details b { color: #fff; }
.re-auteur { font-size: .8rem; color: rgba(255,255,255,.62); }
/* détails repliés, dépliés sous le curseur */
.re-details { display: flex; flex-direction: column; gap: 4px; max-height: 0; overflow: hidden; opacity: 0; transition: max-height .45s ease, opacity .35s ease; }
.re-carte.visee .re-details { max-height: 90px; opacity: 1; }

/* ---------- Curseur ---------- */
.re-curseur {
  position: absolute; top: 0; left: 0; z-index: 3; pointer-events: none; opacity: 0;
  transform: translate3d(var(--x), 0, 0); transition: transform var(--d, 1s) cubic-bezier(.55, .05, .3, 1), opacity .35s ease;
}
.re-curseur.visible { opacity: 1; }
.re-curseur-y { position: relative; display: block; transform: translate3d(0, var(--y), 0); transition: transform var(--d, 1s) cubic-bezier(.35, 1.2, .55, 1); }
/* souris du visiteur : la flèche la suit sans retard, le curseur système est masqué */
.re-curseur.suivi, .re-curseur.suivi .re-curseur-y { transition: opacity .2s ease; }
.re-galerie.souris-visiteur, .re-galerie.souris-visiteur * { cursor: none; }
.re-curseur svg { display: block; filter: drop-shadow(0 4px 10px rgba(0,0,0,.35)); transition: transform .18s ease; }
.re-curseur path { fill: #c026d3; stroke: #fff; stroke-width: 2; stroke-linejoin: round; }
.re-curseur.clic svg { transform: scale(.82); }
.re-etiquette {
  position: absolute; top: 22px; left: 18px; padding: 5px 11px; border-radius: 4px 12px 12px 12px; background: #c026d3; color: #fff;
  font-size: .78rem; font-weight: 700; white-space: nowrap; box-shadow: 0 6px 16px rgba(192, 38, 211, .35);
}
.re-onde { position: absolute; top: -14px; left: -14px; width: 32px; height: 32px; border: 2px solid #f0abfc; border-radius: 50%; opacity: 0; }
.re-curseur.clic .re-onde { animation: re-onde .6s ease-out; }
@keyframes re-onde { from { opacity: 1; transform: scale(.3); } to { opacity: 0; transform: scale(2.2); } }

/* ---------- Téléphone / tablette ---------- */
@media (max-width: 899px), (hover: none) {
  .re-entete { flex-direction: column; align-items: flex-start; margin-bottom: 32px; }
  .re-carte { width: min(74vw, 320px); height: min(100vw, 420px); margin-right: 12px; }
  .re-nom { font-size: 1.6rem; }
}
/* ---------- Mouvements réduits : pas de boucle, défilement manuel du premier exemplaire ---------- */
.re-galerie.calme { overflow-x: auto; scroll-snap-type: x mandatory; padding: 0 var(--gouttiere); scrollbar-width: none; }
.re-galerie.calme .re-piste { animation: none; }
.re-galerie.calme .re-carte { scroll-snap-align: start; }
.re-galerie.calme .re-carte[aria-hidden] { display: none; }
@media (prefers-reduced-motion: reduce) {
  .re-photo, .re-details { transition: none; }
}
</style>

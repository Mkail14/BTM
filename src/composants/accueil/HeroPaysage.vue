<script setup>
/**
 * HeroPaysage — décor animé de l'accueil : crépuscule sur Mayotte.
 * Soleil couchant, silhouette du mont Choungui, lagon qui scintille,
 * grue à tour qui déplace sa charge et immeuble en chantier aux fenêtres allumées.
 * Les plans bougent légèrement avec la souris (parallaxe via --px / --py).
 */
import { onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'

const racine = ref(null)
const zoneSommet = ref(null)
const surSommet = ref(false)
let raf = null
let cible = { x: 0, y: 0 }
let courant = { x: 0, y: 0 }
const mouvementReduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Le décor est sous le contenu (pointer-events: none) : on teste donc la distance
// entre le pointeur et la zone invisible posée sur le sommet du Choungui.
function detecterSommet(e) {
  const zone = zoneSommet.value?.getBoundingClientRect()
  if (!zone || !zone.width) return
  const dx = e.clientX - (zone.left + zone.width / 2)
  const dy = e.clientY - (zone.top + zone.height / 2)
  surSommet.value = Math.hypot(dx, dy) < zone.width / 2
}

function surPointeur(e) {
  detecterSommet(e)
  if (mouvementReduit) return
  cible = { x: e.clientX / window.innerWidth - 0.5, y: e.clientY / window.innerHeight - 0.5 }
  if (!raf) raf = requestAnimationFrame(animer)
}
function animer() {
  courant.x += (cible.x - courant.x) * 0.08
  courant.y += (cible.y - courant.y) * 0.08
  racine.value?.style.setProperty('--px', courant.x.toFixed(4))
  racine.value?.style.setProperty('--py', courant.y.toFixed(4))
  raf = Math.abs(cible.x - courant.x) + Math.abs(cible.y - courant.y) > 0.001 ? requestAnimationFrame(animer) : null
}

// Immeuble en chantier : façade de 5 étages × 4 travées, toutes les fenêtres sont dans la façade.
// Quelques-unes allumées (certaines clignotent), les autres éteintes pour dessiner la trame.
const IMMEUBLE = { x: 1228, sol: 292, largeur: 76, etage: 22, etages: 5 }
IMMEUBLE.haut = IMMEUBLE.sol - IMMEUBLE.etage * IMMEUBLE.etages // 182 : dalle du dernier étage fini
const fenetres = []
for (let etage = 0; etage < IMMEUBLE.etages; etage++)
  for (let col = 0; col < 4; col++) {
    const n = etage * 4 + col
    fenetres.push({
      x: IMMEUBLE.x + 8 + col * 17,                                // 4 fenêtres de 9 px, marges de 8 px
      y: IMMEUBLE.sol - (etage + 1) * IMMEUBLE.etage + 6,          // centrées dans la hauteur de l'étage
      allumee: [1, 6, 7, 12, 14, 17].includes(n), clignote: n % 3 === 0, delai: (n * 0.7) % 5
    })
  }
const dalles = Array.from({ length: IMMEUBLE.etages - 1 }, (_, i) => IMMEUBLE.sol - (i + 1) * IMMEUBLE.etage)

// ---------- Soleil et lune à l'heure de Mayotte ----------
// Le jour, le soleil suit un arc d'est en ouest entre ses vrais lever et coucher à Mayotte (calcul solaire NOAA
// simplifié) ; la nuit, il passe derrière la crête et la lune prend sa place, dans sa phase du jour.
const LATITUDE = -12.78, LONGITUDE = 45.23, FUSEAU = 3 // Mamoudzou, UTC+3 toute l'année
const RAD = Math.PI / 180
function heuresSoleil(maintenant) {
  const jour = Math.floor((maintenant - Date.UTC(maintenant.getUTCFullYear(), 0, 1)) / 864e5)
  const g = (2 * Math.PI / 365) * jour
  const equationTemps = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g))
  const declinaison = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g)
  const lat = LATITUDE * RAD
  const angle = Math.acos(Math.cos(90.833 * RAD) / (Math.cos(lat) * Math.cos(declinaison)) - Math.tan(lat) * Math.tan(declinaison)) / RAD
  const midi = (720 - 4 * LONGITUDE - equationTemps) / 60 + FUSEAU // heure locale du midi solaire
  return { lever: midi - angle / 15, coucher: midi + angle / 15 }
}
// Phase de la lune : 0 nouvelle, 0,5 pleine (référence : nouvelle lune du 6 janvier 2000, 18 h 14 UTC)
const phaseLune = (maintenant) => ((((maintenant - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % 29.530589) + 29.530589) % 29.530589 / 29.530589

// Arc bas, juste au-dessus des collines : l'astre reste sous le texte et la maquette 3D du héros, jamais derrière eux
const HORIZON = 262, HAUTEUR_ARC = 92, EST = 180, OUEST = 1260
const RAYON_LUNE = 22
/**
 * Partie éclairée de la lune (chemin SVG centré sur 0) : un demi-disque et une demi-ellipse (le terminateur),
 * de largeur |cos(2πp)|. Hémisphère sud : la lune croissante est éclairée à gauche, d'où le miroir.
 */
function cheminLune(p, r = RAYON_LUNE) {
  const k = Math.cos(2 * Math.PI * p)
  const d = `M0 ${-r} A${r} ${r} 0 0 1 0 ${r} A${(Math.abs(k) * r).toFixed(2)} ${r} 0 0 ${k > 0 ? 0 : 1} 0 ${-r}Z`
  return { d, miroir: p < 0.5 }
}
const astre = ref(calculerAstre())
function calculerAstre() {
  const maintenant = new Date()
  const heure = ((maintenant.getTime() / 36e5 + FUSEAU) % 24 + 24) % 24
  const { lever, coucher } = heuresSoleil(maintenant)
  const jour = heure >= lever && heure < coucher
  const t = jour ? (heure - lever) / (coucher - lever) : ((heure - coucher + 24) % 24) / (24 - (coucher - lever))
  const x = EST + t * (OUEST - EST)
  const y = HORIZON - Math.sin(Math.PI * t) * HAUTEUR_ARC
  return { jour, x, y, lune: cheminLune(phaseLune(maintenant)) }
}
let minuterieAstre = null

// Décor hors de l'écran (on a défilé plus bas) : ses animations s'arrêtent, rien n'est repeint pour rien
const aLEcran = ref(true)
let observateurEcran = null

// accueil gardé en mémoire (keep-alive) : pas de suivi du pointeur pendant qu'on est sur une autre page.
// onMounted et onActivated se suivent au premier affichage : brancher() ne doit rien doubler.
const brancher = () => {
  window.addEventListener('pointermove', surPointeur, { passive: true })
  astre.value = calculerAstre()
  clearInterval(minuterieAstre)
  minuterieAstre = setInterval(() => { astre.value = calculerAstre() }, 60000)
  if (!observateurEcran && racine.value && 'IntersectionObserver' in window) {
    observateurEcran = new IntersectionObserver(([e]) => { aLEcran.value = e.isIntersecting })
    observateurEcran.observe(racine.value)
  }
}
const debrancher = () => {
  window.removeEventListener('pointermove', surPointeur); if (raf) cancelAnimationFrame(raf); raf = null
  clearInterval(minuterieAstre); minuterieAstre = null
  observateurEcran?.disconnect(); observateurEcran = null
}
onMounted(brancher)
onActivated(brancher)
onDeactivated(debrancher)
onBeforeUnmount(debrancher)
</script>

<template>
  <div ref="racine" class="paysage" :class="{ nuit: !astre.jour, repos: !aLEcran }" aria-hidden="true">
    <div class="paysage-halo"></div>

    <svg class="paysage-svg" overflow="visible" viewBox="0 0 1440 400" preserveAspectRatio="xMaxYMax slice">
      <defs>
        <radialGradient id="soleil" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ffd58a" />
          <stop offset="60%" stop-color="#f59e0b" />
          <stop offset="100%" stop-color="#e2672a" />
        </radialGradient>
        <linearGradient id="eau" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1b2a2f" />
          <stop offset="100%" stop-color="#091116" />
        </linearGradient>
        <!-- Soleil : couronne douce autour du disque -->
        <radialGradient id="couronne">
          <stop offset="0%" stop-color="#ffd58a" stop-opacity=".55" />
          <stop offset="35%" stop-color="#f59e0b" stop-opacity=".18" />
          <stop offset="100%" stop-color="#f59e0b" stop-opacity="0" />
        </radialGradient>
        <!-- Lune : sol clair assombri vers le bord, halo froid, mers et cratères estompés -->
        <radialGradient id="lune-sol" cx="42%" cy="40%" r="62%">
          <stop offset="0%" stop-color="#fbfaf4" />
          <stop offset="70%" stop-color="#e3e3dc" />
          <stop offset="100%" stop-color="#b9bdb9" />
        </radialGradient>
        <radialGradient id="lune-halo">
          <stop offset="0%" stop-color="#dfeaf2" stop-opacity=".28" />
          <stop offset="40%" stop-color="#b9d0e0" stop-opacity=".08" />
          <stop offset="100%" stop-color="#b9d0e0" stop-opacity="0" />
        </radialGradient>
        <filter id="terminateur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation=".9" /></filter>
        <mask id="lune-eclairee" maskUnits="userSpaceOnUse" x="-40" y="-40" width="80" height="80">
          <path :d="astre.lune.d" :transform="astre.lune.miroir ? 'scale(-1 1)' : null" fill="#fff" filter="url(#terminateur)" />
        </mask>
      </defs>

      <!-- Soleil le jour, lune la nuit : position de l'heure actuelle à Mayotte (passe derrière la crête au lever et au coucher) -->
      <g class="plan plan-soleil">
        <g :key="astre.jour" class="astre" :style="{ transform: `translate(${astre.x}px, ${astre.y}px)` }">
          <template v-if="astre.jour">
            <circle r="120" fill="url(#couronne)" />
            <circle class="soleil" r="40" fill="url(#soleil)" />
          </template>
          <g v-else class="lune">
            <circle r="95" fill="url(#lune-halo)" />
            <!-- partie dans l'ombre : à peine visible (lumière cendrée) -->
            <circle :r="RAYON_LUNE" fill="#1c2833" opacity=".55" />
            <!-- partie éclairée, avec son relief -->
            <g mask="url(#lune-eclairee)">
              <circle :r="RAYON_LUNE" fill="url(#lune-sol)" />
              <g fill="#8e9696" opacity=".3">
                <ellipse cx="-7" cy="-6" rx="7.5" ry="5.5" transform="rotate(-20 -7 -6)" />
                <ellipse cx="5" cy="-9" rx="5" ry="4" />
                <ellipse cx="8" cy="2" rx="6" ry="7.5" transform="rotate(15 8 2)" />
                <ellipse cx="-4" cy="7" rx="5.5" ry="4" />
              </g>
              <g fill="#9ea5a4" stroke="#fdfdf8" stroke-width=".4" stroke-opacity=".4" opacity=".4">
                <circle cx="-12" cy="9" r="2.2" />
                <circle cx="2" cy="14" r="2.8" />
                <circle cx="13" cy="-4" r="1.6" />
                <circle cx="-2" cy="-15" r="1.4" />
                <circle cx="-15" cy="-3" r="1.2" />
              </g>
              <circle cx="3" cy="15" r=".9" fill="#fff" opacity=".9" /> <!-- éclat de Tycho -->
            </g>
          </g>
        </g>
      </g>

      <!-- Crête lointaine avec le mont Choungui -->
      <g class="plan plan-loin">
        <path fill="#17232a" d="M-500 262 H0 C120 244 210 252 310 236 C390 222 450 230 540 214 L600 178 L632 110 L646 104 L662 118 L700 186 C760 212 830 220 930 222 C1030 224 1120 204 1220 214 C1320 224 1390 216 1440 220 H2000 V400 H-500 Z" />

        <!-- Sommet du Choungui : zone de détection + étiquette discrète au survol -->
        <circle ref="zoneSommet" cx="646" cy="122" r="34" fill="none" />
        <g class="sommet" :class="{ visible: surSommet }">
          <circle class="sommet-point" cx="646" cy="104" r="2.2" />
          <path class="sommet-trait" d="M646 100 V66 H660" />
          <text class="sommet-nom" x="666" y="64">MONT CHOUNGUI · 594 m</text>
          <text class="sommet-info" x="666" y="78">Le pic emblématique de Mayotte</text>
        </g>
      </g>

      <!-- Collines proches -->
      <g class="plan plan-proche">
        <path fill="#0c1419" d="M-500 318 H0 C140 296 260 306 390 292 C520 278 640 298 780 302 C900 306 1010 286 1150 288 C1270 290 1370 302 1440 298 H2000 V400 H-500 Z" />

        <!-- Chantier (immeuble + grue) : masqué sur téléphone -->
        <g class="chantier">
        <!-- Immeuble en chantier -->
        <!-- façade (5 étages finis) et dalle de toit débordante -->
        <rect fill="#0a1216" :x="IMMEUBLE.x" :y="IMMEUBLE.haut" :width="IMMEUBLE.largeur" :height="IMMEUBLE.sol - IMMEUBLE.haut" />
        <rect fill="#0a1216" :x="IMMEUBLE.x - 4" :y="IMMEUBLE.haut - 4" :width="IMMEUBLE.largeur + 8" height="4" />
        <!-- dalles d'étage, à peine visibles -->
        <path stroke="#16242b" stroke-width="1" :d="dalles.map((y) => `M${IMMEUBLE.x} ${y} H${IMMEUBLE.x + IMMEUBLE.largeur}`).join(' ')" />
        <!-- étage en construction : poteaux et poutre, sans murs -->
        <g stroke="#27373f" stroke-width="1.5" fill="none">
          <path :d="`M${IMMEUBLE.x + 2} ${IMMEUBLE.haut - 4} V${IMMEUBLE.haut - 24} M${IMMEUBLE.x + 38} ${IMMEUBLE.haut - 4} V${IMMEUBLE.haut - 24} M${IMMEUBLE.x + 74} ${IMMEUBLE.haut - 4} V${IMMEUBLE.haut - 24} M${IMMEUBLE.x} ${IMMEUBLE.haut - 24} H${IMMEUBLE.x + 76}`" />
          <path :d="`M${IMMEUBLE.x + 2} ${IMMEUBLE.haut - 4} L${IMMEUBLE.x + 38} ${IMMEUBLE.haut - 24}`" stroke-width="1" />
        </g>
        <rect v-for="(f, i) in fenetres" :key="i" class="fenetre" :class="{ allumee: f.allumee, clignote: f.allumee && f.clignote }"
          :style="f.allumee ? { animationDelay: `${f.delai}s` } : null" :x="f.x" :y="f.y" width="9" height="10" />

        <!-- Grue à tour (bord droit, sous la maquette 3D) -->
        <g class="grue" stroke="#27373f" fill="none" stroke-width="2">
          <path d="M1370 296 V140 M1384 296 V140" />
          <path d="M1370 290 L1384 272 L1370 254 L1384 236 L1370 218 L1384 200 L1370 182 L1384 164 L1370 146" stroke-width="1.2" />
          <path d="M1230 140 H1460 M1250 148 H1370" />
          <path d="M1250 148 L1262 140 L1274 148 L1286 140 L1298 148 L1310 140 L1322 148 L1334 140 L1346 148 L1358 140 L1370 148" stroke-width="1.2" />
          <path d="M1370 140 L1377 112 L1384 140 M1377 112 L1234 140 M1377 112 L1460 132" stroke-width="1.2" />
          <rect x="1364" y="142" width="26" height="12" fill="#27373f" stroke="none" />
        </g>
        <!-- Chariot, câble et charge -->
        <g class="chariot">
          <rect x="1254" y="148" width="14" height="5" fill="#27373f" />
          <g class="charge">
            <line x1="1261" y1="153" x2="1261" y2="212" stroke="#35464f" stroke-width="1.2" />
            <path d="M1251 212 H1271 L1266 218 H1256 Z" fill="#27373f" />
            <rect x="1245" y="218" width="32" height="12" fill="#27373f" />
          </g>
        </g>
        </g>
      </g>

      <!-- Lagon -->
      <g class="plan plan-eau">
        <rect x="-500" y="330" width="2500" height="70" fill="url(#eau)" />
        <g class="reflets" stroke-linecap="round">
          <!-- reflet du soleil ou de la lune : toujours sous l'astre -->
          <g :key="astre.jour" class="reflets-astre" :style="{ transform: `translateX(${astre.x - 820}px)` }">
            <line x1="700" y1="342" x2="940" y2="342" stroke="rgba(255,190,90,.45)" stroke-width="2" stroke-dasharray="40 16 10 22" />
            <line x1="730" y1="354" x2="910" y2="354" stroke="rgba(255,190,90,.3)" stroke-width="2" stroke-dasharray="24 18 8 14" />
            <line x1="760" y1="366" x2="880" y2="366" stroke="rgba(255,190,90,.2)" stroke-width="2" stroke-dasharray="16 20 6 12" />
          </g>
          <line x1="120" y1="350" x2="420" y2="350" stroke="rgba(160,215,225,.12)" stroke-width="1.5" stroke-dasharray="30 40" />
          <line x1="1040" y1="360" x2="1380" y2="360" stroke="rgba(160,215,225,.1)" stroke-width="1.5" stroke-dasharray="26 34" />
        </g>
      </g>
    </svg>

    <div class="paysage-grain"></div>
  </div>
</template>

<style scoped>
.paysage { --px: 0; --py: 0; position: absolute; inset: 0; z-index: -1; overflow: hidden; pointer-events: none;
  background: linear-gradient(180deg, #070b10 0%, #0c141b 40%, #261c1b 74%, #5a3522 100%); }

/* Lueur chaude à l'horizon, qui respire lentement */
.paysage-halo {
  position: absolute; left: 50%; bottom: 8%; width: 110vw; height: 70vh; transform: translateX(-40%);
  background: radial-gradient(ellipse at center, rgba(245, 158, 11, .28), rgba(226, 103, 42, .12) 40%, transparent 70%);
  animation: respirer 9s ease-in-out infinite;
}

.paysage-svg { overflow: visible; position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: clamp(260px, 50vh, 560px); }

/* Parallaxe : chaque plan se déplace plus ou moins selon sa profondeur */
.plan-soleil { transform: translate(calc(var(--px) * -8px), calc(var(--py) * -4px)); }
.plan-loin { transform: translate(calc(var(--px) * -14px), 0); }
.plan-proche { transform: translate(calc(var(--px) * -30px), 0); }
.plan-eau { transform: translate(calc(var(--px) * -40px), 0); }

/* soleil ou lune : la position change chaque minute, le déplacement est fondu */
/* pas de transition : l'astre avance d'un pixel par minute, une transition repeindrait la scène sans arrêt */
/* lueurs dessinées par des dégradés (couronne, halo) : un filtre serait recalculé à chaque mouvement de souris */
/* nuit : lueur de l'horizon refroidie, reflets argentés sur le lagon */
.paysage.nuit { background: linear-gradient(180deg, #05080d 0%, #0a121a 45%, #111c26 78%, #1a2733 100%); }
.paysage.nuit .paysage-halo { opacity: .35; filter: hue-rotate(170deg) saturate(.5); }
.paysage.nuit .reflets-astre line { stroke: rgba(215, 230, 240, .3); }
.paysage.nuit .fenetre.allumee { opacity: 1; }

@media (max-width: 639px) { .chantier { display: none; } }
.chariot { animation: chariot 16s ease-in-out infinite; }
.charge { transform-box: view-box; transform-origin: 1261px 153px; animation: balancer 4s ease-in-out infinite; }

/* Étiquette du mont Choungui : apparaît en fondu quand la souris frôle le sommet */
.sommet { opacity: 0; transform: translateY(4px); transition: opacity .5s ease, transform .5s ease; }
.sommet.visible { opacity: 1; transform: translateY(0); }
.sommet-point { fill: #ffd58a; filter: drop-shadow(0 0 4px rgba(245, 158, 11, .9)); }
.sommet.visible .sommet-point { animation: pulser 2.4s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.sommet-trait { fill: none; stroke: rgba(255, 213, 138, .45); stroke-width: .8;
  stroke-dasharray: 60; stroke-dashoffset: 60; transition: stroke-dashoffset .6s ease .1s; }
.sommet.visible .sommet-trait { stroke-dashoffset: 0; }
.sommet-nom { font-family: var(--font-mono); font-size: 8.5px; letter-spacing: .18em; fill: rgba(255, 255, 255, .78); }
.sommet-info { font-family: var(--font-corps); font-size: 8px; font-style: italic; fill: rgba(255, 213, 138, .6); }

.fenetre { fill: #16242b; }
.fenetre.allumee { fill: #f7b955; opacity: .85; }
.fenetre.clignote { animation: clignoter 6s steps(1) infinite; }

.reflets line { animation: scintiller 7s linear infinite; }
.reflets line:nth-child(2) { animation-duration: 9s; animation-direction: reverse; }
.reflets line:nth-child(3) { animation-duration: 6s; }

/* Grain photographique léger */
.paysage-grain {
  position: absolute; inset: 0; opacity: .035;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

@keyframes respirer { 50% { opacity: .75; } }
@keyframes chariot { 0%, 8% { transform: translateX(0); } 45%, 58% { transform: translateX(92px); } 100% { transform: translateX(0); } }
@keyframes balancer { 0%, 100% { transform: rotate(-2.5deg); } 50% { transform: rotate(2.5deg); } }
@keyframes clignoter { 0%, 70% { opacity: .85; } 71%, 100% { opacity: .15; } }
@keyframes scintiller { to { stroke-dashoffset: -180; } }
@keyframes pulser { 50% { transform: scale(1.8); opacity: .5; } }

@media (prefers-reduced-motion: reduce) {
  .paysage *, .paysage { animation: none !important; }
}
.paysage.repos, .paysage.repos * { animation-play-state: paused !important; }
</style>

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

// Fenêtres de l'immeuble en chantier : quelques-unes allumées, certaines clignotent
const fenetres = []
for (let etage = 0; etage < 5; etage++)
  for (let col = 0; col < 4; col++) {
    const n = etage * 4 + col
    if ([1, 6, 7, 12, 14, 17].includes(n)) fenetres.push({ x: 1236 + col * 16, y: 262 - etage * 22, clignote: n % 3 === 0, delai: (n * 0.7) % 5 })
  }

// accueil gardé en mémoire (keep-alive) : pas de suivi du pointeur pendant qu'on est sur une autre page
const brancher = () => window.addEventListener('pointermove', surPointeur, { passive: true })
const debrancher = () => { window.removeEventListener('pointermove', surPointeur); if (raf) cancelAnimationFrame(raf); raf = null }
onMounted(brancher)
onActivated(brancher)
onDeactivated(debrancher)
onBeforeUnmount(debrancher)
</script>

<template>
  <div ref="racine" class="paysage" aria-hidden="true">
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
      </defs>

      <!-- Soleil couchant -->
      <g class="plan plan-soleil">
        <circle class="soleil" cx="820" cy="236" r="58" fill="url(#soleil)" />
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
        <g fill="#0a1216">
          <rect x="1228" y="190" width="76" height="102" />
          <rect x="1224" y="186" width="84" height="5" />
        </g>
        <g stroke="#27373f" stroke-width="1.5" fill="none">
          <path d="M1224 186 V292 M1308 186 V292" />
          <path d="M1228 168 V190 M1304 168 V190 M1228 168 H1304" />
        </g>
        <rect v-for="(f, i) in fenetres" :key="i" class="fenetre" :class="{ clignote: f.clignote }"
          :style="{ animationDelay: `${f.delai}s` }" :x="f.x" :y="f.y" width="8" height="10" />

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
          <line x1="700" y1="342" x2="940" y2="342" stroke="rgba(255,190,90,.45)" stroke-width="2" stroke-dasharray="40 16 10 22" />
          <line x1="730" y1="354" x2="910" y2="354" stroke="rgba(255,190,90,.3)" stroke-width="2" stroke-dasharray="24 18 8 14" />
          <line x1="760" y1="366" x2="880" y2="366" stroke="rgba(255,190,90,.2)" stroke-width="2" stroke-dasharray="16 20 6 12" />
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
.plan { transition: transform .1s linear; }
.plan-soleil { transform: translate(calc(var(--px) * -8px), calc(var(--py) * -4px)); }
.plan-loin { transform: translate(calc(var(--px) * -14px), 0); }
.plan-proche { transform: translate(calc(var(--px) * -30px), 0); }
.plan-eau { transform: translate(calc(var(--px) * -40px), 0); }

.soleil { filter: drop-shadow(0 0 30px rgba(245, 158, 11, .7)); animation: coucher 40s ease-in-out infinite alternate; transform-box: view-box; }

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

.fenetre { fill: #f7b955; opacity: .85; }
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
@keyframes coucher { to { transform: translateY(14px); } }
@keyframes chariot { 0%, 8% { transform: translateX(0); } 45%, 58% { transform: translateX(92px); } 100% { transform: translateX(0); } }
@keyframes balancer { 0%, 100% { transform: rotate(-2.5deg); } 50% { transform: rotate(2.5deg); } }
@keyframes clignoter { 0%, 70% { opacity: .85; } 71%, 100% { opacity: .15; } }
@keyframes scintiller { to { stroke-dashoffset: -180; } }
@keyframes pulser { 50% { transform: scale(1.8); opacity: .5; } }

@media (prefers-reduced-motion: reduce) {
  .paysage *, .paysage { animation: none !important; }
}
</style>

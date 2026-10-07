<script>
// File d'attente commune à toutes les maquettes : construire une scène (contexte WebGL, ombres, éclairage)
// prend du temps ; une seule est construite par créneau libre du navigateur, pour ne jamais figer la page.
const file = []
let fileEnCours = false
const creneau = (tache) => (window.requestIdleCallback ? window.requestIdleCallback(tache, { timeout: 400 }) : setTimeout(tache, 16))
function tacheSuivante() {
  const tache = file.shift()
  fileEnCours = !!tache
  if (tache) creneau(async () => { await tache(); tacheSuivante() })
}
function planifier(tache) {
  file.push(tache)
  if (!fileEnCours) tacheSuivante()
}
</script>

<script setup>
/**
 * Maquette3D — maquette three.js procédurale d'un ouvrage (mur, dalle, fondation, terrasse),
 * façon maquette d'architecte : matériaux réalistes, ombres douces, légère oscillation.
 * Pivote vers l'utilisateur quand `actif` est vrai (survol de la carte).
 * La scène n'est construite qu'à l'approche de l'écran, et le rendu ne tourne que lorsqu'elle est visible.
 */
import { onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

const props = defineProps({
  type: { type: String, required: true },
  actif: { type: Boolean, default: false }
})

const hote = ref(null)
let renderer, scene, camera, pivot, pmrem, envTexture
let rafId = null
let visible = false
let pivotSurvol = 0
let observateurVisibilite, observateurTaille
let planifiee = false
let detruite = false
const mouvementReduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* ---------- Outils de modélisation ---------- */

// Aléa déterministe : la maquette est identique à chaque chargement
function alea(graine) {
  return () => {
    graine |= 0; graine = (graine + 0x6d2b79f5) | 0
    let t = Math.imul(graine ^ (graine >>> 15), 1 | graine)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = alea(7)

const matiere = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...options })

function texture(base, taches, repetition = 2) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, 128, 128)
  for (let i = 0; i < 2800; i++) {
    ctx.fillStyle = taches[Math.floor(rnd() * taches.length)]
    const s = 1 + rnd() * 2.5
    ctx.fillRect(rnd() * 128, rnd() * 128, s, s)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repetition, repetition)
  return t
}

// Boîte posée sur y (et non centrée), avec arêtes adoucies si `arrondi`
function boite(g, w, h, d, mat, x, y, z, arrondi = 0) {
  const geo = arrondi ? new RoundedBoxGeometry(w, h, d, 2, arrondi) : new THREE.BoxGeometry(w, h, d)
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y + h / 2, z)
  m.castShadow = m.receiveShadow = true
  g.add(m)
  return m
}

// Barre cylindrique (armature, poteau, main courante) centrée en (x, y, z)
function barre(g, longueur, axe, mat, x, y, z, r = 0.012) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, longueur, 8), mat)
  if (axe === 'x') m.rotation.z = Math.PI / 2
  if (axe === 'z') m.rotation.x = Math.PI / 2
  m.position.set(x, y, z)
  m.castShadow = true
  g.add(m)
  return m
}

function materiaux() {
  return {
    beton: matiere('#b8bab5', { map: texture('#b8bab5', ['#adafaa', '#c3c5c0', '#a6a8a3']) }),
    acier: matiere('#8c5a3c', { roughness: 0.55, metalness: 0.55 }),
    bois: matiere('#c99a64', { roughness: 0.75 }),
    terre: matiere('#8b6a4a', { map: texture('#8b6a4a', ['#7a5b3e', '#9c7a58', '#6e5037', '#a4845f'], 3) }),
    gravier: matiere('#8d8a82', { map: texture('#8d8a82', ['#6f6c66', '#a8a59d', '#7c7973', '#b7b3aa'], 3) }),
    herbe: matiere('#5f8f4e', { map: texture('#5f8f4e', ['#527f43', '#6ea05b', '#4a7440'], 3) }),
    inox: matiere('#d7dde2', { roughness: 0.25, metalness: 1 })
  }
}

/* ---------- Ouvrages ---------- */

function construireMur(g, m) {
  const L = 0.4, H = 0.2, E = 0.2, j = 0.014, colonnes = 6
  const largeur = colonnes * L + (colonnes - 1) * j
  const teintes = [matiere('#d2cfc8'), matiere('#c7c3bb'), matiere('#dad7d0')]
  const baie = [-0.02, 0.83]
  const y0 = 0.1

  boite(g, largeur + 0.24, y0, E + 0.24, m.beton, 0, 0, 0)

  const decouper = ([a, b], [x1, x2]) => [[a, Math.min(b, x1)], [Math.max(a, x2), b]].filter(([u, v]) => v - u > 0.05)

  for (let r = 0; r < 6; r++) {
    const tailles = r % 2 ? [L / 2, ...Array(colonnes - 1).fill(L), L / 2] : Array(colonnes).fill(L)
    const y = y0 + r * (H + j)
    let x = -largeur / 2
    for (const w of tailles) {
      let morceaux = [[x, x + w]]
      x += w + j
      if (r === 2 || r === 3) morceaux = morceaux.flatMap((s) => decouper(s, baie))
      if (r === 4) morceaux = morceaux.flatMap((s) => decouper(s, [baie[0] - 0.15, baie[1] + 0.15]))
      if (r === 5) morceaux = morceaux.flatMap((s) => decouper(s, [0.25, 99]))
      for (const [a, b] of morceaux) boite(g, b - a, H, E, teintes[Math.floor(rnd() * 3)], (a + b) / 2, y, 0, 0.012)
    }
  }
  // appui et linteau de la fenêtre
  const milieu = (baie[0] + baie[1]) / 2
  boite(g, baie[1] - baie[0] + 0.1, 0.04, E + 0.06, m.beton, milieu, y0 + 2 * (H + j), 0)
  boite(g, baie[1] - baie[0] + 0.3, H, E, m.beton, milieu, y0 + 4 * (H + j), 0)

  // palette de parpaings
  const px = largeur / 2 + 0.6, pz = 0.25
  for (const dz of [-0.25, 0, 0.25]) boite(g, 0.8, 0.03, 0.1, m.bois, px, 0.07, pz + dz)
  for (const dx of [-0.35, 0, 0.35]) boite(g, 0.1, 0.07, 0.6, m.bois, px + dx, 0, pz)
  for (let n = 0; n < 2; n++)
    for (const dx of [-0.2, 0.2])
      for (const dz of [-0.2, 0, 0.2]) boite(g, L - 0.01, H - 0.01, 0.19, teintes[Math.floor(rnd() * 3)], px + dx, 0.1 + n * H, pz + dz, 0.012)

  // sac de ciment
  const sac = boite(g, 0.32, 0.11, 0.46, matiere('#e6dcc2', { roughness: 0.95 }), -largeur / 2 - 0.05, 0, 0.55, 0.05)
  sac.rotation.y = 0.5
}

function construireDalle(g, m) {
  const Lx = 2.8, Lz = 2, coupe = -0.1
  boite(g, Lx, 0.16, Lz, m.gravier, 0, 0, 0)
  boite(g, Lx, 0.008, Lz, matiere('#27313d', { roughness: 0.4 }), 0, 0.16, 0)
  const yb = 0.168

  // moitié coulée
  boite(g, coupe + Lx / 2, 0.13, Lz, m.beton, (-Lx / 2 + coupe) / 2, yb, 0)

  // treillis soudé sur cales
  const debut = coupe - 0.15, fin = Lx / 2 - 0.08, hy = yb + 0.05
  for (let z = -Lz / 2 + 0.1; z < Lz / 2 - 0.05; z += 0.2) barre(g, fin - debut, 'x', m.acier, (debut + fin) / 2, hy, z)
  for (let x = coupe + 0.1; x < Lx / 2 - 0.05; x += 0.2) {
    barre(g, Lz - 0.12, 'z', m.acier, x, hy + 0.024, 0)
    for (let z = -Lz / 2 + 0.3; z < Lz / 2; z += 0.6) boite(g, 0.03, 0.04, 0.03, matiere('#3b4450'), x, yb, z)
  }

  // coffrage bois
  const lc = Lx / 2 - coupe
  boite(g, lc, 0.2, 0.04, m.bois, coupe + lc / 2, 0.1, Lz / 2 + 0.02)
  boite(g, lc, 0.2, 0.04, m.bois, coupe + lc / 2, 0.1, -Lz / 2 - 0.02)
  boite(g, 0.04, 0.2, Lz + 0.08, m.bois, Lx / 2 + 0.02, 0.1, 0)
}

function construireFondation(g, m) {
  const Lx = 2.8, Lz = 2.2, prof = 0.5, lt = 0.5, fond = 0.25
  const cote = (Lz - lt) / 2
  boite(g, Lx, fond, Lz, m.terre, 0, 0, 0)
  // berge arrière (pleine hauteur) et berge avant (coupée pour voir la tranchée)
  boite(g, Lx, prof, cote, m.terre, 0, fond, -(lt / 2 + cote / 2))
  boite(g, Lx, 0.04, cote, m.herbe, 0, fond + prof, -(lt / 2 + cote / 2))
  boite(g, Lx, 0.18, cote, m.terre, 0, fond, lt / 2 + cote / 2)
  boite(g, Lx, 0.03, cote, m.herbe, 0, fond + 0.18, lt / 2 + cote / 2)

  // déblais
  const tas = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 12), m.terre)
  tas.scale.set(1.2, 0.45, 0.8)
  tas.position.set(-0.7, fond + prof + 0.02, -(lt / 2 + cote / 2) - 0.05)
  tas.castShadow = tas.receiveShadow = true
  g.add(tas)

  // béton de propreté + semelle coulée à gauche
  boite(g, Lx, 0.04, lt, matiere('#9fa19c'), 0, fond, 0)
  const yf = fond + 0.04, xc = 0.1
  boite(g, xc + Lx / 2, 0.22, lt - 0.1, m.beton, (-Lx / 2 + xc) / 2, yf, 0)

  // cage d'armature à droite
  const debut = xc - 0.15, fin = Lx / 2 - 0.06
  for (const [dy, dz] of [[0.04, -0.14], [0.04, 0.14], [0.18, -0.14], [0.18, 0.14]])
    barre(g, fin - debut, 'x', m.acier, (debut + fin) / 2, yf + dy, dz)
  for (let x = xc + 0.08; x < fin; x += 0.18) {
    boite(g, 0.012, 0.012, 0.3, m.acier, x, yf + 0.03, 0)
    boite(g, 0.012, 0.012, 0.3, m.acier, x, yf + 0.18, 0)
    boite(g, 0.012, 0.16, 0.012, m.acier, x, yf + 0.03, -0.144)
    boite(g, 0.012, 0.16, 0.012, m.acier, x, yf + 0.03, 0.144)
  }
  // attentes verticales
  for (const x of [-1.1, -0.55, 0]) for (const z of [-0.1, 0.1]) barre(g, 0.75, 'y', m.acier, x, yf + 0.375, z)
}

function construireTerrasse(g, m) {
  const Lx = 2.8, Lz = 2, h = 0.18, j = 0.012
  boite(g, Lx, h, Lz, m.beton, 0, 0, 0)
  boite(g, 1, 0.09, 0.3, m.beton, 0.6, 0, Lz / 2 + 0.15)
  boite(g, Lx, 0.006, Lz, matiere('#bdb6a8'), 0, h, 0)

  const nx = 7, nz = 5
  const cx = (Lx - (nx + 1) * j) / nx, cz = (Lz - (nz + 1) * j) / nz
  const teintes = ['#ebe3d5', '#e2d8c6', '#f0e9dd'].map((c) => matiere(c, { roughness: 0.45 }))
  const aPoser = (i, k) => (i === nx - 1 && k >= nz - 2) || (i === nx - 2 && k === nz - 1)
  for (let i = 0; i < nx; i++)
    for (let k = 0; k < nz; k++) {
      if (aPoser(i, k)) continue
      boite(g, cx, 0.022, cz, teintes[Math.floor(rnd() * 3)], -Lx / 2 + j + cx / 2 + i * (cx + j), h + 0.006, -Lz / 2 + j + cz / 2 + k * (cz + j), 0.006)
    }

  // garde-corps vitré sur deux côtés
  const verre = new THREE.MeshPhysicalMaterial({ color: '#cdeff4', transparent: true, opacity: 0.28, roughness: 0.05 })
  const yg = h + 0.03, hg = 0.85
  const cotes = [
    { depart: [-Lx / 2 + 0.05, -Lz / 2 + 0.05], fin: [Lx / 2 - 0.05, -Lz / 2 + 0.05] },
    { depart: [-Lx / 2 + 0.05, -Lz / 2 + 0.05], fin: [-Lx / 2 + 0.05, Lz / 2 - 0.05] }
  ]
  for (const { depart, fin } of cotes) {
    const [ax, az] = depart, [bx, bz] = fin
    const longueur = Math.hypot(bx - ax, bz - az)
    const axe = bx !== ax ? 'x' : 'z'
    const n = Math.round(longueur / 0.7)
    for (let p = 0; p <= n; p++) barre(g, hg, 'y', m.inox, ax + ((bx - ax) * p) / n, yg + hg / 2, az + ((bz - az) * p) / n, 0.018)
    barre(g, longueur, axe, m.inox, (ax + bx) / 2, yg + hg, (az + bz) / 2, 0.022)
    const panneau = axe === 'x'
      ? boite(g, longueur - 0.06, hg - 0.12, 0.012, verre, (ax + bx) / 2, yg + 0.04, az)
      : boite(g, 0.012, hg - 0.12, longueur - 0.06, verre, ax, yg + 0.04, (az + bz) / 2)
    panneau.castShadow = false
  }

  // plantes en pot
  const pot = matiere('#b8633f', { roughness: 0.9 })
  const feuillage = [matiere('#4f7d45', { flatShading: true }), matiere('#6a9a55', { flatShading: true })]
  const planter = (x, z, s) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.12 * s, 0.32 * s, 20), pot)
    p.position.set(x, h + 0.028 + 0.16 * s, z)
    p.castShadow = p.receiveShadow = true
    g.add(p)
    for (const [dx, dy, dz, r, f] of [[0, 0.5, 0, 0.26, 0], [0.1, 0.68, 0.05, 0.18, 1], [-0.08, 0.62, -0.06, 0.16, 1]]) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 1), feuillage[f])
      b.position.set(x + dx * s, h + dy * s, z + dz * s)
      b.castShadow = true
      g.add(b)
    }
  }
  planter(-1.05, -0.6, 1)
  planter(-0.6, -0.72, 0.7)
}

const constructeurs = { mur: construireMur, dalle: construireDalle, fondation: construireFondation, terrasse: construireTerrasse }

/* ---------- Scène ---------- */

let cible = new THREE.Vector3()
let rayon = 1

function cadrer() {
  if (!hote.value || !renderer) return
  const { clientWidth: w, clientHeight: h } = hote.value
  if (!w || !h) return
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  const demiV = THREE.MathUtils.degToRad(camera.fov / 2)
  const demi = Math.min(demiV, Math.atan(Math.tan(demiV) * camera.aspect))
  // 1,15 : la maquette entière tient dans la carte avec un peu d'air autour (0,92 la faisait déborder)
  const distance = (rayon / Math.sin(demi)) * 1.15
  const az = THREE.MathUtils.degToRad(38), el = THREE.MathUtils.degToRad(30)
  camera.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(distance).add(cible)
  camera.lookAt(cible)
  rendre()
}

function initialiser() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  hote.value.appendChild(renderer.domElement)

  scene = new THREE.Scene()
  pmrem = new THREE.PMREMGenerator(renderer)
  envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = envTexture
  scene.environmentIntensity = 0.55

  camera = new THREE.PerspectiveCamera(24, 1, 0.1, 100)

  scene.add(new THREE.HemisphereLight('#ffffff', '#d9cfbf', 0.9))
  const soleil = new THREE.DirectionalLight('#fff3df', 2.4)
  soleil.position.set(2.5, 5, 3)
  soleil.castShadow = true
  soleil.shadow.mapSize.set(1024, 1024)
  Object.assign(soleil.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 15 })
  soleil.shadow.bias = -0.0004
  soleil.shadow.normalBias = 0.02
  scene.add(soleil)

  const sol = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.16 }))
  sol.rotation.x = -Math.PI / 2
  sol.receiveShadow = true
  scene.add(sol)

  // Maquette : construite, centrée, posée au sol et mise à l'échelle
  const maquette = new THREE.Group()
  constructeurs[props.type]?.(maquette, materiaux())
  const boiteEnglobante = new THREE.Box3().setFromObject(maquette)
  const taille = boiteEnglobante.getSize(new THREE.Vector3())
  const centre = boiteEnglobante.getCenter(new THREE.Vector3())
  maquette.position.set(-centre.x, -boiteEnglobante.min.y, -centre.z)
  pivot = new THREE.Group()
  pivot.add(maquette)
  pivot.scale.setScalar(2.6 / Math.max(taille.x, taille.z))
  scene.add(pivot)

  const sphere = new THREE.Box3().setFromObject(pivot).getBoundingSphere(new THREE.Sphere())
  cible = sphere.center
  rayon = sphere.radius
}

function rendre() {
  if (renderer) renderer.render(scene, camera)
}

function boucle(temps) {
  rafId = requestAnimationFrame(boucle)
  pivotSurvol += ((props.actif ? 0.6 : 0) - pivotSurvol) * 0.06
  pivot.rotation.y = Math.sin(temps * 0.00035) * 0.18 + pivotSurvol
  rendre()
}

function demarrer() {
  if (rafId || mouvementReduit || !visible || !renderer) return
  rafId = requestAnimationFrame(boucle)
}
function arreter() {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = null
}

async function construire() {
  if (detruite || renderer || !hote.value) return
  try {
    initialiser()
  } catch (e) {
    console.warn('Maquette 3D indisponible :', e)
    return
  }
  // shaders compilés en parallèle (KHR_parallel_shader_compile) : le premier rendu ne fige plus la page
  try { await renderer.compileAsync(scene, camera) } catch { /* navigateur sans compilation asynchrone : compilés au premier rendu */ }
  if (detruite) return
  cadrer()
  observateurTaille = new ResizeObserver(cadrer)
  observateurTaille.observe(hote.value)
  demarrer()
}

onMounted(() => {
  // construite à l'approche de l'écran (marge de 300 px), pas au chargement de la page
  observateurVisibilite = new IntersectionObserver(([entree]) => {
    visible = entree.isIntersecting
    if (visible && !planifiee) { planifiee = true; planifier(construire) }
    visible ? demarrer() : arreter()
  }, { rootMargin: '300px 0px' })
  observateurVisibilite.observe(hote.value)
})
// accueil gardé en mémoire (keep-alive) : pas de rendu pendant qu'on est sur une autre page
onDeactivated(arreter)
onActivated(demarrer)

onBeforeUnmount(() => {
  detruite = true
  arreter()
  observateurVisibilite?.disconnect()
  observateurTaille?.disconnect()
  scene?.traverse((o) => {
    o.geometry?.dispose()
    if (o.material) {
      o.material.map?.dispose()
      o.material.dispose()
    }
  })
  envTexture?.dispose()
  pmrem?.dispose()
  if (renderer) {
    renderer.dispose()
    renderer.forceContextLoss() // dispose() seul garde le contexte WebGL ouvert jusqu'au ramasse-miettes
    renderer.domElement.remove()
    renderer = null
  }
})
</script>

<template>
  <div ref="hote" class="maquette" aria-hidden="true"></div>
</template>

<style scoped>
.maquette { position: absolute; inset: 0; }
.maquette :deep(canvas) { display: block; width: 100%; height: 100%; }
</style>

<script setup>
/**
 * RobotChantier3D — petit robot de chantier aux couleurs de BTM qui monte un mur de parpaings, en boucle
 * (page « Bientôt disponible »). Scène three.js procédurale, sans modèle à charger :
 *  - le robot roule entre sa palette et le mur, saisit un parpaing (bras à deux segments, cinématique
 *    inverse) et le pose rangée par rangée ;
 *  - mur terminé : courte pause, les parpaings retournent sur la palette, et il recommence ;
 *  - le plateau tourne lentement sur lui-même.
 * Mouvement réduit (préférence système) : le mur est affiché fini, sans animation.
 * Rendu suspendu quand l'onglet est caché ; tout est libéré au démontage.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'
import { appareilLeger } from '@/composables/useAppareil.js'

const conteneur = ref(null)
let renderer, scene, camera, raf, observateur
let enPause = false
const nettoyages = []

// ---------- Dimensions ----------
const PARPAING = { l: 0.42, h: 0.2, p: 0.2 }
const JOINT = 0.018
const RANGEES = 3, COLONNES = 4
const NB = RANGEES * COLONNES
const SOL = 0.06                 // épaisseur du plateau
const MUR_Z = -0.05, MUR_X = 0.3  // centre du mur
const ROBOT_Z = 0.75               // ligne sur laquelle roule le robot
const PALETTE_X = -1.05
const EPAULE = { y: 0.98, z: -0.16 } // repère du robot (il regarde vers −z)
const L1 = 0.52, L2 = 0.5        // segments du bras
const SOUS_PINCE = 0.13          // le parpaing pend sous la pince

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
const lerp = (a, b, t) => a + (b - a) * t
const lerp3 = (a, b, t) => new THREE.Vector3(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t))

function materiau(couleur, options = {}) {
  const m = new THREE.MeshStandardMaterial({ color: couleur, roughness: 0.55, metalness: 0.1, ...options })
  nettoyages.push(() => m.dispose())
  return m
}
function boite(l, h, p, mat, rayon = 0) {
  const g = rayon ? arrondie(l, h, p, rayon) : new THREE.BoxGeometry(l, h, p)
  nettoyages.push(() => g.dispose())
  const m = new THREE.Mesh(g, mat)
  m.castShadow = true; m.receiveShadow = true
  return m
}
// boîte aux arêtes adoucies (extrusion d'un rectangle arrondi)
function arrondie(l, h, p, r) {
  const f = new THREE.Shape()
  const x = -l / 2, y = -h / 2
  f.moveTo(x + r, y); f.lineTo(x + l - r, y); f.quadraticCurveTo(x + l, y, x + l, y + r)
  f.lineTo(x + l, y + h - r); f.quadraticCurveTo(x + l, y + h, x + l - r, y + h)
  f.lineTo(x + r, y + h); f.quadraticCurveTo(x, y + h, x, y + h - r)
  f.lineTo(x, y + r); f.quadraticCurveTo(x, y, x + r, y)
  const g = new THREE.ExtrudeGeometry(f, { depth: p - 2 * r * 0.6, bevelEnabled: true, bevelThickness: r * 0.6, bevelSize: r * 0.6, bevelSegments: 3, curveSegments: 6 })
  g.translate(0, 0, -(p - 2 * r * 0.6) / 2)
  return g
}
function cylindre(r, h, mat, segments = 20) {
  const g = new THREE.CylinderGeometry(r, r, h, segments)
  nettoyages.push(() => g.dispose())
  const m = new THREE.Mesh(g, mat)
  m.castShadow = true
  return m
}
function sphere(r, mat, options = {}) {
  const g = new THREE.SphereGeometry(r, 24, 16, 0, Math.PI * 2, 0, options.demi ? Math.PI / 2 : Math.PI)
  nettoyages.push(() => g.dispose())
  const m = new THREE.Mesh(g, mat)
  m.castShadow = true
  return m
}

function construire() {
  const el = conteneur.value
  const largeur = el.clientWidth || 480, hauteur = el.clientHeight || 480

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(32, largeur / hauteur, 0.1, 50)
  camera.position.set(0, 2.6, 6.5)
  camera.lookAt(0, 0.5, 0)

  renderer = new THREE.WebGLRenderer({ antialias: !appareilLeger.value, alpha: true })
  renderer.setPixelRatio(appareilLeger.value ? 1 : Math.min(window.devicePixelRatio, 2))
  renderer.setSize(largeur, hauteur)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  el.appendChild(renderer.domElement)

  // lumière du décor : soleil couchant orangé, contre-jour bleu lagon
  scene.add(new THREE.AmbientLight(0xffffff, 0.9))
  const soleil = new THREE.DirectionalLight(0xffd2a1, 2.1)
  soleil.position.set(3, 5, 4)
  soleil.castShadow = true
  soleil.shadow.mapSize.set(1024, 1024)
  Object.assign(soleil.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 })
  scene.add(soleil)
  const contre = new THREE.DirectionalLight(0x67e8f9, 1.1)
  contre.position.set(-4, 2.5, -3)
  scene.add(contre)

  const plateau = new THREE.Group()
  scene.add(plateau)

  // ---------- Plateau ----------
  const disque = cylindre(2.05, SOL, materiau(0x1e293b, { roughness: 0.8 }), 64)
  disque.position.y = SOL / 2
  disque.receiveShadow = true
  plateau.add(disque)
  const anneauGeo = new THREE.TorusGeometry(2.05, 0.018, 8, 96)
  nettoyages.push(() => anneauGeo.dispose())
  const anneau = new THREE.Mesh(anneauGeo, materiau(0x111111, { emissive: 0x0891b2, emissiveIntensity: 1.2 }))
  anneau.rotation.x = Math.PI / 2
  anneau.position.y = SOL
  plateau.add(anneau)

  // ---------- Mur (emplacements) et palette ----------
  const matParpaings = [0x9ca3af, 0xa8afb8, 0x949ba5].map((c) => materiau(c, { roughness: 0.9 }))
  const emplacements = []
  for (let r = 0; r < RANGEES; r++) {
    for (let c = 0; c < COLONNES; c++) {
      const decalage = r % 2 ? PARPAING.l / 2 : 0 // appareillage en quinconce
      emplacements.push(new THREE.Vector3(
        MUR_X + (c - (COLONNES - 1) / 2) * (PARPAING.l + JOINT) + decalage - PARPAING.l / 4,
        SOL + PARPAING.h / 2 + r * (PARPAING.h + JOINT),
        MUR_Z
      ))
    }
  }
  const palette = boite(0.95, 0.1, 0.62, materiau(0x9a6b3f, { roughness: 0.85 }))
  palette.position.set(PALETTE_X, SOL + 0.05, MUR_Z + 0.2)
  plateau.add(palette)
  // parpaings rangés sur la palette : 2 × 2 par couche, 3 couches
  const surPalette = []
  for (let i = 0; i < NB; i++) {
    const couche = Math.floor(i / 4), k = i % 4
    surPalette.push(new THREE.Vector3(
      PALETTE_X + (k % 2 ? 0.22 : -0.22),
      SOL + 0.1 + PARPAING.h / 2 + couche * (PARPAING.h + 0.004),
      MUR_Z + 0.2 + (k < 2 ? -0.12 : 0.12)
    ))
  }
  const parpaings = surPalette.map((p, i) => {
    const m = boite(PARPAING.l, PARPAING.h, PARPAING.p, matParpaings[i % 3], 0.012)
    m.position.copy(p)
    plateau.add(m)
    return m
  })

  // ---------- Robot ----------
  const blanc = materiau(0xf1f5f9, { roughness: 0.35, metalness: 0.15 })
  const lagon = materiau(0x0891b2, { roughness: 0.4 })
  const sombre = materiau(0x0f172a, { roughness: 0.3, metalness: 0.4 })
  const ambre = materiau(0xf59e0b, { roughness: 0.45 })
  const yeuxMat = materiau(0x111111, { emissive: 0x111111, emissiveIntensity: 2 })
  const voyantMat = materiau(0xf59e0b, { emissive: 0xf59e0b, emissiveIntensity: 2 })

  const robot = new THREE.Group()
  robot.position.set(PALETTE_X, SOL, ROBOT_Z)
  plateau.add(robot)

  // chenilles
  for (const x of [-0.24, 0.24]) {
    const chenille = boite(0.16, 0.18, 0.5, sombre, 0.06)
    chenille.position.set(x, 0.09, 0)
    robot.add(chenille)
  }
  const corps = new THREE.Group()
  robot.add(corps)
  const tronc = boite(0.5, 0.52, 0.44, blanc, 0.08)
  tronc.position.y = 0.5
  corps.add(tronc)
  const bande = boite(0.52, 0.07, 0.46, lagon, 0.02)
  bande.position.y = 0.34
  corps.add(bande)
  const ecran = boite(0.26, 0.14, 0.02, sombre, 0.01)
  ecran.position.set(0, 0.56, -0.225)
  corps.add(ecran)
  const logo = boite(0.16, 0.03, 0.022, yeuxMat)
  logo.position.set(0, 0.56, -0.23)
  corps.add(logo)

  // tête : visière, yeux, casque de chantier, antenne
  const tete = new THREE.Group()
  tete.position.y = 0.92
  corps.add(tete)
  const crane = boite(0.4, 0.3, 0.34, blanc, 0.09)
  tete.add(crane)
  const visiere = boite(0.32, 0.13, 0.04, sombre, 0.04)
  visiere.position.set(0, 0, -0.16)
  tete.add(visiere)
  const yeux = []
  for (const x of [-0.07, 0.07]) {
    const oeil = sphere(0.032, yeuxMat)
    oeil.position.set(x, 0.005, -0.185)
    tete.add(oeil)
    yeux.push(oeil)
  }
  const casque = sphere(0.23, ambre, { demi: true })
  casque.scale.set(1, 0.62, 1)
  casque.position.y = 0.13
  tete.add(casque)
  const visiereCasque = cylindre(0.27, 0.025, ambre, 32)
  visiereCasque.scale.set(1, 1, 1.05)
  visiereCasque.position.y = 0.13
  tete.add(visiereCasque)
  const antenne = cylindre(0.012, 0.16, sombre)
  antenne.position.set(0.1, 0.32, 0.04)
  tete.add(antenne)
  const voyant = sphere(0.028, voyantMat)
  voyant.position.set(0.1, 0.41, 0.04)
  tete.add(voyant)

  // bras (épaule → coude → pince), dans le plan avant du robot
  const epaule = new THREE.Group()
  epaule.position.set(0.31, EPAULE.y - SOL, EPAULE.z) // repère du robot, posé sur le plateau (y = SOL)
  corps.add(epaule)
  const articulation = sphere(0.07, lagon)
  epaule.add(articulation)
  const bras = boite(0.09, 0.09, L1, blanc, 0.03)
  bras.position.z = -L1 / 2
  epaule.add(bras)
  const coude = new THREE.Group()
  coude.position.z = -L1
  epaule.add(coude)
  coude.add(sphere(0.06, lagon))
  const avantBras = boite(0.08, 0.08, L2, blanc, 0.03)
  avantBras.position.z = -L2 / 2
  coude.add(avantBras)
  const pince = new THREE.Group()
  pince.position.z = -L2
  coude.add(pince)
  for (const x of [-0.05, 0.05]) {
    const doigt = boite(0.025, 0.1, 0.05, sombre)
    doigt.position.set(x, -0.05, 0)
    pince.add(doigt)
  }

  // ---------- Cinématique du bras ----------
  // point visé (repère du plateau) → angles épaule / coude ; le robot est aligné en x sur le point
  const bras2D = { angleEpaule: 0.4, angleCoude: -0.8 }
  function viser(cible) {
    const avant = (ROBOT_Z + EPAULE.z) - cible.z     // distance vers l'avant (−z)
    const haut = cible.y - EPAULE.y
    const d = Math.min(Math.max(Math.hypot(avant, haut), 0.08), L1 + L2 - 0.001)
    const a = Math.atan2(haut, avant)
    const cosE = (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2)
    const interieur = Math.acos(Math.min(1, Math.max(-1, cosE)))
    const cosS = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)
    bras2D.angleEpaule = a + Math.acos(Math.min(1, Math.max(-1, cosS)))   // coude vers le haut
    bras2D.angleCoude = -(Math.PI - interieur)
  }
  const posPince = new THREE.Vector3()
  function appliquerBras() {
    epaule.rotation.x = bras2D.angleEpaule
    coude.rotation.x = bras2D.angleCoude
  }

  // ---------- Animation ----------
  const DUREE = 2.1           // un parpaing
  const PAUSE_FIN = 1.6, DUREE_RANGEMENT = 1.4
  const CYCLE = NB * DUREE + PAUSE_FIN + DUREE_RANGEMENT
  const DECALAGE_X = 0.31     // le bras est sur le côté droit du robot
  const REPOS = (x) => new THREE.Vector3(x, 1.25, ROBOT_Z - 0.55)
  const PORT = (x) => new THREE.Vector3(x, 1.38, ROBOT_Z - 0.48)
  const prise = (i) => surPalette[i].clone().add(new THREE.Vector3(0, PARPAING.h / 2 + SOUS_PINCE - 0.02, 0))
  const pose = (i) => emplacements[i].clone().add(new THREE.Vector3(0, PARPAING.h / 2 + SOUS_PINCE - 0.02, 0))
  // le dernier parpaing de la palette est pris en premier (couche du dessus)
  const ordrePalette = (n) => NB - 1 - n

  function etat(t) {
    const tc = t % CYCLE
    const n = Math.floor(tc / DUREE) // parpaing en cours
    if (n >= NB) return { phase: 'fin', tFin: tc - NB * DUREE }
    return { phase: 'pose', n, u: (tc - n * DUREE) / DUREE }
  }

  function placer(t) {
    const e = etat(t)
    let robotX = PALETTE_X, cible

    if (e.phase === 'pose') {
      const { n, u } = e
      const iPal = ordrePalette(n)
      const xPalette = surPalette[iPal].x - DECALAGE_X
      const xMur = emplacements[n].x - DECALAGE_X
      // déjà posés / encore sur la palette
      for (let k = 0; k < NB; k++) {
        const m = parpaings[ordrePalette(k)]
        m.scale.setScalar(1)
        if (k < n) m.position.copy(emplacements[k]), m.rotation.set(0, 0, 0)
        else if (k > n) m.position.copy(surPalette[ordrePalette(k)]), m.rotation.set(0, 0, 0)
      }
      const enMain = parpaings[iPal]
      let porte = false, pose_ = false
      if (u < 0.17) { // descend vers la palette
        robotX = xPalette
        cible = lerp3(REPOS(surPalette[iPal].x), prise(iPal), ease(u / 0.17))
      } else if (u < 0.27) { // saisit et remonte
        robotX = xPalette; porte = true
        cible = lerp3(prise(iPal), PORT(surPalette[iPal].x), ease((u - 0.17) / 0.1))
      } else if (u < 0.55) { // roule jusqu'au mur
        const v = ease((u - 0.27) / 0.28)
        robotX = lerp(xPalette, xMur, v); porte = true
        cible = PORT(robotX + DECALAGE_X)
      } else if (u < 0.72) { // pose
        robotX = xMur; porte = true
        cible = lerp3(PORT(emplacements[n].x), pose(n), ease((u - 0.55) / 0.17))
      } else if (u < 0.8) { // lâche et remonte
        robotX = xMur; pose_ = true
        cible = lerp3(pose(n), REPOS(emplacements[n].x), ease((u - 0.72) / 0.08))
      } else { // retour à la palette
        const v = ease((u - 0.8) / 0.2)
        const prochaine = n + 1 < NB ? surPalette[ordrePalette(n + 1)].x - DECALAGE_X : PALETTE_X
        robotX = lerp(xMur, prochaine, v); pose_ = true
        cible = REPOS(robotX + DECALAGE_X)
      }
      robot.position.x = robotX
      viser(cible)
      appliquerBras()
      if (porte) {
        pince.getWorldPosition(posPince)
        plateau.worldToLocal(posPince)
        enMain.position.set(posPince.x, posPince.y - SOUS_PINCE + 0.02, posPince.z)
        enMain.rotation.set(0, 0, 0)
      } else if (pose_) {
        enMain.position.copy(emplacements[n])
      } else {
        enMain.position.copy(surPalette[iPal])
      }
      corps.rotation.z = Math.sin(u * Math.PI * 2) * 0.015 // léger roulis en roulant
    } else {
      // mur fini : pause (le robot « admire »), puis les parpaings retournent sur la palette
      robot.position.x = lerp(robot.position.x, PALETTE_X + 0.2, 0.05)
      viser(REPOS(robot.position.x + DECALAGE_X))
      appliquerBras()
      const r = Math.max(0, (e.tFin - PAUSE_FIN) / DUREE_RANGEMENT)
      for (let k = 0; k < NB; k++) {
        const m = parpaings[ordrePalette(k)]
        const debut = (k / NB) * 0.6
        const v = Math.min(1, Math.max(0, (r - debut) / 0.4))
        if (v === 0) { m.position.copy(emplacements[k]); m.scale.setScalar(1); continue }
        // disparaît du mur, réapparaît sur la palette
        if (v < 0.5) { m.position.copy(emplacements[k]); m.scale.setScalar(1 - ease(v * 2)) }
        else { m.position.copy(surPalette[ordrePalette(k)]); m.scale.setScalar(Math.max(0.001, ease((v - 0.5) * 2))) }
      }
      tete.rotation.y = Math.sin(e.tFin * 3) * 0.25 * Math.min(1, e.tFin) * (e.tFin < PAUSE_FIN ? 1 : 0)
    }
    if (e.phase === 'pose') tete.rotation.y = lerp(tete.rotation.y, 0, 0.1)
  }

  // ---------- Boucle ----------
  const reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const horloge = new THREE.Clock()
  let t = 0
  function image() {
    raf = requestAnimationFrame(image)
    if (enPause) return
    const dt = Math.min(horloge.getDelta(), 0.05)
    t += dt
    plateau.rotation.y = -0.55 + t * 0.16          // le plateau tourne lentement
    placer(t)
    tete.position.y = 0.92 + Math.sin(t * 2.4) * 0.008
    const clignement = (t % 3.6) < 0.12 ? 0.15 : 1
    yeux.forEach((o) => { o.scale.y = clignement })
    voyantMat.emissiveIntensity = 1 + Math.max(0, Math.sin(t * 5)) * 2.5
    renderer.render(scene, camera)
  }

  if (reduit) {
    // mur terminé, robot à côté, une seule image
    plateau.rotation.y = -0.35
    for (let k = 0; k < NB; k++) parpaings[ordrePalette(k)].position.copy(emplacements[k])
    robot.position.x = PALETTE_X + 0.2
    viser(REPOS(robot.position.x + DECALAGE_X)); appliquerBras()
    renderer.render(scene, camera)
  } else {
    image()
  }

  // ---------- Taille ----------
  observateur = new ResizeObserver(() => {
    const l = el.clientWidth, h = el.clientHeight
    if (!l || !h) return
    renderer.setSize(l, h)
    camera.aspect = l / h
    camera.updateProjectionMatrix()
    if (reduit) renderer.render(scene, camera)
  })
  observateur.observe(el)
}

const surVisibilite = () => { enPause = document.hidden }

onMounted(() => {
  try {
    construire()
  } catch (e) {
    console.warn('Scène du robot indisponible (WebGL)', e) // la page reste lisible sans elle
  }
  document.addEventListener('visibilitychange', surVisibilite)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  document.removeEventListener('visibilitychange', surVisibilite)
  observateur?.disconnect()
  nettoyages.forEach((f) => f())
  renderer?.dispose()
  renderer?.domElement.remove()
  renderer = scene = camera = null
})
</script>

<template>
  <div ref="conteneur" class="robot-chantier" role="img" aria-label="Un robot de chantier BTM monte un mur de parpaings"></div>
</template>

<style scoped>
.robot-chantier { width: 100%; height: 100%; }
.robot-chantier :deep(canvas) { display: block; }
</style>

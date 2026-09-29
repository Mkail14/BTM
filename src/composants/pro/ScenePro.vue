<script setup>
/**
 * ScenePro — maquette 3D d'un projet professionnel (Three.js), à l'échelle réelle (1 unité = 1 mètre).
 *  - Maisons : fondations, dalle, murs avec portes et fenêtres, terrasse ; dalles, murs et terrasses seuls.
 *  - Cotes exactes (longueur, largeur, hauteur) en étiquettes ; l'ouvrage sélectionné est surligné.
 *  - Mode « Orbite » : tourner, zoomer, cliquer un ouvrage pour le sélectionner.
 *  - Mode « Visite » : à hauteur d'homme (1,65 m), flèches / ZQSD pour marcher, glisser pour regarder ;
 *    les murs arrêtent le visiteur, on entre par les portes. Boutons tactiles sur téléphone.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { emprise, PORTE, FENETRE } from '@/services/calculs/projetPro.js'

const props = defineProps({
  ouvrages: { type: Array, required: true },
  selection: { type: String, default: '' },
  mode: { type: String, default: 'orbite' }, // 'orbite' | 'visite'
  fondations: Boolean // sol transparent pour voir les fondations
})
const emit = defineEmits(['selectionner'])

const conteneur = ref(null)
const indisponible = ref(false)
let renderer, etiquettes, scene, camera, orbite, frame, observer, monde, sol, grille
let obstacles = [] // boîtes (x/z) qui arrêtent le visiteur
let textures = []
const touches = new Set()
const vue = { lacet: 0, tangage: 0 } // regard du visiteur
let dernier = performance.now()

// ---------- Matériaux ----------
const M = {
  beton: new THREE.MeshStandardMaterial({ color: 0xd4d6d9, roughness: .85 }),
  fondation: new THREE.MeshStandardMaterial({ color: 0x8c8f94, roughness: .95 }),
  mur: new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: .9 }),
  murInterieur: new THREE.MeshStandardMaterial({ color: 0xfaf8f3, roughness: .95 }),
  cadre: new THREE.MeshStandardMaterial({ color: 0x0b3a4d, roughness: .5 }),
  vitre: new THREE.MeshStandardMaterial({ color: 0x9be7f5, roughness: .05, transparent: true, opacity: .35 }),
  bois: new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: .8 }),
  selection: new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: .18, depthWrite: false })
}

function texture(dessiner, rx, ry) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  dessiner(c.getContext('2d'), 128)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(rx, ry)
  t.colorSpace = THREE.SRGBColorSpace
  textures.push(t)
  return t
}
const carrelage = (rx, ry) => new THREE.MeshStandardMaterial({ roughness: .5, map: texture((g, n) => {
  g.fillStyle = '#e7ddcf'; g.fillRect(0, 0, n, n); g.strokeStyle = '#b9ab98'; g.lineWidth = 3; g.strokeRect(0, 0, n, n)
}, rx, ry) })
const lisse = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: .35, metalness: .05 })

function boite(l, h, p, materiau, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(l, .001), Math.max(h, .001), Math.max(p, .001)), materiau)
  m.position.set(x, y, z)
  m.castShadow = m.receiveShadow = true
  return m
}

const fr = (n) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
function etiquette(texte, x, y, z, classe = '') {
  const div = document.createElement('div')
  div.className = `sp-cote ${classe}`
  div.textContent = texte
  const o = new CSS2DObject(div)
  o.position.set(x, y, z)
  return o
}

/**
 * Mur le long de l'axe x (centré sur 0), avec ouvertures [{ centre, largeur, bas, haut, type }].
 * Découpé en boîtes : trumeaux pleine hauteur, allèges sous les fenêtres, linteaux au-dessus.
 */
function murOuvert(longueur, hauteur, epaisseur, ouvertures, materiau = M.mur) {
  const g = new THREE.Group()
  const tri = [...ouvertures].sort((a, b) => a.centre - b.centre)
  let debut = -longueur / 2
  for (const o of tri) {
    const g0 = Math.max(debut, o.centre - o.largeur / 2)
    const g1 = Math.min(longueur / 2, o.centre + o.largeur / 2)
    if (g0 - debut > .01) g.add(boite(g0 - debut, hauteur, epaisseur, materiau, (debut + g0) / 2, hauteur / 2, 0))
    const l = g1 - g0
    if (l > .01) {
      if (o.bas > .01) g.add(boite(l, o.bas, epaisseur, materiau, (g0 + g1) / 2, o.bas / 2, 0))
      if (hauteur - o.haut > .01) g.add(boite(l, hauteur - o.haut, epaisseur, materiau, (g0 + g1) / 2, (hauteur + o.haut) / 2, 0))
      if (o.type === 'fenetre') {
        g.add(boite(l, o.haut - o.bas, .03, M.vitre, (g0 + g1) / 2, (o.bas + o.haut) / 2, 0))
        g.add(boite(l, .05, epaisseur + .02, M.cadre, (g0 + g1) / 2, o.bas, 0))
      } else {
        g.add(boite(.05, o.haut, epaisseur + .02, M.cadre, g0, o.haut / 2, 0))
        g.add(boite(.05, o.haut, epaisseur + .02, M.cadre, g1, o.haut / 2, 0))
        // porte ouverte à 90° contre le mur intérieur : on entre librement
        const battant = boite(.04, o.haut - .05, l - .05, M.bois, g1 - .03, (o.haut - .05) / 2, -(l / 2) - epaisseur / 2)
        battant.userData.traversable = true
        g.add(battant)
      }
    }
    debut = Math.max(debut, g1)
  }
  if (longueur / 2 - debut > .01) g.add(boite(longueur / 2 - debut, hauteur, epaisseur, materiau, (debut + longueur / 2) / 2, hauteur / 2, 0))
  return g
}

/** Répartit n ouvertures régulièrement sur un mur (en évitant les angles) */
function repartir(longueur, liste) {
  const n = liste.length
  return liste.map((o, i) => ({ ...o, centre: -longueur / 2 + (longueur * (i + 1)) / (n + 1) }))
}

// ---------- Ouvrages ----------
function construireMaison(o, g) {
  const L = o.longueur, W = o.largeur, t = o.epaisseurMur, e = o.epaisseurDalle / 100, h = o.hauteur
  const D = W + (o.terrasse ? o.terrasseProfondeur : 0)
  const z0 = -D / 2
  const cz = z0 + W / 2
  // Fondations (sous le sol) : semelles sous les murs
  const fl = o.fondationLargeur, fp = o.fondationProfondeur
  g.add(boite(L + fl - t, fp, fl, M.fondation, 0, -fp / 2, z0 + t / 2))
  g.add(boite(L + fl - t, fp, fl, M.fondation, 0, -fp / 2, z0 + W - t / 2))
  g.add(boite(fl, fp, W - t, M.fondation, -L / 2 + t / 2, -fp / 2, cz))
  g.add(boite(fl, fp, W - t, M.fondation, L / 2 - t / 2, -fp / 2, cz))
  // Dalle
  g.add(boite(L, e, W, M.beton, 0, e / 2, cz))

  // Ouvertures : portes sur la façade avant, fenêtres réparties (avant, arrière, côtés)
  const portes = Array.from({ length: Math.max(0, o.portes) }, () => ({ type: 'porte', largeur: PORTE.largeur, bas: 0, haut: Math.min(PORTE.hauteur, h - .1) }))
  const fen = () => ({ type: 'fenetre', largeur: FENETRE.largeur, bas: FENETRE.allege, haut: Math.min(FENETRE.allege + FENETRE.hauteur, h - .15) })
  const parMur = { avant: [...portes], arriere: [], gauche: [], droite: [] }
  const ordre = ['arriere', 'avant', 'gauche', 'droite']
  for (let i = 0; i < Math.max(0, o.fenetres); i++) parMur[ordre[i % 4]].push(fen())
  // façade avant : porte au centre, fenêtres de part et d'autre
  const avant = repartir(L - 2 * t, [...parMur.avant.filter((x) => x.type === 'fenetre').slice(0, Math.ceil(parMur.avant.length / 2)), ...portes, ...parMur.avant.filter((x) => x.type === 'fenetre').slice(Math.ceil(parMur.avant.length / 2))])

  const base = new THREE.Group()
  base.position.y = e
  const murAvant = murOuvert(L, h, t, avant); murAvant.position.z = z0 + W - t / 2
  const murArriere = murOuvert(L, h, t, repartir(L - 2 * t, parMur.arriere)); murArriere.position.z = z0 + t / 2; murArriere.rotation.y = Math.PI
  const murGauche = murOuvert(W - 2 * t, h, t, repartir(W - 2 * t, parMur.gauche)); murGauche.position.set(-L / 2 + t / 2, 0, cz); murGauche.rotation.y = Math.PI / 2
  const murDroite = murOuvert(W - 2 * t, h, t, repartir(W - 2 * t, parMur.droite)); murDroite.position.set(L / 2 - t / 2, 0, cz); murDroite.rotation.y = -Math.PI / 2
  base.add(murAvant, murArriere, murGauche, murDroite)
  g.add(base)

  if (o.terrasse) {
    const tp = o.terrasseProfondeur
    const mat = o.terrasseFinition === 'carrelage' ? carrelage(L / .6, tp / .6) : lisse
    g.add(boite(L, .1, tp, mat, 0, .05, z0 + W + tp / 2))
    g.add(etiquette(`${fr(tp)} m`, L / 2 + .3, .2, z0 + W + tp / 2, 'petite'))
  }
  // Cotes
  g.add(etiquette(`${fr(L)} m`, 0, .15, z0 + W + (o.terrasse ? o.terrasseProfondeur : 0) + .5))
  g.add(etiquette(`${fr(W)} m`, -L / 2 - .6, .15, cz))
  g.add(etiquette(`h ${fr(h)} m`, L / 2 + .25, e + h, z0 + W, 'petite'))
  g.add(etiquette(o.nom, 0, e + h + .9, cz, 'nom'))
}

function construireDalle(o, g, finition) {
  const e = o.epaisseurDalle / 100
  const mat = finition === 'carrelage' ? carrelage(o.longueur / .6, o.largeur / .6) : finition === 'beton_lisse' ? lisse : M.beton
  g.add(boite(o.longueur, e, o.largeur, mat, 0, e / 2, 0))
  g.add(etiquette(`${fr(o.longueur)} m`, 0, .15, o.largeur / 2 + .5))
  g.add(etiquette(`${fr(o.largeur)} m`, -o.longueur / 2 - .6, .15, 0))
  g.add(etiquette(o.nom, 0, e + .8, 0, 'nom'))
}

function construireMur(o, g) {
  const m = murOuvert(o.longueur, o.hauteur, o.epaisseurMur || .2, [])
  g.add(m)
  g.add(etiquette(`${fr(o.longueur)} m`, 0, .15, (o.epaisseurMur || .2) / 2 + .5))
  g.add(etiquette(`h ${fr(o.hauteur)} m`, o.longueur / 2 + .3, o.hauteur, 0, 'petite'))
  g.add(etiquette(o.nom, 0, o.hauteur + .7, 0, 'nom'))
}

function vider(objet) {
  objet.traverse((o) => {
    if (o.geometry) o.geometry.dispose()
    if (o.material && o.material.map) o.material.dispose()
    if (o.isCSS2DObject) o.element.remove()
  })
}

function construire() {
  if (!scene) return
  if (monde) { vider(monde); scene.remove(monde) }
  textures.forEach((t) => t.dispose()); textures = []
  monde = new THREE.Group()
  obstacles = []
  const bornes = new THREE.Box3()
  for (const o of props.ouvrages) {
    const e = emprise(o)
    const g = new THREE.Group()
    g.position.set(o.x + e.longueur / 2, 0, o.z + e.largeur / 2)
    g.rotation.y = -(o.rotation % 4) * Math.PI / 2
    if (o.type === 'maison') construireMaison(o, g)
    else if (o.type === 'mur') construireMur(o, g)
    else construireDalle(o, g, o.type === 'terrasse' ? o.terrasseFinition : null)
    g.traverse((m) => { if (m.isMesh) m.userData.ouvrageId = o.id })
    if (o.id === props.selection) {
      const b = new THREE.Box3().setFromObject(g)
      const taille = b.getSize(new THREE.Vector3()), centre = b.getCenter(new THREE.Vector3())
      const halo = new THREE.Mesh(new THREE.BoxGeometry(taille.x + .3, .02, taille.z + .3), M.selection)
      halo.position.set(centre.x - g.position.x, .01, centre.z - g.position.z)
      halo.rotation.y = -g.rotation.y
      g.add(halo)
      g.traverse((el) => { if (el.isCSS2DObject) el.element.classList.add('actif') })
    }
    monde.add(g)
    g.updateMatrixWorld(true)
    // Obstacles du visiteur : éléments posés au sol (murs, allèges), pas les linteaux ni les portes ouvertes
    g.traverse((m) => {
      if (!m.isMesh || m.material === M.beton || m.material === M.fondation || m.material === M.selection || m.userData.traversable) return
      const b = new THREE.Box3().setFromObject(m)
      if (b.min.y < 1.2 && b.max.y > .3) obstacles.push(b)
    })
    bornes.expandByObject(g)
  }
  scene.add(monde)

  // Sol et quadrillage à la taille du projet
  const taille = bornes.isEmpty() ? new THREE.Vector3(20, 0, 20) : bornes.getSize(new THREE.Vector3())
  const centre = bornes.isEmpty() ? new THREE.Vector3() : bornes.getCenter(new THREE.Vector3())
  const cote = Math.max(taille.x, taille.z) + 30
  sol.scale.set(cote, cote, 1)
  sol.position.set(centre.x, 0, centre.z)
  scene.remove(grille); grille?.geometry.dispose()
  const pas = cote > 80 ? 5 : 1
  grille = new THREE.GridHelper(Math.ceil(cote / pas) * pas, Math.ceil(cote / pas), 0x7aa35a, 0x7aa35a)
  grille.material.transparent = true; grille.material.opacity = .25
  grille.position.set(Math.round(centre.x), .005, Math.round(centre.z))
  scene.add(grille)
  return { centre, taille }
}

// ---------- Caméra ----------
function cadrer() {
  const { centre, taille } = construire() || {}
  if (!centre || !orbite) return
  const d = Math.max(taille.x, taille.z, 8) * 1.25
  orbite.target.copy(centre)
  camera.position.set(centre.x + d * .7, d * .75, centre.z + d)
  orbite.update()
}

/** Visite : devant la porte de la maison sélectionnée (ou de la première), face à elle */
function entrerVisite() {
  const o = props.ouvrages.find((x) => x.id === props.selection && x.type === 'maison') || props.ouvrages.find((x) => x.type === 'maison') || props.ouvrages[0]
  if (!o) return
  const e = emprise(o)
  const centre = new THREE.Vector3(o.x + e.longueur / 2, 0, o.z + e.largeur / 2)
  const recul = (o.type === 'maison' ? o.largeur / 2 + (o.terrasse ? o.terrasseProfondeur : 0) : (o.largeur || 1) / 2) + 3
  const angle = -(o.rotation % 4) * Math.PI / 2
  const devant = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle))
  camera.position.copy(centre).addScaledVector(devant, recul).setY(1.65)
  vue.lacet = Math.atan2(devant.x, devant.z) + Math.PI
  vue.tangage = -.05
}

function bloque(x, z) {
  const r = .25
  return obstacles.some((b) => x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z)
}

function deplacer(dt) {
  const vitesse = (touches.has('shift') ? 4 : 2) * dt
  let avance = 0, lateral = 0, tourne = 0
  if (touches.has('z') || touches.has('w') || touches.has('arrowup') || touches.has('avancer')) avance += 1
  if (touches.has('s') || touches.has('arrowdown') || touches.has('reculer')) avance -= 1
  if (touches.has('q') || touches.has('a')) lateral -= 1
  if (touches.has('d')) lateral += 1
  if (touches.has('arrowleft') || touches.has('gauche')) tourne += 1
  if (touches.has('arrowright') || touches.has('droite')) tourne -= 1
  vue.lacet += tourne * 1.8 * dt
  if (avance || lateral) {
    const dx = (Math.sin(vue.lacet) * avance + Math.sin(vue.lacet - Math.PI / 2) * lateral) * vitesse
    const dz = (Math.cos(vue.lacet) * avance + Math.cos(vue.lacet - Math.PI / 2) * lateral) * vitesse
    if (!bloque(camera.position.x + dx, camera.position.z)) camera.position.x += dx
    if (!bloque(camera.position.x, camera.position.z + dz)) camera.position.z += dz
  }
  const cible = new THREE.Vector3(Math.sin(vue.lacet) * Math.cos(vue.tangage), Math.sin(vue.tangage), Math.cos(vue.lacet) * Math.cos(vue.tangage))
  camera.lookAt(camera.position.clone().add(cible))
}

// ---------- Interaction ----------
let glisse = null
function surPointeurBas(e) {
  glisse = { x: e.clientX, y: e.clientY, bouge: false }
}
function surPointeurBouge(e) {
  if (!glisse) return
  const dx = e.clientX - glisse.x, dy = e.clientY - glisse.y
  if (Math.abs(dx) + Math.abs(dy) > 4) glisse.bouge = true
  if (props.mode === 'visite') {
    vue.lacet -= dx * .005
    vue.tangage = Math.max(-1.2, Math.min(1.2, vue.tangage - dy * .004))
    glisse.x = e.clientX; glisse.y = e.clientY
  }
}
function surPointeurHaut(e) {
  if (glisse && !glisse.bouge && props.mode === 'orbite') choisir(e)
  glisse = null
}
function choisir(e) {
  const r = renderer.domElement.getBoundingClientRect()
  const souris = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
  const rayon = new THREE.Raycaster()
  rayon.setFromCamera(souris, camera)
  const touche = rayon.intersectObjects(monde?.children || [], true).find((i) => i.object.userData.ouvrageId)
  if (touche) emit('selectionner', touche.object.userData.ouvrageId)
}
const clavier = (bas) => (e) => {
  if (props.mode !== 'visite' || /input|select|textarea/i.test(e.target.tagName)) return
  const k = e.key.toLowerCase()
  if (['z', 'q', 's', 'd', 'w', 'a', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
    e.preventDefault()
    bas ? touches.add(k) : touches.delete(k)
  }
}
const toucheBas = clavier(true), toucheHaut = clavier(false)
// boutons tactiles
const appui = (nom) => touches.add(nom)
const relache = (nom) => touches.delete(nom)

// ---------- Cycle de vie ----------
function boucle(t) {
  frame = requestAnimationFrame(boucle)
  const dt = Math.min(.05, (t - dernier) / 1000)
  dernier = t
  if (props.mode === 'visite') deplacer(dt)
  else orbite.update()
  renderer.render(scene, camera)
  etiquettes.render(scene, camera)
}

function redimensionner() {
  const { clientWidth: l, clientHeight: h } = conteneur.value
  if (!l || !h) return
  renderer.setSize(l, h)
  etiquettes.setSize(l, h)
  camera.aspect = l / h
  camera.updateProjectionMatrix()
}

onMounted(() => {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true })
  } catch {
    indisponible.value = true
    return
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  conteneur.value.appendChild(renderer.domElement)
  etiquettes = new CSS2DRenderer()
  etiquettes.domElement.className = 'sp-etiquettes'
  conteneur.value.appendChild(etiquettes.domElement)

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xcfe9f5)
  scene.fog = new THREE.Fog(0xcfe9f5, 60, 220)
  camera = new THREE.PerspectiveCamera(55, 1, .1, 500)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7aa35a, .9))
  const soleil = new THREE.DirectionalLight(0xffffff, 1.6)
  soleil.position.set(30, 50, 20)
  soleil.castShadow = true
  soleil.shadow.mapSize.set(2048, 2048)
  Object.assign(soleil.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, far: 150 })
  scene.add(soleil)
  sol = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x86b56a, roughness: 1, transparent: true, opacity: 1 }))
  sol.rotation.x = -Math.PI / 2
  sol.receiveShadow = true
  scene.add(sol)

  orbite = new OrbitControls(camera, renderer.domElement)
  orbite.enableDamping = true
  orbite.maxPolarAngle = Math.PI / 2 - .05
  orbite.minDistance = 2
  orbite.maxDistance = 250

  const el = renderer.domElement
  el.addEventListener('pointerdown', surPointeurBas)
  window.addEventListener('pointermove', surPointeurBouge)
  window.addEventListener('pointerup', surPointeurHaut)
  window.addEventListener('keydown', toucheBas)
  window.addEventListener('keyup', toucheHaut)
  observer = new ResizeObserver(redimensionner)
  observer.observe(conteneur.value)
  redimensionner()
  cadrer()
  appliquerMode()
  appliquerFondations()
  frame = requestAnimationFrame(boucle)
})

function appliquerMode() {
  if (!orbite) return
  orbite.enabled = props.mode === 'orbite'
  touches.clear()
  if (props.mode === 'visite') entrerVisite()
  else cadrer()
}
function appliquerFondations() {
  if (!sol) return
  sol.material.opacity = props.fondations ? .35 : 1
  sol.material.depthWrite = !props.fondations
}

let enAttente = false
watch(() => [props.ouvrages, props.selection], () => {
  if (enAttente) return
  enAttente = true
  requestAnimationFrame(() => { enAttente = false; construire() })
}, { deep: true })
watch(() => props.ouvrages.length, () => { if (props.mode === 'orbite') requestAnimationFrame(cadrer) })
watch(() => props.mode, appliquerMode)
watch(() => props.fondations, appliquerFondations)

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  observer?.disconnect()
  window.removeEventListener('pointermove', surPointeurBouge)
  window.removeEventListener('pointerup', surPointeurHaut)
  window.removeEventListener('keydown', toucheBas)
  window.removeEventListener('keyup', toucheHaut)
  if (monde) vider(monde)
  textures.forEach((t) => t.dispose())
  orbite?.dispose()
  renderer?.dispose()
})

defineExpose({ recadrer: cadrer })
</script>

<template>
  <div ref="conteneur" class="sp" :class="{ visite: mode === 'visite' }">
    <p v-if="indisponible" class="sp-indispo"><i class="fa-solid fa-cube" aria-hidden="true"></i> La 3D n’est pas disponible sur cet appareil.</p>
    <template v-else-if="mode === 'visite'">
      <p class="sp-aide"><i class="fa-solid fa-person-walking" aria-hidden="true"></i> Flèches ou Z Q S D pour marcher · Maj pour courir · glisser pour regarder</p>
      <div class="sp-manette" aria-label="Se déplacer">
        <button type="button" aria-label="Avancer" class="av" @pointerdown="appui('avancer')" @pointerup="relache('avancer')" @pointerleave="relache('avancer')"><i class="fa-solid fa-chevron-up"></i></button>
        <button type="button" aria-label="Tourner à gauche" class="ga" @pointerdown="appui('gauche')" @pointerup="relache('gauche')" @pointerleave="relache('gauche')"><i class="fa-solid fa-rotate-left"></i></button>
        <button type="button" aria-label="Tourner à droite" class="dr" @pointerdown="appui('droite')" @pointerup="relache('droite')" @pointerleave="relache('droite')"><i class="fa-solid fa-rotate-right"></i></button>
        <button type="button" aria-label="Reculer" class="re" @pointerdown="appui('reculer')" @pointerup="relache('reculer')" @pointerleave="relache('reculer')"><i class="fa-solid fa-chevron-down"></i></button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.sp { position: relative; width: 100%; height: 100%; min-height: 320px; overflow: hidden; border-radius: inherit; background: #cfe9f5; touch-action: none; }
.sp :deep(canvas) { display: block; cursor: grab; }
.sp.visite :deep(canvas) { cursor: crosshair; }
.sp :deep(.sp-etiquettes) { position: absolute; inset: 0; pointer-events: none; }
.sp :deep(.sp-cote) {
  padding: 2px 8px; border-radius: 999px; background: rgba(15, 23, 42, .78); color: #fff; font: 600 12px/1.4 var(--font-corps);
  white-space: nowrap; font-variant-numeric: tabular-nums;
}
.sp :deep(.sp-cote.petite) { font-size: 11px; background: rgba(15, 23, 42, .6); }
.sp :deep(.sp-cote.nom) { background: #fff; color: #0f172a; box-shadow: 0 4px 12px rgba(15, 23, 42, .2); }
.sp :deep(.sp-cote.actif) { background: #0891b2; color: #fff; }
.sp.visite :deep(.sp-cote:not(.nom)) { opacity: .75; }
.sp-indispo { display: grid; place-items: center; height: 100%; margin: 0; color: #475569; }
.sp-aide { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); margin: 0; padding: 6px 14px; border-radius: 999px; background: rgba(15, 23, 42, .75); color: #fff; font-size: .8rem; white-space: nowrap; pointer-events: none; }
.sp-aide i { margin-right: 6px; }
.sp-manette { position: absolute; right: 16px; bottom: 16px; display: grid; grid-template-columns: repeat(3, 44px); grid-template-rows: repeat(2, 44px); gap: 6px; }
.sp-manette button { border: 0; border-radius: 12px; background: rgba(15, 23, 42, .72); color: #fff; font-size: 1rem; cursor: pointer; touch-action: none; }
.sp-manette button:active { background: #0891b2; }
.sp-manette .av { grid-column: 2; grid-row: 1; }
.sp-manette .ga { grid-column: 1; grid-row: 2; }
.sp-manette .re { grid-column: 2; grid-row: 2; }
.sp-manette .dr { grid-column: 3; grid-row: 2; }
@media (max-width: 640px) { .sp-aide { display: none; } }
</style>

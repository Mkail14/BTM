<script setup>
/**
 * Maquette 3D (Three.js) du projet, à l'échelle réelle (1 unité = 1 mètre).
 *  - Les dimensions saisies changent réellement la taille du modèle ; un quadrillage de 1 m (ou 5 m)
 *    et une silhouette de 1,75 m donnent l'échelle.
 *  - Murs : chaque mur ajouté se colle au bout du précédent en formant un angle droit.
 *  - Des cotes (lignes + étiquettes) affichent les mesures ; le mur en cours de saisie est surligné.
 * Glisser pour tourner ; bouton « Vue du dessus » pour lire les angles et les longueurs.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'

const props = defineProps({
  type: { type: String, required: true },
  dimensions: { type: Object, default: () => ({}) },
  murActif: { type: Number, default: -1 }, // index du mur en cours de saisie (0 = premier), -1 = aucun
  compacte: Boolean // cartes de choix : pas d'interaction ni de cotes, rendu plus léger
})

const conteneur = ref(null)
const indisponible = ref(false)
const dessus = ref(false)
const legende = ref('')
let renderer, scene, camera, modele, frame, observer
let visible = true
let glisse = null
let rotationCible = -0.55
let textures = []
let etiquettes = []
const reduireAnimations = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// ---------- Matériaux partagés ----------
const M = {
  beton: new THREE.MeshStandardMaterial({ color: 0xd4d6d9, roughness: .85 }),
  betonLisse: new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: .35, metalness: .05 }),
  dessusMur: new THREE.MeshStandardMaterial({ color: 0xc4c8ce, roughness: .9 }),
  gravier: new THREE.MeshStandardMaterial({ color: 0x8b8378, roughness: 1 }),
  acier: new THREE.MeshStandardMaterial({ color: 0xb4532a, roughness: .6, metalness: .5 }),
  terre: new THREE.MeshStandardMaterial({ color: 0x9a6b43, roughness: 1 }),
  herbe: new THREE.MeshStandardMaterial({ color: 0x6aa84f, roughness: 1 }),
  cadre: new THREE.MeshStandardMaterial({ color: 0x0b3a4d, roughness: .5 }),
  vitre: new THREE.MeshStandardMaterial({ color: 0x67e8f9, roughness: .1, transparent: true, opacity: .7 }),
  bois: new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: .8 }),
  toile: new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: .7, side: THREE.DoubleSide }),
  personne: new THREE.MeshStandardMaterial({ color: 0x475569, roughness: .8, transparent: true, opacity: .85 })
}

const nb = (v, defaut) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : defaut
}
const borner = (v, min, max) => Math.min(max, Math.max(min, v))
const fr = (n, max = 2) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: max })
const metres = (n) => `${fr(n, n < 10 ? 2 : 1)} m`

function boite(l, h, p, materiau, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(l, h, p), materiau)
  m.position.set(x, y, z)
  return m
}

function barre(longueur, rayon, axe, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rayon, rayon, longueur, 6), M.acier)
  if (axe === 'x') m.rotation.z = Math.PI / 2
  if (axe === 'z') m.rotation.x = Math.PI / 2
  m.position.set(x, y, z)
  return m
}

// ---------- Textures procédurales (parpaings, carrelage) ----------
function textureMotif(dessiner, repX, repY) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  dessiner(c.getContext('2d'), 128)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(Math.max(.05, repX), Math.max(.05, repY))
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  textures.push(t)
  return t
}
// Une tuile = 2 parpaings de long (0,80 m) × 2 rangs (0,40 m), joints décalés
const motifParpaing = (ctx, s) => {
  ctx.fillStyle = '#b9bdc4'; ctx.fillRect(0, 0, s, s)
  ctx.fillStyle = '#a4a9b1'
  ctx.fillRect(0, 0, s, s / 2); ctx.fillRect(s / 2, s / 2, s / 2, s / 2) // variation de teinte
  ctx.fillStyle = '#b9bdc4'
  ctx.fillRect(4, 4, s / 2 - 8, s / 2 - 8); ctx.fillRect(s / 2 + 4, 4, s / 2 - 8, s / 2 - 8)
  ctx.fillRect(s / 4 + 4, s / 2 + 4, s / 2 - 8, s / 2 - 8)
  ctx.strokeStyle = '#7b8088'; ctx.lineWidth = 3
  ctx.strokeRect(1.5, 1.5, s - 3, s - 3)
  ctx.beginPath(); ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2); ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s / 2); ctx.moveTo(s / 4, s / 2); ctx.lineTo(s / 4, s); ctx.moveTo(3 * s / 4, s / 2); ctx.lineTo(3 * s / 4, s); ctx.stroke()
}
const motifCarreau = (ctx, s) => {
  ctx.fillStyle = '#efe0c4'; ctx.fillRect(0, 0, s, s)
  ctx.fillStyle = '#e4d0aa'; ctx.fillRect(0, 0, s / 2, s / 2); ctx.fillRect(s / 2, s / 2, s / 2, s / 2)
  ctx.strokeStyle = '#b8a27a'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, s - 3, s - 3)
  ctx.beginPath(); ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s); ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2); ctx.stroke()
}

// ---------- Étiquettes et lignes de cote ----------
function etiquette(texte) {
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')
  ctx.font = '600 44px Inter, "Segoe UI", Arial, sans-serif'
  const w = Math.ceil(ctx.measureText(texte).width) + 44, h = 76
  c.width = w; c.height = h
  ctx.font = '600 44px Inter, "Segoe UI", Arial, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,.96)'
  ctx.strokeStyle = '#0e7490'; ctx.lineWidth = 4
  ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(3, 3, w - 6, h - 6, 22); else ctx.rect(3, 3, w - 6, h - 6)
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#0b3a4d'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(texte, w / 2, h / 2 + 2)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  textures.push(t)
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }))
  s.renderOrder = 30
  s.userData.ratio = w / h
  etiquettes.push(s)
  return s
}

const matCote = new THREE.LineBasicMaterial({ color: 0x0e7490, depthTest: false, transparent: true })
const matActif = new THREE.LineBasicMaterial({ color: 0x22d3ee, depthTest: false, transparent: true })

/** Ligne de cote entre a et b (avec repères aux extrémités) + étiquette au milieu */
function cote(annot, a, b, texte, tick) {
  const pts = [a, b, a.clone().add(tick), a.clone().sub(tick), b.clone().add(tick), b.clone().sub(tick)]
  const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), matCote)
  l.renderOrder = 29
  annot.add(l)
  const e = etiquette(texte)
  e.position.copy(a).add(b).multiplyScalar(.5)
  annot.add(e)
}

// ---------- Constructeurs (unités = mètres, sol à y = 0) ----------
function construireMur(d, struct, annot) {
  const t = .2 // épaisseur d'un mur en parpaings 20 cm
  const murs = [{ longueur: nb(d.longueur, 6), hauteur: nb(d.hauteur, 2.5), ouvertures: nb(d.ouvertures, 0) }]
  for (const m of d.autresMurs || []) {
    murs.push({
      longueur: nb(m.longueur, 4),
      hauteur: nb(m.hauteur, murs[0].hauteur),
      ouvertures: nb(m.ouvertures, 0)
    })
  }
  murs.forEach((m) => { m.longueur = borner(m.longueur, .3, 200); m.hauteur = borner(m.hauteur, .3, 20) })

  // Chemin : le 1er mur part vers +x ; chaque mur suivant tourne de 90° à gauche au bout du précédent
  const dirs = [[1, 0], [0, -1], [-1, 0], [0, 1]]
  let px = 0, pz = 0
  const n = murs.length
  murs.forEach((m, i) => {
    const [dx, dz] = dirs[i % 4]
    const a = i === 0 ? 0 : t / 2 // le coin appartient au mur précédent : pas de chevauchement
    const b = m.longueur + (i < n - 1 ? t / 2 : 0)
    const len = Math.max(.05, b - a)
    const H = m.hauteur

    const groupe = new THREE.Group()
    groupe.position.set(px + dx * (a + len / 2), 0, pz + dz * (a + len / 2))
    groupe.rotation.y = Math.atan2(-dz, dx)

    const faceLongue = new THREE.MeshStandardMaterial({ map: textureMotif(motifParpaing, len / .8, H / .4), roughness: .95 })
    const faceBout = new THREE.MeshStandardMaterial({ map: textureMotif(motifParpaing, t / .8, H / .4), roughness: .95 })
    const corps = new THREE.Mesh(new THREE.BoxGeometry(len, H, t), [faceBout, faceBout, M.dessusMur, M.dessusMur, faceLongue, faceLongue])
    corps.position.y = H / 2
    groupe.add(corps)

    // ouverture (porte / fenêtre) proportionnelle à la surface déclarée, visible des deux côtés
    if (m.ouvertures > 0) {
      let fh = Math.min(H * .7, m.ouvertures > 3 ? 2.1 : 1.2)
      const fw = Math.min(len * .7, m.ouvertures / fh)
      fh = Math.min(H * .8, m.ouvertures / fw)
      const bas = fh > 1.5 ? 0 : Math.min(.9, H - fh - .1)
      for (const s of [1, -1]) {
        groupe.add(boite(fw, fh, .04, M.vitre, 0, bas + fh / 2, s * (t / 2 + .01)))
        const e = .06
        groupe.add(boite(fw + e, e, .06, M.cadre, 0, bas, s * (t / 2 + .02)), boite(fw + e, e, .06, M.cadre, 0, bas + fh, s * (t / 2 + .02)))
        groupe.add(boite(e, fh, .06, M.cadre, -fw / 2, bas + fh / 2, s * (t / 2 + .02)), boite(e, fh, .06, M.cadre, fw / 2, bas + fh / 2, s * (t / 2 + .02)))
      }
    }

    if (props.murActif === i) {
      const contour = new THREE.LineSegments(new THREE.EdgesGeometry(corps.geometry), matActif)
      contour.position.copy(corps.position)
      contour.renderOrder = 28
      groupe.add(contour)
    }
    struct.add(groupe)

    // cote de longueur, côté extérieur (à droite du sens de marche)
    if (!props.compacte) {
      const off = t / 2 + Math.max(.45, Math.min(1.2, m.longueur * .06))
      const loc = (x, y, z) => new THREE.Vector3(x, y, z).applyEuler(new THREE.Euler(0, groupe.rotation.y, 0)).add(groupe.position)
      const tick = new THREE.Vector3(0, 0, .15).applyEuler(new THREE.Euler(0, groupe.rotation.y, 0))
      cote(annot, loc(-len / 2 - (i === 0 ? 0 : 0), .03, off), loc(len / 2, .03, off), metres(m.longueur), tick)
      if (i === 0) {
        // cote de hauteur près du départ du 1er mur
        const ox = -len / 2 - .35, oz = off
        const a2 = loc(ox, 0, oz), b2 = loc(ox, H, oz)
        cote(annot, a2, b2, metres(H), new THREE.Vector3(0, 0, 0).add(new THREE.Vector3(.12, 0, 0).applyEuler(new THREE.Euler(0, groupe.rotation.y, 0))))
      } else if (Math.abs(H - murs[0].hauteur) > .01) {
        const ox = -len / 2 - .35, oz = off
        cote(annot, loc(ox, 0, oz), loc(ox, H, oz), metres(H), new THREE.Vector3(.12, 0, 0).applyEuler(new THREE.Euler(0, groupe.rotation.y, 0)))
      }
    }
    px += dx * m.longueur; pz += dz * m.longueur
  })
  const surface = murs.reduce((s, m) => s + m.longueur * m.hauteur - m.ouvertures, 0)
  legende.value = n > 1 ? `${n} murs · ${fr(surface, 1)} m² de maçonnerie` : ''
}

function construireDalle(d, struct, annot, finition) {
  const L = borner(nb(d.longueur, 8), .5, 200)
  const l = borner(nb(d.largeur, 6), .5, 200)
  const e = borner(nb(d.epaisseur, 12), 5, 60) / 100
  const gravier = .12

  struct.add(boite(L, gravier, l, M.gravier, 0, gravier / 2, 0))
  const yTop = gravier + e

  if (finition) {
    struct.add(boite(L, e, l, M.beton, 0, gravier + e / 2, 0))
    if (finition === 'carrelage') {
      const mat = new THREE.MeshStandardMaterial({ map: textureMotif(motifCarreau, L / .6, l / .6), roughness: .45 })
      struct.add(boite(L, .025, l, mat, 0, yTop + .0125, 0))
    } else {
      struct.add(boite(L, .02, l, M.betonLisse, 0, yTop + .01, 0))
    }
    if (Math.min(L, l) >= 2.5) { // parasol pour reconnaître une terrasse
      const px = L / 2 - .9, pz = -l / 2 + .9
      struct.add(barre(2.2, .03, 'y', px, yTop + 1.1, pz))
      const toile = new THREE.Mesh(new THREE.ConeGeometry(1.2, .45, 10, 1, true), M.toile)
      toile.position.set(px, yTop + 2.3, pz)
      struct.add(toile)
    }
  } else {
    // dalle : les 3/4 coulés, le reste montre le ferraillage sur le gravier
    const coule = L * .72
    struct.add(boite(coule, e, l, M.beton, -L / 2 + coule / 2, gravier + e / 2, 0))
    const yFer = gravier + e * .45
    const reste = L - coule
    const pasZ = Math.max(.2, l / 40), pasX = Math.max(.2, reste / 20)
    for (let z = -l / 2 + pasZ / 2; z < l / 2; z += pasZ) struct.add(barre(reste + .05, .012, 'x', L / 2 - reste / 2, yFer, z))
    for (let x = -L / 2 + coule + pasX / 2; x < L / 2; x += pasX) struct.add(barre(l, .012, 'z', x, yFer + .025, 0))
  }

  if (!props.compacte) {
    const off = Math.max(.6, Math.min(1.5, Math.max(L, l) * .07))
    cote(annot, new THREE.Vector3(-L / 2, .03, l / 2 + off), new THREE.Vector3(L / 2, .03, l / 2 + off), metres(L), new THREE.Vector3(0, 0, .15))
    cote(annot, new THREE.Vector3(L / 2 + off, .03, l / 2), new THREE.Vector3(L / 2 + off, .03, -l / 2), metres(l), new THREE.Vector3(.15, 0, 0))
    cote(annot, new THREE.Vector3(L / 2 + off * .4, gravier, l / 2 + off * .4), new THREE.Vector3(L / 2 + off * .4, yTop, l / 2 + off * .4), `${fr(e * 100, 0)} cm`, new THREE.Vector3(.08, 0, 0))
  }
  legende.value = `${fr(L * l, 1)} m² · ${fr(L * l * e, 2)} m³ de béton`
}

function construireFondation(d, struct, annot) {
  const L = borner(nb(d.longueur, 12), .5, 500)
  const w = borner(nb(d.largeur, .5), .1, 5)
  const p = borner(nb(d.profondeur, .6), .1, 5)
  const cote_ = Math.max(1.2, w * 2)
  const sous = .3

  // terrain avec la tranchée creusée au centre (surface du sol à y = 0)
  struct.add(boite(cote_, p + sous, L, M.terre, -(w / 2 + cote_ / 2), -(p + sous) / 2, 0))
  struct.add(boite(cote_, p + sous, L, M.terre, w / 2 + cote_ / 2, -(p + sous) / 2, 0))
  struct.add(boite(w, sous, L, M.terre, 0, -p - sous / 2, 0))
  struct.add(boite(cote_, .03, L, M.herbe, -(w / 2 + cote_ / 2), .015, 0))
  struct.add(boite(cote_, .03, L, M.herbe, w / 2 + cote_ / 2, .015, 0))

  // béton coulé sur la première moitié de la tranchée, armatures visibles sur le reste
  const coule = L * .55
  struct.add(boite(w * .98, p, coule, M.beton, 0, -p / 2, -L / 2 + coule / 2))
  const reste = L - coule
  const zc = L / 2 - reste / 2
  const ax = w * .32, ay0 = -p + Math.min(.08, p * .2), ay1 = -Math.min(.08, p * .2)
  const rayon = Math.max(.008, Math.min(.02, w * .04))
  for (const [bx, by] of [[-ax, ay0], [ax, ay0], [-ax, ay1], [ax, ay1]]) struct.add(barre(reste + .05, rayon, 'z', bx, by, zc))
  const pas = Math.max(.22, reste / 45)
  for (let z = L / 2 - .12; z > -L / 2 + coule; z -= pas) {
    struct.add(barre(ay1 - ay0, rayon * .7, 'y', -ax, (ay0 + ay1) / 2, z), barre(ay1 - ay0, rayon * .7, 'y', ax, (ay0 + ay1) / 2, z))
    struct.add(barre(ax * 2, rayon * .7, 'x', 0, ay0, z), barre(ax * 2, rayon * .7, 'x', 0, ay1, z))
  }

  if (!props.compacte) {
    const off = Math.max(.5, Math.min(1.4, cote_ * .5))
    cote(annot, new THREE.Vector3(-(w / 2 + off), .05, -L / 2), new THREE.Vector3(-(w / 2 + off), .05, L / 2), metres(L), new THREE.Vector3(.15, 0, 0))
    cote(annot, new THREE.Vector3(-w / 2, .05, L / 2 + 1), new THREE.Vector3(w / 2, .05, L / 2 + 1), metres(w), new THREE.Vector3(0, 0, .12))
    const zp = L / 2 - Math.min(2.5, L * .25) // écarté de la cote de largeur pour éviter le chevauchement
    cote(annot, new THREE.Vector3(w / 2 + off, -p, zp), new THREE.Vector3(w / 2 + off, 0, zp), metres(p), new THREE.Vector3(.1, 0, 0))
  }
  legende.value = `${fr(L * w * p, 2)} m³ de béton armé`
}

// ---------- Scène ----------
function construire() {
  const d = props.dimensions || {}
  const struct = new THREE.Group()
  const annot = new THREE.Group()
  if (props.type === 'mur') construireMur(d, struct, annot)
  else if (props.type === 'dalle') construireDalle(d, struct, annot)
  else if (props.type === 'fondation') construireFondation(d, struct, annot)
  else construireDalle(d, struct, annot, d.finition || 'carrelage')
  return { struct, annot }
}

function personne() {
  const g = new THREE.Group()
  const torse = new THREE.Mesh(new THREE.CapsuleGeometry(.2, .5, 4, 12), M.personne)
  torse.position.y = 1.2
  torse.scale.z = .7
  const tete = new THREE.Mesh(new THREE.SphereGeometry(.115, 16, 12), M.personne)
  tete.position.y = 1.63
  g.add(torse, tete)
  for (const x of [-.09, .09]) {
    const jambe = new THREE.Mesh(new THREE.CapsuleGeometry(.075, .55, 4, 8), M.personne)
    jambe.position.set(x, .4, 0)
    g.add(jambe)
  }
  return g
}

function liberer(objet) {
  objet?.traverse((o) => {
    if (o.isMesh || o.isLineSegments) o.geometry.dispose()
    if (o.isSprite) o.material.dispose()
  })
}

function reconstruire() {
  if (!scene) return
  const rotation = modele?.rotation.y ?? rotationCible
  if (modele) { scene.remove(modele); liberer(modele) }
  textures.forEach((t) => t.dispose()); textures = []; etiquettes = []

  const { struct, annot } = construire()
  const boiteStruct = new THREE.Box3().setFromObject(struct)
  const centre = boiteStruct.getCenter(new THREE.Vector3())
  const taille = boiteStruct.getSize(new THREE.Vector3())
  let cadre = boiteStruct

  const interieur = new THREE.Group()
  interieur.add(struct)

  if (!props.compacte) {
    interieur.add(annot)
    // quadrillage d'échelle : 1 m (ou 5 m si le projet est grand)
    const pas = Math.max(taille.x, taille.z) > 30 ? 5 : 1
    const demiCote = Math.ceil((Math.max(taille.x, taille.z) + 8) / pas / 2) * 2 * pas
    const grille = new THREE.GridHelper(demiCote, demiCote / pas, 0x0e7490, 0x0e7490)
    grille.material.transparent = true
    grille.material.opacity = .2
    grille.position.set(centre.x, .008, centre.z)
    interieur.add(grille)
    grille.userData.pas = pas
    legende.value = `${legende.value ? legende.value + ' · ' : ''}grille ${pas} m`

    if (Math.max(taille.x, taille.z) <= 80) {
      const p = personne()
      p.position.set(boiteStruct.min.x - .9, 0, boiteStruct.max.z + .4)
      interieur.add(p)
      cadre = boiteStruct.clone().expandByPoint(new THREE.Vector3(p.position.x - .3, 0, p.position.z + .3)).expandByPoint(new THREE.Vector3(p.position.x, 1.8, p.position.z))
    }
  }

  modele = new THREE.Group()
  interieur.position.set(-centre.x, -(boiteStruct.min.y + boiteStruct.max.y) / 2, -centre.z)
  modele.add(interieur)
  modele.rotation.y = dessus.value ? 0 : rotation
  scene.add(modele)
  cadrer(cadre)
}

function cadrer(boiteStruct) {
  const sphere = boiteStruct.getBoundingSphere(new THREE.Sphere())
  const rayon = Math.max(.6, sphere.radius)
  const distance = rayon / Math.sin((camera.fov * Math.PI) / 360) * (props.compacte ? 1.05 : 1.4)
  if (dessus.value) camera.position.set(0, distance * 1.02, .001)
  else camera.position.set(0, distance * .5, distance * .87)
  camera.lookAt(0, 0, 0)
  // étiquettes : taille constante à l'écran, proportionnelle à l'ensemble du modèle
  const h = rayon * .115
  etiquettes.forEach((s) => s.scale.set(h * s.userData.ratio, h, 1))
}

function initialiser() {
  const el = conteneur.value
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  } catch {
    indisponible.value = true
    return
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, props.compacte ? 1.5 : 2))
  renderer.setSize(el.clientWidth, el.clientHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  el.appendChild(renderer.domElement)

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(32, el.clientWidth / el.clientHeight, .1, 1000)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9fb6c0, 1.6))
  const soleil = new THREE.DirectionalLight(0xfff4e0, 2.1)
  soleil.position.set(4, 8, 5)
  scene.add(soleil)

  reconstruire()

  const boucle = () => {
    frame = requestAnimationFrame(boucle)
    if (!visible || !modele) return
    // rotation lente uniquement sur les cartes de choix ; sur le calculateur on garde une vue stable pour lire les cotes
    if (props.compacte && !glisse && !reduireAnimations) rotationCible += .004
    const cible = dessus.value ? 0 : rotationCible
    modele.rotation.y += (cible - modele.rotation.y) * .12
    renderer.render(scene, camera)
  }
  boucle()

  observer = new IntersectionObserver(([e]) => { visible = e.isIntersecting })
  observer.observe(el)
  window.addEventListener('resize', redimensionner)
}

function redimensionner() {
  const el = conteneur.value
  if (!el || !renderer) return
  renderer.setSize(el.clientWidth, el.clientHeight)
  camera.aspect = el.clientWidth / el.clientHeight
  camera.updateProjectionMatrix()
}

function debutGlisse(e) {
  if (props.compacte || dessus.value) return
  glisse = { x: e.clientX, rotation: rotationCible }
  e.currentTarget.setPointerCapture?.(e.pointerId)
}
function pendantGlisse(e) {
  if (glisse) rotationCible = glisse.rotation + (e.clientX - glisse.x) * .012
}
function finGlisse() { glisse = null }

watch(() => [props.type, props.murActif, JSON.stringify(props.dimensions)], reconstruire)
watch(dessus, reconstruire)

onMounted(initialiser)
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  observer?.disconnect()
  window.removeEventListener('resize', redimensionner)
  liberer(scene)
  textures.forEach((t) => t.dispose())
  Object.values(M).forEach((m) => m.dispose())
  matCote.dispose(); matActif.dispose()
  renderer?.dispose()
  renderer?.forceContextLoss() // libère le contexte WebGL tout de suite (nombre limité par navigateur)
  renderer?.domElement.remove()
})
</script>

<template>
  <div
    ref="conteneur"
    class="maquette"
    :class="{ 'maquette-interactive': !compacte && !dessus }"
    role="img"
    :aria-label="`Maquette 3D à l’échelle : ${type}`"
    @pointerdown="debutGlisse"
    @pointermove="pendantGlisse"
    @pointerup="finGlisse"
    @pointercancel="finGlisse"
  >
    <i v-if="indisponible" class="fa-solid fa-cube maquette-secours" aria-hidden="true"></i>
    <template v-else-if="!compacte">
      <button type="button" class="maquette-vue" @click="dessus = !dessus" @pointerdown.stop>
        <i :class="dessus ? 'fa-solid fa-cube' : 'fa-solid fa-border-none'" aria-hidden="true"></i> {{ dessus ? 'Vue 3D' : 'Vue du dessus' }}
      </button>
      <span v-if="legende" class="maquette-legende">{{ legende }}</span>
      <span v-else class="maquette-astuce"><i class="fa-solid fa-hand-pointer" aria-hidden="true"></i> Glissez pour tourner</span>
    </template>
  </div>
</template>

<style scoped>
.maquette { position: relative; width: 100%; height: 100%; min-height: 140px; touch-action: pan-y; }
.maquette :deep(canvas) { display: block; width: 100% !important; height: 100% !important; }
.maquette-interactive { cursor: grab; }
.maquette-interactive:active { cursor: grabbing; }
.maquette-secours { position: absolute; inset: 0; display: grid; place-items: center; color: var(--lagon-300); font-size: 3rem; }
.maquette-astuce, .maquette-legende { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); max-width: calc(100% - 20px); padding: 5px 10px; border-radius: 999px; background: rgba(255,255,255,.88); color: var(--gris-600); font-size: .72rem; text-align: center; pointer-events: none; }
.maquette-astuce { white-space: nowrap; }
.maquette-vue {
  position: absolute; top: 10px; right: 10px; z-index: 2; display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 12px;
  border: 1px solid var(--lagon-200, #a5f3fc); border-radius: 999px; background: rgba(255,255,255,.92); color: var(--lagon-800, #0b3a4d);
  font: inherit; font-size: .78rem; font-weight: 600; cursor: pointer; transition: background var(--transition), border-color var(--transition);
}
.maquette-vue:hover { background: #fff; border-color: var(--lagon-500); }
</style>

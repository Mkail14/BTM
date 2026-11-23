/**
 * Moteur 3D commun aux maquettes de l'accueil (Maquette3D.vue) : un seul contexte WebGL pour les cinq.
 * Chaque maquette rend sa scène ici puis recopie l'image dans son propre canevas 2D. Le contexte, les shaders et
 * l'éclairage d'ambiance sont préparés une fois au lieu de cinq : l'accueil ne fige plus ~80 ms par maquette
 * au chargement. Libéré quand plus aucune maquette ne s'en sert (accueil quitté) : son contexte revient aux autres pages.
 */
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

let moteur = null
const taille = new THREE.Vector2()

/**
 * Prend le moteur, créé au premier appel. `leger` : ni lissage, ni ombres, ni reflets d'ambiance (appareil peu puissant).
 * `surPerte` est appelé si le navigateur coupe le contexte (mise en veille, carte graphique réinitialisée…).
 */
export function prendreMoteur(leger, surPerte) {
  if (!moteur) {
    const renderer = new THREE.WebGLRenderer({ antialias: !leger, alpha: true })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = !leger
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    let environnement = null
    if (!leger) {
      const pmrem = new THREE.PMREMGenerator(renderer)
      environnement = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
      pmrem.dispose()
    }
    moteur = { renderer, environnement, leger, abonnes: new Set() }
    renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      const abonnes = [...moteur.abonnes]
      detruire()
      abonnes.forEach((f) => f()) // chaque maquette repart d'une scène neuve, sur un nouveau moteur
    })
  }
  moteur.abonnes.add(surPerte)
  return moteur
}

/** Rend le moteur : détruit quand plus aucune maquette ne s'en sert */
export function rendreMoteur(surPerte) {
  if (!moteur) return
  moteur.abonnes.delete(surPerte)
  if (!moteur.abonnes.size) detruire()
}

function detruire() {
  moteur.environnement?.dispose()
  moteur.renderer.dispose()
  moteur.renderer.forceContextLoss() // dispose() seul garde le contexte WebGL ouvert jusqu'au ramasse-miettes
  moteur = null
}

/** Dessine `scene` vue par `camera` dans le canevas 2D `toile` (à ses dimensions en pixels) */
export function dessiner(scene, camera, toile) {
  if (!moteur || !toile.width || !toile.height) return
  const { renderer } = moteur
  const { width: l, height: h } = toile
  // canevas commun agrandi au besoin, jamais réduit : changer sa taille à chaque maquette réallouerait son image
  renderer.getSize(taille)
  if (taille.x < l || taille.y < h) renderer.setSize(Math.max(l, taille.x), Math.max(h, taille.y), false)
  renderer.getSize(taille)
  renderer.setViewport(0, 0, l, h) // coin bas gauche du canevas commun
  renderer.render(scene, camera)
  const ctx = toile.getContext('2d')
  ctx.clearRect(0, 0, l, h)
  ctx.drawImage(renderer.domElement, 0, taille.y - h, l, h, 0, 0, l, h)
}

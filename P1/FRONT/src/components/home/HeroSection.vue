<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import BaseButton from '../common/BaseButton.vue'

const modelContainer = ref(null)
let renderer = null
let scene = null
let camera = null
let model = null
let animationFrameId = null
let pointer = { x: 0, y: 0 }
let lastFrameTime = 0
let scrollOffset = 0
let currentScale = 1

function updateModelPosition(timeMs) {
  if (!model) return

  const elapsed = timeMs * 0.001
  const targetY = -0.15 + Math.sin(elapsed * 1.45) * 0.14
  const targetRotY = 0.75 + pointer.x * 0.65
  const targetRotX = -0.35 + pointer.y * 0.28

  model.position.y += (targetY - model.position.y) * 0.08
  model.rotation.x += (targetRotX - model.rotation.x) * 0.08
  model.rotation.y += (targetRotY - model.rotation.y) * 0.08

  const targetScale = 1 + scrollOffset * 0.22
  currentScale += (targetScale - currentScale) * 0.05
  model.scale.setScalar(currentScale)
}

function setup3DScene() {
  if (!modelContainer.value) return

  const container = modelContainer.value
  const width = container.clientWidth
  const height = container.clientHeight || 500

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(28, width / height, 0.1, 100)
  camera.position.set(0.9, 1.15, 5.6)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(width, height)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setClearColor(0x000000, 0)
  container.appendChild(renderer.domElement)

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.45)
  scene.add(ambientLight)

  const keyLight = new THREE.DirectionalLight(0xfff4d0, 2.2)
  keyLight.position.set(4, 3.5, 5)
  scene.add(keyLight)

  const rimLight = new THREE.DirectionalLight(0x8cc1ff, 1.25)
  rimLight.position.set(-4, 2.5, -3)
  scene.add(rimLight)

  const fillLight = new THREE.PointLight(0xf59e0b, 1.2, 18)
  fillLight.position.set(2.5, 2, 2)
  scene.add(fillLight)

  const loader = new GLTFLoader()

  loader.load(
    '/models/model1.glb',
    (gltf) => {
      const loadedModel = gltf.scene

      loadedModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = false
          child.receiveShadow = false
        }
      })

      const box = new THREE.Box3().setFromObject(loadedModel)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      const sphere = new THREE.Sphere()
      box.getBoundingSphere(sphere)

      loadedModel.position.sub(center)
      loadedModel.rotation.set(-0.35, 0.75, 0)

      const maxDimension = Math.max(size.x, size.y, size.z) || 1
      const targetScale = 2.8 / maxDimension
      loadedModel.scale.setScalar(targetScale)

      const fitDistance = sphere.radius / Math.tan((camera.fov * Math.PI / 180) / 2) * 1.55
      camera.position.set(0.9, 1.1, fitDistance)
      camera.lookAt(0, 0.1, 0)

      model = loadedModel
      scene.add(model)
    },
    undefined,
    (error) => {
      console.error('Erreur de chargement du modèle 3D :', error)
    }
  )

  const animate = (timeMs) => {
    animationFrameId = requestAnimationFrame(animate)

    if (!renderer || !scene || !camera) return

    if (!lastFrameTime) lastFrameTime = timeMs
    const delta = (timeMs - lastFrameTime) / 1000
    lastFrameTime = timeMs

    if (model) {
      updateModelPosition(timeMs)
      model.rotation.y += 0.0035 + delta * 0.2
      model.rotation.x += (-(0.35 + pointer.y * 0.35) - model.rotation.x) * 0.04
      model.rotation.z += (pointer.x * 0.18 - model.rotation.z) * 0.04
    }

    const baseDistance = camera.position.z || 5.6
    camera.position.x += ((0.9 + pointer.x * 0.5) - camera.position.x) * 0.05
    camera.position.y += ((1.1 + pointer.y * 0.35) - camera.position.y) * 0.05
    camera.position.z += ((baseDistance) - camera.position.z) * 0.05
    camera.lookAt(0, 0.15, 0)

    renderer.render(scene, camera)
  }

  animationFrameId = requestAnimationFrame(animate)
}

function handlePointerMove(event) {
  const bounds = modelContainer.value?.getBoundingClientRect()
  if (!bounds) return

  const relativeX = (event.clientX - bounds.left) / bounds.width
  const relativeY = (event.clientY - bounds.top) / bounds.height

  pointer.x = (relativeX - 0.5) * 2
  pointer.y = (relativeY - 0.5) * 2
}

function handleResize() {
  if (!modelContainer.value || !renderer || !camera) return

  const { clientWidth, clientHeight } = modelContainer.value
  renderer.setSize(clientWidth, clientHeight)
  camera.aspect = clientWidth / clientHeight
  camera.updateProjectionMatrix()
}

function handleScroll() {
  const hero = modelContainer.value?.closest('.hero')
  if (!hero) return

  const rect = hero.getBoundingClientRect()
  const offset = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / (window.innerHeight + rect.height)))
  scrollOffset = offset - 0.5
}

onMounted(() => {
  setup3DScene()
  handleScroll()
  window.addEventListener('resize', handleResize)
  window.addEventListener('scroll', handleScroll, { passive: true })
  modelContainer.value?.addEventListener('pointermove', handlePointerMove)
})

onBeforeUnmount(() => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId)
  if (renderer) {
    renderer.dispose()
    renderer.domElement.remove()
  }
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('scroll', handleScroll)
  modelContainer.value?.removeEventListener('pointermove', handlePointerMove)
})
</script>

<template>
  <section class="hero">
    <div class="container hero__inner">
      <div class="hero__grid">
        <div class="hero__copy">
          <span class="eyebrow eyebrow--dark">Calculateur BTP · Mayotte</span>
          <h1>
            Combien de matériaux pour <span class="hl">votre chantier</span> ?
          </h1>
          <p class="hero__lead">
            Mur, dalle, fondation ou terrasse : obtenez en quelques secondes une estimation claire des matériaux nécessaires à votre projet.
          </p>
          <div class="hero__cta">
            <BaseButton to="/calculateur" variant="primary">Calculer mon projet →</BaseButton>
            <BaseButton to="/fournisseurs" variant="outline-light">Voir les fournisseurs</BaseButton>
          </div>
          <ul class="hero__stats">
            <li><strong>4</strong><span>types de projets</span></li>
            <li><strong>100%</strong><span>local &amp; fiable</span></li>
            <li><strong>0€</strong><span>pour estimer</span></li>
          </ul>
        </div>

        <div class="hero__visual" ref="modelContainer" aria-label="Modèle 3D de bâtiment"></div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  overflow: hidden;
  min-height: 100vh;
  min-height: 100svh;
  display: flex;
  align-items: center;
  background-color: var(--color-black);
  background-image:
    linear-gradient(110deg, rgba(9, 17, 31, 0.82), rgba(9, 17, 31, 0.38)),
    url("../../assets/background.jpg");
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

.hero__inner {
  position: relative;
  min-height: 100vh;
  min-height: 100svh;
  display: flex;
  align-items: center;
  padding-top: calc(var(--header-h) + 72px);
  padding-bottom: 52px;
}

.hero__grid {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
  align-items: center;
  gap: clamp(20px, 4vw, 52px);
}

.hero__copy {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: 760px;
  z-index: 1;
}

.hero__visual {
  position: relative;
  width: clamp(260px, 34vw, 520px);
  height: clamp(260px, 34vw, 520px);
  aspect-ratio: 1 / 0.85;
  max-width: 520px;
  margin-left: auto;
  border-radius: 0;
  background: transparent;
  border: none;
  box-shadow: none;
  overflow: hidden;
  user-select: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.hero__visual::before {
  content: none;
}

.hero__visual :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
}

.eyebrow--dark {
  color: var(--color-yellow);
}

.eyebrow--dark::before {
  background: var(--color-yellow);
}

.hero h1 {
  color: var(--text-on-dark);
  font-size: clamp(2.6rem, 4.4vw, 4.4rem);
  max-width: 660px;
  line-height: 0.96;
  letter-spacing: -0.07em;
}

.hl {
  color: var(--color-yellow);
}

.hero__lead {
  color: var(--text-on-dark-dim);
  font-size: 1.08rem;
  max-width: 560px;
  line-height: 1.7;
}

.hero__cta {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin: 28px 0 36px;
}

.hero__stats {
  display: flex;
  gap: 28px;
  flex-wrap: wrap;
}

.hero__stats li {
  display: flex;
  flex-direction: column;
  min-width: 120px;
}

.hero__stats strong {
  font-family: var(--font-display);
  font-size: 1.7rem;
  color: var(--text-on-dark);
}

.hero__stats span {
  font-size: 0.8rem;
  color: var(--text-on-dark-dim);
  font-family: var(--font-mono);
}

@media (max-width: 980px) {
  .hero__inner {
    padding-top: calc(var(--header-h) + 92px);
  }

  .hero__grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .hero__copy {
    max-width: 100%;
  }

  .hero__visual {
    min-height: 420px;
    max-height: 500px;
  }
}

@media (max-width: 640px) {
  .hero__cta {
    width: 100%;
    flex-direction: column;
  }

  .hero__cta :deep(.btn) {
    width: 100%;
  }

  .hero__stats {
    gap: 16px 18px;
  }

  .hero__visual {
    min-height: 320px;
  }
}
</style>

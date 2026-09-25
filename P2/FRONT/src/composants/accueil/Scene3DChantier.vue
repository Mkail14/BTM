<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const sceneElement = ref(null)
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
  if (!sceneElement.value) return

  const container = sceneElement.value
  const width = container.clientWidth
  const height = container.clientHeight || 500

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(28, width / height, 0.1, 100)
  camera.position.set(0.4, 1.15, 5.6)

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
    '/model1.glb',
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

      const fitDistance = sphere.radius / Math.tan((camera.fov * Math.PI / 180) / 2) * (window.innerWidth < 640 ? 1.25 : 1.8)
      camera.position.set(0.4, 1.1, fitDistance)
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
    camera.position.x += ((0.4 + pointer.x * 0.5) - camera.position.x) * 0.05
    camera.position.y += ((1.1 + pointer.y * 0.35) - camera.position.y) * 0.05
    camera.position.z += ((baseDistance) - camera.position.z) * 0.05
    camera.lookAt(0, 0.15, 0)

    renderer.render(scene, camera)
  }

  animationFrameId = requestAnimationFrame(animate)
}

function handlePointerMove(event) {
  pointer.x = (event.clientX / window.innerWidth - 0.5) * 2
  pointer.y = (event.clientY / window.innerHeight - 0.5) * 2
}

function resetPointer() {
  pointer.x = 0
  pointer.y = 0
}

function handleResize() {
  if (!sceneElement.value || !renderer || !camera) return

  const { clientWidth, clientHeight } = sceneElement.value
  renderer.setSize(clientWidth, clientHeight)
  camera.aspect = clientWidth / clientHeight
  camera.updateProjectionMatrix()
}

function handleScroll() {
  const hero = sceneElement.value?.closest('.hero')
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
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerleave', resetPointer)
})

onBeforeUnmount(() => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId)
  if (renderer) {
    renderer.dispose()
    renderer.domElement.remove()
  }
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('scroll', handleScroll)
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerleave', resetPointer)
})
</script>

<template>
  <div ref="sceneElement" class="scene" aria-label="Maquette 3D interactive du chantier">
  </div>
</template>

<style scoped>
.scene {
  position: relative; width: 100%; max-width: 620px; aspect-ratio: 1 / .92; margin: 0 auto; overflow: hidden;
  user-select: none; display: grid; place-items: center;
}
.scene :deep(canvas) { display: block; width: 100%; height: 100%; }
@media (max-width: 640px) { .scene { max-width: 380px; } }
</style>

<script setup>
/**
 * Cadre de recadrage d'une photo : on glisse la photo pour choisir ce qui reste visible, on zoome à la molette, au
 * pincement ou avec le curseur du parent (v-model:zoom). Le cadre a le format de la carte où la photo sera affichée.
 * exporter() rend en JPEG exactement ce que montre le cadre.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const ZOOM_MAX = 3
const props = defineProps({
  src: { type: String, required: true },
  ratio: { type: Number, default: 4 / 5 }, // largeur / hauteur du cadre
  zoom: { type: Number, default: 1 }
})
const emit = defineEmits(['update:zoom', 'recadre'])

const cadre = ref(null)
const image = ref(null)
const taille = ref({ l: 0, h: 0 }) // cadre, en px
const nat = ref({ l: 0, h: 0 }) // photo, en px
const centre = ref({ x: 0.5, y: 0.5 }) // point de la photo au centre du cadre (fractions de la photo)
const glisse = ref(false)
const touche = ref(false) // l'aide « Glissez » disparaît au premier geste

// la photo couvre toujours le cadre (zoom 1), puis grossit
const echelle = computed(() => {
  const { l, h } = taille.value
  if (!l || !nat.value.l) return 0
  return Math.max(l / nat.value.l, h / nat.value.h) * props.zoom
})
// le centre reste à une demi-largeur de cadre des bords de la photo : jamais de vide dans le cadre
function borner(c) {
  const s = echelle.value
  if (!s) return c
  const mx = taille.value.l / 2 / (nat.value.l * s), my = taille.value.h / 2 / (nat.value.h * s)
  return { x: Math.min(1 - mx, Math.max(mx, c.x)), y: Math.min(1 - my, Math.max(my, c.y)) }
}
watch(echelle, () => { centre.value = borner(centre.value) })
watch(() => props.src, () => { centre.value = { x: 0.5, y: 0.5 }; touche.value = false; emit('update:zoom', 1) })

const style = computed(() => {
  const s = echelle.value
  if (!s) return { opacity: 0 }
  const dl = nat.value.l * s, dh = nat.value.h * s
  return { width: `${dl}px`, height: `${dh}px`, transform: `translate3d(${taille.value.l / 2 - centre.value.x * dl}px, ${taille.value.h / 2 - centre.value.y * dh}px, 0)` }
})

function charge(e) { nat.value = { l: e.target.naturalWidth, h: e.target.naturalHeight } }
function deplacer(dx, dy) {
  const s = echelle.value
  if (!s) return
  centre.value = borner({ x: centre.value.x - dx / (nat.value.l * s), y: centre.value.y - dy / (nat.value.h * s) })
  touche.value = true
  emit('recadre')
}
function zoomer(z) {
  emit('update:zoom', Math.min(ZOOM_MAX, Math.max(1, z)))
  touche.value = true
  emit('recadre')
}

// glisser (souris, doigt) et pincer (deux doigts)
const pointeurs = new Map()
let ecart = 0
const distance = () => {
  if (pointeurs.size < 2) return 0
  const [a, b] = [...pointeurs.values()]
  return Math.hypot(a.x - b.x, a.y - b.y)
}
function poser(e) {
  cadre.value.setPointerCapture?.(e.pointerId)
  pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY })
  ecart = distance()
  glisse.value = true
}
function bouger(e) {
  const avant = pointeurs.get(e.pointerId)
  if (!avant) return
  const apres = { x: e.clientX, y: e.clientY }
  pointeurs.set(e.pointerId, apres)
  if (pointeurs.size > 1) {
    const d = distance()
    if (ecart) zoomer(props.zoom * (d / ecart))
    ecart = d
  } else deplacer(apres.x - avant.x, apres.y - avant.y)
}
function lever(e) {
  pointeurs.delete(e.pointerId)
  ecart = distance()
  glisse.value = pointeurs.size > 0
}
function molette(e) { zoomer(props.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)) }
function clavier(e) {
  const pas = 12
  const actions = {
    ArrowLeft: () => deplacer(pas, 0), ArrowRight: () => deplacer(-pas, 0), ArrowUp: () => deplacer(0, pas), ArrowDown: () => deplacer(0, -pas),
    '+': () => zoomer(props.zoom + 0.1), '=': () => zoomer(props.zoom + 0.1), '-': () => zoomer(props.zoom - 0.1)
  }
  if (!actions[e.key]) return
  e.preventDefault()
  actions[e.key]()
}

let observateur = null
onMounted(() => {
  observateur = new ResizeObserver(([entree]) => {
    taille.value = { l: entree.contentRect.width, h: entree.contentRect.height }
    centre.value = borner(centre.value)
  })
  observateur.observe(cadre.value)
})
onBeforeUnmount(() => observateur?.disconnect())

/** La partie visible dans le cadre, en JPEG (sans agrandir au-delà de la photo d'origine) */
async function exporter({ largeur = 1200, qualite = 0.92 } = {}) {
  const s = echelle.value
  if (!image.value || !s) throw new Error('La photo n’est pas encore chargée.')
  const sl = taille.value.l / s, sh = taille.value.h / s
  const sx = centre.value.x * nat.value.l - sl / 2, sy = centre.value.y * nat.value.h - sh / 2
  const toile = document.createElement('canvas')
  toile.width = Math.round(Math.min(largeur, sl))
  toile.height = Math.round(toile.width / props.ratio)
  toile.getContext('2d').drawImage(image.value, sx, sy, sl, sh, 0, 0, toile.width, toile.height)
  const blob = await new Promise((r) => { try { toile.toBlob(r, 'image/jpeg', qualite) } catch { r(null) } }) // photo d'un autre site : toile illisible
  if (!blob) throw new Error('Impossible de recadrer cette photo : choisissez-la à nouveau depuis votre appareil.')
  return blob
}
defineExpose({ exporter })
</script>

<template>
  <div
    ref="cadre" class="rp" :class="{ glisse }" :style="{ aspectRatio: ratio }" tabindex="0"
    aria-label="Recadrer la photo : glissez-la, ou utilisez les flèches et les touches + et −"
    @pointerdown.prevent="poser" @pointermove="bouger" @pointerup="lever" @pointercancel="lever" @wheel.prevent="molette" @keydown="clavier"
  >
    <img ref="image" :src="src" alt="" crossorigin="anonymous" draggable="false" :style="style" @load="charge" />
    <span v-if="!touche" class="rp-aide" aria-hidden="true"><i class="fa-solid fa-up-down-left-right"></i><span>Glissez pour recadrer</span></span>
  </div>
</template>

<style scoped>
.rp {
  position: relative; overflow: hidden; border-radius: var(--rayon-lg); background: var(--gris-100); container-type: inline-size;
  cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none;
}
.rp.glisse { cursor: grabbing; }
.rp:focus-visible { outline: 3px solid var(--lagon-400); outline-offset: 2px; }
.rp img { position: absolute; top: 0; left: 0; max-width: none; transform-origin: 0 0; pointer-events: none; }
/* grille des tiers pendant le geste */
.rp::after {
  content: ''; position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity .2s;
  background:
    linear-gradient(90deg, transparent calc(33.33% - .5px), rgba(255, 255, 255, .55) calc(33.33% - .5px) calc(33.33% + .5px), transparent calc(33.33% + .5px) calc(66.66% - .5px), rgba(255, 255, 255, .55) calc(66.66% - .5px) calc(66.66% + .5px), transparent calc(66.66% + .5px)),
    linear-gradient(180deg, transparent calc(33.33% - .5px), rgba(255, 255, 255, .55) calc(33.33% - .5px) calc(33.33% + .5px), transparent calc(33.33% + .5px) calc(66.66% - .5px), rgba(255, 255, 255, .55) calc(66.66% - .5px) calc(66.66% + .5px), transparent calc(66.66% + .5px));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .5);
}
.rp.glisse::after { opacity: 1; }
.rp-aide {
  position: absolute; left: 50%; bottom: 10px; display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px;
  background: rgba(6, 32, 44, .72); color: #fff; font-size: .78rem; font-weight: 600; white-space: nowrap; pointer-events: none;
  transform: translateX(-50%); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
}
@container (max-width: 180px) { .rp-aide span { display: none; } } /* petit cadre : l'icône seule */
</style>

<script setup>
/**
 * AdminPanneau — panneau latéral (formulaires, détails). Échap ou clic sur le fond pour fermer.
 * Slots : défaut (contenu défilant), `pied` (actions collées en bas).
 */
import { onBeforeUnmount, onMounted, ref, nextTick } from 'vue'

const props = defineProps({ titre: { type: String, required: true }, sousTitre: { type: String, default: '' }, large: Boolean })
const emit = defineEmits(['fermer'])
const panneau = ref(null)
const idTitre = `panneau-${Math.random().toString(36).slice(2, 8)}`

const surTouche = (e) => { if (e.key === 'Escape') emit('fermer') }
onMounted(async () => {
  document.addEventListener('keydown', surTouche)
  document.body.style.overflow = 'hidden'
  await nextTick()
  panneau.value?.querySelector('input, select, textarea, button:not(.panneau-fermer)')?.focus()
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', surTouche)
  document.body.style.overflow = ''
})
</script>

<template>
  <div class="panneau-fond" @click.self="emit('fermer')">
    <aside ref="panneau" class="panneau adm" :class="{ large: props.large }" role="dialog" aria-modal="true" :aria-labelledby="idTitre">
      <header class="panneau-tete">
        <div>
          <h2 :id="idTitre">{{ titre }}</h2>
          <p v-if="sousTitre">{{ sousTitre }}</p>
        </div>
        <button type="button" class="adm-icone-btn adm-icone-btn-bord panneau-fermer" aria-label="Fermer" @click="emit('fermer')"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <div class="panneau-corps"><slot /></div>
      <footer v-if="$slots.pied" class="panneau-pied"><slot name="pied" /></footer>
    </aside>
  </div>
</template>

<style scoped>
.panneau-fond { position: fixed; inset: 0; z-index: 300; display: flex; justify-content: flex-end; padding: 12px; background: rgba(15, 23, 42, .32); backdrop-filter: blur(3px); animation: fond .2s ease; }
.panneau {
  width: min(520px, 100%); height: 100%; display: flex; flex-direction: column; overflow: hidden;
  background: var(--adm-carte); border-radius: 24px; box-shadow: 0 30px 80px rgba(15, 23, 42, .25); animation: entree .28s cubic-bezier(.22, .61, .36, 1);
}
.panneau.large { width: min(680px, 100%); }
.panneau-tete { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 24px 24px 18px; border-bottom: 1px solid var(--adm-ligne-2); }
.panneau-tete h2 { margin: 0; font-family: var(--font-corps); font-size: 1.2rem; font-weight: 700; letter-spacing: 0; }
.panneau-tete p { margin: 4px 0 0; color: var(--adm-muet); font-size: .86rem; }
.panneau-corps { flex: 1; overflow-y: auto; padding: 22px 24px; }
.panneau-pied { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; padding: 16px 24px; border-top: 1px solid var(--adm-ligne-2); background: var(--adm-survol); }
@media (max-width: 640px) {
  .panneau-fond { padding: 0; align-items: flex-end; }
  .panneau, .panneau.large { width: 100%; height: 92dvh; border-radius: 24px 24px 0 0; animation-name: monter; }
}
@keyframes fond { from { opacity: 0; } }
@keyframes entree { from { transform: translateX(40px); opacity: 0; } }
@keyframes monter { from { transform: translateY(40px); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .panneau, .panneau-fond { animation: none; } }
</style>

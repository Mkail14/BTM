<script setup>
/**
 * BandeauAnnonce — message court piloté depuis /admin (section « annonce » de contenus_site).
 * Pastille flottante en bas à gauche ; fermée par le visiteur, elle ne revient qu'avec un nouveau texte.
 */
import { computed, ref } from 'vue'
import { useContenuSite } from '@/composables/useContenuSite.js'

const contenu = useContenuSite()
const annonce = computed(() => contenu.annonce)
const CLE = 'btm-annonce-fermee'

const lireFermee = () => { try { return sessionStorage.getItem(CLE) } catch { return null } }
const fermee = ref(lireFermee())
const visible = computed(() => annonce.value.actif && annonce.value.texte?.trim() && fermee.value !== annonce.value.texte)
const lienInterne = computed(() => annonce.value.lien?.startsWith('/'))
const icones = { info: 'fa-solid fa-circle-info', succes: 'fa-solid fa-circle-check', avertissement: 'fa-solid fa-triangle-exclamation' }

function fermer() {
  fermee.value = annonce.value.texte
  try { sessionStorage.setItem(CLE, annonce.value.texte) } catch { /* stockage indisponible : fermé pour cette page seulement */ }
}
</script>

<template>
  <transition name="glisser-bas">
    <aside v-if="visible" class="annonce" :class="`annonce-${annonce.type}`" role="status">
      <i :class="icones[annonce.type] || icones.info" aria-hidden="true"></i>
      <p>
        {{ annonce.texte }}
        <template v-if="annonce.lien">
          <router-link v-if="lienInterne" :to="annonce.lien">{{ annonce.libelleLien || 'En savoir plus' }}</router-link>
          <a v-else :href="annonce.lien" target="_blank" rel="noopener noreferrer">{{ annonce.libelleLien || 'En savoir plus' }}</a>
        </template>
      </p>
      <button type="button" aria-label="Fermer l’annonce" @click="fermer"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
    </aside>
  </transition>
</template>

<style scoped>
.annonce {
  position: fixed; left: 24px; bottom: 24px; z-index: 170; display: flex; align-items: center; gap: 12px;
  max-width: min(520px, calc(100vw - 110px)); padding: 12px 10px 12px 16px; border-radius: 16px;
  background: rgba(15, 23, 42, .92); color: #fff; box-shadow: 0 18px 40px rgba(6, 32, 44, .28);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); font-size: .9rem; line-height: 1.45;
}
.annonce > i { flex: none; font-size: 1rem; }
.annonce-info > i { color: var(--lagon-300); }
.annonce-succes > i { color: #6ee7b7; }
.annonce-avertissement > i { color: var(--ylang); }
.annonce p { margin: 0; }
.annonce a { margin-left: 6px; font-weight: 600; color: #fff; text-decoration: underline; text-underline-offset: 3px; }
.annonce button { flex: none; width: 32px; height: 32px; display: grid; place-items: center; border: 0; border-radius: 10px; background: transparent; color: rgba(255, 255, 255, .6); }
.annonce button:hover { background: rgba(255, 255, 255, .1); color: #fff; }
@media (max-width: 639px) { .annonce { left: 12px; bottom: 12px; max-width: calc(100vw - 88px); font-size: .85rem; } }

.glisser-bas-enter-active, .glisser-bas-leave-active { transition: opacity .3s ease, transform .3s ease; }
.glisser-bas-enter-from, .glisser-bas-leave-to { opacity: 0; transform: translateY(12px); }
</style>

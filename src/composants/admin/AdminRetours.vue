<script setup>
/** AdminRetours — notifications (toasts) et fenêtre de confirmation partagées par toute l'administration */
import { nextTick, ref, watch } from 'vue'
import { useAdmin } from '@/composables/useAdmin.js'

const { notifications, confirmation, repondre } = useAdmin()
const boutonAnnuler = ref(null)
const icones = { succes: 'fa-solid fa-circle-check', erreur: 'fa-solid fa-circle-exclamation', info: 'fa-solid fa-circle-info' }

// focus sur « Annuler » : une validation accidentelle au clavier ne supprime rien
watch(confirmation, async (c) => { if (c) { await nextTick(); boutonAnnuler.value?.focus() } })
</script>

<template>
  <div class="toasts" aria-live="polite">
    <transition-group name="toast">
      <div v-for="n in notifications" :key="n.id" class="toast" :class="`toast-${n.type}`" :role="n.type === 'erreur' ? 'alert' : 'status'">
        <i :class="icones[n.type]" aria-hidden="true"></i>
        <span>{{ n.texte }}</span>
      </div>
    </transition-group>
  </div>

  <transition name="fondu">
    <div v-if="confirmation" class="confirm-fond" @click.self="repondre(false)" @keydown.esc="repondre(false)">
      <div class="confirm adm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-titre" aria-describedby="confirm-texte">
        <span class="confirm-icone" :class="{ danger: confirmation.danger }"><i :class="confirmation.danger ? 'fa-solid fa-trash-can' : 'fa-solid fa-circle-question'" aria-hidden="true"></i></span>
        <h2 id="confirm-titre">{{ confirmation.titre }}</h2>
        <p id="confirm-texte">{{ confirmation.texte }}</p>
        <div class="confirm-actions">
          <button ref="boutonAnnuler" type="button" class="adm-btn adm-btn-clair" @click="repondre(false)">Annuler</button>
          <button type="button" class="adm-btn" :class="confirmation.danger ? 'adm-btn-danger' : 'adm-btn-noir'" @click="repondre(true)">{{ confirmation.libelle }}</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.toasts { position: fixed; right: 20px; bottom: 20px; z-index: 400; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; pointer-events: none; }
.toast {
  display: flex; align-items: center; gap: 10px; max-width: min(420px, calc(100vw - 40px)); padding: 12px 18px; border-radius: 14px;
  background: var(--ardoise); color: #fff; font-size: .9rem; font-weight: 500; box-shadow: 0 14px 34px rgba(15, 23, 42, .25); pointer-events: auto;
}
.toast-succes i { color: #6ee7b7; }
.toast-erreur { background: #9f1239; }
.toast-info i { color: var(--lagon-300); }
.toast-enter-active, .toast-leave-active { transition: opacity .25s ease, transform .25s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(10px); }

.confirm-fond { position: fixed; inset: 0; z-index: 350; display: grid; place-items: center; padding: 16px; background: rgba(15, 23, 42, .4); backdrop-filter: blur(3px); }
.confirm { width: min(420px, 100%); padding: 28px; border-radius: 24px; background: #fff; text-align: center; box-shadow: 0 30px 80px rgba(15, 23, 42, .3); }
.confirm-icone { width: 52px; height: 52px; margin: 0 auto 16px; display: grid; place-items: center; border-radius: 50%; background: var(--adm-ligne-2); color: var(--adm-encre); font-size: 1.2rem; }
.confirm-icone.danger { background: #fff1f2; color: var(--adm-baisse); }
.confirm h2 { margin: 0 0 8px; font-family: var(--font-corps); font-size: 1.15rem; font-weight: 700; letter-spacing: 0; word-break: break-word; }
.confirm p { margin: 0; color: var(--adm-encre-2); font-size: .92rem; line-height: 1.55; }
.confirm-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 24px; }
</style>

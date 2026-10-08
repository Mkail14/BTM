<script setup>
/**
 * Bouton d’aide : choix entre la discussion « Sur le site » (Awa, puis un conseiller BTM), WhatsApp et l’e-mail.
 * Une pastille rouge signale une réponse du conseiller arrivée pendant que la discussion était fermée.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useContenuSite } from '@/composables/useContenuSite.js'
import { conversationGardee, lireConversation } from '@/services/supabase/serviceSupport.js'
import AssistanceChat from './AssistanceChat.vue'

const contenu = useContenuSite()

const ouverte = ref(false)
const chatOuvert = ref(false)
// WhatsApp exige le format international sans « + » ni espaces : 0639 94 11 01 → 262639941101
const INDICATIFS_262 = ['0262', '0263', '0269', '0639', '0692', '0693'] // Mayotte et La Réunion ; sinon France (33)
function numeroInternational(saisi) {
  const chiffres = String(saisi || '').replace(/\D/g, '').replace(/^00/, '')
  if (chiffres.length === 10 && chiffres.startsWith('0')) return (INDICATIFS_262.includes(chiffres.slice(0, 4)) ? '262' : '33') + chiffres.slice(1)
  return chiffres
}
const numeroWhatsApp = computed(() => numeroInternational(contenu.contact.whatsapp))
const messageWhatsApp = encodeURIComponent('Bonjour, j’ai besoin d’aide avec BTM.')

function ouvrir() { ouverte.value = true }
function fermer() { ouverte.value = false }
function ouvrirAssistant() {
  ouverte.value = false
  chatOuvert.value = true
  reponseNonVue.value = false
}

// ---------- Réponse du conseiller pendant que la discussion est fermée ----------
const CLE_VU = 'btm:assistance-vu'
const reponseNonVue = ref(false)
const lireVu = () => { try { return Number(localStorage.getItem(CLE_VU)) || 0 } catch { return 0 } }
function marquerVu(id) { try { localStorage.setItem(CLE_VU, String(id)) } catch { /* stockage bloqué */ } }
let minuterie = null
async function verifierReponse() {
  if (chatOuvert.value || document.hidden || !conversationGardee()) return
  try {
    const r = await lireConversation(lireVu())
    if (!r || !['attente', 'humain'].includes(r.statut)) return
    reponseNonVue.value = r.messages.some((m) => m.auteur === 'conseiller')
  } catch { /* nouvel essai au prochain tour */ }
}

function gererClavier(event) {
  if (event.key === 'Escape') fermer()
}
watch(ouverte, (valeur) => { document.body.style.overflow = valeur ? 'hidden' : '' })
onMounted(() => {
  window.addEventListener('keydown', gererClavier)
  verifierReponse()
  minuterie = setInterval(verifierReponse, 30000)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', gererClavier)
  clearInterval(minuterie)
  document.body.style.overflow = ''
})
</script>

<template>
  <button v-if="!chatOuvert" class="aide-bouton" type="button" :aria-label="reponseNonVue ? 'Ouvrir l’aide : un conseiller vous a répondu' : 'Ouvrir l’aide'" @click="reponseNonVue ? ouvrirAssistant() : ouvrir()">
    <i class="fa-solid fa-headset" aria-hidden="true"></i>
    <span v-if="reponseNonVue" class="aide-pastille" aria-hidden="true"></span>
  </button>

  <transition name="aide-fondu">
    <div v-if="ouverte" class="aide-overlay" @click.self="fermer">
      <button class="aide-fermer" type="button" aria-label="Fermer l’aide" @click="fermer">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>

      <section class="aide-dialogue" role="dialog" aria-modal="true" aria-label="Aide BTM">
        <div class="aide-pages">
          <article class="aide-page aide-page-assistant">
            <div class="aide-page-entete">
              <span class="aide-page-icone"><i class="fa-solid fa-comments" aria-hidden="true"></i></span>
              <div>
                <p class="aide-page-label">Page 01</p>
                <h3>Discuter avec l’assistance</h3>
              </div>
            </div>
            <p class="aide-page-description">Awa, l’assistante BTM, vous répond tout de suite. Si votre demande la dépasse, un conseiller BTM prend le relais dans la même discussion.</p>
            <div class="aide-page-actions">
              <button class="aide-action aide-action-site" type="button" @click="ouvrirAssistant">
                <i class="fa-solid fa-message" aria-hidden="true"></i>
                <strong>Sur le site</strong>
              </button>
              <a
                class="aide-action aide-action-whatsapp"
                :href="`https://wa.me/${numeroWhatsApp}?text=${messageWhatsApp}`"
                target="_blank"
                rel="noopener noreferrer"
                @click="fermer"
              >
                <i class="fa-brands fa-whatsapp" aria-hidden="true"></i>
                <strong>Sur WhatsApp</strong>
              </a>
            </div>
          </article>

          <a class="aide-page aide-page-email" :href="`mailto:${contenu.contact.email}?subject=${encodeURIComponent('Aide BTM')}`" @click="fermer">
            <div class="aide-page-entete">
              <span class="aide-page-icone"><i class="fa-regular fa-envelope" aria-hidden="true"></i></span>
              <div>
                <p class="aide-page-label">Page 02</p>
                <h3>Nous écrire par e-mail</h3>
              </div>
            </div>
            <p class="aide-page-description">Pour une demande détaillée, envoyez-nous un e-mail. Notre équipe vous répondra dès que possible.</p>
            <span class="aide-page-lien">Écrire à {{ contenu.contact.email }} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span>
          </a>
        </div>
      </section>
    </div>
  </transition>

  <AssistanceChat v-if="chatOuvert" @fermer="chatOuvert = false" @reponse-vue="marquerVu" />
</template>

<style scoped>
.aide-bouton {
  position: fixed; right: 28px; bottom: 24px; z-index: 180; width: 54px; height: 54px;
  display: grid; place-items: center; border: 1px solid rgba(255,255,255,.28); border-radius: 50%;
  background: var(--lagon-600); color: #fff; box-shadow: 0 10px 26px rgba(0,0,0,.28);
  font-size: 1.25rem; cursor: pointer; transition: transform .2s, background .2s, box-shadow .2s;
}
.aide-pastille { position: absolute; top: 2px; right: 2px; width: 14px; height: 14px; border: 2px solid #fff; border-radius: 50%; background: #ef4444; }
.aide-bouton:hover, .aide-bouton:focus-visible { transform: translateY(-3px); background: var(--lagon-500); box-shadow: 0 14px 30px rgba(0,0,0,.34); }
.aide-overlay {
  position: fixed; inset: 0; z-index: 260; display: grid; place-items: center; padding: 24px;
  background: rgba(6, 32, 44, .62); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); overflow-y: auto;
}
.aide-dialogue {
  position: relative;
  width: min(100%, 1040px);
  padding: 20px 0;
  margin-top: 26px;
  animation: aide-apparaitre .28s ease both;
}
.aide-fermer {
  position: fixed;
  top: 20px;
  right: 22px;
  z-index: 2;
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255,255,255,.45);
  border-radius: 50%;
  background: rgba(255,255,255,.96);
  color: var(--ardoise);
  cursor: pointer;
  box-shadow: 0 12px 28px rgba(0,0,0,.18);
  transition: background .2s, transform .2s;
}
.aide-fermer:hover { background: #fff; transform: rotate(90deg); }
.aide-entete { display: flex; align-items: center; gap: 16px; padding-right: 42px; }
.aide-icone { width: 52px; height: 52px; display: grid; place-items: center; flex: 0 0 auto; border: 1px solid rgba(255,255,255,.25); border-radius: 14px; background: rgba(103,232,249,.16); color: var(--lagon-300); font-size: 1.35rem; }
.aide-surtitre { color: var(--lagon-300); font-size: .76rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
.aide-dialogue h2 { margin-top: 4px; color: #fff; font-size: clamp(1.55rem, 3vw, 2.15rem); }
.aide-intro { margin: 20px 0 26px; color: rgba(255,255,255,.78); }
.aide-pages {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: stretch;
  gap: 18px;
}
.aide-page {
  display: flex;
  flex-direction: column;
  min-height: 250px;
  padding: 26px;
  border: 1px solid var(--gris-200);
  border-radius: var(--rayon);
  color: var(--ardoise);
  text-decoration: none;
  transition: transform .2s, border-color .2s, box-shadow .2s;
}
.aide-page:hover { transform: translateY(-3px); border-color: var(--lagon-400); box-shadow: var(--ombre); }
.aide-page-assistant { background: linear-gradient(145deg, #f8feff, #effbfc); }
.aide-page-email { background: var(--gris-50); }
.aide-page-entete { display: flex; align-items: center; gap: 14px; }
.aide-page-icone { width: 48px; height: 48px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 12px; background: var(--lagon-100); color: var(--lagon-700); font-size: 1.35rem; }
.aide-page-email .aide-page-icone { background: #e2e8f0; color: var(--ardoise-2); }
.aide-page-label { color: var(--lagon-700); font-size: .7rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
.aide-page h3 { margin-top: 3px; color: var(--ardoise); font-size: 1.45rem; }
.aide-page-description { margin: 22px 0; color: var(--texte-secondaire); line-height: 1.55; }
.aide-page-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: auto; }
.aide-action { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; min-width: 0; padding: 14px 12px; border: 1px solid var(--gris-200); border-radius: var(--rayon-sm); background: #fff; color: var(--ardoise); text-align: left; cursor: pointer; transition: border-color .2s, background .2s; }
.aide-action:hover { border-color: var(--lagon-500); background: var(--lagon-50); }
.aide-action > i { color: var(--lagon-700); font-size: 1.15rem; }
.aide-action-whatsapp > i { color: #16a34a; }
.aide-action strong { font-size: .92rem; }
.aide-page-lien { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: auto; padding-top: 16px; color: var(--lagon-700); font-size: .88rem; font-weight: 700; }
.aide-fondu-enter-active, .aide-fondu-leave-active { transition: opacity .2s ease; }
.aide-fondu-enter-from, .aide-fondu-leave-to { opacity: 0; }
@keyframes aide-apparaitre { from { opacity: 0; transform: translateY(10px) scale(.98); } to { opacity: 1; transform: none; } }
@media (max-width: 900px) {
  .aide-pages { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .aide-bouton { right: 18px; bottom: 18px; }
  .aide-overlay { padding: 14px; }
  .aide-dialogue { padding: 14px 0; }
  .aide-page { min-height: 0; padding: 20px; }
  .aide-page-actions { grid-template-columns: 1fr; }
}
@media (max-width: 400px) {
  .aide-bouton { right: 12px; bottom: 12px; width: 46px; height: 46px; font-size: .95rem; }
}
</style>

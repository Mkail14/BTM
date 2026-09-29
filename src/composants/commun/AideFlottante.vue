<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useContenuSite } from '@/composables/useContenuSite.js'

const contenu = useContenuSite()

const ouverte = ref(false)
const chatOuvert = ref(false)
const chatMinimise = ref(false)
const vueActive = ref('choix')
const nouveauMessage = ref('')
const messages = ref([
  { auteur: 'assistant', texte: 'Bonjour, je suis l’assistant BTM. Que souhaitez-vous préparer aujourd’hui ?' }
])
const numeroWhatsApp = computed(() => String(contenu.contact.whatsapp || '').replace(/\D/g, ''))
const messageWhatsApp = encodeURIComponent('Bonjour, j’ai besoin d’aide avec BTM.')

function ouvrir() {
  ouverte.value = true
  chatOuvert.value = false
  chatMinimise.value = false
}

function fermer() {
  ouverte.value = false
  chatOuvert.value = false
  vueActive.value = 'choix'
  nouveauMessage.value = ''
}

function ouvrirAssistant() {
  ouverte.value = false
  chatOuvert.value = true
  chatMinimise.value = false
}

function reduireChat() {
  chatMinimise.value = !chatMinimise.value
}

function repondre(message) {
  const texte = message.toLowerCase()
  if (texte.includes('calcul') || texte.includes('prix') || texte.includes('budget')) {
    return 'Vous pouvez commencer par le calculateur BTM pour obtenir le devis d’un mur, une dalle, une fondation ou une terrasse.'
  }
  if (texte.includes('fournisseur') || texte.includes('matériau')) {
    return 'L’annuaire des fournisseurs vous permet de comparer les contacts et les matériaux disponibles à Mayotte.'
  }
  if (texte.includes('projet') || texte.includes('sauvegard')) {
    return 'Connectez-vous pour enregistrer vos devis et retrouver vos projets dans votre tableau de bord.'
  }
  return 'Je peux vous guider vers le calculateur, les fournisseurs ou la sauvegarde de vos projets. Que souhaitez-vous consulter ?'
}

function envoyerMessage() {
  const texte = nouveauMessage.value.trim()
  if (!texte) return
  messages.value.push({ auteur: 'utilisateur', texte })
  nouveauMessage.value = ''
  window.setTimeout(() => messages.value.push({ auteur: 'assistant', texte: repondre(texte) }), 300)
}

function gererClavier(event) {
  if (event.key === 'Escape') fermer()
}

watch(ouverte, (valeur) => {
  document.body.style.overflow = valeur ? 'hidden' : ''
})

onMounted(() => window.addEventListener('keydown', gererClavier))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', gererClavier)
  document.body.style.overflow = ''
})
</script>

<template>
  <button v-if="!chatOuvert" class="aide-bouton" type="button" aria-label="Ouvrir l’aide" @click="ouvrir">
    <i class="fa-solid fa-headset" aria-hidden="true"></i>
  </button>

  <transition name="aide-fondu">
    <div v-if="ouverte" class="aide-overlay" @click.self="fermer">
      <button class="aide-fermer" type="button" aria-label="Fermer l’aide" @click="fermer">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>

      <section class="aide-dialogue" role="dialog" aria-modal="true" aria-label="Aide BTM">

        <div v-if="vueActive === 'choix'" class="aide-pages">
          <article class="aide-page aide-page-assistant">
            <div class="aide-page-entete">
              <span class="aide-page-icone"><i class="fa-solid fa-comments" aria-hidden="true"></i></span>
              <div>
                <p class="aide-page-label">Page 01</p>
                <h3>Discuter avec l’assistant</h3>
              </div>
            </div>
            <p class="aide-page-description">Une question ? L’assistant BTM vous répond tout de suite.</p>
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

          <a class="aide-page aide-page-email" :href="`mailto:${contenu.contact.email}?subject=Aide BTM`" @click="fermer">
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

        <div v-else class="aide-chat">
          <header class="aide-chat-barre">
            <button class="aide-retour" type="button" @click="vueActive = 'choix'">
              <i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Retour
            </button>
            <div class="aide-chat-identite">
              <span class="aide-page-icone"><i class="fa-solid fa-message" aria-hidden="true"></i></span>
              <div>
                <p class="aide-page-label">Assistant BTM</p>
                <h3>Discussion sur le site</h3>
              </div>
            </div>
            <span class="aide-chat-statut"><i class="fa-solid fa-circle" aria-hidden="true"></i> En ligne</span>
          </header>
          <div class="aide-chat-introduction">
            <strong>Bonjour, comment puis-je vous aider ?</strong>
            <span>Vous pouvez parler de votre devis, des matériaux, des fournisseurs ou de vos projets.</span>
          </div>
          <div class="aide-messages" aria-live="polite">
            <p v-for="(message, index) in messages" :key="index" class="aide-message" :class="`aide-message-${message.auteur}`">
              {{ message.texte }}
            </p>
          </div>
          <form class="aide-chat-form" @submit.prevent="envoyerMessage">
            <label class="visually-hidden" for="aide-message">Votre message</label>
            <input id="aide-message" v-model="nouveauMessage" type="text" placeholder="Écrivez votre question..." autocomplete="off" />
            <button class="btn btn-primaire" type="submit" aria-label="Envoyer le message">
              <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
            </button>
          </form>
        </div>
      </section>
    </div>
  </transition>

  <aside v-if="chatOuvert" class="aide-widget" :class="{ 'aide-widget-minimise': chatMinimise }" aria-label="Discussion avec l’assistant BTM">
    <header class="aide-widget-barre">
      <div class="aide-widget-titre">
        <span class="aide-widget-avatar">BTM</span>
        <span>Assistant BTM</span>
      </div>
      <div class="aide-widget-actions">
        <button type="button" aria-label="Réduire la discussion" @click="reduireChat">
          <i class="fa-solid fa-minus" aria-hidden="true"></i>
        </button>
        <button type="button" aria-label="Fermer la discussion" @click="fermer">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>
    </header>

    <template v-if="!chatMinimise">
      <div class="aide-widget-presence">
        <span class="aide-widget-avatars" aria-hidden="true"><i>BTM</i><i>IA</i><i>+</i></span>
        <span>Assistant disponible maintenant</span>
      </div>
      <div class="aide-widget-messages" aria-live="polite">
        <p v-for="(message, index) in messages" :key="index" class="aide-widget-message" :class="`aide-widget-message-${message.auteur}`">
          {{ message.texte }}
        </p>
      </div>
      <form class="aide-widget-form" @submit.prevent="envoyerMessage">
        <label class="visually-hidden" for="aide-widget-message">Votre message</label>
        <input id="aide-widget-message" v-model="nouveauMessage" type="text" placeholder="Envoyer un message..." autocomplete="off" />
        <button type="submit" aria-label="Envoyer le message"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i></button>
      </form>
    </template>
  </aside>
</template>

<style scoped>
.aide-bouton {
  position: fixed; right: 28px; bottom: 24px; z-index: 180; width: 54px; height: 54px;
  display: grid; place-items: center; border: 1px solid rgba(255,255,255,.28); border-radius: 50%;
  background: var(--lagon-600); color: #fff; box-shadow: 0 10px 26px rgba(0,0,0,.28);
  font-size: 1.25rem; cursor: pointer; transition: transform .2s, background .2s, box-shadow .2s;
}
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
.aide-chat { display: flex; flex-direction: column; min-height: 390px; }
.aide-chat { min-height: min(720px, calc(100dvh - 96px)); padding: 28px 34px 30px; border: 1px solid var(--gris-200); border-radius: var(--rayon-lg); background: #fff; box-shadow: var(--ombre-lg); }
.aide-retour { align-self: flex-start; padding: 9px 12px; border: 1px solid var(--gris-200); border-radius: var(--rayon-sm); background: var(--gris-50); color: var(--lagon-700); font-size: .88rem; font-weight: 700; cursor: pointer; transition: background .2s, border-color .2s; }
.aide-retour:hover { border-color: var(--lagon-400); background: var(--lagon-50); }
.aide-chat-barre { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 20px; padding-bottom: 22px; border-bottom: 1px solid var(--gris-200); }
.aide-chat-identite { display: flex; align-items: center; justify-content: center; gap: 14px; }
.aide-chat h3 { margin-top: 3px; color: var(--ardoise); font-size: 1.45rem; }
.aide-chat-statut { justify-self: end; color: var(--succes); font-size: .84rem; font-weight: 600; }
.aide-chat-statut i { margin-right: 5px; font-size: .55rem; }
.aide-chat-introduction { display: flex; flex-direction: column; gap: 5px; margin: 24px 0 0; color: var(--texte-secondaire); }
.aide-chat-introduction strong { color: var(--ardoise); font-size: 1.05rem; }
.aide-messages { display: flex; flex: 1; flex-direction: column; gap: 12px; min-height: 260px; margin: 18px 0; padding: 20px; border: 1px solid var(--gris-200); border-radius: var(--rayon); background: var(--gris-50); overflow-y: auto; }
.aide-message { max-width: 82%; margin: 0; padding: 11px 14px; border-radius: 12px; line-height: 1.45; font-size: .92rem; }
.aide-message-assistant { align-self: flex-start; background: #fff; color: var(--ardoise-2); border: 1px solid var(--gris-200); }
.aide-message-utilisateur { align-self: flex-end; background: var(--lagon-700); color: #fff; }
.aide-chat-form { display: flex; gap: 10px; }
.aide-chat-form input { min-width: 0; flex: 1; padding: 12px 14px; border: 1.5px solid var(--gris-300); border-radius: var(--rayon-sm); color: var(--texte); font: inherit; }
.aide-chat-form input:focus { outline: none; border-color: var(--lagon-500); box-shadow: 0 0 0 4px rgba(6, 182, 212, .16); }
.aide-chat-form .btn { width: 46px; padding: 0; }
.aide-widget {
  position: fixed; right: 24px; bottom: 24px; z-index: 220; width: min(360px, calc(100vw - 32px));
  overflow: hidden; border: 1px solid rgba(15, 23, 42, .12); border-radius: 8px 8px 0 0;
  background: #fff; box-shadow: 0 18px 42px rgba(0,0,0,.28); animation: aide-widget-apparaitre .24s ease both;
}
.aide-widget-minimise { width: min(300px, calc(100vw - 32px)); border-radius: 8px; }
.aide-widget-barre { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 14px; background: var(--lagon-500); color: #fff; }
.aide-widget-titre { display: flex; align-items: center; gap: 9px; font-size: .92rem; font-weight: 700; }
.aide-widget-avatar { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 50%; background: #fff; color: var(--lagon-700); font-size: .62rem; font-weight: 800; }
.aide-widget-actions { display: flex; gap: 4px; }
.aide-widget-actions button { width: 28px; height: 28px; border: 0; border-radius: 4px; background: transparent; color: #fff; cursor: pointer; }
.aide-widget-actions button:hover { background: rgba(255,255,255,.18); }
.aide-widget-presence { display: flex; align-items: center; gap: 9px; padding: 10px 14px; border-bottom: 1px solid var(--gris-200); color: var(--gris-600); font-size: .75rem; }
.aide-widget-avatars { display: flex; align-items: center; }
.aide-widget-avatars i { width: 25px; height: 25px; display: grid; place-items: center; margin-left: -4px; border: 2px solid #fff; border-radius: 50%; background: var(--lagon-100); color: var(--lagon-700); font-size: .48rem; font-style: normal; font-weight: 800; }
.aide-widget-avatars i:first-child { margin-left: 0; background: var(--ardoise); color: #fff; }
.aide-widget-avatars i:last-child { background: var(--gris-200); color: var(--gris-600); }
.aide-widget-messages { display: flex; flex-direction: column; gap: 10px; height: 330px; padding: 14px; overflow-y: auto; background: #fff; }
.aide-widget-message { max-width: 86%; margin: 0; padding: 10px 12px; border-radius: 4px; font-size: .8rem; line-height: 1.45; }
.aide-widget-message-assistant { align-self: flex-start; background: #eef0fb; color: var(--ardoise-2); }
.aide-widget-message-utilisateur { align-self: flex-end; background: var(--lagon-600); color: #fff; }
.aide-widget-form { display: flex; align-items: center; gap: 8px; padding: 9px 10px; border-top: 1px solid var(--gris-200); background: #fff; }
.aide-widget-form input { min-width: 0; flex: 1; border: 0; outline: 0; color: var(--texte); font: .8rem var(--font-corps); }
.aide-widget-form button { width: 30px; height: 30px; border: 0; border-radius: 50%; background: var(--lagon-600); color: #fff; cursor: pointer; }
@keyframes aide-widget-apparaitre { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
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
  .aide-chat { min-height: calc(100dvh - 56px); padding: 22px 18px; }
  .aide-chat-barre { grid-template-columns: auto 1fr; gap: 12px; }
  .aide-chat-identite { justify-content: flex-start; }
  .aide-chat-statut { grid-column: 2; justify-self: start; margin-top: -8px; }
  .aide-widget { right: 16px; bottom: 16px; width: calc(100vw - 32px); }
}
@media (max-width: 400px) {
  .aide-bouton { right: 12px; bottom: 12px; width: 46px; height: 46px; font-size: .95rem; }
}
</style>

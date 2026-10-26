<script setup>
/**
 * Bouton d’aide : choix entre la discussion « Sur le site » (Awa, puis un conseiller BTM), WhatsApp et l’e-mail.
 * Une pastille rouge signale une réponse du conseiller arrivée pendant que la discussion était fermée.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useContenuSite } from '@/composables/useContenuSite.js'
import { surChangementCompte } from '@/composables/useAuth.js'
import { conversationGardee, lireConversation, changerCompteSupport } from '@/services/supabase/serviceSupport.js'
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
  if (!conversationGardee()) reponseNonVue.value = false
  if (chatOuvert.value || document.hidden || !conversationGardee()) return
  try {
    const r = await lireConversation(lireVu())
    if (!r || !['attente', 'humain'].includes(r.statut)) return
    reponseNonVue.value = r.messages.some((m) => m.auteur === 'conseiller')
  } catch { /* nouvel essai au prochain tour */ }
}

// ---------- Discussion liée au compte ----------
// Déconnexion ou autre compte : la discussion ouverte repart de zéro (clé) ; connexion : elle reprend celle du compte.
const chat = ref(null)
const cleChat = ref(0)
const arreterSuiviCompte = surChangementCompte(async (nouveau, ancien) => {
  await changerCompteSupport(nouveau)
  if (ancien) cleChat.value++
  else chat.value?.reprendre()
  verifierReponse()
})

// ---------- Bouton déplaçable ----------
// On le glisse où il ne gêne pas : au lâcher il se range contre le bord le plus proche (gauche ou droite),
// à la hauteur choisie. La position est gardée sur l'appareil. Un simple toucher l'ouvre toujours.
const CLE_POSITION = 'btm:aide-position'
const bouton = ref(null)
const cote = ref('droite')
const hauteur = ref(0) // px au-dessus de la position d'origine
const glisse = ref(false)
const decalage = ref({ x: 0, y: 0 })
let depart = null
let vientDeGlisser = false
const hauteurMax = () => Math.max(0, window.innerHeight - 220) // reste sous l'en-tête
try {
  const p = JSON.parse(localStorage.getItem(CLE_POSITION) || 'null')
  if (p) { cote.value = p.cote === 'gauche' ? 'gauche' : 'droite'; hauteur.value = Math.min(Math.max(Number(p.hauteur) || 0, 0), hauteurMax()) }
} catch { /* stockage bloqué : position d'origine */ }
const styleBouton = computed(() => ({
  '--aide-hauteur': `${hauteur.value}px`,
  transform: glisse.value ? `translate(${decalage.value.x}px, ${decalage.value.y}px) scale(1.08)` : undefined
}))
function debutGlisser(e) {
  if (e.button > 0) return
  depart = { x: e.clientX, y: e.clientY }
  bouton.value?.setPointerCapture?.(e.pointerId)
}
function pendantGlisser(e) {
  if (!depart) return
  const x = e.clientX - depart.x, y = e.clientY - depart.y
  if (!glisse.value && Math.hypot(x, y) < 8) return // en dessous : c'est un toucher, pas un glisser
  glisse.value = true
  decalage.value = { x, y }
}
function finGlisser(e) {
  if (!depart) return
  depart = null
  if (!glisse.value) return
  const r = bouton.value.getBoundingClientRect()
  cote.value = r.left + r.width / 2 < window.innerWidth / 2 ? 'gauche' : 'droite'
  hauteur.value = Math.round(Math.min(Math.max(hauteur.value - decalage.value.y, 0), hauteurMax()))
  glisse.value = false
  decalage.value = { x: 0, y: 0 }
  vientDeGlisser = true // le clic qui suit le lâcher ne doit pas ouvrir l'aide
  setTimeout(() => { vientDeGlisser = false }, 0)
  try { localStorage.setItem(CLE_POSITION, JSON.stringify({ cote: cote.value, hauteur: hauteur.value })) } catch { /* stockage bloqué */ }
}
function surClicBouton() {
  if (vientDeGlisser) return
  if (reponseNonVue.value) ouvrirAssistant()
  else ouvrir()
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
  arreterSuiviCompte()
  document.body.style.overflow = ''
})
</script>

<template>
  <button
    v-if="!chatOuvert" ref="bouton" class="aide-bouton" :class="{ 'aide-gauche': cote === 'gauche', 'aide-glisse': glisse }" :style="styleBouton" type="button"
    :aria-label="reponseNonVue ? 'Ouvrir l’aide : un conseiller vous a répondu' : 'Ouvrir l’aide'" title="Glissez pour déplacer"
    @pointerdown="debutGlisser" @pointermove="pendantGlisser" @pointerup="finGlisser" @pointercancel="finGlisser" @click="surClicBouton"
  >
    <i class="fa-solid fa-headset" aria-hidden="true"></i>
    <span v-if="reponseNonVue" class="aide-pastille" aria-hidden="true"></span>
  </button>

  <transition name="aide-fondu">
    <div v-if="ouverte" class="aide-overlay" @click.self="fermer">
      <button class="aide-fermer" type="button" aria-label="Fermer l’aide" @click="fermer">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>

      <!-- Téléphone : feuille qui monte du bas, les trois moyens de contact en liste -->
      <section class="aide-feuille" role="dialog" aria-modal="true" aria-labelledby="aide-feuille-titre">
        <span class="aide-feuille-poignee" aria-hidden="true"></span>
        <h2 id="aide-feuille-titre">Besoin d’aide ?</h2>
        <p>Awa, l’assistante BTM, répond tout de suite. Un conseiller prend le relais si besoin.</p>
        <div class="aide-feuille-liste">
          <button type="button" class="aide-feuille-ligne" @click="ouvrirAssistant">
            <span class="aide-feuille-icone"><i class="fa-solid fa-comments" aria-hidden="true"></i></span>
            <span><strong>Discuter avec Awa</strong><small>Réponse immédiate, sur le site</small></span>
            <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
          </button>
          <a class="aide-feuille-ligne" :href="`https://wa.me/${numeroWhatsApp}?text=${messageWhatsApp}`" target="_blank" rel="noopener noreferrer" @click="fermer">
            <span class="aide-feuille-icone aide-feuille-whatsapp"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i></span>
            <span><strong>WhatsApp</strong><small>Écrire à l’équipe BTM</small></span>
            <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
          </a>
          <a class="aide-feuille-ligne" :href="`mailto:${contenu.contact.email}?subject=${encodeURIComponent('Aide BTM')}`" @click="fermer">
            <span class="aide-feuille-icone aide-feuille-email"><i class="fa-regular fa-envelope" aria-hidden="true"></i></span>
            <span><strong>E-mail</strong><small>{{ contenu.contact.email }}</small></span>
            <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
          </a>
        </div>
        <button type="button" class="aide-feuille-fermer" @click="fermer">Fermer</button>
      </section>

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

  <AssistanceChat v-if="chatOuvert" ref="chat" :key="cleChat" @fermer="chatOuvert = false" @reponse-vue="marquerVu" />
</template>

<style scoped>
.aide-bouton {
  /* --decalage-aide : hauteur d'une barre d'actions collée en bas de l'écran (style.css), que le bouton ne doit pas cacher */
  /* --aide-hauteur : hauteur choisie en glissant le bouton */
  --aide-marge: 28px; --aide-bas: 24px;
  position: fixed; right: var(--aide-marge); bottom: calc(var(--aide-bas) + var(--aide-hauteur, 0px) + var(--decalage-aide, 0px) + var(--barre-onglets, 0px));
  z-index: 180; width: 54px; height: 54px;
  display: grid; place-items: center; border: 1px solid rgba(255,255,255,.28); border-radius: 50%;
  background: var(--lagon-600); color: var(--sur-primaire); box-shadow: 0 10px 26px rgba(0,0,0,.28);
  font-size: 1.25rem; cursor: pointer; transition: transform .2s, background .2s, box-shadow .2s;
  touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
}
.aide-gauche { right: auto; left: var(--aide-marge); }
.aide-glisse, .aide-glisse:hover { transition: none; cursor: grabbing; box-shadow: 0 18px 40px rgba(0,0,0,.4); }
.aide-pastille { position: absolute; top: 2px; right: 2px; width: 14px; height: 14px; border: 2px solid #fff; border-radius: 50%; background: #ef4444; }
.aide-bouton:hover, .aide-bouton:focus-visible { transform: translateY(-3px); background: var(--lagon-500); box-shadow: 0 14px 30px rgba(0,0,0,.34); }
.aide-overlay {
  position: fixed; inset: 0; z-index: 260; display: grid; place-items: center; padding: 24px;
  background: rgba(17, 17, 17, .62); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); overflow-y: auto;
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
  color: var(--encre); /* pastille blanche, croix toujours foncée (thèmes clair et sombre) */
  cursor: pointer;
  box-shadow: 0 12px 28px rgba(0,0,0,.18);
  transition: background .2s, transform .2s;
}
.aide-fermer:hover { background: #fff; transform: rotate(90deg); }
.aide-entete { display: flex; align-items: center; gap: 16px; padding-right: 42px; }
.aide-icone { width: 52px; height: 52px; display: grid; place-items: center; flex: 0 0 auto; border: 1px solid rgba(255,255,255,.25); border-radius: 14px; background: rgba(244, 233, 219,.16); color: var(--lagon-300); font-size: 1.35rem; }
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
}
.aide-page-assistant { background: linear-gradient(145deg, color-mix(in srgb, var(--lagon-50) 40%, var(--carte)), var(--lagon-50)); }
.aide-page-email { background: var(--gris-50); }
.aide-page-entete { display: flex; align-items: center; gap: 14px; }
.aide-page-icone { width: 48px; height: 48px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 12px; background: var(--lagon-100); color: var(--lagon-700); font-size: 1.35rem; }
.aide-page-email .aide-page-icone { background: var(--gris-200); color: var(--ardoise-2); }
.aide-page-label { color: var(--lagon-700); font-size: .7rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
.aide-page h3 { margin-top: 3px; color: var(--ardoise); font-size: 1.45rem; }
.aide-page-description { margin: 22px 0; color: var(--texte-secondaire); line-height: 1.55; }
.aide-page-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: auto; }
.aide-action { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; min-width: 0; padding: 14px 12px; border: 1px solid var(--gris-200); border-radius: var(--rayon-sm); background: var(--carte); color: var(--ardoise); text-align: left; cursor: pointer; transition: border-color .2s, background .2s; }
.aide-action:hover { background: var(--lagon-50); } /* survol discret : pas de contour bleu ni de carte qui se soulève */
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
  .aide-bouton { --aide-marge: 18px; --aide-bas: 18px; }
  .aide-overlay { padding: 14px; }
  .aide-dialogue { padding: 14px 0; }
  .aide-page { min-height: 0; padding: 20px; }
  .aide-page-actions { grid-template-columns: 1fr; }
}
@media (max-width: 400px) {
  .aide-bouton { --aide-marge: 12px; --aide-bas: 12px; width: 46px; height: 46px; font-size: .95rem; }
}

/* ---------- Téléphone : feuille du bas à la place des deux grandes cartes ---------- */
.aide-feuille { display: none; }
@media (max-width: 639px) {
  .aide-overlay { display: flex; align-items: flex-end; padding: 0; overflow: hidden; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); background: rgba(17, 17, 17, .5); }
  .aide-dialogue, .aide-fermer { display: none; }
  .aide-feuille {
    display: flex; flex-direction: column; align-items: center; width: 100%; max-height: 92dvh; overflow-y: auto;
    padding: 10px 20px calc(16px + env(safe-area-inset-bottom)); border-radius: 26px 26px 0 0; background: var(--carte); text-align: center;
    animation: aide-monte .28s cubic-bezier(.22, .61, .36, 1);
  }
  .aide-feuille-poignee { width: 38px; height: 5px; margin-bottom: 18px; border-radius: 999px; background: var(--gris-200); }
  .aide-feuille h2 { margin: 0; color: var(--ardoise); font-size: 1.45rem; }
  .aide-feuille > p { max-width: 340px; margin: 6px 0 18px; color: var(--texte-secondaire); font-size: .92rem; line-height: 1.5; }
  .aide-feuille-liste { width: 100%; overflow: hidden; border: 1px solid var(--gris-200); border-radius: 18px; text-align: left; }
  .aide-feuille-ligne {
    display: flex; align-items: center; gap: 14px; width: 100%; min-height: 66px; padding: 10px 16px;
    border: 0; background: var(--carte); color: var(--ardoise); font: inherit; text-decoration: none; cursor: pointer; -webkit-tap-highlight-color: transparent;
  }
  .aide-feuille-ligne + .aide-feuille-ligne { border-top: 1px solid var(--gris-100); }
  .aide-feuille-ligne:active { background: var(--gris-50); }
  .aide-feuille-ligne > span:nth-child(2) { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; }
  .aide-feuille-ligne strong { font-size: .98rem; }
  .aide-feuille-ligne small { overflow: hidden; color: var(--gris-500); font-size: .8rem; white-space: nowrap; text-overflow: ellipsis; }
  .aide-feuille-ligne > i { flex: none; color: var(--gris-400); font-size: .8rem; }
  .aide-feuille-icone { width: 40px; height: 40px; flex: none; display: grid; place-items: center; border-radius: 12px; background: var(--lagon-100); color: var(--lagon-700); font-size: 1.05rem; }
  .aide-feuille-whatsapp { background: var(--succes-pastille); color: #16a34a; font-size: 1.25rem; }
  .aide-feuille-email { background: var(--gris-100); color: var(--ardoise); }
  .aide-feuille-fermer { width: 100%; min-height: 48px; margin-top: 10px; border: 0; border-radius: 999px; background: none; color: var(--gris-600); font: 600 .95rem var(--font-corps); cursor: pointer; }
  .aide-feuille-fermer:active { background: var(--gris-100); }
}
@keyframes aide-monte { from { transform: translateY(100%); } }
@media (prefers-reduced-motion: reduce) { .aide-feuille { animation: none; } }
</style>

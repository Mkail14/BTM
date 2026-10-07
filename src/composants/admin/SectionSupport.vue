<script setup>
/**
 * Support (espace admin) : les discussions « Sur le site ». Le conseiller voit ce qu'Awa a déjà répondu,
 * le parcours suivi dans les questions guidées, répond en direct (le client voit la réponse dans sa fenêtre de discussion),
 * puis clôture ou rend la main à l'assistante. Nouvelles demandes : pastille, e-mail sur contact@btm.yt et,
 * si autorisée, notification du navigateur.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAdmin } from '@/composables/useAdmin.js'
import { useSupport } from '@/composables/useSupport.js'
import {
  listerConversations, lireMessagesSupport, repondreSupport, changerStatutSupport, presenceSupport,
  canalSupport, emetteurEcriture, recepteurEcriture
} from '@/services/supabase/serviceSupport.js'

const route = useRoute()
const router = useRouter()
const { notifier } = useAdmin()
const { rafraichirDemandes, notificationsNavigateur, activerNotifications } = useSupport()

const FILTRES = [
  { id: 'a-traiter', label: 'À traiter' },
  { id: 'en-cours', label: 'En cours' },
  { id: 'assistante', label: 'Avec Awa' },
  { id: 'fermees', label: 'Clôturées' }
]
const STATUTS = {
  attente: { label: 'Attend un conseiller', classe: 'adm-badge-attention' },
  humain: { label: 'Conseiller en ligne', classe: 'adm-badge-info' },
  ia: { label: 'Avec Awa (IA)', classe: 'adm-badge-violet' },
  fermee: { label: 'Clôturée', classe: '' }
}
const AUTEURS = { client: 'Client', ia: 'Awa · IA', conseiller: 'Vous (conseiller)', systeme: '' }

const filtre = ref('a-traiter')
const conversations = ref([])
const chargement = ref(false)
const erreur = ref('')
const active = ref(null) // conversation ouverte
const messages = ref([])
const reponse = ref('')
const envoi = ref(false)
const fil = ref(null)
let minuterieListe = null
let minuterieFil = null

const dernierId = computed(() => messages.value.at(-1)?.id || 0)
const qui = (c) => c?.nom || c?.email || 'Visiteur'
// Awa hors service : une discussion vient de vous être passée faute de crédits IA (fonction « assistant », RAISON_CREDITS)
const awaHorsService = computed(() => conversations.value.some((c) =>
  c.raison?.startsWith('Plus de crédits IA') && Date.now() - new Date(c.mis_a_jour_le).getTime() < 3 * 3600_000))

// ---------- Accusés de lecture et « écrit… » ----------
// Instantanés par le canal temps réel de la discussion ; le « vu » est aussi enregistré en base (migration 0021),
// relu à chaque relève : le conseiller retrouve l'état même si un signal s'est perdu.
const clientVu = ref(0) // dernier message vu par le client (ne recule jamais)
const clientEcrit = ref(false) // le client tape en ce moment
const dernierConseillerId = computed(() => [...messages.value].reverse().find((m) => m.auteur === 'conseiller')?.id)
const vuParClient = computed(() => !!dernierConseillerId.value && clientVu.value >= dernierConseillerId.value)
let canal = null
const recevoirEcriture = recepteurEcriture(clientEcrit)
const ecriture = emetteurEcriture((oui) => canal?.ecrit(oui))
let vuSignale = 0

function surSignal(s) {
  if (s.type === 'ecrit') recevoirEcriture(!!s.ecrit)
  else if (s.type === 'vu') clientVu.value = Math.max(clientVu.value, Number(s.id) || 0)
  else if (s.type === 'message') { recevoirEcriture(false); suivreFil() }
}
// un canal par discussion ouverte
watch(() => (active.value?.id && active.value?.jeton ? `${active.value.id}|${active.value.jeton}` : ''), (cle) => {
  ecriture.arret()
  canal?.fermer()
  canal = null
  recevoirEcriture(false)
  clientVu.value = 0
  vuSignale = 0
  if (cle) { canal = canalSupport(active.value.id, active.value.jeton, 'conseiller', surSignal); signalerVu() }
})

/** Le conseiller a la discussion sous les yeux : le client voit « Vu » tout de suite */
function signalerVu() {
  if (!canal || document.hidden || dernierId.value <= vuSignale) return
  vuSignale = dernierId.value
  canal.vu(vuSignale)
}
/** Enregistre en base ce que le conseiller a vu, et relit ce que le client a vu */
async function presence() {
  const id = active.value?.id
  if (!id) return
  try {
    const r = await presenceSupport(id, document.hidden ? null : dernierId.value)
    if (active.value?.id === id) clientVu.value = Math.max(clientVu.value, r?.vu_client_id || 0)
  } catch { /* base sans la migration 0021, ou réseau : nouvel essai au prochain tour */ }
}
const auRetour = () => { if (!document.hidden) { signalerVu(); suivreFil() } }
watch(reponse, (v) => ecriture.frappe(v))
watch(clientEcrit, (ecrit) => { if (ecrit) defiler() })

async function chargerListe(silencieux = false) {
  if (!silencieux) chargement.value = true
  try {
    conversations.value = await listerConversations(filtre.value)
    erreur.value = ''
    if (active.value) Object.assign(active.value, conversations.value.find((c) => c.id === active.value.id) || {})
  } catch (e) {
    erreur.value = e.message
  } finally {
    chargement.value = false
  }
}

function defiler() { nextTick(() => { if (fil.value) fil.value.scrollTop = fil.value.scrollHeight }) }

async function ouvrir(c) {
  active.value = { ...c }
  messages.value = []
  reponse.value = ''
  router.replace({ query: { c: c.id } })
  try {
    messages.value = await lireMessagesSupport(c.id)
    defiler()
    signalerVu()
    presence()
    if (c.non_lu) { await changerStatutSupport(c.id, 'lu'); c.non_lu = false; rafraichirDemandes() }
  } catch (e) { notifier(e.message, 'erreur') }
}

async function suivreFil() {
  if (!active.value || document.hidden) return
  const id = active.value.id
  try {
    // filtre par id : une relève et un envoi qui se croisent ne dupliquent pas un message
    const nouveaux = (await lireMessagesSupport(id, dernierId.value)).filter((m) => m.id > dernierId.value)
    if (active.value?.id !== id) return // une autre discussion a été ouverte entre-temps
    if (nouveaux.length) {
      messages.value.push(...nouveaux)
      defiler()
      signalerVu()
      if (nouveaux.some((m) => m.auteur === 'client')) await changerStatutSupport(id, 'lu').catch(() => {})
    }
    await presence()
  } catch { /* nouvel essai au prochain tour */ }
}

async function repondre() {
  const texte = reponse.value.trim()
  if (!texte || envoi.value) return
  envoi.value = true
  try {
    const m = await repondreSupport(active.value.id, texte)
    if (m.id > dernierId.value) messages.value.push(m)
    reponse.value = ''
    canal?.message() // le client affiche la réponse tout de suite
    active.value.statut = 'humain'
    defiler()
    chargerListe(true)
    rafraichirDemandes()
  } catch (e) { notifier(e.message, 'erreur') } finally { envoi.value = false }
}

async function statut(nouveau) {
  try {
    await changerStatutSupport(active.value.id, nouveau)
    active.value.statut = nouveau
    await suivreFil()
    canal?.message()
    notifier({ humain: 'Vous avez pris la conversation en charge.', ia: 'Conversation rendue à Awa.', fermee: 'Conversation clôturée.' }[nouveau])
    chargerListe(true)
    rafraichirDemandes()
  } catch (e) { notifier(e.message, 'erreur') }
}

function repondreClavier(e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) repondre() }

watch(filtre, () => chargerListe())
onMounted(async () => {
  await chargerListe()
  // lien de l'e-mail de notification : /admin/support?c=<id>
  const id = route.query.c
  if (id) {
    let c = conversations.value.find((x) => x.id === id)
    if (!c) { filtre.value = 'toutes'; conversations.value = await listerConversations('toutes').catch(() => []); c = conversations.value.find((x) => x.id === id) }
    if (c) ouvrir(c)
  }
  minuterieListe = setInterval(() => { if (!document.hidden) chargerListe(true) }, 15000)
  minuterieFil = setInterval(suivreFil, 4000) // secours : le canal temps réel signale déjà les nouveaux messages
  document.addEventListener('visibilitychange', auRetour)
})
onBeforeUnmount(() => {
  clearInterval(minuterieListe)
  clearInterval(minuterieFil)
  document.removeEventListener('visibilitychange', auRetour)
  ecriture.arret()
  canal?.fermer()
})

const date = (d) => {
  if (!d) return ''
  const x = new Date(d), aujourdhui = new Date().toDateString() === x.toDateString()
  return aujourdhui ? x.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="support" :class="{ 'fil-ouvert': active }">
    <!-- Liste des discussions -->
    <section class="sp-liste adm-carte" aria-label="Discussions">
      <div class="sp-filtres adm-pilules">
        <button v-for="f in FILTRES" :key="f.id" type="button" class="adm-pilule" :class="{ actif: filtre === f.id }" @click="filtre = f.id">{{ f.label }}</button>
      </div>
      <p v-if="awaHorsService" class="sp-hors-service" role="alert">
        <i class="fa-solid fa-robot" aria-hidden="true"></i>
        <span><strong>Awa est hors service : plus de crédits IA.</strong> Toutes les clés Gemini ont atteint leur quota : les nouvelles discussions vous arrivent directement, à vous de répondre.</span>
      </p>
      <p v-if="notificationsNavigateur === 'default'" class="sp-notif">
        <i class="fa-regular fa-bell" aria-hidden="true"></i> Être prévenu même dans un autre onglet ?
        <button type="button" class="sp-lien" @click="activerNotifications">Activer les notifications</button>
      </p>
      <p v-if="erreur" class="sp-erreur"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> {{ erreur }}</p>
      <div v-else-if="chargement && !conversations.length" class="sp-vide"><span class="spinner"></span></div>
      <p v-else-if="!conversations.length" class="sp-vide">{{ filtre === 'a-traiter' ? 'Aucune demande en attente. 🎉' : 'Aucune discussion.' }}</p>
      <ul v-else class="sp-conversations">
        <li v-for="c in conversations" :key="c.id">
          <button type="button" class="sp-conv" :class="{ actif: active?.id === c.id, 'non-lu': c.non_lu || c.statut === 'attente' }" @click="ouvrir(c)">
            <span class="sp-conv-haut">
              <strong>{{ qui(c) }}</strong>
              <time>{{ date(c.mis_a_jour_le) }}</time>
            </span>
            <span class="sp-conv-raison">{{ c.raison || (c.statut === 'ia' ? 'Discussion avec Awa' : '—') }}</span>
            <span class="adm-badge sans-point" :class="STATUTS[c.statut]?.classe">{{ STATUTS[c.statut]?.label }}</span>
          </button>
        </li>
      </ul>
    </section>

    <!-- Discussion ouverte -->
    <section class="sp-fil adm-carte" aria-label="Discussion">
      <div v-if="!active" class="sp-fil-vide">
        <i class="fa-solid fa-headset" aria-hidden="true"></i>
        <p>Choisissez une discussion pour répondre au client.</p>
      </div>
      <template v-else>
        <header class="sp-entete">
          <button type="button" class="adm-icone-btn sp-retour" aria-label="Retour à la liste" @click="active = null; router.replace({ query: {} })"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button>
          <div class="sp-client">
            <strong>{{ qui(active) }}</strong>
            <small>
              <template v-if="active.email"><a :href="`mailto:${active.email}`">{{ active.email }}</a> · </template>
              {{ active.utilisateur_id ? 'Compte BTM' : 'Visiteur sans compte' }}<template v-if="active.page"> · depuis {{ active.page }}</template>
            </small>
          </div>
          <span class="adm-badge sans-point" :class="STATUTS[active.statut]?.classe">{{ STATUTS[active.statut]?.label }}</span>
        </header>
        <p v-if="active.raison" class="sp-raison"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> {{ active.raison }}</p>

        <div ref="fil" class="sp-messages" aria-live="polite">
          <template v-for="m in messages" :key="m.id">
            <p v-if="m.auteur === 'systeme'" class="sp-systeme">{{ m.texte }}</p>
            <div v-else class="sp-message" :class="m.auteur">
              <span class="sp-auteur">{{ AUTEURS[m.auteur] }} · {{ date(m.cree_le) }}</span>
              <p>{{ m.texte }}</p>
              <span v-if="m.id === dernierConseillerId" class="sp-vu" :class="{ lu: vuParClient }">
                <i :class="vuParClient ? 'fa-solid fa-check-double' : 'fa-solid fa-check'" aria-hidden="true"></i>
                {{ vuParClient ? 'Vu par le client' : 'Envoyé · pas encore vu' }}
              </span>
            </div>
          </template>
          <div v-if="clientEcrit" class="sp-message client">
            <span class="sp-auteur">{{ qui(active) }} écrit…</span>
            <p class="sp-points" aria-label="Le client écrit"><span></span><span></span><span></span></p>
          </div>
        </div>

        <div class="sp-actions">
          <button v-if="active.statut === 'attente' || active.statut === 'ia'" type="button" class="adm-btn adm-btn-clair adm-btn-sm" @click="statut('humain')"><i class="fa-solid fa-hand" aria-hidden="true"></i> Prendre en charge</button>
          <button v-if="active.statut !== 'ia' && active.statut !== 'fermee'" type="button" class="adm-btn adm-btn-fantome adm-btn-sm" @click="statut('ia')"><i class="fa-solid fa-robot" aria-hidden="true"></i> Rendre à Awa</button>
          <button v-if="active.statut !== 'fermee'" type="button" class="adm-btn adm-btn-fantome adm-btn-sm" @click="statut('fermee')"><i class="fa-solid fa-check" aria-hidden="true"></i> Clôturer</button>
        </div>
        <form class="sp-reponse" @submit.prevent="repondre">
          <textarea v-model="reponse" rows="3" placeholder="Votre réponse au client… (Ctrl + Entrée pour envoyer)" aria-label="Votre réponse" @keydown="repondreClavier"></textarea>
          <button type="submit" class="adm-btn adm-btn-noir" :disabled="!reponse.trim() || envoi">
            <span v-if="envoi" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-paper-plane" aria-hidden="true"></i> Envoyer
          </button>
        </form>
      </template>
    </section>
  </div>
</template>

<style scoped>
.support { display: grid; grid-template-columns: 1fr; gap: 14px; min-height: 0; }
@media (min-width: 1024px) {
  .support { grid-template-columns: minmax(300px, 380px) minmax(0, 1fr); height: 100%; }
  .support > * { min-height: 0; }
}
.sp-liste { display: flex; flex-direction: column; min-height: 320px; overflow: hidden; }
.sp-filtres { padding: 14px 14px 10px; border-bottom: 1px solid var(--adm-ligne); }
.sp-filtres .adm-pilule { min-height: 32px; padding: 0 12px; font-size: .82rem; }
.sp-notif { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0; padding: 10px 16px; background: var(--adm-accent-doux); color: var(--lagon-800); font-size: .8rem; }
.sp-hors-service { display: flex; gap: 10px; margin: 0; padding: 12px 16px; background: #fff1f2; color: var(--adm-baisse); font-size: .82rem; line-height: 1.45; }
.sp-hors-service i { margin-top: 2px; }
.sp-lien { border: 0; background: none; color: var(--adm-accent); font: inherit; font-weight: 700; cursor: pointer; }
.sp-erreur { display: flex; gap: 8px; margin: 14px; padding: 12px; border-radius: 12px; background: #fff1f2; color: var(--adm-baisse); font-size: .86rem; }
.sp-vide { display: grid; place-items: center; flex: 1; min-height: 160px; margin: 0; color: var(--adm-muet); font-size: .9rem; }
.sp-conversations { flex: 1; margin: 0; padding: 6px; overflow-y: auto; list-style: none; }
.sp-conv { display: flex; flex-direction: column; gap: 5px; width: 100%; padding: 12px 14px; border: 0; border-radius: 14px; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.sp-conv:hover { background: #fafbfc; }
.sp-conv.actif { background: var(--adm-accent-doux); }
.sp-conv.non-lu { box-shadow: inset 3px 0 0 #f59e0b; }
.sp-conv-haut { display: flex; justify-content: space-between; gap: 10px; }
.sp-conv-haut strong { overflow: hidden; font-size: .9rem; text-overflow: ellipsis; white-space: nowrap; }
.sp-conv.non-lu .sp-conv-haut strong { font-weight: 800; }
.sp-conv-haut time { flex: none; color: var(--adm-muet); font-size: .74rem; }
.sp-conv-raison { overflow: hidden; color: var(--adm-encre-2); font-size: .8rem; text-overflow: ellipsis; white-space: nowrap; }
.sp-conv .adm-badge { align-self: flex-start; font-size: .7rem; }

.sp-fil { display: flex; flex-direction: column; min-height: 420px; overflow: hidden; }
.sp-fil-vide { display: grid; place-content: center; justify-items: center; gap: 10px; flex: 1; color: var(--adm-muet); }
.sp-fil-vide i { font-size: 2.4rem; opacity: .5; }
.sp-fil-vide p { margin: 0; }
.sp-entete { display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--adm-ligne); }
.sp-retour { display: none; }
.sp-client { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.sp-client strong { font-size: 1rem; }
.sp-client small { overflow: hidden; color: var(--adm-muet); font-size: .8rem; text-overflow: ellipsis; white-space: nowrap; }
.sp-client a { color: var(--adm-accent); }
.sp-raison { display: flex; gap: 8px; margin: 0; padding: 10px 18px; background: #fffbeb; color: #92400e; font-size: .84rem; }
.sp-messages { display: flex; flex: 1; flex-direction: column; gap: 10px; padding: 16px 18px; overflow-y: auto; background: #fafbfc; }
.sp-message { display: flex; flex-direction: column; max-width: 78%; }
.sp-message p { margin: 0; padding: 10px 13px; border-radius: 14px 14px 14px 4px; background: #fff; font-size: .9rem; line-height: 1.5; white-space: pre-line; box-shadow: 0 1px 2px rgba(15,23,42,.06); }
.sp-message.client p { background: #fff; }
.sp-message.ia p { background: #f5f3ff; }
.sp-message.conseiller { align-self: flex-end; align-items: flex-end; }
.sp-message.conseiller p { border-radius: 14px 14px 4px 14px; background: var(--adm-noir); color: #fff; }
.sp-auteur { margin: 0 4px 3px; color: var(--adm-muet); font-size: .72rem; font-weight: 600; }
.sp-vu { margin: 3px 4px 0; color: var(--adm-muet); font-size: .72rem; }
.sp-vu.lu { color: var(--adm-accent); font-weight: 600; }
.sp-message p.sp-points { display: flex; gap: 4px; padding: 12px 14px; }
.sp-points span { width: 6px; height: 6px; border-radius: 50%; background: var(--adm-muet); animation: sp-points 1s infinite; }
.sp-points span:nth-child(2) { animation-delay: .15s; }
.sp-points span:nth-child(3) { animation-delay: .3s; }
@keyframes sp-points { 0%, 60%, 100% { opacity: .3; } 30% { opacity: 1; } }
.sp-systeme { align-self: center; margin: 2px 0; color: var(--adm-muet); font-size: .76rem; text-align: center; }
.sp-actions { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 18px 0; border-top: 1px solid var(--adm-ligne); }
.sp-reponse { display: flex; align-items: flex-end; gap: 10px; padding: 10px 18px 16px; }
.sp-reponse textarea { flex: 1; min-height: 70px; padding: 10px 14px; border: 1px solid var(--adm-ligne); border-radius: 12px; resize: vertical; font: inherit; font-size: .9rem; line-height: 1.5; }
.sp-reponse textarea:focus { outline: none; border-color: var(--adm-accent); box-shadow: 0 0 0 4px rgba(8, 145, 178, .14); }
@media (max-width: 1023px) {
  .sp-fil { display: none; }
  .fil-ouvert .sp-fil { display: flex; }
  .fil-ouvert .sp-liste { display: none; }
  .sp-retour { display: inline-grid; }
}
</style>

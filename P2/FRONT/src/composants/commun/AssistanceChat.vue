<script setup>
/**
 * Discussion « Sur le site » : Awa (questions guidées, puis assistante IA pour les questions libres)
 * ou un conseiller BTM (l'admin) quand la demande la dépasse. La conversation est gardée dans le navigateur :
 * le visiteur retrouve la réponse du conseiller s'il revient plus tard.
 * Awa fait aussi le devis dans la discussion (useDevisAwa) : questions, calcul, enregistrement dans « Mes projets », PDF.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAuth } from '@/composables/useAuth.js'
import { ETAPES } from '@/donnees/assistanceQuestions.js'
import { useDevisAwa, demandeDeDevis } from '@/composables/useDevisAwa.js'
import { ouvrirAuth } from '@/composables/useFenetreAuth.js'
import {
  conversationGardee, oublierConversation, envoyerQuestion, demanderConseiller, lireConversation,
  canalSupport, emetteurEcriture, recepteurEcriture
} from '@/services/supabase/serviceSupport.js'

const emit = defineEmits(['fermer', 'reponse-vue'])
const { connecte } = useAuth()
// Devis fait dans la discussion : ses messages restent dans le navigateur, mêlés à la conversation par ordre d'arrivée
const {
  messages: messagesDevis, actif: devisActif, occupe: devisOccupe, choix: choixDevis, dernier: dernierDevis,
  demarrer: demarrerDevis, choisir: choisirDevis, repondre: repondreDevis, annuler: annulerDevis, pdf: pdfDevis, ouvrir: ouvrirDevis, reinitialiser: oublierDevis
} = useDevisAwa()

const minimise = ref(false)
const guide = ref([]) // échanges des questions guidées (dans le navigateur seulement)
const parcours = ref([]) // choix successifs, résumés au conseiller
const VIDE = () => ({ id: null, jeton: null, statut: null, email: null, vuConseiller: 0, messages: [] })
const serveur = ref(VIDE()) // vuConseiller : dernier message vu par le conseiller
const conseillerEcrit = ref(false) // le conseiller tape en ce moment (canal temps réel)
const saisie = ref('')
const envoi = ref(false)
const erreur = ref('')
const demandeCoordonnees = ref(false) // petit formulaire e-mail avant le passage à un conseiller
const coord = ref({ email: '', nom: '' })
const zone = ref(null)
const menuOuvert = ref(false) // options de la conversation, ouvertes depuis l'avatar
const menu = ref(null)
// nombre de messages au moment du passage à un conseiller : la note « vous pouvez fermer » ne vit que jusqu'au message suivant
const debutAttente = ref(null)
let minuterie = null

const dernierId = computed(() => serveur.value.messages.at(-1)?.id || 0)
const statut = computed(() => serveur.value.statut || 'ia')
const chezConseiller = computed(() => statut.value === 'attente' || statut.value === 'humain')
// clôturée par le conseiller : plus de champ de saisie, la suite se fait dans une nouvelle discussion vierge
const cloturee = computed(() => statut.value === 'fermee')
// le parcours guidé envoyé au conseiller n'est pas réaffiché au visiteur
const messagesServeur = computed(() => serveur.value.messages.filter((m) => !(m.auteur === 'client' && m.texte.startsWith('Parcours suivi :'))))
const etapeActive = computed(() => guide.value.at(-1)?.etape || null)
// conversation enregistrée et devis d'Awa dans un seul fil ; un message pas encore horodaté (envoi en cours) reste à la fin
const fil = computed(() => {
  if (!messagesDevis.value.length) return messagesServeur.value
  const instant = (m) => (m.cree_le ? new Date(m.cree_le).getTime() : Infinity)
  return [...messagesServeur.value, ...messagesDevis.value].map((m, i) => ({ m, i })).sort((a, b) => instant(a.m) - instant(b.m) || a.i - b.i).map((x) => x.m)
})
// accusé de lecture : sous le dernier message envoyé par le client, une fois la discussion chez un conseiller
const dernierClientId = computed(() => [...messagesServeur.value].reverse().find((m) => m.auteur === 'client' && typeof m.id === 'number')?.id)
const vuParConseiller = computed(() => !!dernierClientId.value && serveur.value.vuConseiller >= dernierClientId.value)
// la conversation a commencé avec le conseiller dès qu'il a pris la main ou écrit
const conseillerPresent = computed(() => chezConseiller.value && (statut.value === 'humain' || serveur.value.messages.some((m) => m.auteur === 'conseiller')))
// qui répond en ce moment : la barre prend sa couleur (Awa en fuchsia, le conseiller en ardoise)
const interlocuteur = computed(() => (statut.value === 'fermee' ? 'fermee' : conseillerPresent.value ? 'conseiller' : 'awa'))
const titre = computed(() => ({ conseiller: 'Conseiller BTM', fermee: 'Conversation clôturée' })[interlocuteur.value] || 'Awa · Assistante BTM')
// en attente d'un conseiller, Awa continue de répondre (fonction « assistant ») : le client n'est jamais sans réponse
const sousTitre = computed(() => {
  if (interlocuteur.value === 'conseiller') return 'Vous discutez avec un conseiller'
  if (interlocuteur.value === 'fermee') return 'Discussion terminée'
  return statut.value === 'attente' ? 'Awa vous répond · un conseiller va vous rejoindre' : 'Assistante virtuelle · répond tout de suite'
})
// affichée juste après la demande de conseiller, effacée dès que quelqu'un (client, Awa ou conseiller) écrit
const noteFermer = computed(() => chezConseiller.value && debutAttente.value === serveur.value.messages.length && !serveur.value.email && !connecte.value && !demandeCoordonnees.value)
const peutRecommencer = computed(() => !!serveur.value.statut || guide.value.length > 1)

function defiler() { nextTick(() => { if (zone.value) zone.value.scrollTop = zone.value.scrollHeight }) }
watch(() => [guide.value.length, serveur.value.messages.length, messagesDevis.value.length, demandeCoordonnees.value, conseillerEcrit.value], defiler)

function etapeVers(cle) {
  const e = ETAPES[cle]
  guide.value.push({ auteur: 'ia', texte: e.texte, etape: cle, lien: e.lien })
}

function choisir(c) {
  guide.value.push({ auteur: 'client', texte: c.label })
  parcours.value.push(c.label)
  if (c.conseiller) return passerConseiller()
  if (c.devis) return demarrerDevis()
  etapeVers(c.suite)
}
function resolu(oui) {
  // pas réglé : Awa cherche d'abord avec le visiteur ; le conseiller reste à un clic (« Parler à un conseiller »)
  if (!oui) { guide.value.push({ auteur: 'client', texte: 'Non, ce n’est pas réglé' }); parcours.value.push('Pas réglé'); return etapeVers('pas-regle') }
  guide.value.push({ auteur: 'client', texte: 'Oui, merci' })
  guide.value.push({ auteur: 'ia', texte: 'Avec plaisir ! Puis-je vous aider pour autre chose ?', etape: 'depart' })
  parcours.value = []
}

// ---------- Échanges avec le serveur ----------
function integrer(r) {
  if (!r) return
  const connus = new Set(serveur.value.messages.map((m) => m.id))
  // le message du client enregistré côté serveur (ramené par la relève pendant qu'Awa réfléchit)
  // remplace sa copie provisoire : il ne s'affiche jamais en double
  const recu = r.messages.some((m) => m.auteur === 'client' && !connus.has(m.id))
  serveur.value = {
    id: r.conversation_id, jeton: r.jeton, statut: r.statut, email: r.email,
    // « vu » ne recule jamais : une réponse ancienne arrivée en retard ne l'efface pas
    vuConseiller: Math.max(serveur.value.vuConseiller, r.vu_conseiller_id || 0),
    messages: [...serveur.value.messages.filter((m) => !(recu && m.provisoire)), ...r.messages.filter((m) => !connus.has(m.id))]
  }
  if (r.messages.some((m) => m.auteur === 'conseiller')) emit('reponse-vue', dernierId.value)
}

async function envoyer() {
  const texte = saisie.value.trim()
  if (!texte || envoi.value) return
  // devis dans la discussion : la réponse va à Awa sur place ; une demande de devis écrite le démarre
  if (devisActif.value) { saisie.value = ''; repondreDevis(texte); return }
  if (!chezConseiller.value && demandeDeDevis(texte)) { saisie.value = ''; demarrerDevis(texte); return }
  erreur.value = ''
  envoi.value = true
  saisie.value = ''
  serveur.value.messages.push({ id: `attente-${Date.now()}`, auteur: 'client', texte, provisoire: true })
  const avant = chezConseiller.value
  try {
    const r = await envoyerQuestion(parcours.value.length && !serveur.value.statut ? `${texte}\n\n(Parcours : ${parcours.value.join(' → ')})` : texte, numeriqueDernier())
    serveur.value.messages = serveur.value.messages.filter((m) => !m.provisoire)
    integrer(r)
    noterPassage(avant)
    canal?.message() // le conseiller relit tout de suite la discussion
  } catch (e) {
    serveur.value.messages = serveur.value.messages.filter((m) => !m.provisoire)
    saisie.value = texte
    erreur.value = e.message
  } finally {
    envoi.value = false
  }
}
const numeriqueDernier = () => [...serveur.value.messages].reverse().find((m) => typeof m.id === 'number')?.id || 0
// la discussion vient de passer chez un conseiller (à la demande du client ou d'Awa)
function noterPassage(avant) { if (!avant && chezConseiller.value) debutAttente.value = serveur.value.messages.length }

function passerConseiller() {
  menuOuvert.value = false
  // visiteur sans compte : on propose (sans obliger) de laisser un e-mail pour être recontacté
  if (!connecte.value && !serveur.value.email) { demandeCoordonnees.value = true; return }
  confirmerConseiller()
}
async function confirmerConseiller(avecCoordonnees = false) {
  demandeCoordonnees.value = false
  erreur.value = ''
  envoi.value = true
  const avant = chezConseiller.value
  try {
    const contexte = parcours.value.length ? `Parcours suivi : ${parcours.value.join(' → ')}` : ''
    integrer(await demanderConseiller({ contexte, email: avecCoordonnees ? coord.value.email.trim() : '', nom: avecCoordonnees ? coord.value.nom.trim() : '' }, numeriqueDernier()))
    noterPassage(avant)
  } catch (e) {
    erreur.value = e.message
  } finally {
    envoi.value = false
  }
}

function recommencer() {
  menuOuvert.value = false
  oublierConversation()
  oublierDevis()
  debutAttente.value = null
  serveur.value = VIDE()
  guide.value = []
  parcours.value = []
  etapeVers('depart')
}

// ---------- Avec le conseiller : temps réel ----------
// « écrit… », « vu » et « nouveau message » passent par le canal temps réel (instantané) ; la relève toutes les 4 s
// reste en secours et enregistre ce que le client a vu (le conseiller le retrouve s'il rouvre la discussion plus tard).
let canal = null
const recevoirEcriture = recepteurEcriture(conseillerEcrit)
const ecriture = emetteurEcriture((oui) => canal?.ecrit(oui))
let vuSignale = 0

function surSignal(s) {
  if (s.type === 'ecrit') recevoirEcriture(!!s.ecrit)
  else if (s.type === 'vu') serveur.value.vuConseiller = Math.max(serveur.value.vuConseiller, Number(s.id) || 0)
  else if (s.type === 'message') { recevoirEcriture(false); actualiser() }
}
// canal ouvert tant que la discussion est entre les mains d'un conseiller
watch(() => (chezConseiller.value && serveur.value.id && serveur.value.jeton ? `${serveur.value.id}|${serveur.value.jeton}` : ''), (cle) => {
  ecriture.arret()
  canal?.fermer()
  canal = null
  recevoirEcriture(false)
  vuSignale = 0
  if (cle) { canal = canalSupport(serveur.value.id, serveur.value.jeton, 'client', surSignal); signalerVu() }
})

/** Le client a la discussion sous les yeux : le conseiller voit « Vu » tout de suite */
function signalerVu() {
  if (!canal || minimise.value || document.hidden) return
  const id = numeriqueDernier()
  if (id > vuSignale) { vuSignale = id; canal.vu(id) }
}
watch(() => [serveur.value.messages.length, minimise.value], signalerVu)
const auRetour = () => { if (!document.hidden) { signalerVu(); actualiser() } }

watch(saisie, (v) => { if (chezConseiller.value) ecriture.frappe(v) })

let releveEnCours = false
async function actualiser() {
  if (!chezConseiller.value || document.hidden || releveEnCours) return
  releveEnCours = true
  try {
    integrer(await lireConversation(numeriqueDernier(), { vu: minimise.value ? 0 : numeriqueDernier() }))
  } catch { /* nouvel essai au prochain tour */ } finally {
    releveEnCours = false
  }
}

// le menu se referme au clic en dehors ou avec Échap
const horsMenu = (e) => { if (menuOuvert.value && menu.value && !menu.value.contains(e.target)) menuOuvert.value = false }
const echap = (e) => { if (e.key === 'Escape') menuOuvert.value = false }

onMounted(async () => {
  document.addEventListener('pointerdown', horsMenu)
  document.addEventListener('keydown', echap)
  if (conversationGardee()) {
    try { integrer(await lireConversation(0)) } catch { /* conversation expirée : on repart de zéro */ }
  }
  if (!serveur.value.messages.length) etapeVers('depart')
  minuterie = setInterval(actualiser, 4000)
  document.addEventListener('visibilitychange', auRetour)
  defiler()
})
onBeforeUnmount(() => {
  clearInterval(minuterie)
  document.removeEventListener('visibilitychange', auRetour)
  document.removeEventListener('pointerdown', horsMenu)
  document.removeEventListener('keydown', echap)
  ecriture.arret()
  canal?.fermer()
})

const AUTEURS = { ia: { nom: 'Awa', badge: 'IA' }, conseiller: { nom: 'Conseiller BTM', badge: 'BTM' } }
const heure = (d) => (d ? new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '')
</script>

<template>
  <aside class="ac" :class="{ minimise }" aria-label="Discussion avec l’assistance BTM">
    <header class="ac-barre" :class="`ac-barre-${interlocuteur}`">
      <!-- profil de la conversation : un clic sur l'avatar ouvre ses options -->
      <div ref="menu" class="ac-profil">
        <button type="button" class="ac-avatar" aria-haspopup="true" :aria-expanded="menuOuvert" aria-controls="ac-options" aria-label="Options de la conversation" @click="minimise = false; menuOuvert = !menuOuvert">
          <i :class="interlocuteur === 'conseiller' ? 'fa-solid fa-headset' : 'fa-solid fa-robot'" aria-hidden="true"></i>
          <i class="fa-solid fa-chevron-down ac-avatar-fleche" aria-hidden="true"></i>
        </button>
        <div v-if="menuOuvert" id="ac-options" class="ac-options">
          <p class="ac-options-qui"><strong>{{ titre }}</strong><small>{{ sousTitre }}</small></p>
          <button v-if="!devisActif && !cloturee" type="button" @click="menuOuvert = false; demarrerDevis()"><i class="fa-solid fa-calculator" aria-hidden="true"></i> Faire un devis avec Awa</button>
          <button v-if="!chezConseiller && !cloturee" type="button" @click="passerConseiller"><i class="fa-solid fa-headset" aria-hidden="true"></i> Parler à un conseiller</button>
          <button v-if="peutRecommencer" type="button" @click="recommencer"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Nouvelle discussion</button>
          <button type="button" @click="menuOuvert = false; minimise = true"><i class="fa-solid fa-minus" aria-hidden="true"></i> Réduire la fenêtre</button>
          <button type="button" @click="emit('fermer')"><i class="fa-solid fa-xmark" aria-hidden="true"></i> Fermer la discussion</button>
        </div>
      </div>
      <span class="ac-titre"><strong>{{ titre }}</strong><small>{{ sousTitre }}</small></span>
      <button type="button" :aria-label="minimise ? 'Agrandir la discussion' : 'Réduire la discussion'" @click="minimise = !minimise"><i :class="minimise ? 'fa-solid fa-chevron-up' : 'fa-solid fa-minus'" aria-hidden="true"></i></button>
      <button type="button" aria-label="Fermer la discussion" @click="emit('fermer')"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
    </header>

    <template v-if="!minimise">
      <div ref="zone" class="ac-messages" aria-live="polite">
        <!-- Questions guidées -->
        <template v-for="(m, i) in guide" :key="`g${i}`">
          <div class="ac-ligne" :class="m.auteur === 'client' ? 'client' : 'ia'">
            <span v-if="m.auteur !== 'client'" class="ac-qui">Awa <em>IA</em></span>
            <p class="ac-bulle">{{ m.texte }}</p>
            <router-link v-if="m.lien" :to="m.lien.to" class="ac-lien" @click="minimise = true">{{ m.lien.label }} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></router-link>
          </div>
          <!-- choix de la dernière étape seulement -->
          <div v-if="i === guide.length - 1 && m.etape && !serveur.statut" class="ac-choix">
            <template v-if="ETAPES[m.etape].choix">
              <button v-for="c in ETAPES[m.etape].choix" :key="c.label" type="button" :disabled="envoi" @click="choisir(c)">
                <i v-if="c.icone" :class="c.icone" aria-hidden="true"></i>{{ c.label }}
              </button>
            </template>
            <template v-else-if="ETAPES[m.etape].resolu">
              <button type="button" :disabled="envoi" @click="resolu(true)"><i class="fa-solid fa-check" aria-hidden="true"></i>Oui, c’est réglé</button>
              <button type="button" :disabled="envoi" @click="resolu(false)"><i class="fa-solid fa-xmark" aria-hidden="true"></i>Non, ce n’est pas réglé</button>
            </template>
          </div>
        </template>

        <!-- Conversation enregistrée (assistante IA et conseiller) et devis fait avec Awa -->
        <template v-for="m in fil" :key="m.id">
          <p v-if="m.auteur === 'systeme'" class="ac-systeme">{{ m.texte }}</p>
          <div v-else class="ac-ligne" :class="m.auteur === 'client' ? 'client' : m.auteur">
            <span v-if="AUTEURS[m.auteur]" class="ac-qui">{{ AUTEURS[m.auteur].nom }} <em>{{ AUTEURS[m.auteur].badge }}</em></span>
            <p class="ac-bulle" :class="{ provisoire: m.provisoire }">{{ m.texte.replace(/\n\n\(Parcours : .*\)$/s, '') }}</p>
            <span v-if="m.cree_le" class="ac-heure">
              <time>{{ heure(m.cree_le) }}</time>
              <span v-if="m.id === dernierClientId && chezConseiller" class="ac-vu" :class="{ lu: vuParConseiller }">
                · <i :class="vuParConseiller ? 'fa-solid fa-check-double' : 'fa-solid fa-check'" aria-hidden="true"></i>
                {{ vuParConseiller ? 'Vu' : 'Envoyé' }}
              </span>
            </span>
            <!-- devis terminé : PDF, détail, projets -->
            <div v-if="dernierDevis && m.id === dernierDevis.idMessage" class="ac-choix ac-devis-actions">
              <button type="button" @click="pdfDevis('visualiser')"><i class="fa-regular fa-file-pdf" aria-hidden="true"></i>Voir le PDF</button>
              <button type="button" @click="pdfDevis('telecharger')"><i class="fa-solid fa-download" aria-hidden="true"></i>Télécharger</button>
              <button type="button" @click="ouvrirDevis(); minimise = true"><i class="fa-solid fa-list-check" aria-hidden="true"></i>Devis complet</button>
              <router-link v-if="dernierDevis.dansCompte" to="/dashboard" @click="minimise = true"><i class="fa-solid fa-folder-open" aria-hidden="true"></i>Mes projets</router-link>
              <button v-else type="button" @click="ouvrirAuth('connexion', { redirect: '/dashboard' }); minimise = true"><i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i>Me connecter</button>
              <button type="button" @click="demarrerDevis()"><i class="fa-solid fa-plus" aria-hidden="true"></i>Autre devis</button>
            </div>
          </div>
        </template>

        <!-- réponses proposées à la question du devis en cours -->
        <div v-if="devisActif && !devisOccupe" class="ac-choix">
          <button v-for="c in choixDevis" :key="c.label" type="button" @click="choisirDevis(c)">
            <i v-if="c.icone" :class="c.icone" aria-hidden="true"></i>{{ c.label }}
          </button>
          <button type="button" class="ac-choix-discret" @click="annulerDevis">Annuler le devis</button>
        </div>

        <div v-if="conseillerEcrit && chezConseiller && !envoi" class="ac-ligne conseiller">
          <span class="ac-qui">Conseiller BTM écrit…</span>
          <p class="ac-ecrit" aria-label="Le conseiller écrit"><span></span><span></span><span></span></p>
        </div>
        <p v-if="envoi || devisOccupe" class="ac-ecrit"><span></span><span></span><span></span></p>

        <!-- Coordonnées facultatives avant le passage à un conseiller -->
        <form v-if="demandeCoordonnees" class="ac-coord" @submit.prevent="confirmerConseiller(true)">
          <p>Un conseiller va prendre le relais. Laissez votre e-mail s’il doit vous recontacter après votre visite <small>(facultatif)</small>.</p>
          <input v-model="coord.nom" type="text" maxlength="80" placeholder="Votre nom" autocomplete="name" />
          <input v-model="coord.email" type="email" maxlength="254" placeholder="votre@email.fr" autocomplete="email" />
          <div>
            <button type="submit" class="btn btn-primaire btn-sm">Contacter un conseiller</button>
            <button type="button" class="ac-lien-bouton" @click="confirmerConseiller(false)">Continuer sans e-mail</button>
          </div>
        </form>

        <p v-if="noteFermer" class="ac-systeme">
          Vous pouvez fermer cette fenêtre : la réponse s’affichera ici à votre retour sur le site.
        </p>
      </div>

      <p v-if="erreur" class="ac-erreur" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ erreur }}</p>

      <!-- conversation clôturée par le conseiller : on ne peut plus y écrire -->
      <div v-if="cloturee" class="ac-cloture" role="status">
        <p><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Cette conversation a été clôturée par un conseiller BTM.</p>
        <small>Pour continuer, ouvrez une « Nouvelle discussion » depuis le menu de l’avatar.</small>
      </div>
      <form v-else class="ac-saisie" @submit.prevent="envoyer">
        <label class="visually-hidden" for="ac-message">Votre message</label>
        <input id="ac-message" v-model="saisie" type="text" maxlength="1000" :placeholder="devisActif ? 'Votre réponse…' : statut === 'humain' ? 'Écrire au conseiller…' : 'Posez votre question…'" autocomplete="off" />
        <button type="submit" :disabled="!saisie.trim() || envoi" aria-label="Envoyer"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i></button>
      </form>
    </template>
  </aside>
</template>

<style scoped>
.ac {
  position: fixed; right: 24px; bottom: 24px; z-index: 220; display: flex; flex-direction: column; width: min(390px, calc(100vw - 32px));
  max-height: min(640px, calc(100dvh - 48px)); overflow: hidden; border: 1px solid rgba(15, 23, 42, .12); border-radius: 18px;
  background: #fff; box-shadow: 0 18px 42px rgba(0,0,0,.28); animation: ac-apparaitre .24s ease both;
}
.ac.minimise { width: min(320px, calc(100vw - 32px)); }
.ac-barre { display: flex; align-items: center; gap: 10px; padding: 12px 10px 12px 14px; background: var(--lagon-600); color: #fff; }
.ac-barre-awa { background: #c026d3; }
.ac-barre-conseiller { background: var(--ardoise); }
.ac-profil { position: relative; flex: none; }
.ac-barre .ac-avatar { position: relative; width: 38px; height: 38px; display: grid; place-items: center; border-radius: 50%; background: rgba(255,255,255,.18); transition: background .15s, box-shadow .15s; }
.ac-barre .ac-avatar:hover, .ac-barre .ac-avatar[aria-expanded="true"] { background: rgba(255,255,255,.3); box-shadow: 0 0 0 2px rgba(255,255,255,.55); }
.ac-avatar-fleche { position: absolute; right: -3px; bottom: -3px; width: 15px; height: 15px; display: grid; place-items: center; border-radius: 50%; background: #fff; color: var(--ardoise-2); font-size: .5rem; }
.ac-options { position: absolute; top: calc(100% + 8px); left: 0; z-index: 2; display: flex; flex-direction: column; width: 240px; padding: 6px; border: 1px solid var(--gris-200); border-radius: 14px; background: #fff; box-shadow: 0 12px 28px rgba(15,23,42,.22); animation: ac-apparaitre .16s ease both; }
.ac-options-qui { display: flex; flex-direction: column; margin: 0 0 4px; padding: 8px 10px 10px; border-bottom: 1px solid var(--gris-200); line-height: 1.3; }
.ac-options-qui strong { color: var(--ardoise-2); font-size: .86rem; }
.ac-options-qui small { color: var(--texte-secondaire); font-size: .72rem; }
.ac-barre .ac-options button { display: flex; align-items: center; gap: 10px; width: 100%; height: auto; padding: 9px 10px; border-radius: 9px; color: var(--ardoise-2); font: inherit; font-size: .84rem; font-weight: 600; text-align: left; }
.ac-barre .ac-options button:hover { background: var(--gris-50); }
.ac-options button i { width: 16px; color: var(--texte-secondaire); text-align: center; }
.ac-titre { display: flex; flex: 1; flex-direction: column; min-width: 0; line-height: 1.25; }
.ac-titre strong { font-size: .95rem; }
.ac-titre small { overflow: hidden; color: rgba(255,255,255,.8); font-size: .74rem; text-overflow: ellipsis; white-space: nowrap; }
.ac-barre button { width: 32px; height: 32px; flex: none; border: 0; border-radius: 8px; background: transparent; color: #fff; cursor: pointer; }
.ac-barre button:hover { background: rgba(255,255,255,.18); }

.ac-messages { display: flex; flex: 1; flex-direction: column; gap: 10px; min-height: 240px; padding: 16px 14px; overflow-y: auto; background: var(--gris-50); }
.ac-ligne { display: flex; flex-direction: column; max-width: 88%; }
.ac-ligne.client { align-self: flex-end; align-items: flex-end; }
.ac-qui { display: flex; align-items: center; gap: 6px; margin: 0 0 3px 4px; color: var(--texte-secondaire); font-size: .72rem; font-weight: 700; }
.ac-qui em { padding: 0 6px; border-radius: 999px; background: var(--lagon-100); color: var(--lagon-800); font-size: .62rem; font-style: normal; }
.ac-ligne.conseiller .ac-qui em { background: var(--ardoise); color: #fde68a; }
.ac-bulle { margin: 0; padding: 10px 13px; border-radius: 14px 14px 14px 4px; background: #fff; color: var(--ardoise-2); font-size: .86rem; line-height: 1.5; white-space: pre-line; box-shadow: 0 1px 2px rgba(15,23,42,.06); }
.ac-ligne.client .ac-bulle { border-radius: 14px 14px 4px 14px; background: var(--lagon-600); color: #fff; }
.ac-ligne.conseiller .ac-bulle { border: 1px solid #fde68a; background: #fffbeb; }
.ac-bulle.provisoire { opacity: .6; }
.ac-heure { margin: 2px 6px 0; color: var(--gris-400); font-size: .66rem; }
.ac-vu.lu { color: var(--lagon-600); font-weight: 700; }
.ac-lien { display: inline-flex; align-items: center; gap: 6px; margin: 6px 0 0 4px; color: var(--lagon-700); font-size: .82rem; font-weight: 700; }
.ac-choix { display: flex; flex-wrap: wrap; gap: 6px; }
.ac-choix button { display: inline-flex; align-items: center; gap: 7px; padding: 8px 12px; border: 1.5px solid var(--lagon-200); border-radius: 999px; background: #fff; color: var(--lagon-800); font: inherit; font-size: .8rem; font-weight: 600; cursor: pointer; transition: background .15s, border-color .15s; }
.ac-choix button:hover:not(:disabled) { border-color: var(--lagon-500); background: var(--lagon-50); }
.ac-choix a { display: inline-flex; align-items: center; gap: 7px; padding: 8px 12px; border: 1.5px solid var(--lagon-200); border-radius: 999px; background: #fff; color: var(--lagon-800); font-size: .8rem; font-weight: 600; }
.ac-choix a:hover { border-color: var(--lagon-500); background: var(--lagon-50); }
.ac-choix .ac-choix-discret { border-color: transparent; background: transparent; color: var(--texte-secondaire); font-weight: 500; }
.ac-devis-actions { margin-top: 8px; }
.ac-systeme { align-self: center; max-width: 92%; margin: 2px 0; color: var(--texte-secondaire); font-size: .74rem; text-align: center; }
.ac-ecrit { display: flex; gap: 4px; align-self: flex-start; margin: 0; padding: 12px 14px; border-radius: 14px; background: #fff; }
.ac-ecrit span { width: 6px; height: 6px; border-radius: 50%; background: var(--gris-400); animation: ac-points 1s infinite; }
.ac-ecrit span:nth-child(2) { animation-delay: .15s; }
.ac-ecrit span:nth-child(3) { animation-delay: .3s; }
.ac-coord { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid #fde68a; border-radius: 14px; background: #fffbeb; }
.ac-coord p { margin: 0; color: #78350f; font-size: .8rem; line-height: 1.45; }
.ac-coord input { min-height: 38px; padding: 0 12px; border: 1px solid var(--gris-300); border-radius: 10px; font: inherit; font-size: .84rem; }
.ac-coord > div { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.ac-erreur { display: flex; gap: 6px; margin: 0; padding: 8px 14px; background: #fff1f2; color: var(--erreur); font-size: .78rem; }
.ac-cloture { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 14px; border-top: 1px solid var(--gris-200); background: #fff; text-align: center; }
.ac-cloture p { display: flex; align-items: center; gap: 8px; margin: 0; color: var(--ardoise-2); font-size: .84rem; font-weight: 600; }
.ac-cloture p i { color: #047857; }
.ac-cloture small { color: var(--texte-secondaire); font-size: .76rem; }
.ac-saisie { display: flex; align-items: center; gap: 8px; padding: 10px; border-top: 1px solid var(--gris-200); background: #fff; }
.ac-saisie input { min-width: 0; flex: 1; min-height: 40px; padding: 0 12px; border: 1px solid var(--gris-200); border-radius: 999px; outline: 0; font: inherit; font-size: .86rem; }
.ac-saisie input:focus { border-color: var(--lagon-500); }
.ac-saisie button { width: 40px; height: 40px; flex: none; border: 0; border-radius: 50%; background: var(--lagon-600); color: #fff; cursor: pointer; }
.ac-saisie button:disabled { opacity: .45; cursor: default; }
.ac-lien-bouton { display: inline-flex; align-items: center; gap: 6px; padding: 4px 0; border: 0; background: none; color: var(--lagon-700); font: inherit; font-size: .78rem; font-weight: 700; cursor: pointer; }
.ac-lien-bouton:hover { text-decoration: underline; text-underline-offset: 3px; }
@keyframes ac-apparaitre { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes ac-points { 0%, 60%, 100% { opacity: .3; } 30% { opacity: 1; } }
@media (max-width: 640px) { .ac { right: 12px; bottom: 12px; width: calc(100vw - 24px); max-height: calc(100dvh - 24px); } }
</style>

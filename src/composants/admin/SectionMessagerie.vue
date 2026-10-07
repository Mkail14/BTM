<script setup>
/**
 * Messagerie de contact@btm.yt : dossiers | liste des messages | lecture.
 * Lire, répondre, répondre à tous, transférer, écrire, marquer lu / non lu / important, déplacer, supprimer,
 * pièces jointes (téléchargement, aperçu des PDF). Le contenu HTML des e-mails est affiché dans un cadre isolé
 * (aucun script, images distantes bloquées par défaut : elles servent souvent à pister l'ouverture des messages).
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useAdmin } from '@/composables/useAdmin.js'
import { useMessagerie } from '@/composables/useMessagerie.js'
import { apercuPdf, fermerApercuPdf } from '@/services/export/livrerPdf.js'
import {
  ouvrirBoite, listerMessages, lireMessage, lirePieceJointe, marquerMessages, deplacerMessages, supprimerMessages, versBlob
} from '@/services/supabase/serviceMessagerie.js'
import MessagerieRedaction from './MessagerieRedaction.vue'

const { notifier, confirmer } = useAdmin()
const { nonLus, majDepuisDossiers, memoire } = useMessagerie()
const MOI = 'contact@btm.yt'
const SIGNATURE = '\n\n--\nL’équipe BTM — Bâtiment & Travaux Mayotte\nwww.btm.yt · contact@btm.yt'

// gardés en mémoire (useMessagerie) : revenir dans la messagerie affiche tout de suite la dernière liste
const { dossiers, dossier, liste } = memoire
const recherche = ref('')
const rechercheActive = ref('')
const ouvert = ref(null) // message affiché (en-tête tout de suite, contenu dès qu'il est arrivé)
const chargementListe = ref(false)
const chargementMessage = ref(false) // contenu du message en cours de chargement
const erreur = ref('')
const selection = ref([])
const imagesDistantes = ref(false)
const brouillon = ref(null) // fenêtre de rédaction ouverte
const pieceEnCours = ref(null)

const dossierActif = computed(() => dossiers.value.find((d) => d.chemin === dossier.value))
const estCorbeille = computed(() => dossierActif.value?.cle === 'corbeille')
const autresDossiers = computed(() => dossiers.value.filter((d) => d.chemin !== dossier.value))
const tousCoches = computed(() => liste.value.messages.length > 0 && selection.value.length === liste.value.messages.length)
const ICONES = { reception: 'fa-solid fa-inbox', envoyes: 'fa-solid fa-paper-plane', brouillons: 'fa-regular fa-file-lines', indesirables: 'fa-solid fa-ban', corbeille: 'fa-regular fa-trash-can', archives: 'fa-solid fa-box-archive' }

// ---------- Chargements ----------
// Page 1 : dossiers + messages en un seul appel ; autres pages : la liste seule
async function actualiser(page = 1) {
  chargementListe.value = true
  erreur.value = ''
  try {
    if (page === 1) {
      const r = await ouvrirBoite(dossier.value, rechercheActive.value)
      dossiers.value = r.dossiers
      liste.value = r.liste
      majDepuisDossiers(r.dossiers)
      memoire.chargee.value = true
    } else {
      liste.value = await listerMessages(dossier.value, page, rechercheActive.value)
    }
    selection.value = []
  } catch (e) {
    erreur.value = e.message
  } finally {
    chargementListe.value = false
  }
}
const chargerListe = actualiser
const toutRecharger = () => actualiser(liste.value.page)
onMounted(() => actualiser()) // la liste en mémoire reste affichée pendant l'actualisation

function choisirDossier(chemin) {
  dossier.value = chemin
  ouvert.value = null
  recherche.value = rechercheActive.value = ''
  liste.value = { messages: [], total: 0, page: 1, pages: 1 }
  actualiser()
}
function rechercher() { rechercheActive.value = recherche.value.trim(); actualiser() }
function effacerRecherche() { recherche.value = rechercheActive.value = ''; actualiser() }

/** Compteurs de non lus mis à jour sur place (sans recharger la boîte) */
function ajusterNonLus(ecart) {
  const d = dossierActif.value
  if (d) d.nonLus = Math.max(0, d.nonLus + ecart)
  if (d?.cle === 'reception') nonLus.value = Math.max(0, nonLus.value + ecart)
}

async function ouvrir(m) {
  imagesDistantes.value = false
  const cle = `${dossier.value}:${m.uid}`
  const enMemoire = memoire.messages.get(cle)
  if (enMemoire) { ouvert.value = enMemoire; return }
  // en-tête connu par la liste : affiché tout de suite, le contenu suit
  ouvert.value = { ...m, cc: [], repondreA: [], texte: '', html: '', piecesJointes: [], partiel: true }
  chargementMessage.value = true
  try {
    const complet = { ...(await lireMessage(dossier.value, m.uid)), important: m.important }
    memoire.messages.set(cle, complet)
    if (ouvert.value?.uid === m.uid) ouvert.value = complet
    if (!m.lu) { m.lu = true; ajusterNonLus(-1) }
  } catch (e) {
    if (ouvert.value?.uid === m.uid) ouvert.value = null
    notifier(e.message, 'erreur')
  } finally {
    chargementMessage.value = false
  }
}

// ---------- Actions ----------
const uidsVises = (uid) => (uid ? [uid] : selection.value)

async function marquer(etat, uid) {
  const uids = uidsVises(uid)
  if (!uids.length) return
  try {
    await marquerMessages(dossier.value, uids, etat)
    for (const m of liste.value.messages) {
      if (!uids.includes(m.uid)) continue
      if ('lu' in etat && m.lu !== etat.lu) ajusterNonLus(etat.lu ? -1 : 1)
      Object.assign(m, etat)
      const enMemoire = memoire.messages.get(`${dossier.value}:${m.uid}`)
      if (enMemoire && 'important' in etat) enMemoire.important = etat.important
    }
    if (ouvert.value && uids.includes(ouvert.value.uid) && 'important' in etat) ouvert.value.important = etat.important
    selection.value = []
  } catch (e) { notifier(e.message, 'erreur') }
}

async function supprimer(uid) {
  const uids = uidsVises(uid)
  if (!uids.length) return
  if (estCorbeille.value && !(await confirmer({ titre: 'Supprimer définitivement ?', texte: `${uids.length > 1 ? `${uids.length} messages seront effacés` : 'Ce message sera effacé'} pour toujours.`, libelle: 'Supprimer', danger: true }))) return
  try {
    const r = await supprimerMessages(dossier.value, uids)
    uids.forEach((uid) => memoire.messages.delete(`${dossier.value}:${uid}`))
    notifier(r.definitif ? 'Supprimé définitivement.' : uids.length > 1 ? `${uids.length} messages mis à la corbeille.` : 'Message mis à la corbeille.')
    if (ouvert.value && uids.includes(ouvert.value.uid)) ouvert.value = null
    toutRecharger()
  } catch (e) { notifier(e.message, 'erreur') }
}

async function deplacer(vers, uid) {
  const uids = uidsVises(uid)
  if (!uids.length || !vers) return
  try {
    await deplacerMessages(dossier.value, uids, vers)
    uids.forEach((uid) => memoire.messages.delete(`${dossier.value}:${uid}`))
    notifier(`Déplacé vers « ${dossiers.value.find((d) => d.chemin === vers)?.libelle || vers} ».`)
    if (ouvert.value && uids.includes(ouvert.value.uid)) ouvert.value = null
    toutRecharger()
  } catch (e) { notifier(e.message, 'erreur') }
}

function basculerSelection(uid) {
  selection.value = selection.value.includes(uid) ? selection.value.filter((x) => x !== uid) : [...selection.value, uid]
}
function toutCocher() { selection.value = tousCoches.value ? [] : liste.value.messages.map((m) => m.uid) }

// ---------- Pièces jointes ----------
async function piece(p, mode) {
  pieceEnCours.value = `${p.index}:${mode}`
  try {
    const fichier = await lirePieceJointe(dossier.value, ouvert.value.uid, p.index)
    const url = URL.createObjectURL(versBlob(fichier))
    if (mode === 'visualiser') { fermerApercuPdf(); apercuPdf.value = { url, fichier: fichier.nom } }
    else {
      const a = Object.assign(document.createElement('a'), { href: url, download: fichier.nom })
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30000)
    }
  } catch (e) { notifier(e.message, 'erreur') } finally { pieceEnCours.value = null }
}
const estPdf = (p) => /pdf/i.test(p.type) || /\.pdf$/i.test(p.nom)

// ---------- Rédaction ----------
const adresseTexte = (a) => (a?.nom ? `${a.nom} <${a.email}>` : a?.email || '')
const dateLongue = (d) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' }) : '')
const citer = (texte) => texte.split('\n').map((l) => `> ${l}`).join('\n')
const prefixer = (prefixe, objet) => (new RegExp(`^${prefixe}\\s*:`, 'i').test(objet) ? objet : `${prefixe} : ${objet}`)

function nouveau() { brouillon.value = { texte: SIGNATURE } }
function repondre(tous = false) {
  const o = ouvert.value
  const destinataire = (o.repondreA?.length ? o.repondreA : [o.de]).map((x) => x.email)
  const autres = tous ? [...o.a, ...o.cc].map((x) => x.email).filter((e) => e && e.toLowerCase() !== MOI && !destinataire.includes(e)) : []
  brouillon.value = {
    a: destinataire.join(', '), cc: autres.join(', '), objet: prefixer('Re', o.objet),
    texte: `${SIGNATURE}\n\nLe ${dateLongue(o.date)}, ${adresseTexte(o.de)} a écrit :\n${citer(o.texte || '')}`,
    enReponseA: { messageId: o.messageId, references: o.references, dossier: dossier.value, uid: o.uid }
  }
}
async function transferer() {
  const o = ouvert.value
  const pieces = []
  try {
    for (const p of o.piecesJointes) { const f = await lirePieceJointe(dossier.value, o.uid, p.index); pieces.push({ ...f, taille: p.taille }) }
  } catch (e) { notifier(`Pièces jointes non reprises : ${e.message}`, 'erreur') }
  brouillon.value = {
    transfert: true, objet: prefixer('Tr', o.objet), pieces,
    texte: `${SIGNATURE}\n\n---------- Message transféré ----------\nDe : ${adresseTexte(o.de)}\nDate : ${dateLongue(o.date)}\nObjet : ${o.objet}\nÀ : ${o.a.map(adresseTexte).join(', ')}\n\n${o.texte || ''}`
  }
}
function apresEnvoi() {
  brouillon.value = null
  notifier('Message envoyé.')
  toutRecharger()
}

// ---------- Affichage ----------
const contientImagesDistantes = computed(() => /<img[^>]+src=["']?https?:/i.test(ouvert.value?.html || ''))
// Cadre isolé (sandbox sans scripts) : liens ouverts dans un nouvel onglet, images distantes seulement sur demande
const documentHtml = computed(() => {
  const html = ouvert.value?.html
  if (!html) return ''
  const images = imagesDistantes.value ? 'data: https: http:' : 'data:'
  const masquer = imagesDistantes.value ? '' : 'img[src^="http"]{display:none}' // pas d'icône d'image cassée tant qu'elles sont bloquées
  // les « target » propres au message sont retirés : tous les liens suivent <base target="_blank"> (un lien qui voudrait
  // s'ouvrir dans le cadre ou la page serait bloqué par l'isolation, et le clic ne ferait rien)
  const corps = html.replace(/(<a\b[^>]*?)\s+target\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '$1')
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${images}; style-src 'unsafe-inline'; font-src data:"><base target="_blank"><style>body{margin:0;padding:18px 20px;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0f172a;word-wrap:break-word}img{max-width:100%;height:auto}table{max-width:100%}a{color:#0e7490}${masquer}</style></head><body>${corps}</body></html>`
})

// Message en texte brut : adresses web et e-mails rendus cliquables (découpage en morceaux, aucun HTML injecté).
// Lien vers le site BTM → ouvert dans l'admin ; autre site → nouvel onglet ; adresse e-mail → nouveau message ici même.
const MOTIF_LIEN = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/gi
function versLien(brut) {
  if (!/^(https?:|www\.)/i.test(brut)) return { texte: brut, email: brut }
  const url = /^www\./i.test(brut) ? `https://${brut}` : brut
  try {
    const u = new URL(url)
    if (u.host === window.location.host || /^(www\.)?btm\.yt$/i.test(u.host)) return { texte: brut, route: u.pathname + u.search + u.hash }
    return { texte: brut, href: u.href }
  } catch { return { texte: brut } }
}
const morceauxTexte = computed(() => {
  const texte = ouvert.value?.texte || '(message vide)'
  const morceaux = []
  let fin = 0
  for (const m of texte.matchAll(MOTIF_LIEN)) {
    const brut = m[0].replace(/[.,;:!?)\]»]+$/, '') // ponctuation de fin de phrase laissée hors du lien
    if (m.index > fin) morceaux.push({ texte: texte.slice(fin, m.index) })
    morceaux.push(versLien(brut))
    fin = m.index + brut.length
  }
  if (fin < texte.length) morceaux.push({ texte: texte.slice(fin) })
  return morceaux
})
const ecrireA = (email) => { brouillon.value = { a: email, texte: SIGNATURE } }

function dateCourte(d) {
  if (!d) return ''
  const date = new Date(d), maintenant = new Date()
  if (date.toDateString() === maintenant.toDateString()) return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (date.getFullYear() === maintenant.getFullYear()) return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  return date.toLocaleDateString('fr-FR')
}
const tailleLisible = (o) => (o > 1024 * 1024 ? `${(o / 1024 / 1024).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`)
const initiale = (a) => (a?.nom || a?.email || '?').trim().charAt(0).toUpperCase()

watch(dossier, () => { selection.value = [] })
</script>

<template>
  <div class="messagerie" :class="{ 'lecture-ouverte': ouvert }">
    <!-- Dossiers -->
    <aside class="mg-dossiers adm-carte">
      <button type="button" class="adm-btn adm-btn-noir mg-nouveau" @click="nouveau"><i class="fa-solid fa-pen" aria-hidden="true"></i> Nouveau message</button>
      <nav aria-label="Dossiers">
        <button v-for="d in dossiers" :key="d.chemin" type="button" class="mg-dossier" :class="{ actif: d.chemin === dossier }" @click="choisirDossier(d.chemin)">
          <i :class="ICONES[d.cle] || 'fa-regular fa-folder'" aria-hidden="true"></i><span>{{ d.libelle }}</span>
          <strong v-if="d.nonLus" class="mg-compteur">{{ d.nonLus }}</strong>
        </button>
      </nav>
      <p class="mg-boite"><i class="fa-solid fa-at" aria-hidden="true"></i> contact@btm.yt</p>
    </aside>

    <!-- Liste -->
    <section class="mg-liste adm-carte" aria-label="Messages">
      <form class="mg-recherche" role="search" @submit.prevent="rechercher">
        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
        <input v-model="recherche" type="search" placeholder="Rechercher (expéditeur, objet, texte)" aria-label="Rechercher dans les messages" />
        <button v-if="rechercheActive" type="button" class="mg-lien" @click="effacerRecherche">Effacer</button>
      </form>

      <div class="mg-outils">
        <input type="checkbox" :checked="tousCoches" :indeterminate="selection.length > 0 && !tousCoches" aria-label="Tout sélectionner" @change="toutCocher" />
        <template v-if="selection.length">
          <span class="mg-nb">{{ selection.length }} sélectionné{{ selection.length > 1 ? 's' : '' }}</span>
          <button type="button" class="adm-icone-btn" title="Marquer comme lu" aria-label="Marquer comme lu" @click="marquer({ lu: true })"><i class="fa-regular fa-envelope-open" aria-hidden="true"></i></button>
          <button type="button" class="adm-icone-btn" title="Marquer comme non lu" aria-label="Marquer comme non lu" @click="marquer({ lu: false })"><i class="fa-solid fa-envelope" aria-hidden="true"></i></button>
          <button type="button" class="adm-icone-btn danger" :title="estCorbeille ? 'Supprimer définitivement' : 'Mettre à la corbeille'" :aria-label="estCorbeille ? 'Supprimer définitivement' : 'Mettre à la corbeille'" @click="supprimer()"><i class="fa-regular fa-trash-can" aria-hidden="true"></i></button>
        </template>
        <span v-else class="mg-nb">{{ dossierActif?.libelle }}<template v-if="liste.total"> · {{ liste.total }}</template></span>
        <button type="button" class="adm-icone-btn mg-actualiser" title="Actualiser" aria-label="Actualiser" :disabled="chargementListe" @click="toutRecharger"><i class="fa-solid fa-rotate-right" :class="{ 'fa-spin': chargementListe }" aria-hidden="true"></i></button>
      </div>

      <p v-if="erreur" class="mg-erreur" role="alert"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> {{ erreur }}</p>
      <div v-else-if="chargementListe && !liste.messages.length" class="mg-vide"><span class="spinner"></span></div>
      <p v-else-if="!liste.messages.length" class="mg-vide">{{ rechercheActive ? 'Aucun message ne correspond.' : 'Aucun message.' }}</p>

      <ul v-else class="mg-messages">
        <li v-for="m in liste.messages" :key="m.uid" class="mg-message" :class="{ 'non-lu': !m.lu, actif: ouvert?.uid === m.uid, coche: selection.includes(m.uid) }">
          <input type="checkbox" :checked="selection.includes(m.uid)" :aria-label="`Sélectionner « ${m.objet} »`" @change="basculerSelection(m.uid)" />
          <button type="button" class="mg-message-corps" @click="ouvrir(m)">
            <span class="mg-de">{{ dossierActif?.cle === 'envoyes' ? `À : ${m.a[0]?.nom || m.a[0]?.email || ''}` : m.de.nom || m.de.email }}</span>
            <span class="mg-date">{{ dateCourte(m.date) }}</span>
            <span class="mg-objet">
              <i v-if="m.repondu" class="fa-solid fa-reply" title="Répondu" aria-hidden="true"></i>
              {{ m.objet }}
            </span>
            <span class="mg-icones">
              <i v-if="m.piecesJointes" class="fa-solid fa-paperclip" title="Pièce jointe" aria-hidden="true"></i>
            </span>
          </button>
          <button type="button" class="mg-etoile" :class="{ on: m.important }" :aria-label="m.important ? 'Retirer des importants' : 'Marquer comme important'" @click="marquer({ important: !m.important }, m.uid)"><i :class="m.important ? 'fa-solid fa-star' : 'fa-regular fa-star'" aria-hidden="true"></i></button>
        </li>
      </ul>

      <div v-if="liste.pages > 1" class="mg-pages">
        <button type="button" class="adm-icone-btn" :disabled="liste.page <= 1 || chargementListe" aria-label="Page précédente" @click="chargerListe(liste.page - 1)"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
        <span>Page {{ liste.page }} / {{ liste.pages }}</span>
        <button type="button" class="adm-icone-btn" :disabled="liste.page >= liste.pages || chargementListe" aria-label="Page suivante" @click="chargerListe(liste.page + 1)"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
      </div>
    </section>

    <!-- Lecture -->
    <section class="mg-lecture adm-carte" aria-label="Lecture du message">
      <div v-if="!ouvert" class="mg-lecture-vide">
        <i class="fa-regular fa-envelope-open" aria-hidden="true"></i>
        <p>Choisissez un message pour le lire.</p>
      </div>
      <template v-else>
        <div class="mg-actions">
          <button type="button" class="adm-icone-btn mg-retour" aria-label="Retour à la liste" @click="ouvert = null"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button>
          <button type="button" class="adm-btn adm-btn-clair adm-btn-sm" :disabled="ouvert.partiel" @click="repondre(false)"><i class="fa-solid fa-reply" aria-hidden="true"></i> Répondre</button>
          <button type="button" class="adm-btn adm-btn-clair adm-btn-sm" :disabled="ouvert.partiel" @click="repondre(true)"><i class="fa-solid fa-reply-all" aria-hidden="true"></i> <span class="mg-txt">Répondre à tous</span></button>
          <button type="button" class="adm-btn adm-btn-clair adm-btn-sm" :disabled="ouvert.partiel" @click="transferer"><i class="fa-solid fa-share" aria-hidden="true"></i> <span class="mg-txt">Transférer</span></button>
          <span class="mg-espace"></span>
          <button type="button" class="adm-icone-btn" :title="ouvert.important ? 'Retirer des importants' : 'Important'" :aria-label="ouvert.important ? 'Retirer des importants' : 'Marquer comme important'" @click="marquer({ important: !ouvert.important }, ouvert.uid)"><i :class="ouvert.important ? 'fa-solid fa-star mg-jaune' : 'fa-regular fa-star'" aria-hidden="true"></i></button>
          <button type="button" class="adm-icone-btn" title="Marquer comme non lu" aria-label="Marquer comme non lu" @click="marquer({ lu: false }, ouvert.uid); ouvert = null"><i class="fa-solid fa-envelope" aria-hidden="true"></i></button>
          <select class="mg-deplacer" aria-label="Déplacer vers" @change="deplacer($event.target.value, ouvert.uid); $event.target.value = ''">
            <option value="">Déplacer…</option>
            <option v-for="d in autresDossiers" :key="d.chemin" :value="d.chemin">{{ d.libelle }}</option>
          </select>
          <button type="button" class="adm-icone-btn danger" :title="estCorbeille ? 'Supprimer définitivement' : 'Mettre à la corbeille'" :aria-label="estCorbeille ? 'Supprimer définitivement' : 'Mettre à la corbeille'" @click="supprimer(ouvert.uid)"><i class="fa-regular fa-trash-can" aria-hidden="true"></i></button>
        </div>

        <header class="mg-entete">
          <h2>{{ ouvert.objet }}</h2>
          <div class="mg-expediteur">
            <span class="adm-avatar rond">{{ initiale(ouvert.de) }}</span>
            <div>
              <strong>{{ ouvert.de.nom || ouvert.de.email }}</strong> <small v-if="ouvert.de.nom">&lt;{{ ouvert.de.email }}&gt;</small>
              <p>À : {{ ouvert.a.map(adresseTexte).join(', ') || '—' }}<template v-if="ouvert.cc.length"> · Cc : {{ ouvert.cc.map(adresseTexte).join(', ') }}</template></p>
            </div>
            <time :datetime="ouvert.date">{{ dateLongue(ouvert.date) }}</time>
          </div>
        </header>

        <p v-if="contientImagesDistantes && !imagesDistantes" class="mg-images">
          <i class="fa-regular fa-image" aria-hidden="true"></i> Images distantes masquées pour votre confidentialité.
          <button type="button" class="mg-lien" @click="imagesDistantes = true">Afficher les images</button>
        </p>

        <div v-if="chargementMessage && ouvert.partiel" class="mg-corps-attente"><span class="spinner spinner-grand" aria-hidden="true"></span><span>Ouverture du message…</span></div>
        <iframe v-else-if="documentHtml" class="mg-corps-html" :srcdoc="documentHtml" sandbox="allow-popups allow-popups-to-escape-sandbox" :title="`Contenu du message « ${ouvert.objet} »`"></iframe>
        <!-- sur une seule ligne : dans <pre>, tout espace ou retour à la ligne du modèle s'afficherait -->
        <pre v-else class="mg-corps-texte"><template v-for="(p, i) in morceauxTexte" :key="i"><router-link v-if="p.route" :to="p.route">{{ p.texte }}</router-link><a v-else-if="p.href" :href="p.href" target="_blank" rel="noopener noreferrer">{{ p.texte }}</a><a v-else-if="p.email" :href="`mailto:${p.email}`" :title="`Écrire à ${p.email}`" @click.prevent="ecrireA(p.email)">{{ p.texte }}</a><template v-else>{{ p.texte }}</template></template></pre>

        <div v-if="ouvert.piecesJointes.length" class="mg-pieces">
          <p>{{ ouvert.piecesJointes.length }} pièce{{ ouvert.piecesJointes.length > 1 ? 's' : '' }} jointe{{ ouvert.piecesJointes.length > 1 ? 's' : '' }}</p>
          <ul>
            <li v-for="p in ouvert.piecesJointes" :key="p.index">
              <i :class="estPdf(p) ? 'fa-solid fa-file-pdf mg-rouge' : 'fa-regular fa-file'" aria-hidden="true"></i>
              <span class="mg-piece-nom" :title="p.nom">{{ p.nom }}<small>{{ tailleLisible(p.taille) }}</small></span>
              <button v-if="estPdf(p)" type="button" class="adm-icone-btn" title="Visualiser" :aria-label="`Visualiser ${p.nom}`" :disabled="!!pieceEnCours" @click="piece(p, 'visualiser')">
                <span v-if="pieceEnCours === `${p.index}:visualiser`" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-eye" aria-hidden="true"></i>
              </button>
              <button type="button" class="adm-icone-btn" title="Télécharger" :aria-label="`Télécharger ${p.nom}`" :disabled="!!pieceEnCours" @click="piece(p, 'telecharger')">
                <span v-if="pieceEnCours === `${p.index}:telecharger`" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-download" aria-hidden="true"></i>
              </button>
            </li>
          </ul>
        </div>
      </template>
    </section>

    <MessagerieRedaction v-if="brouillon" :brouillon="brouillon" @fermer="brouillon = null" @envoye="apresEnvoi" />
  </div>
</template>

<style scoped>
.messagerie { display: grid; grid-template-columns: 1fr; gap: 14px; min-height: 0; }
@media (min-width: 1024px) {
  .messagerie { grid-template-columns: 220px minmax(320px, 400px) minmax(0, 1fr); height: 100%; }
  .messagerie > * { min-height: 0; }
}

/* Dossiers */
.mg-dossiers { display: flex; flex-direction: column; gap: 4px; padding: 14px; }
.mg-nouveau { justify-content: center; margin-bottom: 10px; }
.mg-dossiers nav { display: flex; flex-direction: column; gap: 2px; }
.mg-dossier { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 40px; padding: 0 12px; border: 0; border-radius: 12px; background: transparent; color: var(--adm-encre-2); font: inherit; font-size: .9rem; text-align: left; cursor: pointer; }
.mg-dossier i { width: 18px; color: var(--adm-muet); }
.mg-dossier span { flex: 1; }
.mg-dossier:hover { background: var(--adm-ligne-2); color: var(--adm-encre); }
.mg-dossier.actif { background: var(--adm-accent-doux); color: var(--lagon-800); font-weight: 600; }
.mg-dossier.actif i { color: var(--lagon-700); }
.mg-compteur { min-width: 22px; padding: 1px 7px; border-radius: 999px; background: var(--adm-accent); color: #fff; font-size: .74rem; text-align: center; }
.mg-boite { margin: auto 0 0; padding: 12px 8px 0; color: var(--adm-muet); font-size: .8rem; }

/* Liste */
.mg-liste { display: flex; flex-direction: column; min-height: 320px; overflow: hidden; }
.mg-recherche { display: flex; align-items: center; gap: 10px; margin: 12px 12px 4px; padding: 0 14px; border-radius: 12px; background: var(--adm-ligne-2); color: var(--adm-muet); }
.mg-recherche input { flex: 1; min-width: 0; min-height: 40px; border: 0; outline: 0; background: transparent; color: var(--adm-encre); font: inherit; font-size: .88rem; }
.mg-outils { display: flex; align-items: center; gap: 4px; padding: 4px 12px 6px 18px; border-bottom: 1px solid var(--adm-ligne); }
.mg-nb { flex: 1; margin-left: 8px; color: var(--adm-muet); font-size: .82rem; }
.mg-messages { flex: 1; margin: 0; padding: 0; overflow-y: auto; list-style: none; }
.mg-message { display: flex; align-items: flex-start; gap: 8px; padding: 10px 10px 10px 18px; border-bottom: 1px solid var(--adm-ligne-2); }
.mg-message:hover { background: #fafbfc; }
.mg-message.actif { background: var(--adm-accent-doux); }
.mg-message.coche { background: #f1f5f9; }
.mg-message > input { margin-top: 4px; }
.mg-message-corps { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 10px; flex: 1; min-width: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.mg-de { overflow: hidden; color: var(--adm-encre-2); font-size: .88rem; text-overflow: ellipsis; white-space: nowrap; }
.mg-date { color: var(--adm-muet); font-size: .76rem; white-space: nowrap; }
.mg-objet { overflow: hidden; color: var(--adm-encre-2); font-size: .84rem; text-overflow: ellipsis; white-space: nowrap; }
.mg-objet i { margin-right: 4px; color: var(--adm-muet); font-size: .74rem; }
.mg-icones { color: var(--adm-muet); font-size: .78rem; text-align: right; }
.mg-message.non-lu .mg-de, .mg-message.non-lu .mg-objet { color: var(--adm-encre); font-weight: 700; }
.mg-message.non-lu { box-shadow: inset 3px 0 0 var(--adm-accent); }
.mg-etoile { width: 28px; height: 28px; flex: none; border: 0; border-radius: 50%; background: none; color: #cbd5e1; cursor: pointer; }
.mg-etoile:hover, .mg-etoile.on { color: #f59e0b; }
.mg-pages { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 8px; border-top: 1px solid var(--adm-ligne); color: var(--adm-muet); font-size: .84rem; }
.mg-vide { display: grid; place-items: center; flex: 1; min-height: 160px; margin: 0; color: var(--adm-muet); font-size: .9rem; }
.mg-erreur { display: flex; gap: 10px; margin: 14px; padding: 12px 14px; border-radius: 12px; background: #fff1f2; color: var(--adm-baisse); font-size: .88rem; line-height: 1.45; }
.mg-lien { border: 0; background: none; color: var(--adm-accent); font: inherit; font-size: .84rem; font-weight: 600; cursor: pointer; }

/* Lecture */
.mg-lecture { display: flex; flex-direction: column; min-height: 420px; overflow: hidden; }
.mg-lecture-vide { display: grid; place-content: center; justify-items: center; gap: 10px; flex: 1; color: var(--adm-muet); }
.mg-lecture-vide i { font-size: 2.4rem; opacity: .5; }
.mg-lecture-vide p { margin: 0; }
.mg-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 10px 14px; border-bottom: 1px solid var(--adm-ligne); }
.mg-espace { flex: 1; }
.mg-retour { display: none; }
.mg-deplacer { min-height: 34px; padding: 0 10px; border: 1px solid var(--adm-ligne); border-radius: 10px; background: #fff; color: var(--adm-encre-2); font: inherit; font-size: .84rem; }
.mg-jaune { color: #f59e0b; }
.mg-entete { padding: 16px 20px 12px; border-bottom: 1px solid var(--adm-ligne-2); }
.mg-entete h2 { margin: 0 0 12px; font-family: var(--font-corps); font-size: 1.2rem; font-weight: 700; line-height: 1.3; }
.mg-expediteur { display: flex; align-items: flex-start; gap: 12px; }
.mg-expediteur > div { flex: 1; min-width: 0; font-size: .9rem; }
.mg-expediteur small { color: var(--adm-muet); }
.mg-expediteur p { margin: 2px 0 0; overflow: hidden; color: var(--adm-muet); font-size: .8rem; text-overflow: ellipsis; white-space: nowrap; }
.mg-expediteur time { color: var(--adm-muet); font-size: .78rem; white-space: nowrap; }
.mg-images { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0; padding: 8px 20px; background: #fffbeb; color: #92400e; font-size: .82rem; }
.mg-corps-attente { display: grid; place-content: center; justify-items: center; gap: 10px; flex: 1; color: var(--adm-muet); font-size: .88rem; }
.mg-corps-html { flex: 1; width: 100%; min-height: 300px; border: 0; background: #fff; }
.mg-corps-texte { flex: 1; margin: 0; padding: 18px 20px; overflow: auto; color: var(--adm-encre); font: inherit; font-size: .93rem; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
.mg-corps-texte a { color: var(--adm-accent); text-decoration: underline; text-underline-offset: 2px; }
.mg-pieces { padding: 12px 20px 16px; border-top: 1px solid var(--adm-ligne); }
.mg-pieces > p { margin: 0 0 8px; color: var(--adm-muet); font-size: .8rem; font-weight: 600; }
.mg-pieces ul { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
.mg-pieces li { display: flex; align-items: center; gap: 6px; max-width: 100%; padding: 4px 4px 4px 12px; border: 1px solid var(--adm-ligne); border-radius: 12px; }
.mg-piece-nom { display: flex; flex-direction: column; min-width: 0; max-width: 220px; overflow: hidden; font-size: .84rem; text-overflow: ellipsis; white-space: nowrap; }
.mg-piece-nom small { color: var(--adm-muet); font-size: .74rem; }
.mg-rouge { color: #dc2626; }
.mg-pieces .spinner, .mg-outils .spinner { width: 14px; height: 14px; border-width: 2px; }

/* Téléphone et tablette : une colonne à la fois (dossiers + liste, puis la lecture) */
@media (max-width: 1023px) {
  .mg-dossiers { flex-direction: row; flex-wrap: wrap; align-items: center; }
  .mg-dossiers nav { flex-direction: row; flex-wrap: wrap; }
  .mg-nouveau { margin: 0 6px 0 0; }
  .mg-dossier { width: auto; }
  .mg-boite { display: none; }
  .mg-lecture { display: none; }
  .lecture-ouverte .mg-lecture { display: flex; }
  .lecture-ouverte .mg-liste, .lecture-ouverte .mg-dossiers { display: none; }
  .mg-retour { display: inline-grid; }
}
@media (max-width: 560px) { .mg-txt { display: none; } }
</style>

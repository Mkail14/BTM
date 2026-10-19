<script setup>
/**
 * Messagerie de contact@btm.yt : dossiers | liste des messages | lecture.
 * Lire, répondre, répondre à tous, transférer, écrire, marquer lu / non lu / important, déplacer, supprimer,
 * pièces jointes (téléchargement, aperçu des PDF). Le contenu HTML des e-mails est affiché dans un cadre isolé
 * (aucun script ; les images distantes sont affichées directement).
 *
 * Rapidité : la dernière liste de chaque dossier s'affiche tout de suite (mémoire + appareil), les messages récents
 * sont préchargés (sans être marqués lus) pour s'ouvrir instantanément, la liste se met à jour seule toutes les
 * 30 secondes et au retour sur l'onglet, et suppressions / déplacements s'affichent avant la réponse du serveur.
 * Téléphone : présentation de Gmail (dossiers en tiroir, avatars à toucher pour sélectionner, bouton « Nouveau »
 * flottant, lecture en plein écran avec Répondre / Transférer en bas).
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAdmin } from '@/composables/useAdmin.js'
import { useMessagerie } from '@/composables/useMessagerie.js'
import { apercuPdf, fermerApercuPdf } from '@/services/export/livrerPdf.js'
import {
  ouvrirBoite, listerMessages, lireMessage, lireMessages, lirePieceJointe, marquerMessages, deplacerMessages, supprimerMessages, versBlob
} from '@/services/supabase/serviceMessagerie.js'
import MessagerieRedaction from './MessagerieRedaction.vue'

const { notifier, confirmer } = useAdmin()
const { nonLus, majDepuisDossiers, memoire, memoriser, sauverMemoire, LISTE_VIDE } = useMessagerie()
const MOI = 'contact@btm.yt'
const SIGNATURE = '\n\n--\nL’équipe BTM — Bâtiment & Travaux Mayotte\nwww.btm.yt · contact@btm.yt'
const ACTUALISATION = 30000 // mise à jour automatique de la liste
const PRECHARGES = 12 // messages récents préchargés…
const PAR_LOT = 4 // …par appels de 4 (une seule connexion à la boîte par appel)
const TAILLE_PRECHARGEMENT = 1024 * 1024 // les messages plus lourds s'ouvrent à la demande

// gardés en mémoire (useMessagerie) : revenir dans la messagerie affiche tout de suite la dernière liste
const { dossiers, dossier, liste } = memoire
const tiroir = ref(false) // téléphone : tiroir des dossiers ouvert
const recherche = ref('')
const rechercheActive = ref('')
const ouvert = ref(null) // message affiché (en-tête tout de suite, contenu dès qu'il est arrivé)
const chargementListe = ref(false)
const chargementMessage = ref(false) // contenu du message en cours de chargement
const erreur = ref('')
const selection = ref([])
const brouillon = ref(null) // fenêtre de rédaction ouverte
const pieceEnCours = ref(null)

const dossierActif = computed(() => dossiers.value.find((d) => d.chemin === dossier.value))
const estCorbeille = computed(() => dossierActif.value?.cle === 'corbeille')
const autresDossiers = computed(() => dossiers.value.filter((d) => d.chemin !== dossier.value))
const tousCoches = computed(() => liste.value.messages.length > 0 && selection.value.length === liste.value.messages.length)
const ICONES = { reception: 'fa-solid fa-inbox', envoyes: 'fa-solid fa-paper-plane', brouillons: 'fa-regular fa-file-lines', indesirables: 'fa-solid fa-ban', corbeille: 'fa-regular fa-trash-can', archives: 'fa-solid fa-box-archive' }

// ---------- Chargements ----------
// Numéro de la dernière demande de liste : une réponse dépassée (changement de dossier, suppression entre-temps) est ignorée
let requete = 0
function invaliderListe() { requete++; chargementListe.value = false }

// Page 1 : dossiers + messages en un seul appel ; autres pages : la liste seule.
// « discret » (mise à jour automatique) : pas de message d'erreur tant qu'une liste est affichée.
async function actualiser(page = 1, { discret = false } = {}) {
  const n = ++requete
  const chemin = dossier.value, cherche = rechercheActive.value
  chargementListe.value = true
  if (!discret) erreur.value = ''
  try {
    let nouvelle
    if (page === 1) {
      const r = await ouvrirBoite(chemin, cherche)
      if (n !== requete) return
      dossiers.value = r.dossiers
      majDepuisDossiers(r.dossiers)
      nouvelle = r.liste
    } else {
      nouvelle = await listerMessages(chemin, page, cherche)
      if (n !== requete) return
    }
    liste.value = nouvelle
    erreur.value = ''
    if (!cherche) memoire.listes.set(chemin, nouvelle)
    memoire.chargee.value = true
    sauverMemoire()
    const presents = new Set(nouvelle.messages.map((m) => m.uid))
    selection.value = selection.value.filter((uid) => presents.has(uid))
    precharger()
  } catch (e) {
    if (n !== requete) return
    if (!discret || !liste.value.messages.length) erreur.value = e.message
  } finally {
    if (n === requete) chargementListe.value = false
  }
}
const chargerListe = actualiser
const toutRecharger = () => actualiser(liste.value.page)

// Mise à jour automatique : toutes les 30 s quand l'onglet est visible, et dès qu'on y revient
function actualiserEnFond() {
  if (!document.hidden && !chargementListe.value) actualiser(liste.value.page, { discret: true })
}
let minuterie
onMounted(() => {
  actualiser() // la liste en mémoire reste affichée pendant l'actualisation
  minuterie = setInterval(actualiserEnFond, ACTUALISATION)
  document.addEventListener('visibilitychange', actualiserEnFond)
  window.addEventListener('focus', actualiserEnFond)
})
onBeforeUnmount(() => {
  clearInterval(minuterie)
  document.removeEventListener('visibilitychange', actualiserEnFond)
  window.removeEventListener('focus', actualiserEnFond)
})

function choisirDossier(chemin) {
  tiroir.value = false
  if (chemin === dossier.value && !rechercheActive.value) { ouvert.value = null; return }
  dossier.value = chemin
  ouvert.value = null
  recherche.value = rechercheActive.value = ''
  liste.value = memoire.listes.get(chemin) || LISTE_VIDE() // dernière liste connue du dossier, tout de suite
  actualiser()
}

// ---------- Préchargement ----------
// Les messages récents sont lus à l'avance (sans les marquer comme lus) : leur ouverture est instantanée.
const prechargements = new Map() // clé du message → chargement en cours
let prechargementActif = false
let prechargementIndisponible = false // fonction serveur pas encore à jour : on n'insiste pas
async function precharger() {
  if (prechargementActif || prechargementIndisponible) return
  const chemin = dossier.value
  const aLire = liste.value.messages
    .filter((m) => m.taille <= TAILLE_PRECHARGEMENT && !memoire.messages.has(`${chemin}:${m.uid}`))
    .slice(0, PRECHARGES)
  if (!aLire.length) return
  prechargementActif = true
  try {
    for (let i = 0; i < aLire.length && dossier.value === chemin; i += PAR_LOT) {
      const lot = aLire.slice(i, i + PAR_LOT)
      const chargement = lireMessages(chemin, lot.map((m) => m.uid))
        .then((r) => {
          for (const c of r.messages || []) memoriser(`${chemin}:${c.uid}`, { ...c, important: lot.find((m) => m.uid === c.uid)?.important ?? false })
        })
        .catch((e) => { if (/action inconnue/i.test(e.message)) prechargementIndisponible = true })
      lot.forEach((m) => prechargements.set(`${chemin}:${m.uid}`, chargement))
      await chargement
      lot.forEach((m) => prechargements.delete(`${chemin}:${m.uid}`))
      if (prechargementIndisponible) break
    }
  } finally {
    prechargementActif = false
  }
}
function rechercher() { rechercheActive.value = recherche.value.trim(); actualiser() }
function effacerRecherche() { recherche.value = rechercheActive.value = ''; actualiser() }

/** Compteurs de non lus mis à jour sur place (sans recharger la boîte) */
function ajusterNonLus(ecart) {
  const d = dossierActif.value
  if (d) d.nonLus = Math.max(0, d.nonLus + ecart)
  if (d?.cle === 'reception') nonLus.value = Math.max(0, nonLus.value + ecart)
}

/** Message ouvert : marqué lu tout de suite à l'écran ; « serveur » quand la boîte ne l'a pas déjà fait (contenu préchargé) */
function marquerLu(m, serveur) {
  if (m.lu) return
  m.lu = true
  ajusterNonLus(-1)
  if (serveur) marquerMessages(dossier.value, [m.uid], { lu: true }).catch(() => {})
}

async function ouvrir(m) {
  const chemin = dossier.value, cle = `${chemin}:${m.uid}`
  const enMemoire = memoire.messages.get(cle)
  if (enMemoire) { ouvert.value = enMemoire; marquerLu(m, true); return }
  // en-tête connu par la liste : affiché tout de suite, le contenu suit
  ouvert.value = { ...m, cc: [], repondreA: [], texte: '', html: '', piecesJointes: [], partiel: true }
  chargementMessage.value = true
  try {
    // déjà en cours de préchargement : on attend ce chargement plutôt que d'en lancer un second
    await prechargements.get(cle)
    let complet = memoire.messages.get(cle)
    if (complet) marquerLu(m, true)
    else {
      complet = { ...(await lireMessage(chemin, m.uid)), important: m.important }
      memoriser(cle, complet)
      marquerLu(m, false)
    }
    if (ouvert.value?.uid === m.uid && dossier.value === chemin) ouvert.value = complet
  } catch (e) {
    if (ouvert.value?.uid === m.uid) ouvert.value = null
    notifier(e.message, 'erreur')
  } finally {
    chargementMessage.value = false
  }
}

// ---------- Actions ----------
// Affichées tout de suite ; si la boîte refuse, l'écran revient à l'état précédent.
const uidsVises = (uid) => (uid ? [uid] : selection.value)

async function marquer(etat, uid) {
  const uids = uidsVises(uid)
  if (!uids.length) return
  const chemin = dossier.value
  const avant = []
  const appliquer = (m, e) => {
    if ('lu' in e && m.lu !== e.lu) ajusterNonLus(e.lu ? -1 : 1)
    Object.assign(m, e)
    const enMemoire = memoire.messages.get(`${chemin}:${m.uid}`)
    if (enMemoire && 'important' in e) enMemoire.important = e.important
    if (ouvert.value?.uid === m.uid && 'important' in e) ouvert.value.important = e.important
  }
  for (const m of liste.value.messages) {
    if (!uids.includes(m.uid)) continue
    avant.push([m, Object.fromEntries(Object.keys(etat).map((k) => [k, m[k]]))])
    appliquer(m, etat)
  }
  selection.value = []
  sauverMemoire()
  try {
    await marquerMessages(chemin, uids, etat)
  } catch (e) {
    avant.forEach(([m, ancien]) => appliquer(m, ancien))
    notifier(e.message, 'erreur')
  }
}

/** Retire des messages de la liste affichée ; renvoie de quoi les remettre si la boîte refuse */
function retirerDeLaListe(uids) {
  invaliderListe() // une actualisation partie avant ne doit pas les faire réapparaître
  const precedente = liste.value
  const retires = precedente.messages.filter((m) => uids.includes(m.uid))
  const nonLusRetires = retires.filter((m) => !m.lu).length
  liste.value = { ...precedente, messages: precedente.messages.filter((m) => !uids.includes(m.uid)), total: Math.max(0, precedente.total - retires.length) }
  if (nonLusRetires) ajusterNonLus(-nonLusRetires)
  if (ouvert.value && uids.includes(ouvert.value.uid)) ouvert.value = null
  selection.value = []
  return () => { liste.value = precedente; if (nonLusRetires) ajusterNonLus(nonLusRetires) }
}

async function supprimer(uid) {
  const uids = uidsVises(uid)
  if (!uids.length) return
  if (estCorbeille.value && !(await confirmer({ titre: 'Supprimer définitivement ?', texte: `${uids.length > 1 ? `${uids.length} messages seront effacés` : 'Ce message sera effacé'} pour toujours.`, libelle: 'Supprimer', danger: true }))) return
  const chemin = dossier.value
  const remettre = retirerDeLaListe(uids)
  try {
    const r = await supprimerMessages(chemin, uids)
    uids.forEach((uid) => memoire.messages.delete(`${chemin}:${uid}`))
    notifier(r.definitif ? 'Supprimé définitivement.' : uids.length > 1 ? `${uids.length} messages mis à la corbeille.` : 'Message mis à la corbeille.')
    toutRecharger() // complète la page et met à jour les compteurs des dossiers
  } catch (e) { remettre(); notifier(e.message, 'erreur') }
}

async function deplacer(vers, uid) {
  const uids = uidsVises(uid)
  if (!uids.length || !vers) return
  const chemin = dossier.value
  const remettre = retirerDeLaListe(uids)
  try {
    await deplacerMessages(chemin, uids, vers)
    uids.forEach((uid) => memoire.messages.delete(`${chemin}:${uid}`))
    notifier(`Déplacé vers « ${dossiers.value.find((d) => d.chemin === vers)?.libelle || vers} ».`)
    toutRecharger()
  } catch (e) { remettre(); notifier(e.message, 'erreur') }
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
// Cadre isolé (sandbox sans scripts) : liens ouverts dans un nouvel onglet, images distantes affichées d'office
const documentHtml = computed(() => {
  const html = ouvert.value?.html
  if (!html) return ''
  // les « target » propres au message sont retirés : tous les liens suivent <base target="_blank"> (un lien qui voudrait
  // s'ouvrir dans le cadre ou la page serait bloqué par l'isolation, et le clic ne ferait rien)
  const corps = html.replace(/(<a\b[^>]*?)\s+target\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '$1')
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; font-src data:"><base target="_blank"><style>body{margin:0;padding:18px 20px;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0f172a;word-wrap:break-word}img{max-width:100%;height:auto}table{max-width:100%}a{color:#0e7490}</style></head><body>${corps}</body></html>`
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
// Liste : l'expéditeur, ou le destinataire dans « Envoyés »
const correspondant = (m) => (dossierActif.value?.cle === 'envoyes' ? m.a[0] : m.de) || { nom: '', email: '' }
// Avatar (téléphone) : une couleur stable par adresse, comme dans Gmail
function couleur(a) {
  let h = 0
  for (const c of (a?.email || a?.nom || '?').toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360
  return `hsl(${h} 45% 46%)`
}

watch(dossier, () => { selection.value = [] })
</script>

<template>
  <div class="messagerie" :class="{ 'lecture-ouverte': ouvert, 'tiroir-ouvert': tiroir }">
    <!-- Dossiers (téléphone : tiroir) -->
    <aside class="mg-dossiers adm-carte" @keydown.esc="tiroir = false">
      <div class="mg-tiroir-tete">
        <strong><i class="fa-solid fa-at" aria-hidden="true"></i> contact@btm.yt</strong>
        <button type="button" class="adm-icone-btn" aria-label="Fermer les dossiers" @click="tiroir = false"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      </div>
      <button type="button" class="adm-btn adm-btn-noir mg-nouveau" @click="tiroir = false; nouveau()"><i class="fa-solid fa-pen" aria-hidden="true"></i> Nouveau message</button>
      <nav aria-label="Dossiers">
        <button v-for="d in dossiers" :key="d.chemin" type="button" class="mg-dossier" :class="{ actif: d.chemin === dossier }" @click="choisirDossier(d.chemin)">
          <i :class="ICONES[d.cle] || 'fa-regular fa-folder'" aria-hidden="true"></i><span>{{ d.libelle }}</span>
          <strong v-if="d.nonLus" class="mg-compteur">{{ d.nonLus }}</strong>
        </button>
      </nav>
      <p class="mg-boite"><i class="fa-solid fa-at" aria-hidden="true"></i> contact@btm.yt</p>
    </aside>
    <div v-if="tiroir" class="mg-voile" aria-hidden="true" @click="tiroir = false"></div>

    <!-- Liste -->
    <section class="mg-liste adm-carte" aria-label="Messages">
      <form class="mg-recherche" role="search" @submit.prevent="rechercher">
        <button type="button" class="mg-ouvrir-tiroir" aria-label="Dossiers" :aria-expanded="tiroir" @click="tiroir = true"><i class="fa-solid fa-bars-staggered" aria-hidden="true"></i></button>
        <i class="fa-solid fa-magnifying-glass mg-loupe" aria-hidden="true"></i>
        <input v-model="recherche" type="search" placeholder="Rechercher dans les messages" aria-label="Rechercher dans les messages" />
        <button v-if="rechercheActive" type="button" class="mg-lien" @click="effacerRecherche">Effacer</button>
      </form>

      <div class="mg-outils" :class="{ selection: selection.length }">
        <button v-if="selection.length" type="button" class="adm-icone-btn mg-annuler-selection" aria-label="Annuler la sélection" @click="selection = []"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        <input type="checkbox" class="mg-tout" :checked="tousCoches" :indeterminate="selection.length > 0 && !tousCoches" aria-label="Tout sélectionner" @change="toutCocher" />
        <template v-if="selection.length">
          <span class="mg-nb">{{ selection.length }} sélectionné{{ selection.length > 1 ? 's' : '' }}</span>
          <button type="button" class="adm-icone-btn" title="Marquer comme lu" aria-label="Marquer comme lu" @click="marquer({ lu: true })"><i class="fa-regular fa-envelope-open" aria-hidden="true"></i></button>
          <button type="button" class="adm-icone-btn" title="Marquer comme non lu" aria-label="Marquer comme non lu" @click="marquer({ lu: false })"><i class="fa-solid fa-envelope" aria-hidden="true"></i></button>
          <button type="button" class="adm-icone-btn danger" :title="estCorbeille ? 'Supprimer définitivement' : 'Mettre à la corbeille'" :aria-label="estCorbeille ? 'Supprimer définitivement' : 'Mettre à la corbeille'" @click="supprimer()"><i class="fa-regular fa-trash-can" aria-hidden="true"></i></button>
        </template>
        <template v-else>
          <span class="mg-nb">{{ dossierActif?.libelle }}<template v-if="liste.total"> · {{ liste.total }}</template></span>
          <button type="button" class="mg-choix-dossier" :aria-expanded="tiroir" @click="tiroir = true">
            {{ rechercheActive ? `Résultats pour « ${rechercheActive} »` : dossierActif?.libelle || 'Boîte de réception' }}<small v-if="liste.total"> · {{ liste.total }}</small>
            <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
          </button>
        </template>
        <button type="button" class="adm-icone-btn mg-actualiser" title="Actualiser" aria-label="Actualiser" :disabled="chargementListe" @click="toutRecharger"><i class="fa-solid fa-rotate-right" :class="{ 'fa-spin': chargementListe }" aria-hidden="true"></i></button>
      </div>

      <p v-if="erreur" class="mg-erreur" role="alert"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> {{ erreur }}</p>
      <div v-else-if="chargementListe && !liste.messages.length" class="mg-vide"><span class="spinner"></span></div>
      <p v-else-if="!liste.messages.length" class="mg-vide">{{ rechercheActive ? 'Aucun message ne correspond.' : 'Aucun message.' }}</p>

      <ul v-else class="mg-messages">
        <li v-for="m in liste.messages" :key="m.uid" class="mg-message" :class="{ 'non-lu': !m.lu, actif: ouvert?.uid === m.uid, coche: selection.includes(m.uid) }">
          <input type="checkbox" class="mg-case" :checked="selection.includes(m.uid)" :aria-label="`Sélectionner « ${m.objet} »`" @change="basculerSelection(m.uid)" />
          <!-- téléphone : l'avatar sert de case à cocher, comme dans Gmail -->
          <button type="button" class="mg-avatar" :style="selection.includes(m.uid) ? null : { background: couleur(correspondant(m)) }" :aria-pressed="selection.includes(m.uid)" :aria-label="`Sélectionner « ${m.objet} »`" @click="basculerSelection(m.uid)">
            <i v-if="selection.includes(m.uid)" class="fa-solid fa-check" aria-hidden="true"></i><template v-else>{{ initiale(correspondant(m)) }}</template>
          </button>
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

    <!-- Téléphone : bouton flottant « Nouveau », comme dans Gmail -->
    <button v-if="!ouvert && !brouillon && !tiroir" type="button" class="mg-fab" @click="nouveau"><i class="fa-solid fa-pen" aria-hidden="true"></i> Nouveau</button>

    <!-- Lecture (téléphone : plein écran) -->
    <section class="mg-lecture adm-carte" aria-label="Lecture du message">
      <div v-if="!ouvert" class="mg-lecture-vide">
        <i class="fa-regular fa-envelope-open" aria-hidden="true"></i>
        <p>Choisissez un message pour le lire.</p>
      </div>
      <template v-else>
        <div class="mg-actions">
          <button type="button" class="adm-icone-btn mg-retour" aria-label="Retour à la liste" @click="ouvert = null"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button>
          <button type="button" class="adm-btn adm-btn-clair adm-btn-sm" :disabled="ouvert.partiel" @click="repondre(false)"><i class="fa-solid fa-reply" aria-hidden="true"></i> Répondre</button>
          <button type="button" class="adm-btn adm-btn-clair adm-btn-sm" :disabled="ouvert.partiel" title="Répondre à tous" aria-label="Répondre à tous" @click="repondre(true)"><i class="fa-solid fa-reply-all" aria-hidden="true"></i> <span class="mg-txt">Répondre à tous</span></button>
          <button type="button" class="adm-btn adm-btn-clair adm-btn-sm" :disabled="ouvert.partiel" title="Transférer" aria-label="Transférer" @click="transferer"><i class="fa-solid fa-share" aria-hidden="true"></i> <span class="mg-txt">Transférer</span></button>
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
            <time :datetime="ouvert.date" :title="dateLongue(ouvert.date)"><span class="mg-date-longue">{{ dateLongue(ouvert.date) }}</span><span class="mg-date-courte">{{ dateCourte(ouvert.date) }}</span></time>
          </div>
        </header>


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

        <!-- Téléphone : réponses en bas de l'écran, à portée du pouce -->
        <div class="mg-reponses">
          <button type="button" :disabled="ouvert.partiel" @click="repondre(false)"><i class="fa-solid fa-reply" aria-hidden="true"></i> Répondre</button>
          <button type="button" :disabled="ouvert.partiel" @click="repondre(true)"><i class="fa-solid fa-reply-all" aria-hidden="true"></i> À tous</button>
          <button type="button" :disabled="ouvert.partiel" @click="transferer"><i class="fa-solid fa-share" aria-hidden="true"></i> Transférer</button>
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
.mg-dossier.actif { background: var(--adm-accent-doux); color: var(--adm-info-texte); font-weight: 600; }
.mg-dossier.actif i { color: var(--adm-info-texte); }
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
.mg-message:hover { background: var(--adm-survol); }
.mg-message.actif { background: var(--adm-accent-doux); }
.mg-message.coche { background: var(--adm-ligne-2); }
.mg-message > input { margin-top: 4px; }
.mg-message-corps { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 10px; flex: 1; min-width: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.mg-de { overflow: hidden; color: var(--adm-encre-2); font-size: .88rem; text-overflow: ellipsis; white-space: nowrap; }
.mg-date { color: var(--adm-muet); font-size: .76rem; white-space: nowrap; }
.mg-objet { overflow: hidden; color: var(--adm-encre-2); font-size: .84rem; text-overflow: ellipsis; white-space: nowrap; }
.mg-objet i { margin-right: 4px; color: var(--adm-muet); font-size: .74rem; }
.mg-icones { color: var(--adm-muet); font-size: .78rem; text-align: right; }
.mg-message.non-lu .mg-de, .mg-message.non-lu .mg-objet { color: var(--adm-encre); font-weight: 700; }
.mg-message.non-lu { box-shadow: inset 3px 0 0 var(--adm-accent); }
.mg-etoile { width: 28px; height: 28px; flex: none; border: 0; border-radius: 50%; background: none; color: var(--adm-ligne-forte); cursor: pointer; }
.mg-etoile:hover, .mg-etoile.on { color: #f59e0b; }
.mg-pages { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 8px; border-top: 1px solid var(--adm-ligne); color: var(--adm-muet); font-size: .84rem; }
.mg-vide { display: grid; place-items: center; flex: 1; min-height: 160px; margin: 0; color: var(--adm-muet); font-size: .9rem; }
.mg-erreur { display: flex; gap: 10px; margin: 14px; padding: 12px 14px; border-radius: 12px; background: var(--adm-danger-fond); color: var(--adm-baisse); font-size: .88rem; line-height: 1.45; }
.mg-lien { border: 0; background: none; color: var(--adm-accent); font: inherit; font-size: .84rem; font-weight: 600; cursor: pointer; }

/* Lecture */
.mg-lecture { display: flex; flex-direction: column; min-height: 420px; overflow: hidden; }
.mg-lecture-vide { display: grid; place-content: center; justify-items: center; gap: 10px; flex: 1; color: var(--adm-muet); }
.mg-lecture-vide i { font-size: 2.4rem; opacity: .5; }
.mg-lecture-vide p { margin: 0; }
.mg-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 10px 14px; border-bottom: 1px solid var(--adm-ligne); }
.mg-espace { flex: 1; }
.mg-retour { display: none; }
.mg-deplacer { min-height: 34px; padding: 0 10px; border: 1px solid var(--adm-ligne); border-radius: 10px; background: var(--adm-champ); color: var(--adm-encre-2); font: inherit; font-size: .84rem; }
.mg-jaune { color: #f59e0b; }
.mg-entete { padding: 16px 20px 12px; border-bottom: 1px solid var(--adm-ligne-2); }
.mg-entete h2 { margin: 0 0 12px; font-family: var(--font-corps); font-size: 1.2rem; font-weight: 700; line-height: 1.3; }
.mg-expediteur { display: flex; align-items: flex-start; gap: 12px; }
.mg-expediteur > div { flex: 1; min-width: 0; font-size: .9rem; }
.mg-expediteur small { color: var(--adm-muet); }
.mg-expediteur p { margin: 2px 0 0; overflow: hidden; color: var(--adm-muet); font-size: .8rem; text-overflow: ellipsis; white-space: nowrap; }
.mg-expediteur time { color: var(--adm-muet); font-size: .78rem; white-space: nowrap; }
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

/* Petit écran d'ordinateur : trois colonnes ne tiennent pas, le message ouvert prend la place de la liste */
@media (min-width: 1024px) and (max-width: 1399px) {
  .messagerie { grid-template-columns: 200px minmax(0, 1fr); }
  .mg-lecture { display: none; }
  .lecture-ouverte .mg-liste { display: none; }
  .lecture-ouverte .mg-lecture { display: flex; }
  .mg-retour { display: inline-grid; }
  .mg-txt { display: none; }
}

/* Éléments propres au téléphone */
.mg-tiroir-tete, .mg-voile, .mg-ouvrir-tiroir, .mg-choix-dossier, .mg-annuler-selection, .mg-avatar, .mg-fab, .mg-reponses, .mg-date-courte { display: none; }

/* Téléphone et tablette : présentation de Gmail */
@media (max-width: 1023px) {
  .messagerie { gap: 0; }

  /* Dossiers : tiroir glissant depuis la gauche */
  .mg-dossiers {
    position: fixed; top: 0; bottom: 0; left: 0; z-index: 290; width: min(300px, 86vw); padding: 14px 12px calc(14px + env(safe-area-inset-bottom));
    border-radius: 0 22px 22px 0; overflow-y: auto; overscroll-behavior: contain;
    transform: translateX(-105%); visibility: hidden; transition: transform .28s cubic-bezier(.22, .61, .36, 1), visibility 0s .28s;
  }
  .tiroir-ouvert .mg-dossiers { transform: none; visibility: visible; transition-delay: 0s; box-shadow: 0 30px 80px rgba(15, 23, 42, .35); }
  .mg-tiroir-tete { display: flex; align-items: center; justify-content: space-between; padding: 0 0 10px 8px; font-size: .9rem; }
  .mg-tiroir-tete i { margin-right: 6px; color: var(--adm-muet); }
  .mg-dossier { min-height: 46px; }
  .mg-boite { display: none; }
  .mg-voile { display: block; position: fixed; inset: 0; z-index: 285; background: rgba(15, 23, 42, .4); }

  /* Liste : barre de recherche arrondie qui reste en haut, lignes pleine largeur */
  .mg-liste { min-height: 0; padding-bottom: 84px; overflow: visible; border-radius: 0; background: transparent; box-shadow: none; }
  .mg-recherche { position: sticky; top: 8px; z-index: 6; min-height: 50px; margin: 0 0 4px; padding: 0 8px 0 4px; border-radius: 999px; background: var(--adm-carte); box-shadow: var(--adm-ombre); }
  .mg-recherche input { font-size: 1rem; } /* 16 px : pas de zoom automatique sur iPhone */
  .mg-loupe { display: none; }
  .mg-ouvrir-tiroir { display: grid; place-items: center; width: 42px; height: 42px; flex: none; border: 0; border-radius: 50%; background: transparent; color: var(--adm-encre-2); font-size: 1.05rem; cursor: pointer; }
  .mg-ouvrir-tiroir:hover { background: var(--adm-ligne-2); }
  .mg-outils { min-height: 44px; padding: 4px 4px 4px 6px; border-bottom: 0; }
  .mg-outils.selection { position: sticky; top: 64px; z-index: 5; margin-bottom: 6px; border-radius: 999px; background: var(--adm-carte); box-shadow: var(--adm-ombre); }
  .mg-outils:not(.selection) .mg-nb, .mg-tout { display: none; }
  .mg-annuler-selection { display: inline-grid; }
  .mg-choix-dossier {
    display: inline-flex; align-items: center; gap: 6px; flex: 1; min-width: 0; padding: 6px 8px; border: 0; background: none;
    color: var(--adm-muet); font: inherit; font-size: .76rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; text-align: left; cursor: pointer;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .mg-choix-dossier small { font-size: inherit; font-weight: 500; }
  .mg-choix-dossier i { font-size: .62rem; }
  .mg-messages { overflow: visible; border-radius: var(--adm-rayon-sm); background: var(--adm-carte); box-shadow: var(--adm-ombre); }
  .mg-message { align-items: center; gap: 12px; padding: 11px 6px 11px 12px; }
  .mg-message:first-child { border-radius: var(--adm-rayon-sm) var(--adm-rayon-sm) 0 0; }
  .mg-message:last-child { border-bottom: 0; border-radius: 0 0 var(--adm-rayon-sm) var(--adm-rayon-sm); }
  .mg-message.non-lu { box-shadow: none; }
  .mg-message.coche { background: var(--adm-accent-doux); }
  .mg-case { display: none; }
  .mg-avatar {
    display: grid; place-items: center; width: 40px; height: 40px; flex: none; border: 0; border-radius: 50%;
    background: var(--adm-accent); color: #fff; font: inherit; font-size: 1rem; font-weight: 600; cursor: pointer;
  }
  .mg-de { font-size: .95rem; }
  .mg-objet { font-size: .88rem; }
  .mg-message.non-lu .mg-date { color: var(--adm-encre); font-weight: 700; }
  .mg-etoile { width: 38px; height: 38px; }
  .mg-pages { border-top: 0; }
  .mg-vide, .mg-erreur { border-radius: var(--adm-rayon-sm); background: var(--adm-carte); }
  .mg-erreur { margin: 0 0 8px; background: var(--adm-danger-fond); }

  /* Bouton flottant « Nouveau » */
  .mg-fab {
    display: inline-flex; align-items: center; gap: 10px; position: fixed; right: 16px; bottom: calc(18px + env(safe-area-inset-bottom)); z-index: 200;
    min-height: 56px; padding: 0 22px 0 20px; border: 0; border-radius: 18px; background: var(--adm-accent-doux); color: var(--adm-info-texte);
    font: inherit; font-size: .95rem; font-weight: 600; box-shadow: 0 4px 14px rgba(15, 23, 42, .2), 0 1px 3px rgba(15, 23, 42, .12); cursor: pointer;
  }

  /* Lecture : plein écran ; la liste reste dessous, à sa position de défilement */
  .mg-lecture { display: none; }
  .lecture-ouverte .mg-lecture { display: flex; position: fixed; inset: 0; z-index: 240; min-height: 0; padding-bottom: env(safe-area-inset-bottom); border-radius: 0; box-shadow: none; overscroll-behavior: contain; }
  .mg-retour { display: inline-grid; }
  .mg-actions { flex-wrap: nowrap; gap: 2px; padding: 8px 8px 4px; border-bottom: 0; }
  .mg-actions > .adm-btn { display: none; }
  .mg-deplacer { max-width: 116px; }
  .mg-entete { padding: 6px 16px 12px; }
  .mg-entete h2 { font-size: 1.25rem; font-weight: 600; }
  .mg-date-longue { display: none; }
  .mg-date-courte { display: inline; }
  .mg-corps-html { min-height: 0; }
  .mg-corps-texte { padding: 14px 16px; overscroll-behavior: contain; }
  .mg-pieces { max-height: 30vh; padding: 10px 16px; overflow-y: auto; }
  .mg-reponses { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--adm-ligne); }
  .mg-reponses button {
    display: inline-flex; flex: 1; align-items: center; justify-content: center; gap: 8px; min-width: 0; min-height: 44px; padding: 0 10px;
    border: 1px solid var(--adm-ligne-forte); border-radius: 999px; background: transparent; color: var(--adm-encre);
    font: inherit; font-size: .88rem; font-weight: 600; white-space: nowrap; cursor: pointer;
  }
  .mg-reponses button:disabled { opacity: .5; cursor: default; }
}
@media (max-width: 380px) { .mg-reponses button { font-size: .8rem; gap: 6px; } .mg-deplacer { max-width: 90px; } }
</style>

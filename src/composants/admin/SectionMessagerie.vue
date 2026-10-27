<script setup>
/**
 * Messagerie de contact@btm.yt, sur le modèle de Gmail : dossiers à gauche, et à droite une seule carte
 * où la liste des messages laisse la place au message ouvert (retour à la liste avec la flèche ou Échap).
 * Lire, répondre, répondre à tous, transférer, écrire, marquer lu / non lu / important, déplacer, supprimer,
 * pièces jointes (téléchargement, aperçu des PDF). Le contenu HTML des e-mails est affiché dans un cadre isolé
 * (aucun script ; les images distantes sont affichées directement).
 *
 * Rapidité : la dernière liste de chaque dossier s'affiche tout de suite (mémoire + appareil), toute la page de
 * messages est préchargée (sans être marquée lue) pour que chaque message s'ouvre instantanément et que la liste
 * montre l'extrait du texte, la liste se met à jour seule toutes les 30 secondes et au retour sur l'onglet, et
 * suppressions / déplacements s'affichent avant la réponse du serveur.
 * Raccourcis (message ouvert) : Échap retour, j message plus ancien, k plus récent, r répondre, # supprimer.
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
const PAR_PAGE = 25 // messages par page (fixé par la fonction serveur)
const PAR_LOT = 5 // préchargement par appels de 5 messages (une seule connexion à la boîte par appel)
const TAILLE_PRECHARGEMENT = 2 * 1024 * 1024 // les messages plus lourds s'ouvrent à la demande

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
const estEnvoyes = computed(() => dossierActif.value?.cle === 'envoyes')
const autresDossiers = computed(() => dossiers.value.filter((d) => d.chemin !== dossier.value))
const tousCoches = computed(() => liste.value.messages.length > 0 && selection.value.length === liste.value.messages.length)
const ICONES = { reception: 'fa-solid fa-inbox', envoyes: 'fa-solid fa-paper-plane', brouillons: 'fa-regular fa-file-lines', indesirables: 'fa-solid fa-ban', corbeille: 'fa-regular fa-trash-can', archives: 'fa-solid fa-box-archive' }

// « 1–25 sur 26 », comme dans Gmail
const plage = computed(() => {
  const { page, total, messages } = liste.value
  if (!total) return ''
  const debut = (page - 1) * PAR_PAGE + 1
  return `${debut}–${Math.min(total, debut + messages.length - 1)} sur ${total}`
})
// position du message ouvert dans la liste (précédent / suivant)
const indexOuvert = computed(() => (ouvert.value ? liste.value.messages.findIndex((m) => m.uid === ouvert.value.uid) : -1))
const positionOuvert = computed(() => (indexOuvert.value < 0 ? '' : `${(liste.value.page - 1) * PAR_PAGE + indexOuvert.value + 1} sur ${liste.value.total}`))

// ---------- Extraits (texte affiché après l'objet dans la liste) ----------
function apercuDe(c) {
  let t = c?.texte || ''
  if (!t.trim() && c?.html) {
    try { t = new DOMParser().parseFromString(c.html, 'text/html').body.textContent || '' } catch { t = '' }
  }
  return t.replace(/\s+/g, ' ').trim().slice(0, 200)
}
function noterApercu(chemin, c) {
  const apercu = apercuDe(c)
  const listes = [memoire.listes.get(chemin)]
  if (dossier.value === chemin) listes.push(liste.value)
  for (const l of listes) {
    const m = l?.messages.find((x) => x.uid === c.uid)
    if (m) m.apercu = apercu
  }
}

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
    // extraits déjà connus repris tout de suite (liste précédente ou messages en mémoire)
    const connus = new Map([...(memoire.listes.get(chemin)?.messages || []), ...liste.value.messages].filter((m) => m.apercu).map((m) => [m.uid, m.apercu]))
    for (const m of nouvelle.messages) {
      const enMemoire = memoire.messages.get(`${chemin}:${m.uid}`)
      m.apercu = connus.get(m.uid) || (enMemoire ? apercuDe(enMemoire) : '')
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
const chargerListe = (page) => { ouvert.value = null; actualiser(page) }
const toutRecharger = () => actualiser(liste.value.page)

// Mise à jour automatique : toutes les 30 s quand l'onglet est visible, et dès qu'on y revient
function actualiserEnFond() {
  if (!document.hidden && !chargementListe.value) actualiser(liste.value.page, { discret: true })
}
let minuterie
onMounted(() => {
  actualiser() // la liste en mémoire reste affichée pendant l'actualisation
  precharger() // messages de la liste enregistrée : préchargés sans attendre l'actualisation
  minuterie = setInterval(actualiserEnFond, ACTUALISATION)
  document.addEventListener('visibilitychange', actualiserEnFond)
  window.addEventListener('focus', actualiserEnFond)
  window.addEventListener('keydown', raccourci)
})
onBeforeUnmount(() => {
  clearInterval(minuterie)
  document.removeEventListener('visibilitychange', actualiserEnFond)
  window.removeEventListener('focus', actualiserEnFond)
  window.removeEventListener('keydown', raccourci)
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
// Toute la page est lue à l'avance (sans marquer les messages comme lus) : leur ouverture est instantanée
// et la liste affiche l'extrait du texte. Les premiers messages de la liste passent en premier.
const prechargements = new Map() // clé du message → chargement en cours
let prechargementActif = false
let prechargementIndisponible = false // fonction serveur pas à jour : on n'insiste pas
const echecs = new Set() // messages que le préchargement n'a pas pu lire : ouverts à la demande
async function precharger() {
  if (prechargementActif || prechargementIndisponible) return
  prechargementActif = true
  try {
    for (;;) {
      const chemin = dossier.value
      const lot = liste.value.messages
        .filter((m) => m.taille <= TAILLE_PRECHARGEMENT && !memoire.messages.has(`${chemin}:${m.uid}`) && !prechargements.has(`${chemin}:${m.uid}`) && !echecs.has(`${chemin}:${m.uid}`))
        .slice(0, PAR_LOT)
      if (!lot.length) break
      const chargement = lireMessages(chemin, lot.map((m) => m.uid))
        .then((r) => {
          const recus = new Set()
          for (const c of r.messages || []) {
            recus.add(c.uid)
            memoriser(`${chemin}:${c.uid}`, { ...c, important: lot.find((m) => m.uid === c.uid)?.important ?? false })
            noterApercu(chemin, c)
          }
          lot.forEach((m) => { if (!recus.has(m.uid)) echecs.add(`${chemin}:${m.uid}`) })
        })
        .catch((e) => {
          if (/action inconnue/i.test(e.message)) prechargementIndisponible = true
          else lot.forEach((m) => echecs.add(`${chemin}:${m.uid}`))
        })
      lot.forEach((m) => prechargements.set(`${chemin}:${m.uid}`, chargement))
      await chargement
      lot.forEach((m) => prechargements.delete(`${chemin}:${m.uid}`))
      sauverMemoire() // extraits gardés sur l'appareil
      if (prechargementIndisponible) break
    }
  } finally {
    prechargementActif = false
  }
}
function rechercher() { ouvert.value = null; rechercheActive.value = recherche.value.trim(); actualiser() }
function effacerRecherche() { ouvert.value = null; recherche.value = rechercheActive.value = ''; actualiser() }

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
  sauverMemoire()
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
      noterApercu(chemin, complet)
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

/** Message plus récent (-1) ou plus ancien (+1) de la liste */
function ouvrirVoisin(sens) {
  const voisin = liste.value.messages[indexOuvert.value + sens]
  if (indexOuvert.value >= 0 && voisin) ouvrir(voisin)
}
function fermerLecture() { ouvert.value = null }

// Raccourcis clavier de Gmail, quand un message est ouvert et qu'on n'écrit pas
function raccourci(e) {
  if (!ouvert.value || brouillon.value || e.ctrlKey || e.metaKey || e.altKey) return
  if (e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return
  if (e.key === 'Escape') fermerLecture()
  else if (e.key === 'j') ouvrirVoisin(1)
  else if (e.key === 'k') ouvrirVoisin(-1)
  else if (e.key === 'r' && !ouvert.value.partiel) { e.preventDefault(); repondre(false) }
  else if (e.key === '#') supprimer(ouvert.value.uid)
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
  if (!uid) selection.value = []
  sauverMemoire()
  try {
    await marquerMessages(chemin, uids, etat)
  } catch (e) {
    avant.forEach(([m, ancien]) => appliquer(m, ancien))
    notifier(e.message, 'erreur')
  }
}
function marquerNonLuEtFermer() { const uid = ouvert.value.uid; ouvert.value = null; marquer({ lu: false }, uid) }

/** Retire des messages de la liste affichée ; renvoie de quoi les remettre si la boîte refuse */
function retirerDeLaListe(uids) {
  invaliderListe() // une actualisation partie avant ne doit pas les faire réapparaître
  const precedente = liste.value
  const retires = precedente.messages.filter((m) => uids.includes(m.uid))
  const nonLusRetires = retires.filter((m) => !m.lu).length
  liste.value = { ...precedente, messages: precedente.messages.filter((m) => !uids.includes(m.uid)), total: Math.max(0, precedente.total - retires.length) }
  if (nonLusRetires) ajusterNonLus(-nonLusRetires)
  if (ouvert.value && uids.includes(ouvert.value.uid)) ouvert.value = null
  selection.value = selection.value.filter((x) => !uids.includes(x))
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
const selectionNonLue = computed(() => liste.value.messages.some((m) => selection.value.includes(m.uid) && !m.lu))

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
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; font-src data:"><base target="_blank"><style>body{margin:0;padding:8px 24px 20px 80px;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#0f172a;word-wrap:break-word}@media (max-width:700px){body{padding:8px 16px 16px}}img{max-width:100%;height:auto}table{max-width:100%}a{color:#1f1f1f}</style></head><body>${corps}</body></html>`
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
// Lecture : « 16 oct. 2026, 15:59 (il y a 3 jours) », comme dans Gmail
function dateLecture(d) {
  if (!d) return ''
  const date = new Date(d)
  const texte = date.toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const jours = Math.floor((Date.now() - date.getTime()) / 86400000)
  const relatif = jours < 1 ? '' : jours === 1 ? 'hier' : jours < 30 ? `il y a ${jours} jours` : ''
  return relatif ? `${texte} (${relatif})` : texte
}
const tailleLisible = (o) => (o > 1024 * 1024 ? `${(o / 1024 / 1024).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`)
const initiale = (a) => (a?.nom || a?.email || '?').trim().charAt(0).toUpperCase()
// Liste : l'expéditeur, ou le destinataire dans « Envoyés »
const correspondant = (m) => (estEnvoyes.value ? m.a[0] : m.de) || { nom: '', email: '' }
const nomCorrespondant = (m) => { const a = correspondant(m); return estEnvoyes.value ? `À : ${a.nom || a.email}` : a.nom || a.email }
// Avatar : une couleur stable par adresse, comme dans Gmail
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
      <button type="button" class="mg-nouveau" @click="tiroir = false; nouveau()"><i class="fa-solid fa-pen" aria-hidden="true"></i> Nouveau message</button>
      <nav aria-label="Dossiers">
        <button v-for="d in dossiers" :key="d.chemin" type="button" class="mg-dossier" :class="{ actif: d.chemin === dossier, 'a-non-lus': d.nonLus }" @click="choisirDossier(d.chemin)">
          <i :class="ICONES[d.cle] || 'fa-regular fa-folder'" aria-hidden="true"></i><span>{{ d.libelle }}</span>
          <strong v-if="d.nonLus" class="mg-compteur">{{ d.nonLus }}</strong>
        </button>
      </nav>
      <p class="mg-boite"><i class="fa-solid fa-at" aria-hidden="true"></i> contact@btm.yt</p>
    </aside>
    <div v-if="tiroir" class="mg-voile" aria-hidden="true" @click="tiroir = false"></div>

    <!-- Liste et lecture dans la même carte, comme dans Gmail -->
    <section class="mg-principal adm-carte" aria-label="Messages">
      <form class="mg-recherche" role="search" @submit.prevent="rechercher">
        <button type="button" class="mg-ouvrir-tiroir" aria-label="Dossiers" :aria-expanded="tiroir" @click="tiroir = true"><i class="fa-solid fa-bars-staggered" aria-hidden="true"></i></button>
        <button type="submit" class="mg-loupe" aria-label="Rechercher"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i></button>
        <input v-model="recherche" type="search" placeholder="Rechercher dans les messages" aria-label="Rechercher dans les messages" />
        <button v-if="rechercheActive" type="button" class="mg-lien" @click="effacerRecherche">Effacer</button>
      </form>

      <div class="mg-zone">
        <!-- Liste -->
        <div class="mg-liste" :inert="ouvert ? '' : null">
          <div class="mg-outils" :class="{ selection: selection.length }">
            <button v-if="selection.length" type="button" class="adm-icone-btn mg-annuler-selection" aria-label="Annuler la sélection" @click="selection = []"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
            <span class="mg-tout-zone"><input type="checkbox" class="mg-tout" :checked="tousCoches" :indeterminate="selection.length > 0 && !tousCoches" aria-label="Tout sélectionner" @change="toutCocher" /></span>
            <template v-if="selection.length">
              <span class="mg-nb">{{ selection.length }}<span class="mg-txt"> sélectionné{{ selection.length > 1 ? 's' : '' }}</span></span>
              <button type="button" class="adm-icone-btn danger" :title="estCorbeille ? 'Supprimer définitivement' : 'Supprimer'" :aria-label="estCorbeille ? 'Supprimer définitivement' : 'Mettre à la corbeille'" @click="supprimer()"><i class="fa-regular fa-trash-can" aria-hidden="true"></i></button>
              <button v-if="selectionNonLue" type="button" class="adm-icone-btn" title="Marquer comme lu" aria-label="Marquer comme lu" @click="marquer({ lu: true })"><i class="fa-regular fa-envelope-open" aria-hidden="true"></i></button>
              <button v-else type="button" class="adm-icone-btn" title="Marquer comme non lu" aria-label="Marquer comme non lu" @click="marquer({ lu: false })"><i class="fa-regular fa-envelope" aria-hidden="true"></i></button>
              <select class="mg-deplacer" aria-label="Déplacer la sélection vers" title="Déplacer vers" @change="deplacer($event.target.value); $event.target.value = ''">
                <option value="">Déplacer…</option>
                <option v-for="d in autresDossiers" :key="d.chemin" :value="d.chemin">{{ d.libelle }}</option>
              </select>
            </template>
            <template v-else>
              <button type="button" class="adm-icone-btn mg-actualiser" title="Actualiser" aria-label="Actualiser" :disabled="chargementListe" @click="toutRecharger"><i class="fa-solid fa-rotate-right" :class="{ 'fa-spin': chargementListe }" aria-hidden="true"></i></button>
              <span v-if="rechercheActive" class="mg-resultats">Résultats pour « {{ rechercheActive }} »</span>
              <button type="button" class="mg-choix-dossier" :aria-expanded="tiroir" @click="tiroir = true">
                {{ rechercheActive ? `Résultats pour « ${rechercheActive} »` : dossierActif?.libelle || 'Boîte de réception' }}<small v-if="liste.total"> · {{ liste.total }}</small>
                <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
              </button>
            </template>
            <span class="mg-espace"></span>
            <div v-if="liste.total" class="mg-pagination">
              <span>{{ plage }}</span>
              <button type="button" class="adm-icone-btn" :disabled="liste.page <= 1 || chargementListe" title="Plus récents" aria-label="Page précédente" @click="chargerListe(liste.page - 1)"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
              <button type="button" class="adm-icone-btn" :disabled="liste.page >= liste.pages || chargementListe" title="Plus anciens" aria-label="Page suivante" @click="chargerListe(liste.page + 1)"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
            </div>
          </div>

          <p v-if="erreur" class="mg-erreur" role="alert"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> {{ erreur }}</p>
          <div v-else-if="chargementListe && !liste.messages.length" class="mg-vide"><span class="spinner"></span></div>
          <p v-else-if="!liste.messages.length" class="mg-vide">{{ rechercheActive ? 'Aucun message ne correspond à votre recherche.' : 'Aucun message dans ce dossier.' }}</p>

          <ul v-else class="mg-messages">
            <li v-for="m in liste.messages" :key="m.uid" class="mg-message" :class="{ 'non-lu': !m.lu, coche: selection.includes(m.uid) }">
              <input type="checkbox" class="mg-case" :checked="selection.includes(m.uid)" :aria-label="`Sélectionner « ${m.objet} »`" @change="basculerSelection(m.uid)" />
              <!-- téléphone : l'avatar sert de case à cocher, comme dans Gmail -->
              <button type="button" class="mg-avatar" :style="selection.includes(m.uid) ? null : { background: couleur(correspondant(m)) }" :aria-pressed="selection.includes(m.uid)" :aria-label="`Sélectionner « ${m.objet} »`" @click="basculerSelection(m.uid)">
                <i v-if="selection.includes(m.uid)" class="fa-solid fa-check" aria-hidden="true"></i><template v-else>{{ initiale(correspondant(m)) }}</template>
              </button>
              <button type="button" class="mg-etoile" :class="{ on: m.important }" :title="m.important ? 'Suivi' : 'Non suivi'" :aria-label="m.important ? 'Retirer des importants' : 'Marquer comme important'" @click="marquer({ important: !m.important }, m.uid)"><i :class="m.important ? 'fa-solid fa-star' : 'fa-regular fa-star'" aria-hidden="true"></i></button>
              <button type="button" class="mg-message-corps" @click="ouvrir(m)">
                <span class="mg-de">{{ nomCorrespondant(m) }}</span>
                <span class="mg-sujet">
                  <span class="mg-objet"><i v-if="m.repondu" class="fa-solid fa-reply" title="Répondu" aria-hidden="true"></i>{{ m.objet }}</span>
                  <span v-if="m.apercu" class="mg-apercu"><span class="mg-tiret"> – </span>{{ m.apercu }}</span>
                </span>
                <span class="mg-icones"><i v-if="m.piecesJointes" class="fa-solid fa-paperclip" title="Pièce jointe" aria-hidden="true"></i></span>
                <time class="mg-date" :datetime="m.date" :title="dateLongue(m.date)">{{ dateCourte(m.date) }}</time>
              </button>
              <!-- ordinateur : actions au survol de la ligne, à la place de la date -->
              <span class="mg-survol">
                <button type="button" class="adm-icone-btn" :title="estCorbeille ? 'Supprimer définitivement' : 'Supprimer'" :aria-label="estCorbeille ? 'Supprimer définitivement' : 'Mettre à la corbeille'" @click="supprimer(m.uid)"><i class="fa-regular fa-trash-can" aria-hidden="true"></i></button>
                <button type="button" class="adm-icone-btn" :title="m.lu ? 'Marquer comme non lu' : 'Marquer comme lu'" :aria-label="m.lu ? 'Marquer comme non lu' : 'Marquer comme lu'" @click="marquer({ lu: !m.lu }, m.uid)"><i :class="m.lu ? 'fa-regular fa-envelope' : 'fa-regular fa-envelope-open'" aria-hidden="true"></i></button>
              </span>
            </li>
          </ul>

          <div v-if="liste.pages > 1" class="mg-pages">
            <button type="button" class="adm-icone-btn" :disabled="liste.page <= 1 || chargementListe" aria-label="Page précédente" @click="chargerListe(liste.page - 1)"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
            <span>{{ plage }}</span>
            <button type="button" class="adm-icone-btn" :disabled="liste.page >= liste.pages || chargementListe" aria-label="Page suivante" @click="chargerListe(liste.page + 1)"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
          </div>
        </div>

        <!-- Lecture : prend la place de la liste (téléphone : plein écran) -->
        <article v-if="ouvert" class="mg-lecture" aria-label="Lecture du message">
          <div class="mg-actions">
            <button type="button" class="adm-icone-btn" title="Retour à la liste (Échap)" aria-label="Retour à la liste" @click="fermerLecture"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button>
            <span class="mg-separateur" aria-hidden="true"></span>
            <button type="button" class="adm-icone-btn" :title="estCorbeille ? 'Supprimer définitivement' : 'Supprimer (#)'" :aria-label="estCorbeille ? 'Supprimer définitivement' : 'Mettre à la corbeille'" @click="supprimer(ouvert.uid)"><i class="fa-regular fa-trash-can" aria-hidden="true"></i></button>
            <button type="button" class="adm-icone-btn" title="Marquer comme non lu" aria-label="Marquer comme non lu" @click="marquerNonLuEtFermer"><i class="fa-regular fa-envelope" aria-hidden="true"></i></button>
            <select class="mg-deplacer" aria-label="Déplacer vers" title="Déplacer vers" @change="deplacer($event.target.value, ouvert.uid); $event.target.value = ''">
              <option value="">Déplacer…</option>
              <option v-for="d in autresDossiers" :key="d.chemin" :value="d.chemin">{{ d.libelle }}</option>
            </select>
            <span class="mg-espace"></span>
            <div v-if="positionOuvert" class="mg-pagination">
              <span>{{ positionOuvert }}</span>
              <button type="button" class="adm-icone-btn" :disabled="indexOuvert <= 0" title="Plus récent (k)" aria-label="Message plus récent" @click="ouvrirVoisin(-1)"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
              <button type="button" class="adm-icone-btn" :disabled="indexOuvert >= liste.messages.length - 1" title="Plus ancien (j)" aria-label="Message plus ancien" @click="ouvrirVoisin(1)"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
            </div>
          </div>

          <div class="mg-lecture-corps">
            <header class="mg-entete">
              <h2>{{ ouvert.objet }}<span v-if="dossierActif" class="mg-etiquette">{{ dossierActif.libelle }}</span></h2>
              <div class="mg-expediteur">
                <span class="mg-avatar-lecture" :style="{ background: couleur(ouvert.de) }" aria-hidden="true">{{ initiale(ouvert.de) }}</span>
                <div class="mg-qui">
                  <p><strong>{{ ouvert.de.nom || ouvert.de.email }}</strong> <small v-if="ouvert.de.nom">&lt;{{ ouvert.de.email }}&gt;</small></p>
                  <p class="mg-a">À : {{ ouvert.a.map(adresseTexte).join(', ') || '—' }}<template v-if="ouvert.cc.length"> · Cc : {{ ouvert.cc.map(adresseTexte).join(', ') }}</template></p>
                </div>
                <div class="mg-meta">
                  <time :datetime="ouvert.date" :title="dateLongue(ouvert.date)"><span class="mg-date-longue">{{ dateLecture(ouvert.date) }}</span><span class="mg-date-courte">{{ dateCourte(ouvert.date) }}</span></time>
                  <button type="button" class="adm-icone-btn" :title="ouvert.important ? 'Suivi' : 'Non suivi'" :aria-label="ouvert.important ? 'Retirer des importants' : 'Marquer comme important'" @click="marquer({ important: !ouvert.important }, ouvert.uid)"><i :class="ouvert.important ? 'fa-solid fa-star mg-jaune' : 'fa-regular fa-star'" aria-hidden="true"></i></button>
                  <button type="button" class="adm-icone-btn mg-repondre-icone" title="Répondre (r)" aria-label="Répondre" :disabled="ouvert.partiel" @click="repondre(false)"><i class="fa-solid fa-reply" aria-hidden="true"></i></button>
                </div>
              </div>
            </header>

            <div v-if="chargementMessage && ouvert.partiel" class="mg-corps-attente"><span class="spinner spinner-grand" aria-hidden="true"></span><span>Ouverture du message…</span></div>
            <iframe v-else-if="documentHtml" class="mg-corps-html" :srcdoc="documentHtml" sandbox="allow-popups allow-popups-to-escape-sandbox" :title="`Contenu du message « ${ouvert.objet} »`"></iframe>
            <!-- sur une seule ligne : dans <pre>, tout espace ou retour à la ligne du modèle s'afficherait -->
            <pre v-else class="mg-corps-texte"><template v-for="(p, i) in morceauxTexte" :key="i"><router-link v-if="p.route" :to="p.route">{{ p.texte }}</router-link><a v-else-if="p.href" :href="p.href" target="_blank" rel="noopener noreferrer">{{ p.texte }}</a><a v-else-if="p.email" :href="`mailto:${p.email}`" :title="`Écrire à ${p.email}`" @click.prevent="ecrireA(p.email)">{{ p.texte }}</a><template v-else>{{ p.texte }}</template></template></pre>
          </div>

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

          <!-- Répondre / Transférer en bas du message, comme dans Gmail -->
          <div class="mg-reponses">
            <button type="button" :disabled="ouvert.partiel" @click="repondre(false)"><i class="fa-solid fa-reply" aria-hidden="true"></i> Répondre</button>
            <button type="button" :disabled="ouvert.partiel" @click="repondre(true)"><i class="fa-solid fa-reply-all" aria-hidden="true"></i> <span class="mg-txt-long">Répondre à tous</span><span class="mg-txt-court">À tous</span></button>
            <button type="button" :disabled="ouvert.partiel" @click="transferer"><i class="fa-solid fa-share" aria-hidden="true"></i> Transférer</button>
          </div>
        </article>
      </div>
    </section>

    <!-- Téléphone : bouton flottant « Nouveau », comme dans Gmail -->
    <button v-if="!ouvert && !brouillon && !tiroir" type="button" class="mg-fab" @click="nouveau"><i class="fa-solid fa-pen" aria-hidden="true"></i> Nouveau</button>

    <MessagerieRedaction v-if="brouillon" :brouillon="brouillon" @fermer="brouillon = null" @envoye="apresEnvoi" />
  </div>
</template>

<style scoped>
.messagerie { display: grid; grid-template-columns: 1fr; gap: 14px; min-height: 0; }
@media (min-width: 1024px) {
  .messagerie { grid-template-columns: 232px minmax(0, 1fr); height: 100%; }
  .messagerie > * { min-height: 0; }
}

/* Dossiers */
.mg-dossiers { display: flex; flex-direction: column; gap: 4px; padding: 14px 12px; }
.mg-nouveau {
  display: inline-flex; align-items: center; gap: 12px; align-self: flex-start; min-height: 54px; margin: 0 0 12px; padding: 0 24px 0 20px;
  border: 0; border-radius: 16px; background: var(--adm-accent-doux); color: var(--adm-info-texte, var(--adm-encre));
  font: inherit; font-size: .92rem; font-weight: 600; cursor: pointer; transition: box-shadow .15s;
}
.mg-nouveau:hover { box-shadow: 0 1px 3px rgba(15, 23, 42, .25), 0 4px 8px rgba(15, 23, 42, .12); }
.mg-dossiers nav { display: flex; flex-direction: column; gap: 1px; }
.mg-dossier { display: flex; align-items: center; gap: 14px; width: 100%; min-height: 34px; padding: 0 12px 0 14px; border: 0; border-radius: 999px; background: transparent; color: var(--adm-encre-2); font: inherit; font-size: .88rem; text-align: left; cursor: pointer; }
.mg-dossier i { width: 18px; color: var(--adm-muet); text-align: center; }
.mg-dossier span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mg-dossier:hover { background: var(--adm-ligne-2); color: var(--adm-encre); }
.mg-dossier.a-non-lus { color: var(--adm-encre); font-weight: 700; }
.mg-dossier.actif { background: var(--adm-accent-doux); color: var(--adm-info-texte, var(--adm-encre)); font-weight: 700; }
.mg-dossier.actif i { color: var(--adm-info-texte, var(--adm-encre)); }
.mg-compteur { font-size: .78rem; font-weight: 700; }
.mg-boite { margin: auto 0 0; padding: 12px 8px 0; color: var(--adm-muet); font-size: .8rem; }

/* Carte principale : recherche, puis liste ou lecture */
.mg-principal { display: flex; flex-direction: column; min-height: 420px; overflow: hidden; }
.mg-recherche { display: flex; align-items: center; gap: 4px; flex: none; margin: 12px 14px 6px; padding: 0 8px 0 4px; border-radius: 999px; background: var(--adm-ligne-2); color: var(--adm-muet); transition: background .15s, box-shadow .15s; }
.mg-recherche:focus-within { background: var(--adm-carte); box-shadow: 0 1px 1px rgba(15, 23, 42, .08), 0 1px 3px 1px rgba(15, 23, 42, .12); }
.mg-loupe { display: grid; place-items: center; width: 40px; height: 40px; flex: none; border: 0; border-radius: 50%; background: none; color: var(--adm-encre-2); cursor: pointer; }
.mg-loupe:hover { background: var(--adm-ligne); }
.mg-recherche input { flex: 1; min-width: 0; min-height: 46px; border: 0; outline: 0; background: transparent; color: var(--adm-encre); font: inherit; font-size: .92rem; }
.mg-zone { position: relative; flex: 1; min-height: 0; }
.mg-liste { display: flex; flex-direction: column; height: 100%; }

/* Barre d'outils de la liste */
.mg-outils { display: flex; align-items: center; gap: 2px; min-height: 48px; padding: 0 10px 0 8px; border-bottom: 1px solid var(--adm-ligne); }
.mg-tout-zone { display: grid; place-items: center; width: 40px; height: 40px; }
.mg-tout, .mg-case { width: 16px; height: 16px; margin: 0; accent-color: var(--adm-accent); cursor: pointer; }
.mg-nb { margin: 0 8px 0 4px; color: var(--adm-encre-2); font-size: .84rem; font-weight: 600; }
.mg-resultats { margin-left: 8px; color: var(--adm-encre-2); font-size: .84rem; }
.mg-espace { flex: 1; }
.mg-pagination { display: flex; align-items: center; gap: 2px; color: var(--adm-muet); font-size: .8rem; white-space: nowrap; }
.mg-pagination > span { margin-right: 6px; }
.mg-deplacer { min-height: 32px; margin-left: 4px; padding: 0 8px; border: 1px solid var(--adm-ligne); border-radius: 8px; background: var(--adm-champ); color: var(--adm-encre-2); font: inherit; font-size: .82rem; cursor: pointer; }

/* Lignes : une seule ligne par message, comme dans Gmail */
.mg-messages { flex: 1; margin: 0; padding: 0; overflow-y: auto; list-style: none; }
.mg-message {
  position: relative; display: flex; align-items: center; min-height: 42px; padding: 0 12px 0 8px;
  border-bottom: 1px solid var(--adm-ligne-2); background: color-mix(in srgb, var(--adm-ligne-2) 70%, var(--adm-carte)); cursor: pointer;
}
.mg-message.non-lu { background: var(--adm-carte); }
.mg-message:hover { z-index: 1; box-shadow: inset 1px 0 0 var(--adm-ligne-forte), inset -1px 0 0 var(--adm-ligne-forte), 0 1px 2px rgba(15, 23, 42, .18), 0 1px 3px 1px rgba(15, 23, 42, .08); }
.mg-message.coche { background: var(--adm-accent-doux); }
.mg-message > .mg-case { flex: none; margin: 0 12px 0 12px; }
.mg-message-corps {
  display: grid; grid-template-columns: 200px minmax(0, 1fr) auto 76px; align-items: center; gap: 12px;
  flex: 1; min-width: 0; min-height: 42px; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.mg-de { overflow: hidden; color: var(--adm-encre); font-size: .875rem; text-overflow: ellipsis; white-space: nowrap; }
.mg-sujet { display: flex; min-width: 0; overflow: hidden; font-size: .875rem; white-space: nowrap; }
.mg-objet { flex: none; max-width: 100%; overflow: hidden; color: var(--adm-encre); text-overflow: ellipsis; }
.mg-objet i { margin-right: 6px; color: var(--adm-muet); font-size: .74rem; }
.mg-apercu { min-width: 0; overflow: hidden; color: var(--adm-muet); text-overflow: ellipsis; }
.mg-icones { color: var(--adm-muet); font-size: .8rem; }
.mg-date { color: var(--adm-encre-2); font-size: .78rem; text-align: right; white-space: nowrap; }
.mg-message.non-lu .mg-de, .mg-message.non-lu .mg-objet, .mg-message.non-lu .mg-date { font-weight: 700; color: var(--adm-encre); }
.mg-etoile { display: grid; place-items: center; width: 32px; height: 32px; flex: none; margin-right: 6px; border: 0; border-radius: 50%; background: none; color: var(--adm-ligne-forte); cursor: pointer; }
.mg-etoile:hover { background: var(--adm-ligne); color: var(--adm-encre-2); }
.mg-etoile.on { color: #f59e0b; }
.mg-survol { display: none; position: absolute; top: 0; right: 8px; bottom: 0; align-items: center; gap: 2px; padding-left: 12px; background: inherit; }
.mg-survol .adm-icone-btn { width: 34px; height: 34px; }
@media (hover: hover) and (min-width: 1024px) {
  .mg-message:hover .mg-survol { display: flex; }
  .mg-message:hover .mg-date { visibility: hidden; }
}
.mg-pages { display: none; }
.mg-vide { display: grid; place-items: center; flex: 1; min-height: 160px; margin: 0; color: var(--adm-muet); font-size: .9rem; }
.mg-erreur { display: flex; gap: 10px; margin: 14px; padding: 12px 14px; border-radius: 12px; background: var(--adm-danger-fond); color: var(--adm-baisse); font-size: .88rem; line-height: 1.45; }
.mg-lien { border: 0; background: none; color: var(--adm-accent); font: inherit; font-size: .84rem; font-weight: 600; cursor: pointer; }

/* Lecture : par-dessus la liste, dans la même carte (la liste garde sa position de défilement) */
.mg-lecture { position: absolute; inset: 0; z-index: 3; display: flex; flex-direction: column; background: var(--adm-carte); }
.mg-actions { display: flex; align-items: center; gap: 2px; flex: none; min-height: 48px; padding: 0 10px 0 8px; border-bottom: 1px solid var(--adm-ligne); }
.mg-separateur { width: 1px; height: 20px; margin: 0 6px; background: var(--adm-ligne); }
.mg-jaune { color: #f59e0b; }
.mg-lecture-corps { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.mg-entete { flex: none; padding: 18px 24px 4px; }
.mg-entete h2 { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 0 0 16px 56px; font-family: var(--font-corps); font-size: 1.35rem; font-weight: 400; line-height: 1.35; color: var(--adm-encre); }
.mg-etiquette { padding: 1px 8px; border-radius: 4px; background: var(--adm-ligne-2); color: var(--adm-encre-2); font-size: .72rem; font-weight: 500; }
.mg-expediteur { display: flex; align-items: flex-start; gap: 16px; }
.mg-avatar-lecture { display: grid; place-items: center; width: 40px; height: 40px; flex: none; border-radius: 50%; color: #fff; font-size: 1.05rem; font-weight: 600; }
.mg-qui { flex: 1; min-width: 0; font-size: .875rem; }
.mg-qui p { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mg-qui strong { color: var(--adm-encre); }
.mg-qui small { color: var(--adm-muet); font-size: .78rem; }
.mg-a { margin-top: 2px !important; color: var(--adm-muet); font-size: .78rem; }
.mg-meta { display: flex; align-items: center; gap: 2px; flex: none; color: var(--adm-muet); font-size: .78rem; white-space: nowrap; }
.mg-meta time { margin-right: 6px; }
.mg-corps-attente { display: grid; place-content: center; justify-items: center; gap: 10px; flex: 1; color: var(--adm-muet); font-size: .88rem; }
.mg-corps-html { flex: 1; width: 100%; min-height: 240px; border: 0; background: #fff; }
.mg-corps-texte { flex: 1; margin: 0; padding: 8px 24px 20px 80px; overflow: auto; color: var(--adm-encre); font: inherit; font-size: .9rem; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
.mg-corps-texte a { color: var(--adm-accent); text-decoration: underline; text-underline-offset: 2px; }
.mg-pieces { flex: none; padding: 12px 24px 4px 80px; border-top: 1px solid var(--adm-ligne-2); }
.mg-pieces > p { margin: 0 0 8px; color: var(--adm-muet); font-size: .8rem; font-weight: 600; }
.mg-pieces ul { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
.mg-pieces li { display: flex; align-items: center; gap: 6px; max-width: 100%; padding: 4px 4px 4px 12px; border: 1px solid var(--adm-ligne); border-radius: 10px; }
.mg-piece-nom { display: flex; flex-direction: column; min-width: 0; max-width: 220px; overflow: hidden; font-size: .84rem; text-overflow: ellipsis; white-space: nowrap; }
.mg-piece-nom small { color: var(--adm-muet); font-size: .74rem; }
.mg-rouge { color: #dc2626; }
.mg-pieces .spinner { width: 14px; height: 14px; border-width: 2px; }
.mg-reponses { display: flex; flex-wrap: wrap; gap: 10px; flex: none; padding: 14px 24px 18px 80px; }
.mg-reponses button {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 38px; padding: 0 20px;
  border: 1px solid var(--adm-ligne-forte); border-radius: 999px; background: transparent; color: var(--adm-encre-2);
  font: inherit; font-size: .86rem; font-weight: 600; white-space: nowrap; cursor: pointer;
}
.mg-reponses button:hover:not(:disabled) { background: var(--adm-ligne-2); color: var(--adm-encre); }
.mg-reponses button:disabled { opacity: .5; cursor: default; }
.mg-txt-court { display: none; }

/* Éléments propres au téléphone */
.mg-tiroir-tete, .mg-voile, .mg-ouvrir-tiroir, .mg-choix-dossier, .mg-annuler-selection, .mg-avatar, .mg-fab, .mg-date-courte { display: none; }

/* Écran d'ordinateur étroit : liste plus compacte */
@media (min-width: 1024px) and (max-width: 1279px) {
  .mg-message-corps { grid-template-columns: 150px minmax(0, 1fr) auto 64px; }
}

/* Téléphone et tablette : présentation de Gmail */
@media (max-width: 1023px) {
  .messagerie { gap: 0; }

  /* Dossiers : tiroir glissant depuis la gauche */
  .mg-dossiers {
    position: fixed; top: 0; bottom: 0; left: 0; z-index: 290; width: min(300px, 86vw); padding: calc(14px + env(safe-area-inset-top, 0px)) 12px calc(14px + env(safe-area-inset-bottom));
    border-radius: 0 22px 22px 0; overflow-y: auto; overscroll-behavior: contain;
    transform: translateX(-105%); visibility: hidden; transition: transform .28s cubic-bezier(.22, .61, .36, 1), visibility 0s .28s;
  }
  .tiroir-ouvert .mg-dossiers { transform: none; visibility: visible; transition-delay: 0s; box-shadow: 0 30px 80px rgba(15, 23, 42, .35); }
  .mg-tiroir-tete { display: flex; align-items: center; justify-content: space-between; padding: 0 0 10px 8px; font-size: .9rem; }
  .mg-tiroir-tete i { margin-right: 6px; color: var(--adm-muet); }
  .mg-nouveau { display: none; }
  .mg-dossier { min-height: 46px; }
  .mg-boite { display: none; }
  .mg-voile { display: block; position: fixed; inset: 0; z-index: 285; background: rgba(15, 23, 42, .4); }

  /* Carte principale transparente : la liste défile avec la page */
  .mg-principal { display: block; min-height: 0; padding-bottom: 84px; overflow: visible; border-radius: 0; background: transparent; box-shadow: none; }
  .mg-zone { position: static; }
  .mg-liste { display: block; height: auto; }

  /* Barre de recherche arrondie qui reste en haut */
  .mg-recherche { position: sticky; top: 8px; z-index: 6; min-height: 50px; margin: 0 0 4px; background: var(--adm-carte); box-shadow: var(--adm-ombre); }
  .mg-recherche input { font-size: 1rem; } /* 16 px : pas de zoom automatique sur iPhone */
  .mg-loupe { display: none; }
  .mg-ouvrir-tiroir { display: grid; place-items: center; width: 42px; height: 42px; flex: none; border: 0; border-radius: 50%; background: transparent; color: var(--adm-encre-2); font-size: 1.05rem; cursor: pointer; }
  .mg-ouvrir-tiroir:hover { background: var(--adm-ligne-2); }
  .mg-outils { min-height: 44px; padding: 4px 4px 4px 6px; border-bottom: 0; }
  .mg-outils.selection { position: sticky; top: 64px; z-index: 5; margin-bottom: 6px; border-radius: 999px; background: var(--adm-carte); box-shadow: var(--adm-ombre); }
  .mg-tout-zone, .mg-actualiser, .mg-resultats, .mg-outils .mg-pagination, .mg-txt { display: none; }
  .mg-outils.selection .mg-espace { display: none; }
  .mg-outils.selection .mg-nb { flex: 1; }
  .mg-annuler-selection { display: inline-grid; }
  .mg-choix-dossier {
    display: inline-flex; align-items: center; gap: 6px; flex: 1; min-width: 0; padding: 6px 8px; border: 0; background: none;
    color: var(--adm-muet); font: inherit; font-size: .76rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; text-align: left; cursor: pointer;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .mg-choix-dossier small { font-size: inherit; font-weight: 500; }
  .mg-choix-dossier i { font-size: .62rem; }

  /* Lignes : avatar, expéditeur et date, objet, extrait */
  .mg-messages { overflow: visible; border-radius: var(--adm-rayon-sm); background: var(--adm-carte); box-shadow: var(--adm-ombre); }
  .mg-message { align-items: flex-start; gap: 12px; min-height: 0; padding: 12px 6px 12px 12px; background: var(--adm-carte); }
  .mg-message:hover { box-shadow: none; }
  .mg-message:first-child { border-radius: var(--adm-rayon-sm) var(--adm-rayon-sm) 0 0; }
  .mg-message:last-child { border-bottom: 0; border-radius: 0 0 var(--adm-rayon-sm) var(--adm-rayon-sm); }
  .mg-message.coche { background: var(--adm-accent-doux); }
  .mg-message > .mg-case { display: none; }
  .mg-avatar {
    display: grid; place-items: center; width: 40px; height: 40px; flex: none; border: 0; border-radius: 50%;
    background: var(--adm-accent); color: var(--sur-primaire); font: inherit; font-size: 1rem; font-weight: 600; cursor: pointer;
  }
  .mg-message-corps { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "de date" "sujet icones"; gap: 2px 10px; align-items: start; min-height: 0; }
  .mg-de { grid-area: de; font-size: .95rem; }
  .mg-date { grid-area: date; font-size: .76rem; }
  .mg-sujet { grid-area: sujet; flex-direction: column; font-size: .88rem; }
  .mg-objet { overflow: hidden; text-overflow: ellipsis; }
  .mg-tiret { display: none; }
  .mg-apercu { font-size: .84rem; }
  .mg-icones { grid-area: icones; align-self: end; }
  .mg-etoile { order: 3; width: 38px; height: 38px; margin: 0; }
  .mg-pages { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 8px; color: var(--adm-muet); font-size: .84rem; }
  .mg-vide, .mg-erreur { border-radius: var(--adm-rayon-sm); background: var(--adm-carte); }
  .mg-erreur { margin: 0 0 8px; background: var(--adm-danger-fond); }

  /* Bouton flottant « Nouveau » */
  .mg-fab {
    display: inline-flex; align-items: center; gap: 10px; position: fixed; right: 16px; bottom: calc(18px + env(safe-area-inset-bottom)); z-index: 200;
    min-height: 56px; padding: 0 22px 0 20px; border: 0; border-radius: 18px; background: var(--adm-accent-doux); color: var(--adm-info-texte);
    font: inherit; font-size: .95rem; font-weight: 600; box-shadow: 0 4px 14px rgba(15, 23, 42, .2), 0 1px 3px rgba(15, 23, 42, .12); cursor: pointer;
  }

  /* Lecture : plein écran ; la liste reste dessous, à sa position de défilement */
  .mg-lecture { position: fixed; z-index: 240; padding-bottom: env(safe-area-inset-bottom); overscroll-behavior: contain; }
  .mg-actions { min-height: 52px; padding: 4px 6px; border-bottom: 0; }
  .mg-separateur, .mg-actions .mg-pagination > span { display: none; }
  .mg-deplacer { max-width: 116px; }
  .mg-entete { padding: 6px 16px 10px; }
  .mg-entete h2 { margin: 0 0 14px; font-size: 1.25rem; }
  .mg-expediteur { gap: 12px; }
  .mg-repondre-icone { display: none; }
  .mg-date-longue { display: none; }
  .mg-date-courte { display: inline; }
  .mg-corps-html { min-height: 0; }
  .mg-corps-texte { padding: 10px 16px 16px; overscroll-behavior: contain; }
  .mg-pieces { max-height: 30vh; padding: 10px 16px; overflow-y: auto; }
  .mg-reponses { flex-wrap: nowrap; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--adm-ligne); }
  .mg-reponses button { flex: 1; min-width: 0; min-height: 44px; padding: 0 10px; color: var(--adm-encre); font-size: .88rem; }
  .mg-txt-long { display: none; }
  .mg-txt-court { display: inline; }
}
@media (max-width: 380px) { .mg-reponses button { font-size: .8rem; gap: 6px; } .mg-deplacer { max-width: 90px; } }
</style>

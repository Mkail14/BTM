<script setup>
/**
 * Calculateur, deux façons de faire son devis :
 *  - « Selon mes mesures » : assistant pas à pas (type de projet → une question par écran → récapitulatif) ;
 *  - « Je sais ce qu'il me faut » : choix direct des matériaux et des quantités, sans mesures.
 * Comptes pro : chaque estimation peut rejoindre un même devis (plusieurs ouvrages et achats).
 */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCalculateur } from '@/composables/useCalculateur.js'
import { typesProjets } from '@/donnees/typesProjets.js'
import { validerDimensions, formaterNombre, formaterEuros } from '@/services/calculs/moteurCalculs.js'
import SelecteurTypeProjet from '@/composants/calculateur/SelecteurTypeProjet.vue'
import Maquette3D from '@/composants/calculateur/Maquette3D.vue'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import BandeauAvertissement from '@/composants/commun/BandeauAvertissement.vue'
import CatalogueDirect from '@/composants/calculateur/CatalogueDirect.vue'
import SelecteurCarreau from '@/composants/calculateur/SelecteurCarreau.vue'
import { modeleCarreau } from '@/services/calculs/formuleCarrelage.js'
import { MENUISERIES, surfaceMenuiseries, surfaceAutre, decrireMenuiseries } from '@/donnees/menuiseries.js'
import { useAuth } from '@/composables/useAuth.js'

const route = useRoute()
const router = useRouter()
const calc = useCalculateur()
const { estPro } = useAuth()

// Le prix est visible sans compte ; le compte ne sert qu'à enregistrer l'estimation et obtenir le code de retrait
async function allerAuDevis() {
  // push() ne lève pas d'erreur quand la navigation est interrompue : il renvoie l'échec
  const echec = await router.push('/resultats')
  if (echec) throw new Error(echec.message || 'navigation vers les résultats interrompue')
}

// Mode : selon mes mesures, ou achat direct (« Je sais ce qu'il me faut »)
const mode = ref(route.query.mode === 'direct' ? 'direct' : 'mesures')
watch(() => route.query.mode, (m) => { mode.value = m === 'direct' ? 'direct' : 'mesures' })
function changerMode(m) {
  mode.value = m
  router.replace({ query: m === 'direct' ? { mode: 'direct' } : {} })
}
const achatInitial = computed(() => (calc.resultat.value?.type === 'achat' ? calc.resultat.value.lignes : []))
async function validerAchat(choix) {
  calc.erreurGlobale.value = ''
  try {
    calc.achatDirect(choix)
    await allerAuDevis()
  } catch (e) {
    // jamais de clic « sans effet » : le problème s'affiche sous la liste des matériaux et dans la console
    console.error('Comparer les fournisseurs :', e)
    calc.erreurGlobale.value = `La comparaison n’a pas pu s’afficher (${e?.message || 'erreur inconnue'})`
  }
}

/** 'type' | index de la question | 'recap' */
const etape = ref('type')

/** Une entrée par écran. Pour le mur : chaque mur ajouté a ses questions, puis « un autre mur ? » */
const questions = computed(() => {
  const t = calc.type.value
  if (!t) return []
  const liste = t.champs.map((champ) => ({ cle: champ.nom, champ, mur: t.id === 'mur' ? 1 : null }))
  if (t.id === 'mur') {
    ;(calc.dimensions.autresMurs || []).forEach((_, index) => {
      t.champs.forEach((champ) => liste.push({ cle: `autresMurs.${index}.${champ.nom}`, champ, mur: index + 2, index }))
    })
    // Plusieurs murs : réservé aux comptes professionnels
    if (estPro.value) liste.push({ cle: 'autreMur', special: true })
  }
  return liste
})

const question = computed(() => (typeof etape.value === 'number' ? questions.value[etape.value] : null))
const total = computed(() => questions.value.length + 2)
const position = computed(() => (etape.value === 'type' ? 1 : etape.value === 'recap' ? total.value : etape.value + 2))

// Mur surligné dans la maquette : celui dont on saisit les mesures (0 = premier), -1 = aucun
const murActif = computed(() => {
  const q = question.value
  if (!q || calc.typeId.value !== 'mur') return -1
  if (q.special) return calc.dimensions.autresMurs?.length || 0 // « un autre mur ? » : le dernier mur ajouté
  return q.index !== undefined ? q.index + 1 : 0
})

function lireValeur(q) {
  const source = q.index !== undefined ? calc.dimensions.autresMurs?.[q.index] : calc.dimensions
  return source?.[q.champ.nom] ?? ''
}

function ecrireValeur(q, valeur) {
  if (q.index === undefined) return calc.definirDimensions({ [q.champ.nom]: valeur })
  const murs = calc.dimensions.autresMurs.map((m, i) => (i === q.index ? { ...m, [q.champ.nom]: valeur } : m))
  calc.definirDimensions({ autresMurs: murs })
}

// ---------- Navigation ----------
function appliquerQuery() {
  const t = route.query.type
  if (t && typesProjets.some((x) => x.id === t) && t !== calc.typeId.value) {
    calc.choisirType(t)
    etape.value = 0
  }
}

onMounted(() => {
  appliquerQuery()
  if (!calc.typeId.value) return
  // on reprend là où la personne s'était arrêtée
  const { valide, erreurs } = validerDimensions(calc.typeId.value, calc.dimensions)
  if (valide) etape.value = 'recap'
  else etape.value = Math.max(0, questions.value.findIndex((q) => q.cle === Object.keys(erreurs)[0]))
})
watch(() => route.query.type, appliquerQuery)

function choisirType(id) {
  calc.choisirType(id)
  router.replace({ query: { ...route.query, type: id } })
  etape.value = 0
}

function suivant() {
  const q = question.value
  calc.validerChamp(q.cle)
  if (calc.erreurs[q.cle]) return focaliser()
  etape.value = etape.value + 1 < questions.value.length ? etape.value + 1 : 'recap'
}

function precedent() {
  if (etape.value === 'recap') etape.value = questions.value.length - 1
  else if (etape.value === 0) etape.value = 'type'
  else etape.value--
}

function choisirOption(q, valeur) {
  // un autre format de carreaux : le modèle choisi (vendu dans un seul format) ne vaut plus
  if (q.champ.nom === 'format' && !modeleCarreau({ ...calc.dimensions, format: valeur })) calc.definirDimensions({ carreau: 'standard' })
  ecrireValeur(q, valeur)
  suivant()
}

function aucuneOuverture(q) {
  ecrireMur(q, { menuiseries: [], ouverturesAutre: '', ouvertures: '0' })
  suivant()
}

// ---------- Portes et fenêtres (question « ouvertures » du mur) ----------
// On choisit « porte » ou « fenêtre », puis on touche le mur dans la maquette pour la placer (taille standard,
// modifiable). « Autre » garde une simple surface en m². Le calcul ne lit que `ouvertures` : la somme des deux.
const placement = ref('') // 'porte' | 'fenetre' : on attend un toucher sur le mur dans la maquette
const autreOuverte = ref(false)
watch(() => question.value?.cle, () => { placement.value = ''; autreOuverte.value = false })

const murDe = (q) => (q.index !== undefined ? calc.dimensions.autresMurs?.[q.index] : calc.dimensions) || {}
function ecrireMur(q, patch) {
  if (q.index === undefined) return calc.definirDimensions(patch)
  calc.definirDimensions({ autresMurs: calc.dimensions.autresMurs.map((m, i) => (i === q.index ? { ...m, ...patch } : m)) })
}
const positif = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0 }
// surface « autre » telle que saisie ; un ancien devis (sans détail) garde toute sa surface en « autre »
const autreTexte = (mur) => mur.ouverturesAutre ?? (surfaceAutre(mur) ? String(surfaceAutre(mur)) : '')
const totalOuvertures = (mur) => Math.round((surfaceMenuiseries(mur.menuiseries) + positif(autreTexte(mur))) * 100) / 100

function ecrireOuvertures(q, menuiseries, autre = autreTexte(murDe(q))) {
  const total = Math.round((surfaceMenuiseries(menuiseries) + positif(autre)) * 100) / 100
  ecrireMur(q, { menuiseries, ouverturesAutre: autre, ouvertures: String(total) })
  if (calc.erreurs[q.cle]) calc.validerChamp(q.cle)
}
function choisirMenuiserie(type) {
  placement.value = placement.value === type ? '' : type
}
// le point touché est le centre de la menuiserie ; une porte reste posée au sol, une fenêtre garde la hauteur touchée
function placerMenuiserie({ mur, position, hauteur }) {
  const q = question.value
  if (!placement.value || !q || q.champ?.nom !== 'ouvertures' || mur !== murActif.value) return
  const m = MENUISERIES[placement.value]
  const nouvelle = { type: placement.value, position, largeur: String(m.largeur), hauteur: String(m.hauteur) }
  if (placement.value === 'fenetre') nouvelle.centre = hauteur
  ecrireOuvertures(q, [...(murDe(q).menuiseries || []), nouvelle])
  placement.value = ''
}
const modifierMenuiserie = (q, i, champ, valeur) => ecrireOuvertures(q, murDe(q).menuiseries.map((m, j) => (j === i ? { ...m, [champ]: valeur } : m)))
const retirerMenuiserie = (q, i) => ecrireOuvertures(q, murDe(q).menuiseries.filter((_, j) => j !== i))
// « Porte 2 », « Fenêtre 1 » : numérotées par sorte
const nomMenuiserie = (liste, i) => `${MENUISERIES[liste[i].type].libelle} ${liste.slice(0, i + 1).filter((m) => m.type === liste[i].type).length}`

/** L'écran « autre mur ? » : les questions du nouveau mur prennent sa place dans la liste */
function ajouterMur() {
  const i = questions.value.findIndex((q) => q.special)
  calc.ajouterMur()
  etape.value = i
}

function modifier(cle) {
  etape.value = Math.max(0, questions.value.findIndex((q) => q.cle === cle))
}

function valider() {
  if (etape.value === 'recap') soumettre()
  else if (question.value && !question.value.special) suivant()
}

async function soumettre() {
  try {
    const ok = await calc.calculer()
    if (ok) {
      await allerAuDevis()
      return
    }
    const premiere = Object.keys(calc.erreurs)[0]
    if (premiere) modifier(premiere)
  } catch (e) {
    // jamais de clic « sans effet » : le problème s'affiche sous le récapitulatif et dans la console
    console.error('Obtenir mon devis :', e)
    calc.erreurGlobale.value = `L’estimation n’a pas pu s’afficher (${e?.message || 'erreur inconnue'})`
  }
}

// Ligne d'aide sous la question quand le champ n'en a pas : elle dit dans quelle unité répondre
const UNITES = { m: 'mètres', cm: 'centimètres', mm: 'millimètres', 'm²': 'mètres carrés', 'm³': 'mètres cubes', u: 'unités' }
const aideUnite = (unite) => (UNITES[unite] ? `Indiquez la valeur en ${UNITES[unite]}` : 'Indiquez la valeur')

function focaliser() {
  nextTick(() => {
    const el = document.querySelector('.assistant-focus')
    if (!window.matchMedia(TELEPHONE).matches) return el?.focus()
    el?.focus({ preventScroll: true }) // le défilement natif ignorerait la maquette collée en haut
    ramenerSousMaquette(el)
  })
}
watch(etape, focaliser)

// ---------- Téléphone : écran d'application ----------
// Une question = un écran fixe qui ne défile pas : projet et avancement en haut, maquette 3D au milieu (elle se
// redessine à chaque chiffre tapé), question, champ et « Continuer » en bas. Clavier ouvert, l'écran suit la zone
// visible : la maquette rétrécit, la barre d'onglets s'efface, le champ ne passe jamais sous le clavier.
const requeteTelephone = window.matchMedia('(max-width: 639px)')
const ecranTelephone = ref(requeteTelephone.matches)
const surTailleEcran = (e) => { ecranTelephone.value = e.matches }
const modeApp = computed(() => ecranTelephone.value && mode.value === 'mesures' && !!question.value && question.value.champ?.type !== 'carreau')
const clavierOuvert = ref(false)
const zoneVisible = ref(null) // { hauteur, haut } de la zone visible (visualViewport), en px
const styleApp = computed(() => (modeApp.value && zoneVisible.value
  ? { '--zone-visible': `${zoneVisible.value.hauteur}px`, '--zone-haut': `${zoneVisible.value.haut}px` }
  : null))
function suivreZoneVisible() {
  const vv = window.visualViewport
  zoneVisible.value = vv ? { hauteur: Math.round(vv.height), haut: Math.round(vv.offsetTop) } : null
}
// la page ne défile pas, la barre d'onglets et la bulle d'aide laissent la place au clavier
watch([modeApp, clavierOuvert], ([app, clavier]) => {
  document.documentElement.classList.toggle('calc-app-actif', app)
  document.documentElement.classList.toggle('clavier-ouvert', app && clavier)
  if (app) window.scrollTo(0, 0)
}, { immediate: true })

// Boutons − / + : régler une mesure au pouce, sans ouvrir le clavier
const pasRapide = (champ) => ((champ.unite === 'm' || champ.unite === 'm²') && champ.pas < 0.5 && champ.max > 10 ? 0.5 : champ.pas)
function ajuster(q, sens) {
  const p = pasRapide(q.champ)
  const actuelle = Number(String(lireValeur(q)).replace(',', '.'))
  const depart = lireValeur(q) === '' || Number.isNaN(actuelle) ? Number(q.champ.placeholder) : Math.round((actuelle + sens * p) / p) * p
  ecrireValeur(q, String(+Math.min(q.champ.max, Math.max(q.champ.min, depart)).toFixed(2)))
  if (calc.erreurs[q.cle]) calc.validerChamp(q.cle)
}

// ---------- Téléphone : la maquette 3D reste visible pendant la saisie ----------
// Sous 900 px, la maquette est collée sous l'entête (CSS). Quand le clavier s'ouvre, la zone visible rétrécit :
// la maquette se fait plus petite et le champ en cours de saisie est ramené juste en dessous d'elle.
const TELEPHONE = '(max-width: 899px)'
const hauteurMaquette = ref('')
let hauteurVisibleMax = 0
const styleMaquette = computed(() => (hauteurMaquette.value ? { '--hauteur-maquette': hauteurMaquette.value } : null))

function ramenerSousMaquette(el = document.activeElement) {
  if (modeApp.value || !el?.closest?.('.assistant-contenu') || !window.matchMedia(TELEPHONE).matches) return
  requestAnimationFrame(() => {
    // la question et son champ ensemble quand ils tiennent sous la maquette, sinon au moins le champ
    // (scroll-margin-top, en CSS, tient compte de l'entête et de la maquette collées en haut)
    const question = el.closest('.assistant-panneau')?.querySelector('.assistant-question')
    const maquette = document.querySelector('.assistant-maquette')?.getBoundingClientRect()
    const place = (window.visualViewport?.height || window.innerHeight) - (maquette?.bottom || 0)
    const ensemble = question && question !== el ? el.getBoundingClientRect().bottom - question.getBoundingClientRect().top + 24 : Infinity
    if (ensemble <= place) question.scrollIntoView({ block: 'start' })
    else el.scrollIntoView({ block: 'nearest' })
  })
}

function surZoneVisible() {
  const vv = window.visualViewport
  if (!vv || !window.matchMedia(TELEPHONE).matches) { hauteurMaquette.value = ''; return }
  hauteurVisibleMax = Math.max(hauteurVisibleMax, vv.height)
  const clavierOuvert = vv.height < hauteurVisibleMax * 0.78
  clavierVisible(clavierOuvert)
  const etaitOuvert = !!hauteurMaquette.value
  hauteurMaquette.value = clavierOuvert ? `${Math.round(Math.min(200, Math.max(120, vv.height * 0.3)))}px` : ''
  if (clavierOuvert) ramenerSousMaquette()
  // clavier refermé : la maquette reprend sa taille, la question en cours ne doit pas passer dessous
  else if (etaitOuvert) nextTick(() => ramenerSousMaquette(document.querySelector('.assistant-contenu input, .assistant-contenu .assistant-focus')))
}
const surRotation = () => { hauteurVisibleMax = 0; surZoneVisible() }

function clavierVisible(ouvert) {
  clavierOuvert.value = ouvert
  suivreZoneVisible()
}

onMounted(() => {
  // hauteur de référence, clavier fermé : sans elle, le premier rétrécissement (ouverture du clavier) passerait inaperçu
  hauteurVisibleMax = Math.max(window.visualViewport?.height || 0, window.innerHeight)
  suivreZoneVisible()
  window.visualViewport?.addEventListener('resize', surZoneVisible)
  window.visualViewport?.addEventListener('scroll', suivreZoneVisible) // iOS : la zone visible glisse au lieu de rétrécir
  window.addEventListener('orientationchange', surRotation)
  requeteTelephone.addEventListener('change', surTailleEcran)
})
onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener('resize', surZoneVisible)
  window.visualViewport?.removeEventListener('scroll', suivreZoneVisible)
  window.removeEventListener('orientationchange', surRotation)
  requeteTelephone.removeEventListener('change', surTailleEcran)
  document.documentElement.classList.remove('calc-app-actif', 'clavier-ouvert')
})

// Carrelage : nombre de carreaux entiers à commander (même calcul que le devis), pour afficher le coût du modèle choisi
const COTES = { '30x30': 0.3, '45x45': 0.45, '60x60': 0.6 }
const nbCarreaux = computed(() => {
  const d = calc.dimensions, cote = COTES[d.format]
  const surface = Number(String(d.longueur || 0).replace(',', '.')) * Number(String(d.largeur || 0).replace(',', '.'))
  const marge = calc.type.value?.parametres?.margeCarreaux || 1.1
  return cote && surface > 0 ? Math.ceil((surface * marge) / cote ** 2) : 0
})

// ---------- Récapitulatif ----------
function formater(champ, valeur) {
  if (champ.type === 'select') return champ.options.find((o) => o.valeur === valeur)?.label.split(' — ')[0] || valeur
  if (champ.type === 'carreau') {
    const m = modeleCarreau(calc.dimensions)
    return m ? `« ${m.nom} » — ${m.fournisseur}, ${formaterEuros(m.prix)} ${m.parCarton > 1 ? `le carton de ${m.parCarton}` : 'le carreau'}` : 'Modèle standard (prix moyen)'
  }
  if (valeur === '' || valeur === undefined || valeur === null) return champ.optionnel ? 'Aucune' : '—'
  return `${formaterNombre(String(valeur).replace(',', '.'), 2)} ${champ.unite}`
}

const recapitulatif = computed(() => {
  const t = calc.type.value
  if (!t) return []
  if (t.id !== 'mur') return t.champs.map((c) => ({ cle: c.nom, label: c.label, valeur: formater(c, calc.dimensions[c.nom]) }))
  const murs = [calc.dimensions, ...(calc.dimensions.autresMurs || [])]
  return murs.map((m, i) => {
    const [longueur, hauteur, ouvertures] = t.champs
    const detail = decrireMenuiseries(m.menuiseries)
    const ouv = Number(String(m.ouvertures || 0).replace(',', '.')) ? `, ${detail ? `${detail} — ` : ''}${formater(ouvertures, m.ouvertures)} d’ouvertures` : ', sans ouverture'
    return {
      cle: i === 0 ? 'longueur' : `autresMurs.${i - 1}.longueur`,
      label: `Mur ${i + 1}`,
      valeur: `${formater(longueur, m.longueur)} × ${formater(hauteur, m.hauteur)}${ouv}`,
      retirer: i > 0 ? () => calc.retirerMur(i - 1) : null
    }
  })
})
</script>

<template>
  <div id="page-calculateur" class="page" :class="{ 'calc-app': modeApp, 'calc-clavier': modeApp && clavierOuvert }" :style="styleApp">
    <div class="conteneur">
      <h1 class="visually-hidden">L’estimation de votre projet</h1>

      <div v-if="mode === 'mesures'" class="assistant-progression" :class="{ 'assistant-progression-debut': etape === 'type' }" role="progressbar" :aria-valuenow="position" aria-valuemin="1" :aria-valuemax="total" :aria-label="`Étape ${position} sur ${total}`">
        <span :style="{ width: `${(position / total) * 100}%` }"></span>
      </div>

      <!-- Devis pro en cours : l'estimation suivante le rejoindra -->
      <p v-if="estPro && calc.cumul.value.length" class="calc-pro">
        <span class="calc-pro-badge">Pro</span>
        <span>Estimation en cours : <strong>{{ calc.cumul.value.length }} élément{{ calc.cumul.value.length > 1 ? 's' : '' }}</strong>. Ce que vous calculez maintenant s’y ajoutera.</span>
        <router-link to="/resultats">Voir l’estimation</router-link>
      </p>

      <!-- Deux façons de faire son devis -->
      <div v-if="mode === 'direct' || etape === 'type'" class="calc-modes" role="tablist" aria-label="Façon de faire mon estimation">
        <button type="button" role="tab" :aria-selected="mode === 'mesures'" @click="changerMode('mesures')">
          <i class="fa-solid fa-ruler-combined" aria-hidden="true"></i><span><strong>Selon mes mesures</strong><b class="calc-mode-court">Mes mesures</b><small>Je donne les dimensions, BTM calcule les quantités</small></span>
        </button>
        <button type="button" role="tab" :aria-selected="mode === 'direct'" @click="changerMode('direct')">
          <i class="fa-solid fa-cart-shopping" aria-hidden="true"></i><span><strong>Je sais ce qu’il me faut</strong><b class="calc-mode-court">Ma liste</b><small>Je choisis mes matériaux et mes quantités</small></span>
        </button>
      </div>

      <div v-if="mode === 'direct'" class="calc-direct">
        <BandeauAvertissement v-if="calc.erreurGlobale.value" type="erreur" compact>{{ calc.erreurGlobale.value }}</BandeauAvertissement>
        <CatalogueDirect :initial="achatInitial" @valider="validerAchat" />
      </div>

      <form v-else novalidate @submit.prevent="valider">
        <transition name="fondu" mode="out-in">
          <!-- 1. Choix du projet -->
          <section v-if="etape === 'type'" key="type" class="assistant-etape">
            <h2 class="assistant-question assistant-focus" tabindex="-1">Que voulez-vous construire ?</h2>
            <p class="assistant-aide">Touchez le projet qui correspond au vôtre.</p>
            <SelecteurTypeProjet :model-value="calc.typeId.value" @update:model-value="choisirType" />
          </section>

          <!-- 2. Questions et récapitulatif : la maquette 3D reste en place, seul le texte change -->
          <section v-else key="assistant" class="carte assistant-carte" :class="{ 'etape-carreau': question?.champ?.type === 'carreau', 'etape-recap': etape === 'recap' }" :style="styleMaquette" @focusin="ramenerSousMaquette($event.target)">
            <div class="assistant-contenu">
              <p class="assistant-contexte">
                <!-- téléphone : retour en haut à gauche, comme dans une application -->
                <button type="button" class="assistant-retour-haut" aria-label="Retour" @click="precedent"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
                <span class="assistant-puce">
                  <i :class="calc.type.value?.icone" aria-hidden="true"></i> {{ calc.type.value?.libelle }}<template v-if="question?.mur && calc.dimensions.autresMurs?.length"> {{ question.mur }}</template>
                </span>
                <span v-if="question" class="assistant-compteur" aria-hidden="true">{{ etape + 1 }}/{{ questions.length }}</span>
                <button type="button" class="assistant-lien assistant-changer" @click="etape = 'type'">Changer de projet</button>
              </p>

              <transition name="fondu" mode="out-in">
                <div v-if="question" :key="question.cle" class="assistant-panneau">
                  <!-- question et réponse centrées dans la carte, les boutons restent en bas -->
                  <div class="assistant-corps">
                  <p class="assistant-numero">Question {{ etape + 1 }} sur {{ questions.length }}</p>
                  <template v-if="question.special">
                    <h2 class="assistant-question assistant-focus" tabindex="-1">Avez-vous un autre mur à ajouter ?</h2>
                    <p class="assistant-aide">Ajoutez autant de murs que vous voulez : tout sera calculé ensemble.</p>
                    <div class="assistant-choix">
                      <button type="button" class="assistant-choix-bouton" @click="ajouterMur"><i class="fa-solid fa-plus" aria-hidden="true"></i> Oui, ajouter un mur</button>
                      <button type="button" class="assistant-choix-bouton" @click="etape = 'recap'"><i class="fa-solid fa-check" aria-hidden="true"></i> Non, c’est tout</button>
                    </div>
                  </template>

                  <template v-else-if="question.champ.type === 'select'">
                    <h2 class="assistant-question assistant-focus" tabindex="-1">{{ question.champ.question }}</h2>
                    <div class="assistant-choix">
                      <button
                        v-for="o in question.champ.options" :key="o.valeur" type="button"
                        class="assistant-choix-bouton" :class="{ actif: lireValeur(question) === o.valeur }"
                        @click="choisirOption(question, o.valeur)"
                      >
                        {{ o.label.split(' — ')[0] }}<small>{{ o.label.split(' — ')[1] }}</small>
                      </button>
                    </div>
                  </template>

                  <template v-else-if="question.champ.type === 'carreau'">
                    <h2 class="assistant-question assistant-focus" tabindex="-1">{{ question.champ.question }}</h2>
                    <p class="assistant-aide">Touchez un modèle pour le choisir, ou gardez le modèle standard si vous choisirez en magasin.</p>
                    <SelecteurCarreau :format="calc.dimensions.format" :model-value="lireValeur(question)" :nb-carreaux="nbCarreaux" @choisir="ecrireValeur(question, $event)" />
                  </template>

                  <template v-else-if="question.champ.nom === 'ouvertures'">
                    <h2 class="assistant-question assistant-focus" tabindex="-1">{{ question.champ.question }}</h2>
                    <p class="assistant-aide">Ajoutez chaque porte et fenêtre, puis touchez le mur dans le dessin pour la placer.</p>
                    <div class="assistant-choix ouv-choix">
                      <button
                        v-for="(m, sorte) in MENUISERIES" :key="sorte" type="button" class="assistant-choix-bouton"
                        :class="{ actif: placement === sorte }" :aria-pressed="placement === sorte" @click="choisirMenuiserie(sorte)"
                      >
                        <i :class="m.icone" aria-hidden="true"></i> {{ placement === sorte ? 'Touchez le mur…' : `Une ${m.libelle.toLowerCase()}` }}
                      </button>
                      <button type="button" class="assistant-choix-bouton" :class="{ actif: autreOuverte }" @click="autreOuverte = true; placement = ''">
                        <i class="fa-solid fa-ruler-combined" aria-hidden="true"></i> Autre
                      </button>
                    </div>

                    <ul v-if="murDe(question).menuiseries?.length" class="ouv-liste">
                      <li v-for="(m, i) in murDe(question).menuiseries" :key="i">
                        <i :class="MENUISERIES[m.type].icone" aria-hidden="true"></i>
                        <strong>{{ nomMenuiserie(murDe(question).menuiseries, i) }}</strong>
                        <span class="ouv-taille">
                          <input
                            type="number" inputmode="decimal" min="0.2" max="10" step="0.05" :value="m.largeur" :aria-label="`Largeur de la ${nomMenuiserie(murDe(question).menuiseries, i).toLowerCase()} (m)`"
                            @input="modifierMenuiserie(question, i, 'largeur', $event.target.value)"
                          />
                          ×
                          <input
                            type="number" inputmode="decimal" min="0.2" max="10" step="0.05" :value="m.hauteur" :aria-label="`Hauteur de la ${nomMenuiserie(murDe(question).menuiseries, i).toLowerCase()} (m)`"
                            @input="modifierMenuiserie(question, i, 'hauteur', $event.target.value)"
                          />
                          m
                        </span>
                        <button type="button" class="ouv-retirer" :aria-label="`Retirer la ${nomMenuiserie(murDe(question).menuiseries, i).toLowerCase()}`" @click="retirerMenuiserie(question, i)">
                          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                        </button>
                      </li>
                    </ul>

                    <div v-if="autreOuverte || autreTexte(murDe(question))" class="ouv-autre">
                      <label :for="`champ-${question.cle}`">Autre ouverture (passage, baie…)</label>
                      <div class="assistant-saisie" :class="{ erreur: calc.erreurs[question.cle] }">
                        <input
                          :id="`champ-${question.cle}`" type="number" inputmode="decimal" min="0" step="0.1" placeholder="ex. 2"
                          :value="autreTexte(murDe(question))" @input="ecrireOuvertures(question, murDe(question).menuiseries || [], $event.target.value)"
                        />
                        <span>m²</span>
                      </div>
                    </div>

                    <p v-if="totalOuvertures(murDe(question))" class="ouv-total">Total des ouvertures : <strong>{{ formaterNombre(totalOuvertures(murDe(question)), 2) }} m²</strong></p>
                    <p v-if="calc.erreurs[question.cle]" id="assistant-erreur" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ calc.erreurs[question.cle] }}</p>
                    <button type="button" class="assistant-lien assistant-passer" @click="aucuneOuverture(question)">Il n’y a ni porte ni fenêtre</button>
                  </template>

                  <template v-else>
                    <label :for="`champ-${question.cle}`" class="assistant-question">{{ question.champ.question }}</label>
                    <p class="assistant-aide">{{ question.champ.aide || aideUnite(question.champ.unite) }}</p>
                    <div class="assistant-saisie" :class="{ erreur: calc.erreurs[question.cle] }">
                      <!-- téléphone : − / + au pouce ; pointerdown.prevent garde le clavier tel quel (ouvert ou fermé) -->
                      <button type="button" class="assistant-pas" :aria-label="`Moins ${pasRapide(question.champ)} ${question.champ.unite}`" @pointerdown.prevent @click="ajuster(question, -1)"><i class="fa-solid fa-minus" aria-hidden="true"></i></button>
                      <input
                        :id="`champ-${question.cle}`" class="assistant-focus" type="number" inputmode="decimal" enterkeyhint="next"
                        :min="question.champ.min" :max="question.champ.max" :step="question.champ.pas"
                        :placeholder="`ex. ${question.champ.placeholder}`" :value="lireValeur(question)"
                        :aria-invalid="!!calc.erreurs[question.cle]" :aria-describedby="calc.erreurs[question.cle] ? 'assistant-erreur' : undefined"
                        @input="ecrireValeur(question, $event.target.value)"
                      />
                      <span>{{ question.champ.unite }}</span>
                      <button type="button" class="assistant-pas" :aria-label="`Plus ${pasRapide(question.champ)} ${question.champ.unite}`" @pointerdown.prevent @click="ajuster(question, 1)"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
                    </div>
                    <p v-if="calc.erreurs[question.cle]" id="assistant-erreur" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ calc.erreurs[question.cle] }}</p>
                  </template>
                  </div>

                  <div class="assistant-actions" :class="{ 'assistant-actions-vide': question.special || question.champ.type === 'select' }">
                    <BoutonBase variante="ghost" type="button" icone="fa-solid fa-arrow-left" @click="precedent">Retour</BoutonBase>
                    <BoutonBase v-if="!question.special && question.champ.type !== 'select'" type="submit" icone-droite="fa-solid fa-arrow-right">Continuer</BoutonBase>
                  </div>
                </div>

                <div v-else key="recap" class="assistant-panneau">
                  <h2 class="assistant-question assistant-focus" tabindex="-1">Tout est prêt !</h2>
                  <p class="assistant-aide">Vérifiez vos réponses, puis lancez le calcul.</p>

                  <ul class="assistant-recap">
                    <li v-for="ligne in recapitulatif" :key="ligne.cle">
                      <span><small>{{ ligne.label }}</small>{{ ligne.valeur }}</span>
                      <button type="button" class="assistant-lien" @click="modifier(ligne.cle)">Modifier</button>
                      <button v-if="ligne.retirer" type="button" class="assistant-lien assistant-retirer" :aria-label="`Retirer le ${ligne.label.toLowerCase()}`" @click="ligne.retirer()">
                        <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
                      </button>
                    </li>
                  </ul>
                  <button v-if="calc.typeId.value === 'mur' && estPro" type="button" class="assistant-lien assistant-ajouter" @click="ajouterMur">
                    <i class="fa-solid fa-plus" aria-hidden="true"></i> Ajouter un autre mur
                  </button>

                  <BandeauAvertissement v-if="calc.erreurGlobale.value" type="erreur" compact>
                    {{ calc.erreurGlobale.value }} — <button type="button" class="assistant-lien" @click="soumettre">réessayer</button>
                  </BandeauAvertissement>

                  <div class="assistant-actions">
                    <BoutonBase variante="ghost" type="button" icone="fa-solid fa-arrow-left" @click="precedent">Retour</BoutonBase>
                    <BoutonBase type="submit" :chargement="calc.chargement.value" icone="fa-solid fa-wand-magic-sparkles">
                      {{ calc.chargement.value ? 'Calcul en cours…' : 'Voir le prix' }}
                    </BoutonBase>
                  </div>
                </div>
              </transition>
            </div>

            <div class="assistant-maquette">
              <Maquette3D :type="calc.typeId.value" :dimensions="calc.dimensions" :mur-actif="murActif" :placement="placement" @placer="placerMenuiserie" />
            </div>
          </section>
        </transition>
      </form>
    </div>
  </div>
</template>

<style scoped>
.calc-modes { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 0 0 22px; }
.calc-modes button { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 1.5px solid var(--gris-200); border-radius: var(--rayon); background: var(--carte); font: inherit; text-align: left; color: inherit; cursor: pointer; transition: border-color var(--transition), background var(--transition); }
.calc-modes button:hover { border-color: var(--lagon-500); }
.calc-modes button[aria-selected="true"] { border-color: var(--lagon-600); background: var(--lagon-50); }
.calc-modes i { width: 40px; height: 40px; flex: none; display: grid; place-items: center; border-radius: 12px; background: var(--gris-100); color: var(--ardoise); }
.calc-modes button[aria-selected="true"] i { background: var(--lagon-600); color: #fff; }
.calc-modes span { display: flex; flex-direction: column; }
.calc-modes strong { color: var(--ardoise); }
.calc-modes small { color: var(--texte-secondaire); font-size: .8rem; }
.calc-pro { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 0 0 16px; padding: 12px 16px; border-radius: var(--rayon); background: var(--encre); color: #fff; font-size: .9rem; }
.calc-pro a { margin-left: auto; color: #fcd34d; font-weight: 700; }
.calc-pro-badge { padding: 2px 10px; border-radius: 999px; background: #fcd34d; color: var(--ardoise); font-size: .72rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
/* Téléphone : deux onglets côte à côte, sans le sous-titre, pour laisser la place au contenu */
@media (max-width: 560px) {
  .calc-modes { gap: 8px; margin-bottom: 18px; }
  .calc-modes button { flex-direction: column; align-items: flex-start; gap: 8px; min-height: 56px; padding: 10px 12px; }
  .calc-modes i { width: 32px; height: 32px; border-radius: 10px; font-size: .9rem; }
  .calc-modes strong { font-size: .9rem; line-height: 1.25; }
  .calc-modes small { display: none; }
}

.assistant-progression { height: 6px; margin: 8px auto 32px; max-width: 520px; border-radius: 999px; background: var(--gris-200); overflow: hidden; }
.assistant-progression span { display: block; height: 100%; border-radius: inherit; background: var(--lagon-600); transition: width .4s ease; }

.assistant-etape { text-align: center; }
.assistant-question { display: block; font-family: var(--font-display); font-size: clamp(1.6rem, 3.4vw, 2.3rem); font-weight: 700; line-height: 1.15; color: var(--ardoise); outline: none; }
.assistant-aide { margin: 8px 0 24px; color: var(--texte-secondaire); font-size: 1rem; }

/* minmax(0, …) : un contenu large (piste de carreaux) ne doit jamais élargir la carte au-delà de l'écran */
.assistant-carte { display: grid; grid-template-columns: minmax(0, 1fr); overflow: hidden; padding: 0; border-radius: var(--rayon-lg); }
@media (min-width: 900px) { .assistant-carte { grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); min-height: 440px; } }
.assistant-contenu { display: flex; flex-direction: column; min-width: 0; padding: 32px; }
.assistant-panneau { display: flex; flex: 1; flex-direction: column; }
.assistant-corps { display: flex; flex: 1; flex-direction: column; justify-content: center; padding: 8px 0; }
.assistant-numero { margin: 0 0 8px; color: var(--lagon-700); font-size: .78rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.assistant-ajouter { align-self: flex-start; margin-bottom: 8px; }
.assistant-maquette { order: -1; height: 300px; background: radial-gradient(circle at 50% 55%, var(--carte), var(--lagon-50) 75%); }
/* Ordinateur : hauteur fixe, collée en haut de l'écran. Elle ne suit plus la hauteur du formulaire : quand une ligne
   s'y ajoute (porte, fenêtre), le dessin ne se recadre pas et la porte reste exactement là où l'on a cliqué. */
@media (min-width: 900px) {
  .assistant-maquette {
    order: 0; align-self: start; position: sticky; top: calc(var(--hauteur-entete) + 16px);
    height: clamp(440px, calc(100vh - var(--hauteur-entete) - 140px), 620px); border-left: 1px solid var(--gris-200);
  }
}
/* Téléphone et tablette : la maquette reste collée sous l'entête pendant qu'on remplit le formulaire,
   et rétrécit quand le clavier est ouvert (--hauteur-maquette, réglée dans le script) */
@media (max-width: 899px) {
  .assistant-carte { overflow: clip; } /* « hidden » empêcherait la maquette de rester collée */
  .assistant-maquette {
    position: sticky; top: var(--hauteur-entete); z-index: 3;
    height: var(--hauteur-maquette, 220px);
    border-bottom: 1px solid var(--gris-200);
    box-shadow: 0 8px 18px -14px rgba(11, 18, 32, .35);
    transition: height .2s ease;
  }
  .assistant-contenu :is(input, .assistant-focus, .assistant-question) { scroll-margin-top: calc(var(--hauteur-entete) + var(--hauteur-maquette, 220px) + 12px); }
  /* Choix du carreau : la maquette (teinte du modèle) reste visible mais petite, la place va aux modèles */
  .etape-carreau { --hauteur-maquette: 150px; }
  .etape-carreau .assistant-maquette :deep(.maquette-legende) { display: none; } /* la surface est déjà connue, la scène reste visible */
  .etape-carreau .assistant-question { font-size: 1.5rem; }
  .etape-carreau .assistant-aide { margin-bottom: 14px; font-size: .92rem; }
  /* … et « Continuer » reste à portée du pouce en bas de l'écran */
  .etape-carreau .assistant-actions {
    position: sticky; bottom: var(--barre-onglets, 0px); z-index: 2; margin: 0 -32px -32px; padding: 12px 32px calc(12px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--gris-200); background: var(--carte); box-shadow: 0 -8px 18px -14px rgba(11, 18, 32, .3);
  }
  /* Récapitulatif : rien à saisir, la maquette défile avec la page */
  .etape-recap .assistant-maquette { position: relative; top: auto; height: 180px; }
}

.assistant-contexte { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.assistant-puce { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 999px; background: var(--lagon-50); color: var(--lagon-800); font-size: .85rem; font-weight: 700; }
.assistant-lien { padding: 0; border: 0; background: none; color: var(--lagon-700); font: inherit; font-size: .9rem; font-weight: 600; cursor: pointer; }
.assistant-lien:hover { text-decoration: underline; }

.assistant-saisie { display: flex; align-items: center; width: 100%; max-width: 420px; border: 2px solid var(--gris-300); border-radius: var(--rayon); background: var(--carte); transition: border-color .2s, box-shadow .2s; }
.assistant-saisie:focus-within { border-color: var(--lagon-500); box-shadow: 0 0 0 4px rgba(6, 182, 212, .16); }
.assistant-saisie.erreur { border-color: var(--erreur); }
.assistant-saisie input { flex: 1; min-width: 0; padding: 16px 18px; border: 0; outline: 0; background: transparent; color: var(--ardoise); font: 600 1.6rem var(--font-corps); }
.assistant-saisie span { padding-right: 18px; color: var(--gris-500); font-size: 1.2rem; font-weight: 600; }
.assistant-passer { align-self: flex-start; margin-top: 14px; }
.champ-erreur { margin-top: 10px; }

.assistant-choix { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin-top: 8px; }
.assistant-choix-bouton { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 20px 16px; border: 2px solid var(--gris-200); border-radius: var(--rayon); background: var(--carte); color: var(--ardoise); font: inherit; font-size: 1.05rem; font-weight: 700; cursor: pointer; transition: border-color .2s, background .2s, transform .2s; }
.assistant-choix-bouton i { color: var(--lagon-600); font-size: 1.2rem; }
.assistant-choix-bouton small { color: var(--texte-secondaire); font-size: .85rem; font-weight: 500; }
.assistant-choix-bouton:hover, .assistant-choix-bouton.actif { border-color: var(--lagon-500); background: var(--lagon-50); transform: translateY(-2px); }
/* Portes et fenêtres : choix compacts, liste des menuiseries placées (taille modifiable), surface « autre » */
.assistant-choix.ouv-choix { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; } /* 3 colonnes, téléphone compris */
.ouv-choix .assistant-choix-bouton, .calc-app .ouv-choix .assistant-choix-bouton { flex-direction: row; align-items: center; justify-content: center; gap: 8px; padding: 12px 10px; font-size: .92rem; text-align: center; }
.ouv-choix .assistant-choix-bouton.actif { animation: ouv-attente 1.4s ease-in-out infinite; }
@keyframes ouv-attente { 50% { box-shadow: 0 0 0 4px rgba(6, 182, 212, .2); } }
.ouv-liste { display: flex; flex-direction: column; gap: 6px; margin-top: 14px; }
.ouv-liste li { display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 12px; border: 1px solid var(--bordure); border-radius: var(--rayon); background: var(--carte); }
.ouv-liste li > i { color: var(--lagon-600); width: 18px; text-align: center; }
.ouv-liste strong { flex: 1; min-width: 0; font-size: .92rem; color: var(--ardoise); }
.ouv-taille { display: inline-flex; align-items: center; gap: 4px; color: var(--texte-secondaire); font-size: .85rem; }
.ouv-taille input { width: 64px; padding: 6px 6px; border: 1.5px solid var(--gris-300); border-radius: var(--rayon-sm); background: var(--carte); color: var(--ardoise); font: 600 .9rem var(--font-corps); text-align: center; }
.ouv-taille input:focus { outline: none; border-color: var(--lagon-500); }
.ouv-retirer { display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 50%; background: transparent; color: var(--gris-500); }
.ouv-retirer:hover { background: var(--erreur-clair); color: var(--erreur); }
.ouv-autre { display: flex; flex-direction: column; gap: 6px; margin-top: 14px; }
.ouv-autre label { font-size: .88rem; font-weight: 600; color: var(--gris-700); }
.ouv-autre .assistant-saisie input { padding: 10px 14px; font-size: 1.15rem; }
.ouv-total { margin-top: 12px; font-size: .9rem; color: var(--texte-secondaire); }
.ouv-total strong { color: var(--ardoise); }
@media (max-width: 639px) {
  .ouv-choix .assistant-choix-bouton, .calc-app .ouv-choix .assistant-choix-bouton { padding: 10px 6px; font-size: .84rem; gap: 6px; }
  .ouv-taille input { width: 54px; }
}

.assistant-actions { display: flex; justify-content: space-between; gap: 12px; margin-top: auto; padding-top: 28px; }

.assistant-recap { display: flex; flex-direction: column; margin: 0 0 14px; padding: 0; list-style: none; border-top: 1px solid var(--gris-200); }
.assistant-recap li { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--gris-200); }
.assistant-recap li > span { display: flex; flex: 1; flex-direction: column; gap: 2px; color: var(--ardoise); font-weight: 600; }
.assistant-recap small { color: var(--texte-secondaire); font-size: .8rem; font-weight: 500; }
.assistant-retirer { color: var(--erreur); }
@media (max-width: 560px) {
  .assistant-contenu { padding: 22px 18px; }
  .assistant-saisie { max-width: none; }
  .assistant-actions .btn:last-child { flex: 1; }
  .etape-carreau .assistant-actions { margin: 0 -18px -22px; padding-left: 18px; padding-right: 18px; }
}

/* ---------- Téléphone : écran d'application ---------- */
.assistant-retour-haut, .assistant-compteur, .calc-mode-court { display: none; }
@media (max-width: 639px) {
  #page-calculateur.page { padding-top: calc(var(--hauteur-entete) + 14px); padding-bottom: 24px; }

  /* deux façons de faire : sélecteur à deux segments */
  .calc-modes { gap: 0; margin: 0 0 20px; padding: 4px; border-radius: 999px; background: rgba(15, 23, 42, .06); }
  .calc-modes button { flex-direction: row; align-items: center; justify-content: center; gap: 8px; min-height: 40px; padding: 0 12px; border: 0; border-radius: 999px; background: transparent; color: var(--gris-600); }
  .calc-modes button[aria-selected="true"] { background: var(--carte); color: var(--ardoise); box-shadow: 0 1px 3px rgba(15, 23, 42, .12); }
  .calc-modes i, .calc-modes button[aria-selected="true"] i { width: auto; height: auto; border-radius: 0; background: none; color: inherit; font-size: .88rem; }
  .calc-modes button[aria-selected="true"] i { color: var(--lagon-700); }
  .calc-modes strong, .calc-modes small { display: none; }
  .calc-mode-court { display: inline; font-size: .9rem; font-weight: 600; }

  .assistant-progression { height: 4px; max-width: none; margin: 0 0 16px; }
  .assistant-progression-debut { display: none; }

  /* titres alignés à gauche, plus compacts */
  .assistant-etape { text-align: left; }
  .assistant-question { font-size: 1.55rem; line-height: 1.2; }
  .assistant-aide { margin: 6px 0 18px; font-size: .92rem; }

  /* question : plus de cadre autour, la maquette devient une carte arrondie collée sous l'entête */
  .assistant-carte { border: 0; border-radius: 0; background: none; box-shadow: none; }
  .assistant-maquette {
    top: calc(var(--hauteur-entete) + 6px); height: var(--hauteur-maquette, 200px); margin-bottom: 18px; overflow: hidden;
    border: 1px solid var(--gris-200); border-radius: 20px; box-shadow: 0 8px 20px -12px rgba(11, 18, 32, .3);
  }
  .etape-carreau { --hauteur-maquette: 140px; }
  .etape-recap .assistant-maquette { height: 160px; }
  .assistant-contenu :is(input, .assistant-focus, .assistant-question) { scroll-margin-top: calc(var(--hauteur-entete) + var(--hauteur-maquette, 200px) + 30px); }
  .assistant-contenu { padding: 0 0 84px; }

  /* barre du haut : retour, projet, avancement */
  .assistant-contexte { justify-content: flex-start; gap: 10px; margin-bottom: 16px; }
  .assistant-retour-haut {
    display: grid; place-items: center; flex: none; width: 38px; height: 38px; padding: 0;
    border: 1px solid var(--gris-200); border-radius: 50%; background: var(--carte); color: var(--ardoise); font-size: .9rem; cursor: pointer;
  }
  .assistant-retour-haut:active { background: var(--gris-100); }
  .assistant-compteur { display: inline; margin-left: auto; color: var(--gris-500); font-size: .85rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .assistant-changer, .assistant-numero { display: none; }
  .assistant-corps { justify-content: flex-start; padding: 0; }

  /* réponses */
  .assistant-saisie { border-radius: 16px; }
  .assistant-saisie input { padding: 14px 16px; font-size: 1.5rem; }
  .assistant-choix { grid-template-columns: 1fr; gap: 10px; margin-top: 4px; }
  .assistant-choix-bouton { align-items: flex-start; padding: 15px 18px; border-radius: 16px; text-align: left; font-size: 1rem; }
  .assistant-choix-bouton:hover, .assistant-choix-bouton.actif { transform: none; }
  .assistant-recap { padding: 0 16px; border: 1px solid var(--gris-200); border-radius: 16px; background: var(--carte); }
  .assistant-recap li:last-child { border-bottom: 0; }

  /* un seul gros bouton, fixé en bas au-dessus des onglets ; le retour est en haut */
  .assistant-actions, .etape-carreau .assistant-actions {
    position: fixed; left: 0; right: 0; bottom: var(--barre-onglets, 0px); z-index: 20; margin: 0; padding: 12px 16px;
    border: 0; background: linear-gradient(to top, var(--fond) 72%, transparent); box-shadow: none;
  }
  .assistant-actions .btn-ghost, .assistant-actions-vide { display: none; }
  .assistant-actions .btn { flex: 1; min-height: 52px; justify-content: center; border-radius: 999px; font-size: 1rem; }
  /* fondu sans déplacement : un parent transformé décrocherait la barre fixée en bas pendant l'animation */
  .fondu-enter-from, .fondu-leave-to { transform: none; }

  /* ---------- Écran d'application (une question numérique ou à choix) ----------
     La page ne défile plus : elle occupe exactement la zone visible entre l'entête et les onglets (ou le clavier).
     Ordre : barre du haut, maquette (prend la place libre), question, champ, « Continuer ». */
  #page-calculateur.calc-app {
    position: fixed; left: 0; right: 0; z-index: 1;
    top: calc(var(--zone-haut, 0px) + var(--hauteur-entete));
    height: calc(var(--zone-visible, 100dvh) - var(--hauteur-entete) - var(--barre-onglets, 0px));
    display: flex; flex-direction: column; min-height: 0; padding: 8px 0 12px; overflow: hidden; overscroll-behavior: none; touch-action: manipulation;
  }
  #page-calculateur.calc-app.calc-clavier { height: calc(var(--zone-visible, 100dvh) - var(--hauteur-entete)); padding-bottom: 8px; }
  .calc-app > .conteneur { display: flex; flex: 1; flex-direction: column; min-height: 0; }
  .calc-app form { display: flex; flex: 1; flex-direction: column; min-height: 0; }
  .calc-app .assistant-progression { flex: none; margin-bottom: 10px; }
  .calc-app .assistant-carte { display: flex; flex: 1; flex-direction: column; min-height: 0; overflow: visible; }
  .calc-app .assistant-contenu { display: contents; } /* ses enfants se rangent autour de la maquette */
  .calc-app .assistant-contexte { order: -2; flex: none; margin-bottom: 10px; }
  .calc-app .assistant-maquette {
    order: -1; position: relative; top: auto; flex: none; min-height: 0; height: clamp(120px, calc(var(--zone-visible, 100dvh) * .36), 320px); margin-bottom: 16px;
    border: 0; border-radius: 24px; background: radial-gradient(circle at 50% 60%, var(--carte), var(--lagon-50) 80%);
    box-shadow: inset 0 0 0 1px rgba(14, 116, 144, .1), 0 14px 30px -18px rgba(14, 116, 144, .45);
    transition: none;
  }
  .calc-app .assistant-panneau { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; } /* très petit écran : seul le bas défile */
  .calc-app .assistant-actions { margin-top: auto; }
  .calc-app .assistant-question { font-size: 1.4rem; }
  .calc-app .assistant-aide { margin: 4px 0 14px; }
  .calc-app .assistant-actions { position: static; flex: none; padding: 16px 0 0; background: none; }
  .calc-app .assistant-actions .btn { min-height: 54px; box-shadow: 0 10px 24px -12px rgba(14, 116, 144, .7); }
  .calc-app .assistant-choix-bouton { padding: 13px 16px; }

  /* champ compact : chiffre centré, − et + discrets de chaque côté */
  .calc-app .assistant-saisie { height: 50px; border-width: 1.5px; border-radius: 14px; }
  .calc-app .assistant-saisie input { padding: 0 4px; text-align: center; font-size: 1.25rem; font-variant-numeric: tabular-nums; }
  .calc-app .assistant-saisie span { padding: 0 2px 0 0; font-size: .95rem; }
  .calc-app .assistant-pas {
    display: grid; place-items: center; flex: none; width: 36px; height: 36px; margin: 0 6px; padding: 0;
    border: 0; border-radius: 10px; background: var(--lagon-50); color: var(--lagon-700); font-size: .85rem; cursor: pointer;
    -webkit-tap-highlight-color: transparent; transition: transform .12s ease, background .15s ease;
  }
  .calc-app .assistant-pas:active { transform: scale(.92); background: var(--lagon-100); }
  .calc-app .assistant-passer { margin-top: 10px; }

  /* la maquette parle d'elle-même : pas de légende ni d'astuce par-dessus */
  .calc-app .assistant-maquette :deep(.maquette-legende), .calc-app .assistant-maquette :deep(.maquette-astuce) { display: none; }

  /* clavier ouvert : on garde l'essentiel — maquette réduite, question, champ, bouton */
  .calc-app.calc-clavier .assistant-aide,
  .calc-app.calc-clavier .assistant-progression { display: none; }
  .calc-app.calc-clavier .assistant-contexte { margin-bottom: 8px; }
  .calc-app.calc-clavier .assistant-maquette { height: clamp(84px, calc(var(--zone-visible, 100dvh) * .26), 170px); margin-bottom: 12px; }
  .calc-app.calc-clavier .assistant-question { margin-bottom: 10px; font-size: 1.2rem; }
  .calc-app.calc-clavier .assistant-actions { padding-top: 10px; }
  .calc-app.calc-clavier .assistant-actions .btn { min-height: 48px; }
}
.assistant-pas { display: none; }

/* ---------- Tablette et ordinateur : une seule page fixe ----------
   La page occupe l'écran sous l'entête et ne défile pas ; un contenu trop long (projets, catalogue, modèles de carreaux,
   récapitulatif) défile dans sa propre zone, la maquette 3D reste en place. */
@media (min-width: 640px) {
  #page-calculateur.page {
    display: flex; flex-direction: column; height: calc(100dvh - var(--barre-onglets, 0px)); min-height: 0; overflow: hidden;
    padding-top: calc(var(--hauteur-entete) + 20px); padding-bottom: 20px;
  }
  #page-calculateur > .conteneur { display: flex; flex: 1; flex-direction: column; width: 100%; min-height: 0; }
  .calc-modes, .calc-pro, .assistant-progression { flex: none; }
  .calc-modes { margin-bottom: 16px; }
  .assistant-progression { margin-bottom: 18px; }
  .calc-direct, form { display: flex; flex: 1; flex-direction: column; min-height: 0; }
  .calc-direct, .assistant-etape, .assistant-contenu { min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
  .calc-direct, .assistant-etape { flex: 1; }
  .assistant-carte { flex: 1; min-height: 0; grid-template-rows: auto minmax(0, 1fr); }
  .assistant-maquette, .etape-recap .assistant-maquette { position: relative; top: auto; }
  .assistant-contenu :is(input, .assistant-focus, .assistant-question) { scroll-margin-top: 12px; }
  .etape-carreau .assistant-actions { bottom: 0; }
}
@media (min-width: 640px) {
  /* le conteneur principal (App.vue) a une hauteur minimale d'un écran : avec la barre d'onglets, il ferait défiler */
  :global(#contenu-principal:has(> #page-calculateur)) { min-height: 0; }
}
@media (min-width: 900px) {
  .assistant-carte { grid-template-rows: minmax(0, 1fr); min-height: 0; }
  /* la carte a la hauteur de l'écran, pas celle du formulaire (qui défile dedans) : la maquette la remplit
     sans se recadrer quand une ligne s'ajoute au formulaire */
  .assistant-maquette { align-self: stretch; height: auto; }
}
</style>

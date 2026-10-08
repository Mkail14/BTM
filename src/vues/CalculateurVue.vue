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
import { validerDimensions, formaterNombre } from '@/services/calculs/moteurCalculs.js'
import SelecteurTypeProjet from '@/composants/calculateur/SelecteurTypeProjet.vue'
import Maquette3D from '@/composants/calculateur/Maquette3D.vue'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import BandeauAvertissement from '@/composants/commun/BandeauAvertissement.vue'
import CatalogueDirect from '@/composants/calculateur/CatalogueDirect.vue'
import { useAuth } from '@/composables/useAuth.js'
import { ouvrirAuth } from '@/composables/useFenetreAuth.js'

const route = useRoute()
const router = useRouter()
const calc = useCalculateur()
const { estPro, connecte } = useAuth()

// Le devis est réservé aux comptes : sans compte, l'estimation est gardée et la fenêtre « Créer un compte » s'ouvre ;
// une fois connecté, la personne arrive sur son devis.
async function allerAuDevis() {
  if (!connecte.value) return ouvrirAuth('inscription', { redirect: '/resultats', message: 'Créez votre compte gratuit pour obtenir votre devis.' })
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
    liste.push({ cle: 'autreMur', special: true })
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
  ecrireValeur(q, valeur)
  suivant()
}

function aucuneOuverture(q) {
  ecrireValeur(q, '0')
  suivant()
}

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
    calc.erreurGlobale.value = `Le devis n’a pas pu s’afficher (${e?.message || 'erreur inconnue'})`
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

// ---------- Téléphone : la maquette 3D reste visible pendant la saisie ----------
// Sous 900 px, la maquette est collée sous l'entête (CSS). Quand le clavier s'ouvre, la zone visible rétrécit :
// la maquette se fait plus petite et le champ en cours de saisie est ramené juste en dessous d'elle.
const TELEPHONE = '(max-width: 899px)'
const hauteurMaquette = ref('')
let hauteurVisibleMax = 0
const styleMaquette = computed(() => (hauteurMaquette.value ? { '--hauteur-maquette': hauteurMaquette.value } : null))

function ramenerSousMaquette(el = document.activeElement) {
  if (!el?.closest?.('.assistant-contenu') || !window.matchMedia(TELEPHONE).matches) return
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
  const etaitOuvert = !!hauteurMaquette.value
  hauteurMaquette.value = clavierOuvert ? `${Math.round(Math.min(200, Math.max(120, vv.height * 0.3)))}px` : ''
  if (clavierOuvert) ramenerSousMaquette()
  // clavier refermé : la maquette reprend sa taille, la question en cours ne doit pas passer dessous
  else if (etaitOuvert) nextTick(() => ramenerSousMaquette(document.querySelector('.assistant-contenu input, .assistant-contenu .assistant-focus')))
}
const surRotation = () => { hauteurVisibleMax = 0; surZoneVisible() }

onMounted(() => {
  // hauteur de référence, clavier fermé : sans elle, le premier rétrécissement (ouverture du clavier) passerait inaperçu
  hauteurVisibleMax = Math.max(window.visualViewport?.height || 0, window.innerHeight)
  window.visualViewport?.addEventListener('resize', surZoneVisible)
  window.addEventListener('orientationchange', surRotation)
})
onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener('resize', surZoneVisible)
  window.removeEventListener('orientationchange', surRotation)
})

// ---------- Récapitulatif ----------
function formater(champ, valeur) {
  if (champ.type === 'select') return champ.options.find((o) => o.valeur === valeur)?.label.split(' — ')[0] || valeur
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
    const ouv = Number(String(m.ouvertures || 0).replace(',', '.')) ? `, ${formater(ouvertures, m.ouvertures)} d’ouvertures` : ', sans ouverture'
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
  <div id="page-calculateur" class="page">
    <div class="conteneur">
      <h1 class="visually-hidden">Le devis de votre projet</h1>

      <div v-if="mode === 'mesures'" class="assistant-progression" role="progressbar" :aria-valuenow="position" aria-valuemin="1" :aria-valuemax="total" :aria-label="`Étape ${position} sur ${total}`">
        <span :style="{ width: `${(position / total) * 100}%` }"></span>
      </div>

      <!-- Devis pro en cours : l'estimation suivante le rejoindra -->
      <p v-if="estPro && calc.cumul.value.length" class="calc-pro">
        <span class="calc-pro-badge">Pro</span>
        <span>Devis en cours : <strong>{{ calc.cumul.value.length }} élément{{ calc.cumul.value.length > 1 ? 's' : '' }}</strong>. Ce que vous calculez maintenant s’y ajoutera.</span>
        <router-link to="/resultats">Voir le devis</router-link>
      </p>

      <!-- Deux façons de faire son devis -->
      <div v-if="mode === 'direct' || etape === 'type'" class="calc-modes" role="tablist" aria-label="Façon de faire mon devis">
        <button type="button" role="tab" :aria-selected="mode === 'mesures'" @click="changerMode('mesures')">
          <i class="fa-solid fa-ruler-combined" aria-hidden="true"></i><span><strong>Selon mes mesures</strong><small>Je donne les dimensions, BTM calcule les quantités</small></span>
        </button>
        <button type="button" role="tab" :aria-selected="mode === 'direct'" @click="changerMode('direct')">
          <i class="fa-solid fa-cart-shopping" aria-hidden="true"></i><span><strong>Je sais ce qu’il me faut</strong><small>Je choisis mes matériaux et mes quantités</small></span>
        </button>
      </div>

      <template v-if="mode === 'direct'">
        <BandeauAvertissement v-if="calc.erreurGlobale.value" type="erreur" compact>{{ calc.erreurGlobale.value }}</BandeauAvertissement>
        <CatalogueDirect :initial="achatInitial" @valider="validerAchat" />
      </template>

      <form v-else novalidate @submit.prevent="valider">
        <transition name="fondu" mode="out-in">
          <!-- 1. Choix du projet -->
          <section v-if="etape === 'type'" key="type" class="assistant-etape">
            <h2 class="assistant-question assistant-focus" tabindex="-1">Que voulez-vous construire ?</h2>
            <p class="assistant-aide">Touchez le projet qui correspond au vôtre.</p>
            <SelecteurTypeProjet :model-value="calc.typeId.value" @update:model-value="choisirType" />
          </section>

          <!-- 2. Questions et récapitulatif : la maquette 3D reste en place, seul le texte change -->
          <section v-else key="assistant" class="carte assistant-carte" :style="styleMaquette" @focusin="ramenerSousMaquette($event.target)">
            <div class="assistant-contenu">
              <p class="assistant-contexte">
                <span class="assistant-puce">
                  <i :class="calc.type.value?.icone" aria-hidden="true"></i> {{ calc.type.value?.libelle }}<template v-if="question?.mur && calc.dimensions.autresMurs?.length"> {{ question.mur }}</template>
                </span>
                <button type="button" class="assistant-lien" @click="etape = 'type'">Changer de projet</button>
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

                  <template v-else>
                    <label :for="`champ-${question.cle}`" class="assistant-question">{{ question.champ.question }}</label>
                    <p class="assistant-aide">{{ question.champ.aide || aideUnite(question.champ.unite) }}</p>
                    <div class="assistant-saisie" :class="{ erreur: calc.erreurs[question.cle] }">
                      <input
                        :id="`champ-${question.cle}`" class="assistant-focus" type="number" inputmode="decimal"
                        :min="question.champ.min" :max="question.champ.max" :step="question.champ.pas"
                        :placeholder="`ex. ${question.champ.placeholder}`" :value="lireValeur(question)"
                        :aria-invalid="!!calc.erreurs[question.cle]" :aria-describedby="calc.erreurs[question.cle] ? 'assistant-erreur' : undefined"
                        @input="ecrireValeur(question, $event.target.value)"
                      />
                      <span>{{ question.champ.unite }}</span>
                    </div>
                    <p v-if="calc.erreurs[question.cle]" id="assistant-erreur" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ calc.erreurs[question.cle] }}</p>
                    <button v-if="question.champ.nom === 'ouvertures'" type="button" class="assistant-lien assistant-passer" @click="aucuneOuverture(question)">
                      Il n’y a ni porte ni fenêtre
                    </button>
                  </template>
                  </div>

                  <div class="assistant-actions">
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
                  <button v-if="calc.typeId.value === 'mur'" type="button" class="assistant-lien assistant-ajouter" @click="ajouterMur">
                    <i class="fa-solid fa-plus" aria-hidden="true"></i> Ajouter un autre mur
                  </button>

                  <BandeauAvertissement v-if="calc.erreurGlobale.value" type="erreur" compact>
                    {{ calc.erreurGlobale.value }} — <button type="button" class="assistant-lien" @click="soumettre">réessayer</button>
                  </BandeauAvertissement>

                  <div class="assistant-actions">
                    <BoutonBase variante="ghost" type="button" icone="fa-solid fa-arrow-left" @click="precedent">Retour</BoutonBase>
                    <BoutonBase type="submit" :chargement="calc.chargement.value" icone="fa-solid fa-wand-magic-sparkles">
                      {{ calc.chargement.value ? 'Calcul en cours…' : 'Obtenir mon devis' }}
                    </BoutonBase>
                  </div>
                </div>
              </transition>
            </div>

            <div class="assistant-maquette">
              <Maquette3D :type="calc.typeId.value" :dimensions="calc.dimensions" :mur-actif="murActif" />
            </div>
          </section>
        </transition>
      </form>
    </div>
  </div>
</template>

<style scoped>
.calc-modes { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 0 0 22px; }
.calc-modes button { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 1.5px solid var(--gris-200); border-radius: var(--rayon); background: #fff; font: inherit; text-align: left; color: inherit; cursor: pointer; transition: border-color var(--transition), background var(--transition); }
.calc-modes button:hover { border-color: var(--lagon-500); }
.calc-modes button[aria-selected="true"] { border-color: var(--lagon-600); background: var(--lagon-50); }
.calc-modes i { width: 40px; height: 40px; flex: none; display: grid; place-items: center; border-radius: 12px; background: var(--gris-100); color: var(--ardoise); }
.calc-modes button[aria-selected="true"] i { background: var(--lagon-600); color: #fff; }
.calc-modes span { display: flex; flex-direction: column; }
.calc-modes strong { color: var(--ardoise); }
.calc-modes small { color: var(--texte-secondaire); font-size: .8rem; }
.calc-pro { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 0 0 16px; padding: 12px 16px; border-radius: var(--rayon); background: var(--ardoise); color: #fff; font-size: .9rem; }
.calc-pro a { margin-left: auto; color: #fcd34d; font-weight: 700; }
.calc-pro-badge { padding: 2px 10px; border-radius: 999px; background: #fcd34d; color: var(--ardoise); font-size: .72rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
@media (max-width: 560px) { .calc-modes { grid-template-columns: 1fr; } }

.assistant-progression { height: 6px; margin: 8px auto 32px; max-width: 520px; border-radius: 999px; background: var(--gris-200); overflow: hidden; }
.assistant-progression span { display: block; height: 100%; border-radius: inherit; background: var(--lagon-600); transition: width .4s ease; }

.assistant-etape { text-align: center; }
.assistant-question { display: block; font-family: var(--font-display); font-size: clamp(1.6rem, 3.4vw, 2.3rem); font-weight: 700; line-height: 1.15; color: var(--ardoise); outline: none; }
.assistant-aide { margin: 8px 0 24px; color: var(--texte-secondaire); font-size: 1rem; }

.assistant-carte { display: grid; grid-template-columns: 1fr; overflow: hidden; padding: 0; border-radius: var(--rayon-lg); }
@media (min-width: 900px) { .assistant-carte { grid-template-columns: 1.1fr 1fr; min-height: 440px; } }
.assistant-contenu { display: flex; flex-direction: column; padding: 32px; }
.assistant-panneau { display: flex; flex: 1; flex-direction: column; }
.assistant-corps { display: flex; flex: 1; flex-direction: column; justify-content: center; padding: 8px 0; }
.assistant-numero { margin: 0 0 8px; color: var(--lagon-700); font-size: .78rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.assistant-ajouter { align-self: flex-start; margin-bottom: 8px; }
.assistant-maquette { order: -1; height: 300px; background: radial-gradient(circle at 50% 55%, #fff, var(--lagon-50) 75%); }
@media (min-width: 900px) { .assistant-maquette { order: 0; height: auto; border-left: 1px solid var(--gris-200); } }
/* Téléphone et tablette : la maquette reste collée sous l'entête pendant qu'on remplit le formulaire,
   et rétrécit quand le clavier est ouvert (--hauteur-maquette, réglée dans le script) */
@media (max-width: 899px) {
  .assistant-carte { overflow: clip; } /* « hidden » empêcherait la maquette de rester collée */
  .assistant-maquette {
    position: sticky; top: var(--hauteur-entete); z-index: 3;
    height: var(--hauteur-maquette, 260px);
    border-bottom: 1px solid var(--gris-200);
    box-shadow: 0 8px 18px -14px rgba(11, 18, 32, .35);
    transition: height .2s ease;
  }
  .assistant-contenu :is(input, .assistant-focus, .assistant-question) { scroll-margin-top: calc(var(--hauteur-entete) + var(--hauteur-maquette, 260px) + 12px); }
}

.assistant-contexte { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.assistant-puce { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 999px; background: var(--lagon-50); color: var(--lagon-800); font-size: .85rem; font-weight: 700; }
.assistant-lien { padding: 0; border: 0; background: none; color: var(--lagon-700); font: inherit; font-size: .9rem; font-weight: 600; cursor: pointer; }
.assistant-lien:hover { text-decoration: underline; }

.assistant-saisie { display: flex; align-items: center; width: 100%; max-width: 420px; border: 2px solid var(--gris-300); border-radius: var(--rayon); background: #fff; transition: border-color .2s, box-shadow .2s; }
.assistant-saisie:focus-within { border-color: var(--lagon-500); box-shadow: 0 0 0 4px rgba(6, 182, 212, .16); }
.assistant-saisie.erreur { border-color: var(--erreur); }
.assistant-saisie input { flex: 1; min-width: 0; padding: 16px 18px; border: 0; outline: 0; background: transparent; color: var(--ardoise); font: 600 1.6rem var(--font-corps); }
.assistant-saisie span { padding-right: 18px; color: var(--gris-500); font-size: 1.2rem; font-weight: 600; }
.assistant-passer { align-self: flex-start; margin-top: 14px; }
.champ-erreur { margin-top: 10px; }

.assistant-choix { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin-top: 8px; }
.assistant-choix-bouton { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 20px 16px; border: 2px solid var(--gris-200); border-radius: var(--rayon); background: #fff; color: var(--ardoise); font: inherit; font-size: 1.05rem; font-weight: 700; cursor: pointer; transition: border-color .2s, background .2s, transform .2s; }
.assistant-choix-bouton i { color: var(--lagon-600); font-size: 1.2rem; }
.assistant-choix-bouton small { color: var(--texte-secondaire); font-size: .85rem; font-weight: 500; }
.assistant-choix-bouton:hover, .assistant-choix-bouton.actif { border-color: var(--lagon-500); background: var(--lagon-50); transform: translateY(-2px); }

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
}
</style>

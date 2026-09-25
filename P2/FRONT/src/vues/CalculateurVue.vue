<script setup>
/**
 * Calculateur en assistant pas à pas : type de projet → une question par écran → récapitulatif → calcul.
 */
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCalculateur } from '@/composables/useCalculateur.js'
import { typesProjets } from '@/donnees/typesProjets.js'
import { validerDimensions, formaterNombre } from '@/services/calculs/moteurCalculs.js'
import SelecteurTypeProjet from '@/composants/calculateur/SelecteurTypeProjet.vue'
import Maquette3D from '@/composants/calculateur/Maquette3D.vue'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import BandeauAvertissement from '@/composants/commun/BandeauAvertissement.vue'

const route = useRoute()
const router = useRouter()
const calc = useCalculateur()

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
  const ok = await calc.calculer()
  if (ok) return router.push('/resultats')
  const premiere = Object.keys(calc.erreurs)[0]
  if (premiere) modifier(premiere)
}

function focaliser() {
  nextTick(() => document.querySelector('.assistant-focus')?.focus())
}
watch(etape, focaliser)

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

      <div class="assistant-progression" role="progressbar" :aria-valuenow="position" aria-valuemin="1" :aria-valuemax="total" :aria-label="`Étape ${position} sur ${total}`">
        <span :style="{ width: `${(position / total) * 100}%` }"></span>
      </div>

      <form novalidate @submit.prevent="valider">
        <transition name="fondu" mode="out-in">
          <!-- 1. Choix du projet -->
          <section v-if="etape === 'type'" key="type" class="assistant-etape">
            <h2 class="assistant-question assistant-focus" tabindex="-1">Que voulez-vous construire ?</h2>
            <p class="assistant-aide">Touchez le projet qui correspond au vôtre.</p>
            <SelecteurTypeProjet :model-value="calc.typeId.value" @update:model-value="choisirType" />
          </section>

          <!-- 2. Questions et récapitulatif : la maquette 3D reste en place, seul le texte change -->
          <section v-else key="assistant" class="carte assistant-carte">
            <div class="assistant-contenu">
              <p class="assistant-contexte">
                <span class="assistant-puce">
                  <i :class="calc.type.value?.icone" aria-hidden="true"></i> {{ calc.type.value?.libelle }}<template v-if="question?.mur && calc.dimensions.autresMurs?.length"> {{ question.mur }}</template>
                </span>
                <button type="button" class="assistant-lien" @click="etape = 'type'">Changer de projet</button>
              </p>

              <transition name="fondu" mode="out-in">
                <div v-if="question" :key="question.cle" class="assistant-panneau">
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
                    <p v-if="question.champ.aide" class="assistant-aide">{{ question.champ.aide }}</p>
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
.assistant-progression { height: 6px; margin: 8px auto 32px; max-width: 520px; border-radius: 999px; background: var(--gris-200); overflow: hidden; }
.assistant-progression span { display: block; height: 100%; border-radius: inherit; background: var(--lagon-600); transition: width .4s ease; }

.assistant-etape { text-align: center; }
.assistant-question { display: block; font-family: var(--font-display); font-size: clamp(1.6rem, 3.4vw, 2.3rem); font-weight: 700; line-height: 1.15; color: var(--ardoise); outline: none; }
.assistant-aide { margin: 8px 0 24px; color: var(--texte-secondaire); font-size: 1rem; }

.assistant-carte { display: grid; grid-template-columns: 1fr; overflow: hidden; padding: 0; border-radius: var(--rayon-lg); }
@media (min-width: 900px) { .assistant-carte { grid-template-columns: 1.1fr 1fr; min-height: 440px; } }
.assistant-contenu { display: flex; flex-direction: column; padding: 32px; }
.assistant-panneau { display: flex; flex: 1; flex-direction: column; }
.assistant-ajouter { align-self: flex-start; margin-bottom: 8px; }
.assistant-maquette { order: -1; height: 300px; background: radial-gradient(circle at 50% 55%, #fff, var(--lagon-50) 75%); }
@media (min-width: 900px) { .assistant-maquette { order: 0; height: auto; border-left: 1px solid var(--gris-200); } }

.assistant-contexte { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.assistant-puce { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 999px; background: var(--lagon-50); color: var(--lagon-800); font-size: .85rem; font-weight: 700; }
.assistant-lien { padding: 0; border: 0; background: none; color: var(--lagon-700); font: inherit; font-size: .9rem; font-weight: 600; cursor: pointer; }
.assistant-lien:hover { text-decoration: underline; }

.assistant-saisie { display: flex; align-items: center; max-width: 340px; border: 2px solid var(--gris-300); border-radius: var(--rayon); background: #fff; transition: border-color .2s, box-shadow .2s; }
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

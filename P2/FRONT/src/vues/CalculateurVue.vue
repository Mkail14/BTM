<script setup>
import { computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCalculateur } from '@/composables/useCalculateur.js'
import { typesProjets } from '@/donnees/typesProjets.js'
import SelecteurTypeProjet from '@/composants/calculateur/SelecteurTypeProjet.vue'
import FormulaireMur from '@/composants/calculateur/FormulaireMur.vue'
import FormulaireDalle from '@/composants/calculateur/FormulaireDalle.vue'
import FormulaireFondation from '@/composants/calculateur/FormulaireFondation.vue'
import FormulaireTerrasse from '@/composants/calculateur/FormulaireTerrasse.vue'
import ApercuProjet from '@/composants/calculateur/ApercuProjet.vue'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import BandeauAvertissement from '@/composants/commun/BandeauAvertissement.vue'

const route = useRoute()
const router = useRouter()
const calc = useCalculateur()

const formulaires = { mur: FormulaireMur, dalle: FormulaireDalle, fondation: FormulaireFondation, terrasse: FormulaireTerrasse }
const composantFormulaire = computed(() => formulaires[calc.typeId.value] || null)
const nbErreurs = computed(() => Object.keys(calc.erreurs).length)

function appliquerQuery() {
  const t = route.query.type
  if (t && typesProjets.some((x) => x.id === t) && t !== calc.typeId.value) calc.choisirType(t)
}
onMounted(appliquerQuery)
watch(() => route.query.type, appliquerQuery)

function changerType(id) {
  calc.choisirType(id)
  router.replace({ query: { ...route.query, type: id } })
}

async function soumettre() {
  const ok = await calc.calculer()
  if (ok) router.push('/resultats')
  else if (nbErreurs.value) {
    // focus sur le premier champ en erreur (BNF03)
    const premier = Object.keys(calc.erreurs)[0]
    document.getElementById(`champ-${premier}`)?.focus()
  }
}
</script>

<template>
  <div id="page-calculateur" class="page">
    <div class="conteneur">
      <header class="page-entete">
        <span class="section-surtitre"><i class="fa-solid fa-calculator"></i> Calculateur BTP</span>
        <h1 class="page-titre">Estimez votre projet</h1>
        <p class="page-sous-titre">Choisissez un type de projet, saisissez vos dimensions et obtenez une estimation indicative en quelques secondes.</p>
      </header>

      <form class="calculateur" novalidate @submit.prevent="soumettre">
        <SelecteurTypeProjet :model-value="calc.typeId.value" @update:model-value="changerType" />

        <transition name="fondu" mode="out-in">
          <section v-if="calc.type.value" :key="calc.typeId.value" class="carte calculateur-formulaire" aria-labelledby="titre-dimensions">
            <div class="calculateur-formulaire-grille">
              <div>
                <h2 id="titre-dimensions" class="calculateur-etape">2. Dimensions — {{ calc.type.value.libelle }}</h2>
                <p class="texte-secondaire calculateur-intro">{{ calc.type.value.description }}</p>

                <component :is="composantFormulaire" :dimensions="calc.dimensions" :erreurs="calc.erreurs"
                  @update="calc.definirDimensions" @blur="calc.validerChamp" />

                <transition name="glisser">
                  <BandeauAvertissement v-if="calc.erreurGlobale.value" type="erreur" compact class="calculateur-erreur">
                    {{ calc.erreurGlobale.value }} — <button type="button" class="lien-reessayer" @click="soumettre">réessayer</button>
                  </BandeauAvertissement>
                  <BandeauAvertissement v-else-if="nbErreurs" type="erreur" compact class="calculateur-erreur">
                    Veuillez corriger {{ nbErreurs === 1 ? 'le champ signalé' : `les ${nbErreurs} champs signalés` }} avant de lancer le calcul.
                  </BandeauAvertissement>
                </transition>

                <div class="calculateur-actions">
                  <BoutonBase type="submit" :chargement="calc.chargement.value" icone="fa-solid fa-wand-magic-sparkles">
                    {{ calc.chargement.value ? 'Calcul en cours…' : 'Calculer mon estimation' }}
                  </BoutonBase>
                  <BoutonBase variante="ghost" type="button" @click="calc.reinitialiser()">Réinitialiser</BoutonBase>
                </div>
              </div>

              <aside class="calculateur-aside">
                <ApercuProjet :type="calc.typeId.value" />
                <dl class="calculateur-hypotheses">
                  <dt><i class="fa-solid fa-circle-info"></i> Hypothèses de calcul</dt>
                  <dd v-if="calc.typeId.value === 'mur'">Parpaings 20×20×40 (+5 % de marge), 1 sac de ciment / 2,5 m², main-d’œuvre 8 h / 10 m² à 15 €/h, livraison 50 €.</dd>
                  <dd v-else-if="calc.typeId.value === 'dalle'">Béton 2,4 t/m³, ferraillage 5 kg/m², gravier 0,8 t/m³, main-d’œuvre 4 h / 10 m² à 20 €/h, livraison 50 € + 20 €/t.</dd>
                  <dd v-else-if="calc.typeId.value === 'fondation'">Béton armé 2,4 t/m³, acier 50 kg/m³, main-d’œuvre 6 h/m³ à 20 €/h, livraison 100 € + 20 €/t.</dd>
                  <dd v-else>Calcul d’une dalle + finition carrelage (50 €/m²) ou béton lissé (15 €/m²).</dd>
                </dl>
              </aside>
            </div>
          </section>

          <section v-else class="calculateur-placeholder" key="vide">
            <i class="fa-solid fa-arrow-up-long"></i>
            <p>Sélectionnez un type de projet ci-dessus pour afficher le formulaire.</p>
          </section>
        </transition>
      </form>

      <BandeauAvertissement compact class="calculateur-disclaimer" />
    </div>
  </div>
</template>

<style scoped>
.calculateur { display: flex; flex-direction: column; gap: 32px; }
.calculateur-formulaire { padding: 28px; border-radius: var(--rayon-lg); }
.calculateur-formulaire-grille { display: grid; gap: 32px; grid-template-columns: 1fr; }
@media (min-width: 900px) { .calculateur-formulaire-grille { grid-template-columns: 1.4fr 1fr; } }
.calculateur-etape { font-size: 1.5rem; font-weight: 700; color: var(--ardoise); }
.calculateur-intro { margin: 6px 0 22px; font-size: .95rem; }
:deep(.formulaire-grille) { display: grid; gap: 18px; grid-template-columns: 1fr; }
@media (min-width: 640px) { :deep(.formulaire-grille) { grid-template-columns: repeat(2, 1fr); } }
.calculateur-erreur { margin-top: 20px; }
.lien-reessayer { background: none; border: none; color: inherit; text-decoration: underline; font-weight: 600; padding: 0; }
.calculateur-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 26px; }
.calculateur-aside { display: flex; flex-direction: column; gap: 16px; }
.calculateur-hypotheses { margin: 0; background: var(--gris-50); border-radius: var(--rayon); padding: 16px 18px; font-size: .88rem; }
.calculateur-hypotheses dt { font-weight: 700; color: var(--lagon-800); display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.calculateur-hypotheses dd { margin: 0; color: var(--texte-secondaire); line-height: 1.55; }
.calculateur-placeholder {
  text-align: center; padding: 48px 20px; border: 2px dashed var(--lagon-200); border-radius: var(--rayon-lg); color: var(--texte-secondaire);
}
.calculateur-placeholder i { font-size: 1.6rem; color: var(--lagon-400); margin-bottom: 10px; animation: flotter 2.4s ease-in-out infinite; }
.calculateur-disclaimer { margin-top: 32px; }
</style>

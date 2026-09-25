<script setup>
/**
 * Résultats : le prix d'abord, puis ce qu'il faut acheter, puis (facultatif) le fournisseur.
 * Une seule action principale : télécharger le PDF.
 */
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useCalculateur } from '@/composables/useCalculateur.js'
import { useProjets } from '@/composables/useProjets.js'
import { useAuth } from '@/composables/useAuth.js'
import { formaterEuros, formaterNombre, formaterQuantite, sujetEstimation } from '@/services/calculs/moteurCalculs.js'
import { exporterEstimationPdf } from '@/services/export/exportPdf.js'
import { trouverTypeProjet } from '@/donnees/typesProjets.js'
import SelecteurFournisseur from '@/composants/resultats/SelecteurFournisseur.vue'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import BandeauAvertissement from '@/composants/commun/BandeauAvertissement.vue'
import EtatVide from '@/composants/commun/EtatVide.vue'

const router = useRouter()
const calc = useCalculateur()
const { sauvegarder } = useProjets()
const { connecte, backendDisponible } = useAuth()

const resultat = computed(() => calc.resultat.value)
const type = computed(() => resultat.value ? trouverTypeProjet(resultat.value.type) : null)
const fournisseur = ref(null)

const titre = computed(() => {
  const { sujet, pluriel } = sujetEstimation(resultat.value)
  return `${sujet} ${pluriel ? 'coûteront' : 'coûtera'} environ`
})

const resume = computed(() => {
  const r = resultat.value
  const nbMurs = (r.dimensions?.autresMurs?.length || 0) + 1
  const principale = r.mesures?.find((m) => m.principale)
  const libelle = nbMurs > 1 ? `${nbMurs} murs` : type.value.libelle
  return principale ? `${libelle} · ${principale.label.toLowerCase()} ${formaterNombre(principale.valeur, 2)} ${principale.unite}` : libelle
})

const repartition = computed(() => [
  { label: 'Matériaux', valeur: resultat.value.totalMateriaux },
  { label: 'Main-d’œuvre', detail: `${formaterNombre(resultat.value.mainOeuvre.heures, 1)} h de travail`, valeur: resultat.value.mainOeuvre.total },
  { label: 'Livraison', valeur: resultat.value.livraison }
])

const icones = { parpaing: 'fa-solid fa-cube', ciment: 'fa-solid fa-sack-xmark', sable: 'fa-solid fa-mound', beton: 'fa-solid fa-truck-droplet', beton_arme: 'fa-solid fa-truck-droplet', ferraillage: 'fa-solid fa-border-all', acier: 'fa-solid fa-bars', gravier: 'fa-solid fa-hill-rockslide', carrelage: 'fa-solid fa-table-cells', beton_lisse: 'fa-solid fa-brush' }

// ---------- PDF ----------
const nomProjet = ref('')
const exportEnCours = ref(false)

async function telecharger() {
  exportEnCours.value = true
  try {
    await exporterEstimationPdf({ nom: nomProjet.value.trim(), resultat: resultat.value, fournisseur: fournisseur.value })
  } catch (e) {
    console.error(e)
    alert('Impossible de générer le PDF. Réessayez.')
  } finally {
    exportEnCours.value = false
  }
}

// ---------- Sauvegarde ----------
const dialogueOuvert = ref(false)
const compteRequis = ref(false)
const nomErreur = ref('')
const sauvegardeEnCours = ref(false)
const messageSucces = ref('')

function ouvrirDialogue() {
  if (backendDisponible && !connecte.value) { compteRequis.value = true; return }
  nomProjet.value = nomProjet.value || `${type.value?.libelle} du ${new Date().toLocaleDateString('fr-FR')}`
  dialogueOuvert.value = true
  setTimeout(() => document.getElementById('nom-projet')?.select(), 50)
}

async function confirmerSauvegarde() {
  nomErreur.value = ''
  if (!nomProjet.value.trim()) { nomErreur.value = 'Donnez un nom à votre projet'; return }
  sauvegardeEnCours.value = true
  try {
    await sauvegarder({ nom: nomProjet.value, resultat: resultat.value, fournisseur: fournisseur.value })
    dialogueOuvert.value = false
    messageSucces.value = `« ${nomProjet.value.trim()} » est enregistré.`
  } finally {
    sauvegardeEnCours.value = false
  }
}

function modifier() { router.push({ path: '/calculateur', query: { type: resultat.value.type } }) }
function nouvelleEstimation() { calc.reinitialiser(); router.push('/calculateur') }
</script>

<template>
  <div id="page-resultats" class="page">
    <div class="conteneur resultats">
      <template v-if="resultat">
        <!-- 1. Le prix -->
        <section class="carte resultats-prix" aria-labelledby="resultats-titre">
          <p class="resultats-resume">
            <span><i :class="type.icone" aria-hidden="true"></i> {{ resume }}</span>
            <button type="button" class="resultats-lien" @click="modifier"><i class="fa-solid fa-pen" aria-hidden="true"></i> Modifier</button>
          </p>
          <h1 id="resultats-titre" class="resultats-titre">{{ titre }}</h1>
          <p class="resultats-total prix">{{ formaterEuros(resultat.total) }}</p>

          <ul class="resultats-repartition">
            <li v-for="p in repartition" :key="p.label">
              <span>{{ p.label }}<small v-if="p.detail">{{ p.detail }}</small></span>
              <strong class="prix">{{ formaterEuros(p.valeur) }}</strong>
            </li>
          </ul>

          <div class="resultats-actions">
            <BoutonBase icone="fa-solid fa-file-arrow-down" :chargement="exportEnCours" @click="telecharger">Télécharger le PDF</BoutonBase>
            <BoutonBase variante="secondaire" icone="fa-regular fa-bookmark" @click="ouvrirDialogue">Enregistrer</BoutonBase>
          </div>        </section>

        <transition name="glisser">
          <BandeauAvertissement v-if="messageSucces" type="succes" compact>
            {{ messageSucces }} <router-link to="/dashboard" class="resultats-lien">Voir mes projets →</router-link>
          </BandeauAvertissement>
        </transition>

        <!-- 2. Ce qu'il faut acheter -->
        <section class="carte resultats-bloc" aria-labelledby="achats-titre">
          <h2 id="achats-titre">Ce qu’il faut acheter</h2>
          <ul class="resultats-achats">
            <li v-for="l in resultat.lignes" :key="l.id">
              <span class="resultats-achat-icone"><i :class="icones[l.id] || 'fa-solid fa-box'" aria-hidden="true"></i></span>
              <span class="resultats-achat-texte">
                <strong>{{ formaterQuantite(l.quantite, l.unite) }}</strong>
                <small>{{ l.libelle }} · {{ formaterEuros(l.prixUnitaire) }} / {{ l.unite === 'u' ? 'unité' : l.unite }}</small>
              </span>
              <span class="prix">{{ formaterEuros(l.sousTotal) }}</span>
            </li>
          </ul>
          <p class="resultats-sous-total">Total matériaux <strong class="prix">{{ formaterEuros(resultat.totalMateriaux) }}</strong></p>
        </section>

        <!-- 3. Facultatif -->
        <SelecteurFournisseur :model-value="calc.fournisseurId.value" @update:model-value="calc.choisirFournisseur" @fournisseur="fournisseur = $event" />

        <details class="resultats-calcul">
          <summary>Comment est fait le calcul ?</summary>
          <p>{{ type.hypotheses }}</p>
          <p>Prix TTC, hors terrassement et études.</p>
        </details>

        <p class="resultats-fin">
          <button type="button" class="resultats-lien" @click="nouvelleEstimation"><i class="fa-solid fa-plus" aria-hidden="true"></i> Faire un nouveau devis</button>
        </p>

        <!-- Compte requis pour enregistrer -->
        <transition name="fondu">
          <div v-if="compteRequis" class="modale-fond" @click.self="compteRequis = false">
            <div class="modale" role="dialog" aria-modal="true" aria-labelledby="compte-titre">
              <h2 id="compte-titre">Créez un compte pour enregistrer</h2>
              <p class="texte-secondaire">Un compte gratuit est nécessaire pour enregistrer ce devis et le retrouver sur tous vos appareils. Votre estimation sera conservée.</p>
              <div class="modale-actions">
                <BoutonBase variante="ghost" type="button" @click="compteRequis = false">Annuler</BoutonBase>
                <BoutonBase variante="secondaire" :to="{ path: '/connexion', query: { redirect: '/resultats' } }">Se connecter</BoutonBase>
                <BoutonBase :to="{ path: '/inscription', query: { redirect: '/resultats' } }" icone="fa-solid fa-user-plus">Créer un compte</BoutonBase>
              </div>
            </div>
          </div>
        </transition>

        <!-- Enregistrement -->
        <transition name="fondu">
          <div v-if="dialogueOuvert" class="modale-fond" @click.self="dialogueOuvert = false">
            <div class="modale" role="dialog" aria-modal="true" aria-labelledby="modale-titre">
              <h2 id="modale-titre">Enregistrer le devis</h2>
              <p class="texte-secondaire">Vous le retrouverez dans « Mes projets ».</p>
              <form @submit.prevent="confirmerSauvegarde" novalidate>
                <div class="champ">
                  <label for="nom-projet">Nom du projet</label>
                  <input id="nom-projet" v-model="nomProjet" type="text" maxlength="120" placeholder="Ex. Mur de clôture Kawéni" :aria-invalid="!!nomErreur" />
                  <p v-if="nomErreur" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ nomErreur }}</p>
                </div>
                <div class="modale-actions">
                  <BoutonBase variante="ghost" type="button" @click="dialogueOuvert = false">Annuler</BoutonBase>
                  <BoutonBase type="submit" :chargement="sauvegardeEnCours" icone="fa-regular fa-bookmark">Enregistrer</BoutonBase>
                </div>
              </form>
            </div>
          </div>
        </transition>
      </template>

      <EtatVide v-else icone="fa-solid fa-calculator" titre="Aucun devis en cours" message="Répondez à quelques questions pour obtenir le devis de votre projet.">
        <BoutonBase to="/calculateur" icone="fa-solid fa-calculator">Commencer un devis</BoutonBase>
      </EtatVide>
    </div>
  </div>
</template>

<style scoped>
.resultats { display: flex; flex-direction: column; gap: 20px; max-width: 760px; }

.resultats-prix { padding: 30px; border-radius: var(--rayon-lg); text-align: center; }
.resultats-resume { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px 16px; color: var(--texte-secondaire); font-size: .92rem; }
.resultats-resume i { color: var(--lagon-600); margin-right: 4px; }
.resultats-titre { margin-top: 18px; color: var(--ardoise); font-size: clamp(1.5rem, 3.4vw, 2rem); }
.resultats-total { margin: 4px 0 22px; color: var(--lagon-700); font-size: clamp(2.8rem, 9vw, 4.2rem); font-weight: 700; line-height: 1.05; letter-spacing: -.02em; }

.resultats-repartition { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 0; padding: 0; list-style: none; }
.resultats-repartition li { display: flex; flex-direction: column; gap: 4px; padding: 14px 10px; border-radius: var(--rayon); background: var(--gris-50); }
.resultats-repartition span { display: flex; flex-direction: column; color: var(--texte-secondaire); font-size: .85rem; }
.resultats-repartition small { color: var(--gris-500); font-size: .75rem; }
.resultats-repartition strong { color: var(--ardoise); font-size: 1.1rem; }

.resultats-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 24px; }

.resultats-lien { padding: 0; border: 0; background: none; color: var(--lagon-700); font: inherit; font-weight: 700; cursor: pointer; }
.resultats-lien:hover { text-decoration: underline; }

.resultats-bloc { padding: 26px 28px; border-radius: var(--rayon-lg); }
.resultats-bloc h2 { margin-bottom: 14px; color: var(--ardoise); font-size: 1.45rem; }
.resultats-achats { margin: 0; padding: 0; list-style: none; }
.resultats-achats li { display: flex; align-items: center; gap: 14px; padding: 14px 0; border-bottom: 1px solid var(--gris-200); }
.resultats-achat-icone { width: 42px; height: 42px; display: grid; place-items: center; flex-shrink: 0; border-radius: 12px; background: var(--lagon-50); color: var(--lagon-700); }
.resultats-achat-texte { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; }
.resultats-achat-texte strong { color: var(--ardoise); font-size: 1.1rem; }
.resultats-achat-texte small { color: var(--texte-secondaire); font-size: .82rem; }
.resultats-achats .prix { color: var(--ardoise); font-weight: 700; white-space: nowrap; }
.resultats-sous-total { display: flex; justify-content: space-between; padding-top: 14px; color: var(--texte-secondaire); font-weight: 600; }
.resultats-sous-total strong { color: var(--lagon-700); font-size: 1.15rem; }

.resultats-calcul { color: var(--texte-secondaire); font-size: .88rem; }
.resultats-calcul summary { color: var(--lagon-800); font-weight: 600; cursor: pointer; }
.resultats-calcul p { margin: 8px 0 0; line-height: 1.55; }
.resultats-fin { text-align: center; }

.modale-fond { position: fixed; inset: 0; z-index: 200; background: rgba(6,32,44,.55); backdrop-filter: blur(4px); display: grid; place-items: center; padding: 20px; }
.modale { background: #fff; border-radius: var(--rayon-lg); padding: 30px; width: 100%; max-width: 460px; box-shadow: var(--ombre-lg); animation: apparaitre .3s ease; }
.modale h2 { font-size: 1.7rem; color: var(--ardoise); margin-bottom: 6px; }
.modale form { margin-top: 20px; display: flex; flex-direction: column; gap: 20px; }
.modale-actions { display: flex; justify-content: flex-end; gap: 10px; }

@media (max-width: 560px) {
  .resultats-prix, .resultats-bloc { padding: 22px 18px; }
  .resultats-repartition { grid-template-columns: 1fr; }
  .resultats-repartition li { flex-direction: row; justify-content: space-between; align-items: center; text-align: left; }
  .resultats-actions .btn { flex: 1; }
}
</style>

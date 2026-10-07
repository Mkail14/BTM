<script setup>
/**
 * Résultats : le prix d'abord, puis ce qu'il faut acheter, puis où l'acheter (prix exacts des fournisseurs).
 * Modèle plateforme : aucun frais pour le client ; choisir un fournisseur applique ses prix BTM au devis.
 * Comptes pro : plusieurs ouvrages ou achats réunis dans un même devis.
 */
import { ref, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useCalculateur } from '@/composables/useCalculateur.js'
import { useProjets } from '@/composables/useProjets.js'
import { useAuth } from '@/composables/useAuth.js'
import { formaterEuros, formaterNombre, formaterQuantite, sujetEstimation, detailPrix } from '@/services/calculs/moteurCalculs.js'
import { exporterEstimationPdf } from '@/services/export/exportPdf.js'
import { infoType, libelleOuvrage } from '@/services/calculs/fusion.js'
import { appliquerPrixFournisseur } from '@/services/supabase/serviceOffres.js'
import ComparateurFournisseurs from '@/composants/resultats/ComparateurFournisseurs.vue'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import BandeauAvertissement from '@/composants/commun/BandeauAvertissement.vue'
import EtatVide from '@/composants/commun/EtatVide.vue'

const router = useRouter()
const calc = useCalculateur()
const { sauvegarder } = useProjets()
const { connecte, backendDisponible, estPro } = useAuth()

// Fournisseur choisi dans le comparateur : sa fiche (PDF) et ses offres (prix BTM)
const choixFournisseur = ref(null) // { fiche, groupe }
const fournisseur = computed(() => choixFournisseur.value?.fiche || null)
// Le devis (ou devis pro cumulé), aux prix du fournisseur choisi quand il en a
const resultat = computed(() => {
  const base = calc.devis.value
  return base && choixFournisseur.value?.groupe ? appliquerPrixFournisseur(base, choixFournisseur.value.groupe) : base
})
const type = computed(() => (resultat.value ? infoType(resultat.value) : null))
// Devis pro : les estimations réunies (cumul + estimation en cours)
const ouvrages = computed(() => [...calc.cumul.value, ...(calc.resultat.value ? [calc.resultat.value] : [])])
function ajouterOuvrage() {
  calc.ajouterAuDevis()
  router.push('/calculateur')
}

const titre = computed(() => {
  if (resultat.value?.type === 'achat') return 'Vos matériaux coûteront'
  if (resultat.value?.type === 'ensemble') return 'Votre chantier coûtera environ'
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

// Matériaux (aucun frais BTM pour le client)
const repartition = computed(() => detailPrix(resultat.value).filter((l) => l.cle === 'materiaux'))
const remise = computed(() => detailPrix(resultat.value).find((l) => l.cle === 'remise'))

// ---------- Code promo ----------
const saisieCode = ref('')
const champCodeOuvert = ref(false)
const erreurCode = ref('')
const verificationCode = ref(false)
async function appliquerCode() {
  if (!saisieCode.value.trim() || verificationCode.value) return
  verificationCode.value = true
  erreurCode.value = await calc.appliquerCode(saisieCode.value)
  verificationCode.value = false
  if (!erreurCode.value) { saisieCode.value = ''; champCodeOuvert.value = false }
}
async function ouvrirChampCode() {
  champCodeOuvert.value = true
  erreurCode.value = ''
  await nextTick()
  document.getElementById('code-promo')?.focus()
}

const icones = { parpaing: 'fa-solid fa-cube', ciment: 'fa-solid fa-sack-xmark', sable: 'fa-solid fa-mound', beton: 'fa-solid fa-truck-droplet', beton_arme: 'fa-solid fa-truck-droplet', ferraillage: 'fa-solid fa-border-all', acier: 'fa-solid fa-bars', gravier: 'fa-solid fa-hill-rockslide', carrelage: 'fa-solid fa-table-cells', beton_lisse: 'fa-solid fa-brush' }

// ---------- PDF ----------
const nomProjet = ref('')
const exportEnCours = ref('') // 'visualiser' | 'telecharger' pendant la génération

async function pdf(mode) {
  exportEnCours.value = mode
  try {
    await exporterEstimationPdf({ nom: nomProjet.value.trim(), resultat: resultat.value, fournisseur: fournisseur.value, code: codeRetrait.value }, mode)
  } catch (e) {
    console.error(e)
    alert('Impossible de générer le PDF. Réessayez.')
  } finally {
    exportEnCours.value = ''
  }
}

// ---------- Code de retrait ----------
// Devis rouvert depuis « Mes projets » : code du projet ; devis enregistré ici : tant qu'il n'a pas changé
const enregistre = ref(null)
const signature = (r) => JSON.stringify([r?.lignes?.map((l) => [l.id, l.quantite, l.prixUnitaire]), r?.total])
const codeRetrait = computed(() => (enregistre.value && enregistre.value.signature === signature(resultat.value) ? enregistre.value.code : (calc.cumul.value.length ? '' : calc.codeRetrait.value)))
watch(() => calc.fournisseurId.value, (nouveau, ancien) => { if (ancien !== undefined && nouveau !== ancien && !enregistre.value) calc.associerCodeRetrait(null) })

// ---------- Sauvegarde ----------
const dialogueOuvert = ref(false)
const compteRequis = ref(false)
// focus sur l'action principale : Échap et Tab fonctionnent tout de suite dans la fenêtre
watch(compteRequis, async (ouvert) => { if (ouvert) { await nextTick(); document.querySelector('.compte .btn')?.focus() } })
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
    const cree = await sauvegarder({ nom: nomProjet.value, resultat: resultat.value, fournisseur: fournisseur.value })
    // projet en ligne : code à présenter au fournisseur, valable tant que le devis affiché ne change pas
    enregistre.value = cree?.code_retrait ? { code: cree.code_retrait, signature: signature(resultat.value) } : null
    calc.oublierMiseDeCote()
    dialogueOuvert.value = false
    messageSucces.value = `« ${nomProjet.value.trim()} » est enregistré.`
  } finally {
    sauvegardeEnCours.value = false
  }
}

function modifier() {
  if (calc.resultat.value?.type === 'achat') return router.push({ path: '/calculateur', query: { mode: 'direct' } })
  router.push({ path: '/calculateur', query: { type: calc.resultat.value?.type } })
}
const modifiable = computed(() => !calc.cumul.value.length && (calc.resultat.value?.type === 'achat' || !!type.value?.champs))
function nouvelleEstimation() { calc.reinitialiser(); router.push('/calculateur') }
</script>

<template>
  <div id="page-resultats" class="page">
    <div class="conteneur resultats">
      <template v-if="resultat">
        <!-- Ordinateur : les 3 blocs côte à côte, tenant dans la hauteur de l'écran (prix → quoi acheter → où acheter) -->
        <div class="resultats-grille">
        <!-- 1. Le prix -->
        <section class="carte resultats-prix" aria-labelledby="resultats-titre">
          <p class="resultats-resume">
            <span><i :class="type.icone" aria-hidden="true"></i> {{ resume }}</span>
            <button v-if="modifiable" type="button" class="resultats-lien" @click="modifier"><i class="fa-solid fa-pen" aria-hidden="true"></i> Modifier</button>
          </p>
          <h1 id="resultats-titre" class="resultats-titre">{{ titre }}</h1>
          <p class="resultats-total prix">{{ formaterEuros(resultat.total) }}</p>

          <!-- sans code promo, le détail répéterait le total -->
          <ul v-if="remise" class="resultats-repartition">
            <li v-for="p in repartition" :key="p.label">
              <span>{{ p.label }}<small v-if="p.detail">{{ p.detail }}</small></span>
              <strong class="prix">{{ formaterEuros(p.valeur) }}</strong>
            </li>
          </ul>
          <p class="resultats-frais">
            <span><i class="fa-solid fa-hand-holding-heart" aria-hidden="true"></i> Frais BTM</span>
            <strong class="prix resultats-gratuit">0 €</strong>
          </p>
          <p v-if="resultat.prixFournisseur?.economie > 0" class="resultats-economie">
            <i class="fa-solid fa-piggy-bank" aria-hidden="true"></i>
            <span>Prix BTM chez <strong>{{ resultat.prixFournisseur.nom }}</strong> : vous économisez <strong>{{ formaterEuros(resultat.prixFournisseur.economie) }}</strong> par rapport au comptoir ({{ formaterEuros(resultat.prixFournisseur.totalComptoir) }}).</span>
          </p>

          <!-- Code promo : réduction appliquée, ou lien discret pour en saisir un -->
          <p v-if="remise" class="resultats-remise">
            <span><i class="fa-solid fa-ticket" aria-hidden="true"></i> {{ remise.label }}</span>
            <span class="resultats-remise-droite">
              <strong class="prix">{{ formaterEuros(remise.valeur) }}</strong>
              <button type="button" class="resultats-remise-retirer" :aria-label="`Retirer le code ${calc.codePromo.value?.code}`" title="Retirer le code" :disabled="calc.chargement.value" @click="calc.retirerCode()"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
            </span>
          </p>
          <p v-if="calc.messageCode.value" class="resultats-code-info" role="status"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> {{ calc.messageCode.value }}</p>

          <template v-if="!remise">
            <button v-if="!champCodeOuvert" type="button" class="resultats-code-lien" @click="ouvrirChampCode"><i class="fa-solid fa-ticket" aria-hidden="true"></i> J’ai un code promo</button>
            <form v-else class="resultats-code" novalidate @submit.prevent="appliquerCode">
              <label for="code-promo" class="visually-hidden">Code promo</label>
              <input
                id="code-promo" v-model="saisieCode" type="text" placeholder="Votre code promo" autocomplete="off" autocapitalize="characters" spellcheck="false"
                maxlength="30" :aria-invalid="!!erreurCode || undefined" :aria-describedby="erreurCode ? 'code-erreur' : undefined" @keydown.esc="champCodeOuvert = false"
              />
              <BoutonBase type="submit" variante="secondaire" taille="sm" :chargement="verificationCode || calc.chargement.value" :disabled="!saisieCode.trim()">Appliquer</BoutonBase>
              <p v-if="erreurCode" id="code-erreur" class="resultats-code-erreur" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ erreurCode }}</p>
            </form>
          </template>

          <div class="resultats-actions">
            <!-- Devis en PDF : le voir dans la page, ou le télécharger directement -->
            <div class="resultats-pdf" role="group" aria-label="Devis en PDF">
              <BoutonBase icone="fa-solid fa-eye" :chargement="exportEnCours === 'visualiser'" :disabled="!!exportEnCours" @click="pdf('visualiser')">Visualiser le PDF</BoutonBase>
              <BoutonBase variante="secondaire" icone="fa-solid fa-download" :chargement="exportEnCours === 'telecharger'" :disabled="!!exportEnCours" @click="pdf('telecharger')">Télécharger</BoutonBase>
            </div>
            <BoutonBase variante="secondaire" icone="fa-regular fa-bookmark" @click="ouvrirDialogue">Enregistrer</BoutonBase>
          </div>

          <!-- Code de retrait : projet enregistré en ligne -->
          <p v-if="codeRetrait" class="resultats-retrait">
            <i class="fa-solid fa-ticket" aria-hidden="true"></i>
            <span>Code de retrait <strong class="mono">{{ codeRetrait }}</strong><small>Présentez-le au fournisseur (il figure aussi sur le PDF) : il retrouve votre devis et vous remet un reçu.</small></span>
          </p>
          <p v-else-if="connecte" class="resultats-retrait-aide"><i class="fa-solid fa-ticket" aria-hidden="true"></i> <span>Enregistrez ce devis pour obtenir votre <strong>code de retrait</strong> : c’est lui qui vous donne le prix BTM chez le fournisseur.</span></p>

          <transition name="glisser">
            <BandeauAvertissement v-if="messageSucces" type="succes" compact>
              {{ messageSucces }} <router-link to="/dashboard" class="resultats-lien">Voir mes projets →</router-link>
            </BandeauAvertissement>
          </transition>

          <div class="resultats-pied">
            <details class="resultats-calcul">
              <summary>Comment est fait le calcul ?</summary>
              <p>{{ type.hypotheses }}</p>
              <p>Prix TTC, hors terrassement et études. BTM est gratuit pour vous : le service est rémunéré par une commission versée par le fournisseur.</p>
            </details>
            <button type="button" class="resultats-lien" @click="nouvelleEstimation"><i class="fa-solid fa-plus" aria-hidden="true"></i> Faire un nouveau devis</button>
          </div>
        </section>

        <!-- 2. Ce qu'il faut acheter (et, compte pro, les ouvrages réunis dans le devis) -->
        <div class="resultats-colonne">
        <!-- Devis pro : plusieurs ouvrages réunis -->
        <section v-if="estPro" class="carte resultats-bloc resultats-pro" aria-labelledby="pro-titre">
          <div class="resultats-pro-tete">
            <h2 id="pro-titre"><span class="resultats-pro-badge">Pro</span> Votre devis</h2>
            <button type="button" class="btn btn-secondaire btn-sm" @click="ajouterOuvrage"><i class="fa-solid fa-plus" aria-hidden="true"></i> Ajouter un ouvrage ou des matériaux</button>
          </div>
          <ul class="resultats-pro-liste">
            <li v-for="(o, i) in ouvrages" :key="i">
              <i :class="infoType(o).icone" aria-hidden="true"></i>
              <span>{{ libelleOuvrage(o) }}</span>
              <strong class="prix">{{ formaterEuros(o.totalMateriaux) }}</strong>
              <button v-if="ouvrages.length > 1" type="button" class="resultats-pro-retirer" :aria-label="`Retirer ${libelleOuvrage(o)}`" @click="calc.retirerDuDevis(i)"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
            </li>
          </ul>
          <p class="resultats-pro-aide">Réunissez tout votre chantier — murs, dalles, fondations, terrasses et achats directs — dans un seul devis et un seul code de retrait.</p>
        </section>

        <section class="carte resultats-bloc" aria-labelledby="achats-titre">
          <h2 id="achats-titre">Ce qu’il faut acheter</h2>
          <ul class="resultats-achats">
            <li v-for="l in resultat.lignes" :key="l.id">
              <span class="resultats-achat-icone"><i :class="icones[l.id] || 'fa-solid fa-box'" aria-hidden="true"></i></span>
              <span class="resultats-achat-texte">
                <strong>{{ formaterQuantite(l.quantite, l.unite) }}</strong>
                <small>{{ l.libelle }} · {{ formaterEuros(l.prixUnitaire) }} / {{ l.unite === 'u' ? 'unité' : l.unite }}<template v-if="l.prixComptoir > l.prixUnitaire"> · <s>{{ formaterEuros(l.prixComptoir) }} au comptoir</s></template></small>
                <small v-if="l.indisponible" class="resultats-indispo"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Non disponible chez {{ resultat.prixFournisseur?.nom }} (prix de référence)</small>
              </span>
              <span class="prix">{{ formaterEuros(l.sousTotal) }}</span>
            </li>
          </ul>
          <p class="resultats-sous-total">Total matériaux <strong class="prix">{{ formaterEuros(resultat.totalMateriaux) }}</strong></p>
        </section>
        </div>

        <!-- 3. Où acheter : prix exacts chez chaque fournisseur -->
        <ComparateurFournisseurs class="resultats-ou" :lignes="calc.devis.value.lignes" :model-value="calc.fournisseurId.value" @update:model-value="calc.choisirFournisseur" @fournisseur="choixFournisseur = $event" />
        </div>

        <!-- Compte requis pour enregistrer -->
        <transition name="fondu">
          <div v-if="compteRequis" class="modale-fond" @click.self="compteRequis = false" @keydown.esc="compteRequis = false">
            <div class="modale compte" role="dialog" aria-modal="true" aria-labelledby="compte-titre" aria-describedby="compte-texte">
              <button type="button" class="compte-fermer" aria-label="Fermer" @click="compteRequis = false"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>

              <span class="compte-icone" aria-hidden="true"><i class="fa-regular fa-bookmark"></i></span>
              <h2 id="compte-titre">Gardez ce devis</h2>
              <p id="compte-texte" class="compte-texte">Créez votre compte gratuit pour l’enregistrer. Votre estimation est conservée pendant l’inscription.</p>

              <!-- Le devis concerné : on sait exactement ce qu'on enregistre -->
              <div class="compte-devis">
                <span class="compte-devis-icone"><i :class="type.icone" aria-hidden="true"></i></span>
                <span class="compte-devis-texte"><strong>{{ type.libelle }}</strong><small>{{ resume.split(' · ').slice(1).join(' · ') || 'Devis en cours' }}</small></span>
                <strong class="compte-devis-prix prix">{{ formaterEuros(resultat.total) }}</strong>
              </div>

              <ul class="compte-avantages">
                <li><i class="fa-solid fa-check" aria-hidden="true"></i> Retrouvez vos devis sur ordinateur et téléphone</li>
                <li><i class="fa-solid fa-check" aria-hidden="true"></i> Modifiez-les ou dupliquez-les quand vous voulez</li>
                <li><i class="fa-solid fa-check" aria-hidden="true"></i> Gratuit, en moins d’une minute</li>
              </ul>

              <BoutonBase bloc :to="{ path: '/inscription', query: { redirect: '/resultats' } }" icone="fa-solid fa-user-plus">Créer mon compte gratuit</BoutonBase>
              <p class="compte-connexion">
                Déjà inscrit ? <router-link :to="{ path: '/connexion', query: { redirect: '/resultats' } }">Se connecter</router-link>
              </p>
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
.resultats-grille, .resultats-colonne { display: flex; flex-direction: column; gap: 20px; }
.resultats-pied { display: flex; flex-direction: column; align-items: center; gap: 12px; margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--gris-200); }

.resultats-prix { padding: 30px; border-radius: var(--rayon-lg); text-align: center; }
.resultats-resume { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px 16px; color: var(--texte-secondaire); font-size: .92rem; }
.resultats-resume i { color: var(--lagon-600); margin-right: 4px; }
.resultats-titre { margin-top: 18px; color: var(--ardoise); font-size: clamp(1.5rem, 3.4vw, 2rem); }
.resultats-total { margin: 4px 0 22px; color: var(--lagon-700); font-size: clamp(2.8rem, 9vw, 4.2rem); font-weight: 700; line-height: 1.05; letter-spacing: -.02em; }

.resultats-repartition { display: grid; grid-template-columns: 1fr; gap: 10px; margin: 0; padding: 0; list-style: none; }
.resultats-repartition li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-radius: var(--rayon); background: var(--gris-50); text-align: left; }
.resultats-repartition span { display: flex; flex-direction: column; color: var(--texte-secondaire); font-size: .9rem; }
.resultats-repartition small { color: var(--gris-500); font-size: .75rem; }
.resultats-repartition strong { color: var(--ardoise); font-size: 1.1rem; }
.resultats-frais { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 10px 0 0; padding: 10px 14px; border: 1px dashed var(--gris-300); border-radius: var(--rayon); color: var(--texte-secondaire); font-size: .88rem; text-align: left; }
.resultats-frais strong { color: var(--ardoise); font-size: .98rem; }
.resultats-frais-info { margin-left: 4px; color: var(--gris-400); }
.resultats-frais-info:hover { color: var(--lagon-700); }

/* Code promo */
.resultats-remise {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 10px 0 0; padding: 8px 8px 8px 14px;
  border-radius: var(--rayon); background: #ecfdf5; color: #047857; font-size: .9rem; font-weight: 600; text-align: left;
}
.resultats-remise i { margin-right: 6px; }
.resultats-remise-droite { display: flex; align-items: center; gap: 6px; }
.resultats-remise strong { color: #047857; font-size: .98rem; }
.resultats-remise-retirer { width: 30px; height: 30px; display: grid; place-items: center; border: 0; border-radius: 8px; background: transparent; color: #047857; }
.resultats-remise-retirer:hover:not(:disabled) { background: #d1fae5; }
.resultats-code-info { display: flex; align-items: center; gap: 8px; margin: 10px 0 0; color: #b45309; font-size: .85rem; text-align: left; }
.resultats-code-lien {
  display: inline-flex; align-items: center; gap: 8px; margin-top: 14px; padding: 4px 2px; border: 0; background: none;
  color: var(--lagon-700); font-size: .9rem; font-weight: 600; cursor: pointer;
}
.resultats-code-lien:hover { text-decoration: underline; text-underline-offset: 3px; }
.resultats-code { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.resultats-code input {
  flex: 1 1 180px; min-height: 42px; padding: 0 14px; border: 1.5px solid var(--gris-300); border-radius: var(--rayon-sm);
  font-family: var(--font-mono); font-size: .95rem; letter-spacing: .06em; text-transform: uppercase;
}
.resultats-code input::placeholder { font-family: var(--font-corps); letter-spacing: 0; text-transform: none; }
.resultats-code input:focus { outline: none; border-color: var(--lagon-500); box-shadow: 0 0 0 4px rgba(6, 182, 212, .18); }
.resultats-code input[aria-invalid="true"] { border-color: var(--erreur); }
.resultats-code-erreur { flex-basis: 100%; margin: 0; color: var(--erreur); font-size: .85rem; text-align: left; }

.resultats-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 24px; }
.resultats-pdf { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.resultats-pdf :deep(.btn) { flex: 1 1 auto; justify-content: center; }

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

.resultats-calcul { align-self: stretch; color: var(--texte-secondaire); font-size: .88rem; text-align: left; }
.resultats-calcul summary { color: var(--lagon-800); font-weight: 600; cursor: pointer; }
.resultats-calcul p { margin: 8px 0 0; line-height: 1.55; }

.modale-fond { position: fixed; inset: 0; z-index: 200; background: rgba(6,32,44,.55); backdrop-filter: blur(4px); display: grid; place-items: center; padding: 20px; }
.modale { background: #fff; border-radius: var(--rayon-lg); padding: 30px; width: 100%; max-width: 460px; box-shadow: var(--ombre-lg); animation: apparaitre .3s ease; }
.modale h2 { font-size: 1.7rem; color: var(--ardoise); margin-bottom: 6px; }
.modale form { margin-top: 20px; display: flex; flex-direction: column; gap: 20px; }
.modale-actions { display: flex; justify-content: flex-end; gap: 10px; }

/* Gratuité, économie, devis pro */
.resultats-frais .resultats-gratuit { color: #047857; }
.resultats-frais i { margin-right: 6px; color: #047857; }
.resultats-economie { display: flex; gap: 10px; margin: 10px 0 0; padding: 12px 14px; border-radius: var(--rayon); background: #ecfdf5; color: #065f46; font-size: .9rem; line-height: 1.5; }
.resultats-economie i { margin-top: 3px; }
.resultats-indispo { color: #b45309 !important; font-weight: 600; }
.resultats-retrait-aide { display: flex; gap: 10px; margin: 16px 0 0; color: var(--texte-secondaire); font-size: .88rem; line-height: 1.5; }
.resultats-retrait-aide i { margin-top: 3px; color: var(--lagon-600); }
.resultats-pro { border: 1.5px solid var(--ardoise); }
.resultats-pro-tete { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
.resultats-pro-tete h2 { display: flex; align-items: center; gap: 10px; margin: 0; }
.resultats-pro-badge { padding: 2px 10px; border-radius: 999px; background: var(--ardoise); color: #fcd34d; font-size: .72rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
.resultats-pro-liste { display: flex; flex-direction: column; margin: 14px 0 0; padding: 0; list-style: none; }
.resultats-pro-liste li { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--gris-100); }
.resultats-pro-liste li:last-child { border-bottom: 0; }
.resultats-pro-liste i { width: 32px; height: 32px; flex: none; display: grid; place-items: center; border-radius: 10px; background: var(--gris-100); color: var(--ardoise); }
.resultats-pro-liste span { flex: 1; font-weight: 600; color: var(--ardoise); }
.resultats-pro-retirer { width: 30px; height: 30px; border: 0; border-radius: 8px; background: none; color: var(--gris-500); cursor: pointer; }
.resultats-pro-retirer:hover { background: var(--erreur-clair, #fff1f2); color: var(--erreur, #be123c); }
.resultats-pro-retirer i { background: none !important; }
.resultats-pro-aide { margin: 10px 0 0; color: var(--texte-secondaire); font-size: .86rem; }

/* Code de retrait */
.resultats-retrait { display: flex; align-items: flex-start; gap: 12px; margin: 16px 0 0; padding: 14px 16px; border-radius: var(--rayon); background: var(--lagon-50); color: var(--ardoise); }
.resultats-retrait > i { margin-top: 3px; color: var(--lagon-700); }
.resultats-retrait span { display: flex; flex-direction: column; gap: 2px; }
.resultats-retrait strong { font-size: 1.15rem; letter-spacing: .08em; color: var(--lagon-800); }
.resultats-retrait small { color: var(--texte-secondaire); font-size: .84rem; }

/* Compte requis pour enregistrer : une action principale, la connexion en lien secondaire */
.compte { position: relative; max-width: 440px; padding: 34px 30px 26px; text-align: center; }
.compte-fermer {
  position: absolute; top: 14px; right: 14px; width: 38px; height: 38px; display: grid; place-items: center;
  border: 0; border-radius: 50%; background: transparent; color: var(--gris-500); transition: background var(--transition), color var(--transition);
}
.compte-fermer:hover { background: var(--gris-100); color: var(--ardoise); }
.compte-icone { width: 58px; height: 58px; margin: 0 auto 16px; display: grid; place-items: center; border-radius: 18px; background: var(--lagon-50); color: var(--lagon-700); font-size: 1.4rem; }
.compte h2 { font-size: 1.8rem; }
.compte-texte { margin: 6px auto 0; max-width: 340px; color: var(--texte-secondaire); line-height: 1.55; }
.compte-devis {
  display: flex; align-items: center; gap: 12px; margin: 22px 0 18px; padding: 12px 14px;
  border: 1px solid var(--gris-200); border-radius: var(--rayon); background: var(--gris-50); text-align: left;
}
.compte-devis-icone { width: 38px; height: 38px; flex: none; display: grid; place-items: center; border-radius: 10px; background: #fff; color: var(--lagon-700); box-shadow: var(--ombre-sm); }
.compte-devis-texte { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.compte-devis-texte strong { color: var(--ardoise); font-size: .95rem; }
.compte-devis-texte small { color: var(--texte-secondaire); font-size: .8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.compte-devis-prix { flex: none; color: var(--lagon-700); font-size: 1.05rem; }
.compte-avantages { display: flex; flex-direction: column; gap: 8px; margin: 0 0 22px; padding: 0; list-style: none; text-align: left; font-size: .9rem; color: var(--gris-700); }
.compte-avantages i { width: 18px; margin-right: 8px; color: var(--vert-mangrove); }
.compte-connexion { margin: 14px 0 0; color: var(--texte-secondaire); font-size: .9rem; }
.compte-connexion a { color: var(--lagon-700); font-weight: 600; }
.compte-connexion a:hover { text-decoration: underline; text-underline-offset: 3px; }
@media (max-width: 480px) { .compte { padding: 30px 20px 22px; } .compte h2 { font-size: 1.55rem; } }

@media (max-width: 560px) {
  .resultats-prix, .resultats-bloc { padding: 22px 18px; }
  .resultats-repartition { grid-template-columns: 1fr; }
  .resultats-repartition li { flex-direction: row; justify-content: space-between; align-items: center; text-align: left; }
  .resultats-actions .btn { flex: 1; }
}

/* Ordinateur : prix | quoi acheter | où acheter, côte à côte et tenant dans l'écran.
   Une colonne trop remplie (beaucoup de matériaux ou de fournisseurs) défile seule, la page ne bouge pas. */
@media (min-width: 1100px) {
  .resultats { max-width: var(--largeur-conteneur); }
  .resultats-grille {
    display: grid; grid-template-columns: minmax(330px, .95fr) minmax(0, 1.05fr) minmax(0, 1.05fr); align-items: stretch; gap: 18px;
    height: calc(100svh - var(--hauteur-entete) - 56px); min-height: 460px;
  }
  .resultats-grille > * { min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
  .resultats-colonne { gap: 18px; }
  .resultats-prix { display: flex; flex-direction: column; padding: 24px; }
  .resultats-titre { margin-top: 12px; font-size: 1.6rem; }
  .resultats-total { margin-bottom: 16px; font-size: clamp(2.6rem, 3.6vw, 3.4rem); }
  .resultats-actions { flex-direction: column; margin-top: 18px; }
  .resultats-actions :deep(.btn) { width: 100%; justify-content: center; }
  .resultats-pied { margin-top: auto; }
  .resultats-colonne > .resultats-bloc:last-child { flex: 1; } /* même hauteur que les deux autres colonnes */
  .resultats-bloc { padding: 22px 24px; }
  .resultats-bloc h2 { font-size: 1.25rem; }
  .resultats-achats li { padding: 10px 0; }
  .resultats-achat-icone { width: 38px; height: 38px; }
}
/* Petits portables (écran peu haut) : on resserre pour que le récapitulatif tienne sans défiler */
@media (min-width: 1100px) and (max-height: 760px) {
  .resultats-prix { padding: 18px 22px; }
  .resultats-titre { margin-top: 6px; font-size: 1.35rem; }
  .resultats-total { margin-bottom: 10px; font-size: 2.5rem; }
  .resultats-actions { margin-top: 12px; gap: 8px; }
  .resultats-pied { gap: 8px; padding-top: 10px; }
}
</style>

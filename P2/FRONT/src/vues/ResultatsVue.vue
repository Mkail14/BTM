<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useCalculateur } from '@/composables/useCalculateur.js'
import { useProjets } from '@/composables/useProjets.js'
import { formaterNombre } from '@/services/calculs/moteurCalculs.js'
import { exporterEstimationPdf } from '@/services/export/exportPdf.js'
import { trouverTypeProjet } from '@/donnees/typesProjets.js'
import ListeMateriaux from '@/composants/resultats/ListeMateriaux.vue'
import EstimationMainOeuvre from '@/composants/resultats/EstimationMainOeuvre.vue'
import ResumeBudget from '@/composants/resultats/ResumeBudget.vue'
import SelecteurFournisseur from '@/composants/resultats/SelecteurFournisseur.vue'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import BandeauAvertissement from '@/composants/commun/BandeauAvertissement.vue'
import EtatVide from '@/composants/commun/EtatVide.vue'
import CarteBase from '@/composants/commun/CarteBase.vue'

const router = useRouter()
const calc = useCalculateur()
const { sauvegarder } = useProjets()

const resultat = computed(() => calc.resultat.value)
const type = computed(() => resultat.value ? trouverTypeProjet(resultat.value.type) : null)
const fournisseur = ref(null)

const nomProjet = ref('')
const nomErreur = ref('')
const sauvegardeEnCours = ref(false)
const messageSucces = ref('')
const exportEnCours = ref(false)
const dialogueOuvert = ref(false)

const dimensionsAffichees = computed(() => {
  if (!type.value) return []
  return type.value.champs.map((c) => {
    const v = resultat.value.dimensions?.[c.nom]
    if (c.type === 'select') {
      const o = c.options.find((x) => x.valeur === v)
      return { label: c.label, valeur: o ? o.label.split(' — ')[0] : v }
    }
    return { label: c.label, valeur: `${formaterNombre(v, 2)} ${c.unite}` }
  })
})

function ouvrirDialogue() {
  nomProjet.value = nomProjet.value || `${type.value?.libelle} ${new Date().toLocaleDateString('fr-FR')}`
  dialogueOuvert.value = true
  setTimeout(() => document.getElementById('nom-projet')?.focus(), 50)
}

async function confirmerSauvegarde() {
  nomErreur.value = ''
  if (!nomProjet.value.trim()) { nomErreur.value = 'Ce champ est obligatoire'; return }
  sauvegardeEnCours.value = true
  try {
    await sauvegarder({ nom: nomProjet.value, resultat: resultat.value, fournisseur: fournisseur.value })
    dialogueOuvert.value = false
    messageSucces.value = `Projet « ${nomProjet.value.trim()} » sauvegardé.`
    setTimeout(() => (messageSucces.value = ''), 5000)
  } finally {
    sauvegardeEnCours.value = false
  }
}

async function exporter(section = 'total') {
  exportEnCours.value = true
  try {
    await exporterEstimationPdf({ nom: nomProjet.value.trim() || `Estimation ${type.value?.libelle}`, resultat: resultat.value, fournisseur: fournisseur.value, section })
  } catch (e) {
    console.error(e)
    alert('Impossible de générer le PDF. Réessayez.')
  } finally {
    exportEnCours.value = false
  }
}

function modifier() { router.push({ path: '/calculateur', query: { type: resultat.value.type } }) }
</script>

<template>
  <div id="page-resultats" class="page">
    <div class="conteneur">
      <template v-if="resultat">
        <header class="page-entete resultats-entete">
          <div>
            <span class="section-surtitre"><i :class="type.icone"></i> {{ type.libelle }}</span>
            <h1 class="page-titre">Votre estimation</h1>
            <p class="page-sous-titre">Calculée le {{ new Date(resultat.calculeLe).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' }) }} — prix {{ calc.sourcePrix.value === 'supabase' ? 'à jour (base BTM)' : 'indicatifs' }}.</p>
          </div>
          <div class="resultats-actions">
            <BoutonBase variante="secondaire" icone="fa-solid fa-pen" @click="modifier">Modifier</BoutonBase>
            <div class="export-menu">
              <button class="btn btn-secondaire export-trigger" type="button" aria-haspopup="true">
                <i class="fa-solid fa-file-pdf" aria-hidden="true"></i>
                Exporter PDF
                <i class="fa-solid fa-chevron-down export-chevron" aria-hidden="true"></i>
              </button>
              <div class="export-options" role="menu">
                <button type="button" role="menuitem" :disabled="exportEnCours" @click="exporter('materiaux')">
                  <i class="fa-solid fa-cubes" aria-hidden="true"></i>
                  <span><strong>Matériaux</strong><small>Quantités et prix des matériaux</small></span>
                </button>
                <button type="button" role="menuitem" :disabled="exportEnCours" @click="exporter('mainOeuvre')">
                  <i class="fa-solid fa-helmet-safety" aria-hidden="true"></i>
                  <span><strong>Main-d’œuvre</strong><small>Heures, taux et coût estimé</small></span>
                </button>
                <button type="button" role="menuitem" :disabled="exportEnCours" @click="exporter('livraison')">
                  <i class="fa-solid fa-truck" aria-hidden="true"></i>
                  <span><strong>Livraison</strong><small>Coût de livraison estimé</small></span>
                </button>
                <button type="button" role="menuitem" :disabled="exportEnCours" @click="exporter('total')">
                  <i class="fa-solid fa-file-invoice-dollar" aria-hidden="true"></i>
                  <span><strong>Récapitulatif complet</strong><small>Matériaux, main-d’œuvre et livraison</small></span>
                </button>
              </div>
            </div>
            <BoutonBase icone="fa-solid fa-floppy-disk" @click="ouvrirDialogue">Sauvegarder</BoutonBase>
          </div>
        </header>

        <transition name="glisser">
          <BandeauAvertissement v-if="messageSucces" type="succes" compact class="resultats-succes">
            {{ messageSucces }} <router-link to="/dashboard" class="lien-inline">Voir mes projets →</router-link>
          </BandeauAvertissement>
        </transition>

        <div class="resultats-grille">
          <div class="resultats-colonne">
            <CarteBase titre="Dimensions utilisées" icone="fa-solid fa-ruler-combined" id="recap-dimensions">
              <dl class="dims">
                <div v-for="d in dimensionsAffichees" :key="d.label" class="dims-item">
                  <dt>{{ d.label }}</dt><dd class="mono">{{ d.valeur }}</dd>
                </div>
                <div v-for="m in resultat.mesures" :key="m.label" class="dims-item dims-mesure" :class="{ principale: m.principale }">
                  <dt>{{ m.label }}</dt><dd class="mono">{{ typeof m.valeur === 'number' ? formaterNombre(m.valeur, 3) : m.valeur }} {{ m.unite }}</dd>
                </div>
              </dl>
            </CarteBase>
            <ListeMateriaux :lignes="resultat.lignes" :total="resultat.totalMateriaux" />
            <EstimationMainOeuvre :main-oeuvre="resultat.mainOeuvre" :livraison="resultat.livraison" />
          </div>

          <aside class="resultats-colonne resultats-aside">
            <ResumeBudget :resultat="resultat" />
            <SelecteurFournisseur :model-value="calc.fournisseurId.value" @update:model-value="calc.choisirFournisseur" @fournisseur="fournisseur = $event" />
            <BandeauAvertissement />
          </aside>
        </div>

        <!-- Dialogue de sauvegarde (BF25/BF26) -->
        <transition name="fondu">
          <div v-if="dialogueOuvert" class="modale-fond" @click.self="dialogueOuvert = false">
            <div class="modale" role="dialog" aria-modal="true" aria-labelledby="modale-titre">
              <h2 id="modale-titre">Nommer votre projet</h2>
              <p class="texte-secondaire">Ce nom vous permettra de retrouver l’estimation dans « Mes projets ».</p>
              <form @submit.prevent="confirmerSauvegarde" novalidate>
                <div class="champ">
                  <label for="nom-projet">Nom du projet</label>
                  <input id="nom-projet" v-model="nomProjet" type="text" maxlength="120" placeholder="Ex. Mur de clôture Kawéni" :aria-invalid="!!nomErreur" style="font-family: var(--font-corps)" />
                  <p v-if="nomErreur" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ nomErreur }}</p>
                </div>
                <div class="modale-actions">
                  <BoutonBase variante="ghost" type="button" @click="dialogueOuvert = false">Annuler</BoutonBase>
                  <BoutonBase type="submit" :chargement="sauvegardeEnCours" icone="fa-solid fa-floppy-disk">Sauvegarder</BoutonBase>
                </div>
              </form>
            </div>
          </div>
        </transition>
      </template>

      <EtatVide v-else icone="fa-solid fa-calculator" titre="Aucune estimation en cours" message="Lancez un calcul depuis le calculateur pour afficher vos résultats ici.">
        <BoutonBase to="/calculateur" icone="fa-solid fa-calculator">Aller au calculateur</BoutonBase>
        <BoutonBase to="/dashboard" variante="secondaire">Mes projets</BoutonBase>
      </EtatVide>
    </div>
  </div>
</template>

<style scoped>
.resultats-entete { display: flex; flex-wrap: wrap; gap: 20px; justify-content: space-between; align-items: flex-end; }
.resultats-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.export-menu { position: relative; }
.export-trigger { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
.export-chevron { font-size: .7rem; margin-left: 2px; transition: transform .2s ease; }
.export-menu:hover .export-chevron, .export-menu:focus-within .export-chevron { transform: rotate(180deg); }
.export-options { position: absolute; z-index: 20; top: calc(100% + 8px); right: 0; width: 290px; padding: 6px; border: 1px solid var(--bordure); border-radius: var(--rayon); background: #fff; box-shadow: var(--ombre-lg); opacity: 0; visibility: hidden; transform: translateY(-6px); transition: opacity .18s ease, transform .18s ease, visibility .18s ease; }
.export-menu:hover .export-options, .export-menu:focus-within .export-options { opacity: 1; visibility: visible; transform: translateY(0); }
.export-options button { display: flex; align-items: center; gap: 12px; width: 100%; padding: 11px 12px; border: 0; border-radius: var(--rayon-sm); background: transparent; color: var(--ardoise); text-align: left; cursor: pointer; }
.export-options button:hover:not(:disabled), .export-options button:focus-visible { background: var(--lagon-50); outline: none; }
.export-options button:disabled { cursor: wait; opacity: .5; }
.export-options button > i { width: 24px; color: var(--lagon-700); text-align: center; }
.export-options span { display: flex; flex-direction: column; gap: 2px; }
.export-options strong { font-size: .88rem; }
.export-options small { color: var(--texte-secondaire); font-size: .75rem; }
.resultats-succes { margin-bottom: 24px; }
.lien-inline { font-weight: 700; text-decoration: underline; margin-left: 6px; }
.resultats-grille { display: grid; gap: 24px; grid-template-columns: 1fr; align-items: start; }
@media (min-width: 900px) { .resultats-grille { grid-template-columns: 1.5fr 1fr; } .resultats-aside { position: sticky; top: calc(var(--hauteur-entete) + 20px); } }
.resultats-colonne { display: flex; flex-direction: column; gap: 24px; }
.dims { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); margin: 0; }
.dims-item { background: var(--gris-50); border-radius: var(--rayon-sm); padding: 12px 14px; }
.dims-item dt { font-size: .78rem; text-transform: uppercase; letter-spacing: .06em; color: var(--gris-500); font-weight: 600; }
.dims-item dd { margin: 4px 0 0; font-weight: 600; font-size: 1.05rem; color: var(--ardoise); }
.dims-mesure { background: var(--lagon-50); }
.dims-mesure.principale { background: linear-gradient(135deg, var(--lagon-100), var(--lagon-50)); border: 1px solid var(--lagon-200); }
.dims-mesure.principale dd { color: var(--lagon-800); }

.modale-fond { position: fixed; inset: 0; z-index: 200; background: rgba(6,32,44,.55); backdrop-filter: blur(4px); display: grid; place-items: center; padding: 20px; }
.modale { background: #fff; border-radius: var(--rayon-lg); padding: 30px; width: 100%; max-width: 460px; box-shadow: var(--ombre-lg); animation: apparaitre .3s ease; }
.modale h2 { font-size: 1.7rem; color: var(--ardoise); margin-bottom: 6px; }
.modale form { margin-top: 20px; display: flex; flex-direction: column; gap: 20px; }
.modale-actions { display: flex; justify-content: flex-end; gap: 10px; }
</style>

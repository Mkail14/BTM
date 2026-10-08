<script setup>
/**
 * Projet professionnel — plusieurs ouvrages dans un même projet (maisons, dalles, murs, terrasses),
 * placés sur un terrain, visibles en 3D (orbite ou visite à hauteur d'homme) avec leurs mesures exactes.
 * Un seul devis : matériaux additionnés, code de retrait et PDF comme le calculateur. Aucun frais pour le client :
 * la commission BTM est payée par le fournisseur (contenu.frais.taux n'est pas un montant à lui ajouter).
 * Réservé aux comptes professionnels vérifiés et aux fournisseurs.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useAuth } from '@/composables/useAuth.js'
import { useProjets } from '@/composables/useProjets.js'
import { useContenuSite } from '@/composables/useContenuSite.js'
import { useProjetPro, signatureProjet, nouveauProjetPro } from '@/composables/useProjetPro.js'
import { chargerCatalogue } from '@/services/supabase/serviceMateriaux.js'
import { chargerFournisseurs } from '@/services/supabase/serviceFournisseurs.js'
import { formaterEuros, formaterQuantite, formaterNombre } from '@/services/calculs/moteurCalculs.js'
import { TYPES_OUVRAGES, creerOuvrage, calculerProjetPro, mesuresOuvrage } from '@/services/calculs/projetPro.js'
import ScenePro from '@/composants/pro/ScenePro.vue'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import { ouvrirAuth } from '@/composables/useFenetreAuth.js'

const { connecte, estPro, demandePro } = useAuth()
const { sauvegarder } = useProjets()
const contenu = useContenuSite()
const { projet, enregistre } = useProjetPro()

// ---------- Catalogue et fournisseurs ----------
const catalogue = ref(null)
const fournisseurs = ref([])
onMounted(async () => {
  const [c, f] = await Promise.all([chargerCatalogue(), chargerFournisseurs()])
  catalogue.value = c.catalogue
  fournisseurs.value = f.donnees
})
const fournisseur = computed(() => fournisseurs.value.find((f) => f.id === projet.value.fournisseurId) || null)

// ---------- Sélection ----------
const selectionId = ref(projet.value.ouvrages[0]?.id || '')
const selection = computed(() => projet.value.ouvrages.find((o) => o.id === selectionId.value) || null)
watch(() => projet.value.ouvrages.length, () => { if (!selection.value) selectionId.value = projet.value.ouvrages[0]?.id || '' })

function ajouter(type) {
  const o = creerOuvrage(type, projet.value.ouvrages)
  projet.value.ouvrages.push(o)
  selectionId.value = o.id
}
function dupliquer(o) {
  const place = creerOuvrage(o.type, projet.value.ouvrages) // nouvel identifiant, placé à côté des autres
  const copie = { ...JSON.parse(JSON.stringify(o)), id: place.id, x: place.x, nom: `${o.nom} (copie)` }
  projet.value.ouvrages.push(copie)
  selectionId.value = copie.id
}
function supprimer(o) {
  if (projet.value.ouvrages.length === 1) return
  projet.value.ouvrages = projet.value.ouvrages.filter((x) => x.id !== o.id)
}
const tourner = (o, sens) => { o.rotation = ((o.rotation || 0) + sens + 4) % 4 }

// ---------- 3D ----------
const mode = ref('orbite')
const fondations = ref(false)
const scene = ref(null)

// ---------- Devis ----------
const devis = computed(() => {
  if (!catalogue.value) return { resultat: null, erreur: '' }
  try {
    return { resultat: calculerProjetPro(projet.value, { catalogue: catalogue.value }), erreur: '' }
  } catch (e) {
    return { resultat: null, erreur: e.message }
  }
})
const mesures = computed(() => (selection.value ? mesuresOuvrage(selection.value) : null))
const codeRetrait = computed(() => (enregistre.value && enregistre.value.signature === signatureProjet(projet.value) ? enregistre.value.code : ''))

// ---------- Enregistrer / PDF ----------
const enregistrement = ref(false)
const message = ref('')
const erreurAction = ref('')
async function enregistrer() {
  erreurAction.value = ''; message.value = ''
  if (!devis.value.resultat) { erreurAction.value = devis.value.erreur || 'Le devis n’est pas prêt.'; return }
  if (!projet.value.nom.trim()) projet.value.nom = `Projet du ${new Date().toLocaleDateString('fr-FR')}`
  enregistrement.value = true
  try {
    const cree = await sauvegarder({ nom: projet.value.nom, resultat: { ...devis.value.resultat, projet: { ...projet.value } }, fournisseur: fournisseur.value })
    enregistre.value = { signature: signatureProjet(projet.value), code: cree?.code_retrait || '', id: cree?.id }
    message.value = cree?.code_retrait ? `Projet enregistré. Code de retrait : ${cree.code_retrait}` : 'Projet enregistré.'
  } catch (e) {
    erreurAction.value = e?.message || 'Enregistrement impossible.'
  } finally {
    enregistrement.value = false
  }
}
const exportEnCours = ref('') // 'visualiser' | 'telecharger' pendant la génération
async function pdf(mode) {
  if (!devis.value.resultat) return
  exportEnCours.value = mode
  try {
    const { exporterEstimationPdf } = await import('@/services/export/exportPdf.js')
    await exporterEstimationPdf({ nom: projet.value.nom.trim() || 'Projet professionnel', resultat: devis.value.resultat, fournisseur: fournisseur.value, code: codeRetrait.value }, mode)
  } catch (e) {
    console.error(e)
    erreurAction.value = 'Impossible de générer le PDF.'
  } finally {
    exportEnCours.value = ''
  }
}
function recommencer() {
  if (!window.confirm('Commencer un nouveau projet ? Le projet en cours non enregistré sera perdu.')) return
  nouveauProjetPro()
  selectionId.value = projet.value.ouvrages[0].id
}

const nb = (v, d = 2) => formaterNombre(v, d)
</script>

<template>
  <div id="page-projet-pro" class="page pp">
    <!-- Réservé aux professionnels -->
    <div v-if="!estPro" class="conteneur pp-reserve">
      <section class="carte pp-reserve-carte">
        <span class="pp-reserve-icone"><i class="fa-solid fa-city" aria-hidden="true"></i></span>
        <h1>Projets professionnels</h1>
        <p>Chiffrez un chantier complet : plusieurs maisons, dalles, murs et terrasses dans un même projet, en 3D, avec la visite intérieure et les mesures exactes.</p>
        <p v-if="demandePro?.statut === 'en_attente'" class="pp-reserve-etat"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> Votre SIRET est en cours de vérification : cet outil s’ouvrira dès qu’elle sera terminée.</p>
        <template v-else>
          <BoutonBase v-if="!connecte" icone-droite="fa-solid fa-arrow-right" @click="ouvrirAuth('inscription', { profil: 'professionnel' })">Créer un compte professionnel</BoutonBase>
          <p v-else class="pp-reserve-etat">Réservé aux comptes professionnels vérifiés. Demandez la vérification de votre SIRET depuis votre profil.</p>
        </template>
      </section>
    </div>

    <div v-else class="pp-app">
      <!-- Barre du projet -->
      <header class="pp-barre">
        <span class="pp-badge"><i class="fa-solid fa-briefcase" aria-hidden="true"></i> Pro</span>
        <label class="pp-nom">
          <span class="visually-hidden">Nom du projet</span>
          <input v-model="projet.nom" maxlength="120" placeholder="Nom du projet (ex. Lotissement Tsingoni)" />
        </label>
        <div class="pp-barre-actions">
          <button type="button" class="btn btn-ghost btn-sm" @click="recommencer"><i class="fa-solid fa-file-circle-plus" aria-hidden="true"></i> Nouveau</button>
          <BoutonBase variante="secondaire" taille="sm" icone="fa-solid fa-eye" :chargement="exportEnCours === 'visualiser'" :disabled="!devis.resultat || !!exportEnCours" @click="pdf('visualiser')">Voir le PDF</BoutonBase>
          <BoutonBase variante="secondaire" taille="sm" icone="fa-solid fa-download" :chargement="exportEnCours === 'telecharger'" :disabled="!devis.resultat || !!exportEnCours" @click="pdf('telecharger')">Télécharger</BoutonBase>
          <BoutonBase taille="sm" icone="fa-regular fa-bookmark" :chargement="enregistrement" :disabled="!devis.resultat" @click="enregistrer">Enregistrer</BoutonBase>
        </div>
      </header>

      <div class="pp-grille">
        <!-- ===== Ouvrages ===== -->
        <aside class="pp-panneau pp-ouvrages" aria-label="Ouvrages du projet">
          <div class="pp-ajout" role="group" aria-label="Ajouter un ouvrage">
            <button v-for="(t, id) in TYPES_OUVRAGES" :key="id" type="button" :title="t.description" @click="ajouter(id)">
              <i :class="t.icone" aria-hidden="true"></i><span>{{ t.libelle }}</span>
            </button>
          </div>

          <ul class="pp-liste">
            <li v-for="o in projet.ouvrages" :key="o.id">
              <button type="button" class="pp-item" :class="{ actif: o.id === selectionId }" @click="selectionId = o.id">
                <i :class="TYPES_OUVRAGES[o.type].icone" aria-hidden="true"></i>
                <span><strong>{{ o.nom }}</strong><small>{{ nb(o.longueur) }} × {{ nb(o.type === 'mur' ? o.hauteur : o.largeur) }} m</small></span>
                <em v-if="devis.resultat">{{ formaterEuros(devis.resultat.ouvrages.find((x) => x.id === o.id)?.total || 0) }}</em>
              </button>
            </li>
          </ul>

          <!-- Réglages de l'ouvrage sélectionné -->
          <section v-if="selection" class="pp-reglages">
            <div class="pp-reglages-tete">
              <input v-model="selection.nom" class="pp-reglages-nom" maxlength="40" aria-label="Nom de l’ouvrage" />
              <button type="button" class="pp-icone" title="Dupliquer" aria-label="Dupliquer l’ouvrage" @click="dupliquer(selection)"><i class="fa-regular fa-copy"></i></button>
              <button type="button" class="pp-icone danger" title="Supprimer" aria-label="Supprimer l’ouvrage" :disabled="projet.ouvrages.length === 1" @click="supprimer(selection)"><i class="fa-regular fa-trash-can"></i></button>
            </div>

            <fieldset class="pp-groupe">
              <legend>Position sur le terrain</legend>
              <label><span>X (est)</span><input v-model.number="selection.x" type="number" step="0.5" /><em>m</em></label>
              <label><span>Z (sud)</span><input v-model.number="selection.z" type="number" step="0.5" /><em>m</em></label>
              <div class="pp-rotation">
                <button type="button" aria-label="Tourner à gauche" @click="tourner(selection, -1)"><i class="fa-solid fa-rotate-left"></i></button>
                <span>{{ (selection.rotation || 0) * 90 }}°</span>
                <button type="button" aria-label="Tourner à droite" @click="tourner(selection, 1)"><i class="fa-solid fa-rotate-right"></i></button>
              </div>
            </fieldset>

            <fieldset class="pp-groupe">
              <legend>Dimensions</legend>
              <label><span>Longueur</span><input v-model.number="selection.longueur" type="number" min="1" max="100" step="0.1" /><em>m</em></label>
              <label v-if="selection.type !== 'mur'"><span>Largeur</span><input v-model.number="selection.largeur" type="number" min="1" max="100" step="0.1" /><em>m</em></label>
              <label v-if="selection.type === 'maison' || selection.type === 'mur'"><span>Hauteur des murs</span><input v-model.number="selection.hauteur" type="number" min="0.5" max="10" step="0.1" /><em>m</em></label>
              <label v-if="selection.type !== 'mur'"><span>Épaisseur {{ selection.type === 'terrasse' ? 'de la terrasse' : 'de la dalle' }}</span><input v-model.number="selection.epaisseurDalle" type="number" min="5" max="60" step="1" /><em>cm</em></label>
              <label v-if="selection.type === 'mur'"><span>Ouvertures</span><input v-model.number="selection.ouvertures" type="number" min="0" step="0.1" /><em>m²</em></label>
              <label v-if="selection.type === 'terrasse'" class="pp-plein"><span>Finition</span>
                <select v-model="selection.terrasseFinition"><option value="carrelage">Carrelage</option><option value="beton_lisse">Béton lissé</option></select>
              </label>
            </fieldset>

            <template v-if="selection.type === 'maison'">
              <fieldset class="pp-groupe">
                <legend>Ouvertures</legend>
                <label><span>Portes</span><input v-model.number="selection.portes" type="number" min="0" max="10" step="1" /><em>× 0,9 m</em></label>
                <label><span>Fenêtres</span><input v-model.number="selection.fenetres" type="number" min="0" max="40" step="1" /><em>× 1,2 m</em></label>
              </fieldset>
              <fieldset class="pp-groupe">
                <legend>Fondations</legend>
                <label><span>Largeur</span><input v-model.number="selection.fondationLargeur" type="number" min="0.2" max="2" step="0.05" /><em>m</em></label>
                <label><span>Profondeur</span><input v-model.number="selection.fondationProfondeur" type="number" min="0.2" max="3" step="0.05" /><em>m</em></label>
                <label><span>Murs de refend</span><input v-model.number="selection.refends" type="number" min="0" max="10" step="1" /><em>× largeur</em></label>
              </fieldset>
              <fieldset class="pp-groupe">
                <legend>
                  <label class="pp-bascule"><input v-model="selection.terrasse" type="checkbox" /> Terrasse devant la maison</label>
                </legend>
                <template v-if="selection.terrasse">
                  <label><span>Profondeur</span><input v-model.number="selection.terrasseProfondeur" type="number" min="1" max="20" step="0.1" /><em>m</em></label>
                  <label><span>Finition</span>
                    <select v-model="selection.terrasseFinition"><option value="carrelage">Carrelage</option><option value="beton_lisse">Béton lissé</option></select>
                  </label>
                </template>
              </fieldset>
            </template>

            <dl v-if="mesures" class="pp-mesures">
              <div v-if="mesures.surfaceHabitable"><dt>Surface habitable</dt><dd>{{ nb(mesures.surfaceHabitable) }} m²</dd></div>
              <div v-if="mesures.surfaceDalle"><dt>Surface de dalle</dt><dd>{{ nb(mesures.surfaceDalle) }} m²</dd></div>
              <div v-if="mesures.volumeDalle"><dt>Béton de dalle</dt><dd>{{ nb(mesures.volumeDalle, 3) }} m³</dd></div>
              <div v-if="mesures.perimetre"><dt>Périmètre</dt><dd>{{ nb(mesures.perimetre) }} m</dd></div>
              <div v-if="mesures.surfaceMurs"><dt>Murs (hors ouvertures)</dt><dd>{{ nb(mesures.surfaceMurs) }} m²</dd></div>
              <div v-if="mesures.longueurFondations"><dt>Tranchées de fondation</dt><dd>{{ nb(mesures.longueurFondations) }} m</dd></div>
              <div v-if="mesures.surfaceTerrasse"><dt>Terrasse</dt><dd>{{ nb(mesures.surfaceTerrasse) }} m²</dd></div>
            </dl>
          </section>
        </aside>

        <!-- ===== 3D ===== -->
        <section class="pp-scene" aria-label="Maquette 3D du projet">
          <ScenePro ref="scene" :ouvrages="projet.ouvrages" :selection="selectionId" :mode="mode" :fondations="fondations" @selectionner="selectionId = $event" />
          <div class="pp-outils">
            <div class="pp-segments" role="radiogroup" aria-label="Vue">
              <button type="button" role="radio" :aria-checked="mode === 'orbite'" @click="mode = 'orbite'"><i class="fa-solid fa-cube" aria-hidden="true"></i> Vue d’ensemble</button>
              <button type="button" role="radio" :aria-checked="mode === 'visite'" @click="mode = 'visite'"><i class="fa-solid fa-person-walking" aria-hidden="true"></i> Visite</button>
            </div>
            <button type="button" class="pp-outil" :aria-pressed="fondations" title="Rendre le sol transparent pour voir les fondations" @click="fondations = !fondations"><i class="fa-solid fa-layer-group" aria-hidden="true"></i> Fondations</button>
            <button v-if="mode === 'orbite'" type="button" class="pp-outil" title="Recadrer la vue" @click="scene?.recadrer()"><i class="fa-solid fa-expand" aria-hidden="true"></i></button>
          </div>
        </section>

        <!-- ===== Devis ===== -->
        <aside class="pp-panneau pp-devis" aria-label="Devis du projet">
          <p v-if="devis.erreur" class="pp-erreur" role="alert"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> {{ devis.erreur }}</p>
          <template v-else-if="devis.resultat">
            <div class="pp-total">
              <span>Coût total du projet</span>
              <strong>{{ formaterEuros(devis.resultat.total) }}</strong>
              <small>Matériaux uniquement · aucun frais BTM pour vous</small>
            </div>
            <p v-if="codeRetrait" class="pp-code"><i class="fa-solid fa-ticket" aria-hidden="true"></i> Code de retrait <strong class="mono">{{ codeRetrait }}</strong></p>
            <p v-if="message && !codeRetrait" class="pp-message">{{ message }}</p>

            <h2 class="pp-titre">Matériaux</h2>
            <ul class="pp-lignes">
              <li v-for="l in devis.resultat.lignes" :key="l.id"><span>{{ l.libelle }}<small>{{ formaterQuantite(l.quantite, l.unite) }}</small></span><strong>{{ formaterEuros(l.sousTotal) }}</strong></li>
            </ul>

            <h2 class="pp-titre">Par ouvrage</h2>
            <ul class="pp-lignes">
              <li v-for="o in devis.resultat.ouvrages" :key="o.id"><span>{{ o.nom }}<small>{{ o.parties.map((p) => p.libelle).join(' · ') }}</small></span><strong>{{ formaterEuros(o.total) }}</strong></li>
            </ul>

            <h2 class="pp-titre">Mesures</h2>
            <dl class="pp-mesures">
              <div v-for="m in devis.resultat.mesures" :key="m.label"><dt>{{ m.label }}</dt><dd>{{ nb(m.valeur, 3) }} {{ m.unite }}</dd></div>
            </dl>

            <label class="pp-fournisseur">
              <span>Fournisseur (facultatif)</span>
              <select v-model="projet.fournisseurId">
                <option value="">Aucun pour l’instant</option>
                <option v-for="f in fournisseurs" :key="f.id" :value="f.id">{{ f.nom }} — {{ f.commune }}</option>
              </select>
            </label>
          </template>
          <div v-else class="pp-chargement"><span class="spinner spinner-grand"></span></div>
          <p v-if="erreurAction" class="pp-erreur" role="alert">{{ erreurAction }}</p>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pp { padding-top: calc(var(--hauteur-entete) + 16px); padding-bottom: 24px; }
/* Réservé */
.pp-reserve { display: grid; place-items: center; min-height: 60vh; }
.pp-reserve-carte { display: flex; flex-direction: column; align-items: center; gap: 14px; max-width: 560px; padding: 44px 32px; text-align: center; }
.pp-reserve-carte h1 { margin: 0; font-size: 2rem; color: var(--ardoise); }
.pp-reserve-carte p { margin: 0; color: var(--texte-secondaire); line-height: 1.6; }
.pp-reserve-icone { width: 64px; height: 64px; display: grid; place-items: center; border-radius: 18px; background: var(--ardoise); color: #fcd34d; font-size: 1.6rem; }
.pp-reserve-etat { padding: 12px 16px; border-radius: var(--rayon); background: var(--gris-50); color: var(--ardoise) !important; }

/* Application */
.pp-app { display: flex; flex-direction: column; gap: 12px; padding: 0 var(--gouttiere); }
.pp-barre { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; }
.pp-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; background: var(--ardoise); color: #fcd34d; font-size: .8rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
.pp-nom { flex: 1 1 260px; }
.pp-nom input { width: 100%; min-height: 44px; padding: 0 14px; border: 1px solid transparent; border-radius: var(--rayon); background: transparent; font: 700 1.35rem var(--font-display, inherit); color: var(--ardoise); }
.pp-nom input:hover { border-color: var(--gris-200); }
.pp-nom input:focus { outline: none; border-color: var(--lagon-500); background: #fff; }
.pp-barre-actions { display: flex; flex-wrap: wrap; gap: 8px; }

.pp-grille { display: grid; grid-template-columns: 320px minmax(0, 1fr) 320px; gap: 12px; height: calc(100dvh - var(--hauteur-entete) - 100px); min-height: 560px; }
.pp-panneau { display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow-y: auto; padding: 14px; border-radius: var(--rayon-lg); background: #fff; box-shadow: var(--ombre-sm, 0 1px 3px rgba(15, 23, 42, .08)); scrollbar-width: thin; }
.pp-scene { position: relative; min-height: 0; border-radius: var(--rayon-lg); overflow: hidden; box-shadow: var(--ombre-sm, 0 1px 3px rgba(15, 23, 42, .08)); }

/* Ouvrages */
.pp-ajout { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.pp-ajout button { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 4px; border: 1px dashed var(--gris-300); border-radius: 12px; background: var(--gris-50); color: var(--ardoise); font: inherit; font-size: .74rem; font-weight: 600; cursor: pointer; }
.pp-ajout button:hover { border-color: var(--lagon-500); background: var(--lagon-50); color: var(--lagon-800); }
.pp-ajout i { font-size: 1rem; }
.pp-liste { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; }
.pp-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; border: 0; border-radius: 10px; background: none; font: inherit; text-align: left; color: inherit; cursor: pointer; }
.pp-item:hover { background: var(--gris-50); }
.pp-item.actif { background: var(--lagon-50); box-shadow: inset 3px 0 0 var(--lagon-600); }
.pp-item > i { width: 30px; height: 30px; flex: none; display: grid; place-items: center; border-radius: 8px; background: var(--gris-100); color: var(--ardoise); font-size: .85rem; }
.pp-item.actif > i { background: var(--lagon-600); color: #fff; }
.pp-item span { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.pp-item strong { font-size: .88rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ardoise); }
.pp-item small { font-size: .74rem; color: var(--texte-secondaire); }
.pp-item em { font-style: normal; font-size: .8rem; font-weight: 700; color: var(--lagon-700); white-space: nowrap; }

.pp-reglages { display: flex; flex-direction: column; gap: 10px; padding-top: 12px; border-top: 1px solid var(--gris-100); }
.pp-reglages-tete { display: flex; align-items: center; gap: 4px; }
.pp-reglages-nom { flex: 1; min-width: 0; min-height: 38px; padding: 0 10px; border: 1px solid var(--gris-200); border-radius: 10px; font: inherit; font-weight: 700; color: var(--ardoise); }
.pp-icone { width: 36px; height: 36px; flex: none; border: 0; border-radius: 10px; background: none; color: var(--gris-500); cursor: pointer; }
.pp-icone:hover:not(:disabled) { background: var(--gris-100); color: var(--ardoise); }
.pp-icone.danger:hover:not(:disabled) { color: var(--erreur); }
.pp-icone:disabled { opacity: .35; cursor: not-allowed; }
.pp-groupe { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 0; padding: 10px; border: 1px solid var(--gris-100); border-radius: 12px; }
.pp-groupe legend { padding: 0 4px; font-size: .74rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--texte-secondaire); }
.pp-groupe > label { position: relative; display: flex; flex-direction: column; gap: 3px; font-size: .76rem; color: var(--texte-secondaire); }
.pp-groupe > label.pp-plein { grid-column: 1 / -1; }
.pp-groupe input, .pp-groupe select, .pp-fournisseur select { width: 100%; min-height: 36px; padding: 0 30px 0 10px; border: 1px solid var(--gris-200); border-radius: 8px; background: #fff; font: inherit; font-size: .88rem; font-weight: 600; color: var(--ardoise); font-variant-numeric: tabular-nums; }
.pp-groupe select { padding-right: 10px; }
.pp-groupe input:focus, .pp-groupe select:focus, .pp-fournisseur select:focus { outline: none; border-color: var(--lagon-500); box-shadow: 0 0 0 3px rgba(6, 182, 212, .15); }
.pp-groupe label em { position: absolute; right: 8px; bottom: 9px; font-style: normal; font-size: .72rem; color: var(--gris-500); pointer-events: none; }
.pp-rotation { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.pp-rotation button { width: 40px; height: 34px; border: 1px solid var(--gris-200); border-radius: 8px; background: #fff; color: var(--ardoise); cursor: pointer; }
.pp-rotation span { font-weight: 700; color: var(--ardoise); font-variant-numeric: tabular-nums; }
.pp-bascule { display: inline-flex; align-items: center; gap: 8px; text-transform: none; letter-spacing: 0; font-size: .82rem; color: var(--ardoise); cursor: pointer; }
.pp-bascule input { width: 16px; height: 16px; accent-color: var(--lagon-600); }

.pp-mesures { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 10px 12px; border-radius: 12px; background: var(--gris-50); }
.pp-mesures div { display: flex; justify-content: space-between; gap: 10px; font-size: .82rem; }
.pp-mesures dt { color: var(--texte-secondaire); }
.pp-mesures dd { margin: 0; font-weight: 700; color: var(--ardoise); font-variant-numeric: tabular-nums; }

/* Outils 3D */
.pp-outils { position: absolute; left: 12px; bottom: 12px; display: flex; flex-wrap: wrap; gap: 8px; }
.pp-segments { display: inline-flex; padding: 4px; border-radius: 999px; background: rgba(255, 255, 255, .92); box-shadow: 0 6px 20px rgba(15, 23, 42, .15); }
.pp-segments button { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 14px; border: 0; border-radius: 999px; background: none; font: inherit; font-size: .84rem; font-weight: 600; color: var(--ardoise); cursor: pointer; }
.pp-segments button[aria-checked="true"] { background: var(--ardoise); color: #fff; }
.pp-outil { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 14px; border: 0; border-radius: 999px; background: rgba(255, 255, 255, .92); box-shadow: 0 6px 20px rgba(15, 23, 42, .15); font: inherit; font-size: .84rem; font-weight: 600; color: var(--ardoise); cursor: pointer; }
.pp-outil[aria-pressed="true"] { background: var(--lagon-600); color: #fff; }

/* Devis */
.pp-total { display: flex; flex-direction: column; gap: 4px; padding: 16px; border-radius: 16px; background: var(--ardoise); color: #fff; }
.pp-total span { font-size: .8rem; color: rgba(255, 255, 255, .7); }
.pp-total strong { font-size: 1.9rem; font-variant-numeric: tabular-nums; }
.pp-total small { font-size: .76rem; color: rgba(255, 255, 255, .6); }
.pp-code { display: flex; align-items: center; gap: 8px; margin: 0; padding: 10px 12px; border-radius: 12px; background: var(--lagon-50); color: var(--ardoise); font-size: .86rem; }
.pp-code strong { letter-spacing: .08em; color: var(--lagon-800); }
.pp-message { margin: 0; font-size: .84rem; color: #047857; }
.pp-titre { margin: 4px 0 0; font-family: var(--font-corps); font-size: .78rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--texte-secondaire); }
.pp-lignes { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
.pp-lignes li { display: flex; justify-content: space-between; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--gris-100); font-size: .85rem; }
.pp-lignes li:last-child { border-bottom: 0; }
.pp-lignes span { display: flex; flex-direction: column; min-width: 0; color: var(--ardoise); }
.pp-lignes small { color: var(--texte-secondaire); font-size: .74rem; }
.pp-lignes strong { white-space: nowrap; font-variant-numeric: tabular-nums; color: var(--ardoise); }
.pp-fournisseur { display: flex; flex-direction: column; gap: 4px; font-size: .78rem; color: var(--texte-secondaire); }
.pp-fournisseur select { padding-right: 10px; }
.pp-erreur { display: flex; gap: 8px; margin: 0; padding: 12px; border-radius: 12px; background: var(--erreur-clair, #fff1f2); color: var(--erreur, #be123c); font-size: .86rem; }
.pp-chargement { display: grid; place-items: center; min-height: 200px; }

@media (max-width: 1200px) {
  .pp-grille { grid-template-columns: 300px minmax(0, 1fr); grid-template-rows: minmax(420px, 1fr) auto; height: auto; }
  .pp-scene { min-height: 520px; }
  .pp-devis { grid-column: 1 / -1; }
}
@media (max-width: 800px) {
  .pp-grille { grid-template-columns: 1fr; }
  .pp-scene { order: -1; min-height: 60vh; }
  .pp-panneau { overflow: visible; }
}
</style>

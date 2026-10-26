<script setup>
/**
 * Contrat de partenariat fournisseur (src/donnees/contratPartenaire.js), complété avec les informations de l'entreprise :
 * une carte (lire le contrat, le télécharger en PDF), puis la signature
 *  - entreprise : nom, qualité, signature dessinée au doigt ou à la souris, accord ;
 *  - admin (lectureSeule) : la signature enregistrée.
 * « Lire » : avec v-model:papier, le parent ouvre le PDF dans un bloc à côté (ApercuContrat, dossier de l'entreprise) ;
 * sans, le PDF s'ouvre dans la fenêtre d'aperçu du site (admin).
 * La signature est gardée en tracé SVG (quelques kilo-octets), avec la version du texte signé.
 */
import { computed, ref } from 'vue'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import { VERSION, DATE_VERSION, contratDeLaDemande } from '@/donnees/contratPartenaire.js'
import { useContenuSite } from '@/composables/useContenuSite.js'
import { signerContrat } from '@/services/supabase/serviceDossierFournisseur.js'

const props = defineProps({
  demande: { type: Object, required: true },
  lectureSeule: Boolean,
  papier: { type: Boolean, default: null } // PDF ouvert à côté (null : pas de bloc à côté, aperçu du site)
})
const emit = defineEmits(['signe', 'update:papier'])

const contenu = useContenuSite()
const contrat = computed(() => contratDeLaDemande(props.demande, contenu.frais.taux))
const nbArticles = computed(() => contrat.value.articles.filter((a) => /^\d/.test(a.titre)).length)
const signe = computed(() => !!props.demande.contrat_signe_le)

// ---------- Lire / télécharger ----------
const pdfEnCours = ref(false)
async function pdf(mode) {
  pdfEnCours.value = true
  try {
    const { exporterContratPdf } = await import('@/services/export/exportContrat.js')
    await exporterContratPdf(contrat.value, mode)
  } catch (e) {
    erreur.value = e?.message || 'Le PDF n’a pas pu être créé.'
  } finally {
    pdfEnCours.value = false
  }
}
function lire() {
  if (props.papier === null) pdf('visualiser')
  else emit('update:papier', !props.papier)
}

// ---------- Signature dessinée ----------
// Les traits sont gardés en coordonnées d'un cadre 600 × 200, quelle que soit la taille affichée
const cadre = ref(null)
const traits = ref([]) // [[{x,y}…]…]
let enCours = null
const point = (e) => {
  const r = cadre.value.getBoundingClientRect()
  return { x: Math.round(((e.clientX - r.left) / r.width) * 600), y: Math.round(((e.clientY - r.top) / r.height) * 200) }
}
function debut(e) {
  if (props.lectureSeule || signe.value) return
  cadre.value.setPointerCapture?.(e.pointerId)
  enCours = [point(e)]
  traits.value = [...traits.value, enCours]
}
function suite(e) {
  if (!enCours) return
  const p = point(e), d = enCours[enCours.length - 1]
  if (Math.abs(p.x - d.x) + Math.abs(p.y - d.y) < 3) return
  enCours.push(p)
  traits.value = [...traits.value]
}
const fin = () => { enCours = null }
const effacer = () => { traits.value = [] }
const trace = computed(() => traits.value.filter((t) => t.length > 1).map((t) => `M${t[0].x} ${t[0].y}` + t.slice(1).map((p) => `L${p.x} ${p.y}`).join('')).join(''))

const signataire = ref('')
const qualite = ref('')
const accord = ref(false)
const erreur = ref('')
const envoi = ref(false)
async function signer() {
  erreur.value = signataire.value.trim().length < 3 ? 'Indiquez le prénom et le nom du signataire.'
    : !qualite.value.trim() ? 'Indiquez sa qualité (gérant, directeur…).'
    : trace.value.length < 20 ? 'Signez dans le cadre.'
    : !accord.value ? 'Cochez la case pour accepter le contrat.' : ''
  if (erreur.value) return
  envoi.value = true
  try {
    await signerContrat({ version: VERSION, signataire: signataire.value.trim(), qualite: qualite.value.trim(), signature: trace.value })
    emit('signe')
  } catch (e) {
    erreur.value = e?.message || 'La signature n’a pas pu être enregistrée.'
  } finally {
    envoi.value = false
  }
}
</script>

<template>
  <div class="ctr">
    <!-- le contrat en une carte : le lire, le garder en PDF -->
    <div class="ctr-doc">
      <span class="ctr-doc-icone" aria-hidden="true"><i class="fa-solid fa-file-contract"></i></span>
      <span class="ctr-doc-texte">
        <strong>Contrat de partenariat fournisseur</strong>
        <small>Version du {{ DATE_VERSION }} · {{ nbArticles }} articles</small>
      </span>
      <span class="ctr-doc-actions">
        <button type="button" class="ctr-bouton" :class="{ actif: papier }" :aria-pressed="papier === null ? undefined : papier" @click="lire">
          <i :class="papier ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'" aria-hidden="true"></i> {{ papier ? 'Masquer le contrat' : 'Lire le contrat' }}
        </button>
        <button type="button" class="ctr-bouton" :disabled="pdfEnCours" @click="pdf('telecharger')">
          <span v-if="pdfEnCours" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-download" aria-hidden="true"></i> Télécharger (PDF)
        </button>
      </span>
    </div>

    <!-- signé : la signature enregistrée -->
    <div v-if="signe" class="ctr-signe">
      <svg viewBox="0 0 600 200" class="ctr-trace" aria-label="Signature"><path :d="demande.contrat_signature" /></svg>
      <p><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Signé par <strong>{{ demande.contrat_signataire }}</strong><template v-if="demande.contrat_qualite">, {{ demande.contrat_qualite }}</template>, le {{ contrat.signature.date }}<template v-if="demande.contrat_version !== VERSION"> (version {{ demande.contrat_version }})</template></p>
    </div>

    <p v-else-if="lectureSeule" class="ctr-attente"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> Pas encore signé par l’entreprise.</p>

    <!-- à signer -->
    <form v-else class="ctr-signature" novalidate @submit.prevent="signer">
      <div class="ctr-duo">
        <div class="champ"><label for="ctr-nom">Signataire</label><input id="ctr-nom" v-model="signataire" maxlength="120" autocomplete="name" placeholder="Prénom Nom" /></div>
        <div class="champ"><label for="ctr-qualite">Qualité</label><input id="ctr-qualite" v-model="qualite" maxlength="80" placeholder="Gérant, directeur…" /></div>
      </div>
      <div class="ctr-zone">
        <span class="ctr-zone-label">Signature</span>
        <div
          ref="cadre" class="ctr-cadre" role="img" aria-label="Cadre de signature : signez au doigt ou à la souris"
          @pointerdown.prevent="debut" @pointermove="suite" @pointerup="fin" @pointercancel="fin" @pointerleave="fin"
        >
          <svg viewBox="0 0 600 200" class="ctr-trace"><path :d="trace" /></svg>
          <span v-if="!trace" class="ctr-indice"><i class="fa-solid fa-signature" aria-hidden="true"></i> Signez ici</span>
        </div>
        <button v-if="trace" type="button" class="ctr-effacer" @click="effacer"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Effacer</button>
      </div>
      <label class="ctr-accord"><input v-model="accord" type="checkbox" /> J’ai lu le contrat et je l’accepte au nom de {{ demande.entreprise }}</label>
      <BoutonBase type="submit" bloc :chargement="envoi" icone="fa-solid fa-file-signature">Signer le contrat</BoutonBase>
    </form>

    <p v-if="erreur" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreur }}</p>
  </div>
</template>

<style scoped>
.ctr { display: flex; flex-direction: column; gap: 14px; min-height: 0; }

/* ---------- Carte du contrat ---------- */
.ctr-doc { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px 14px; border: 1.5px solid var(--gris-200); border-radius: var(--rayon); background: var(--carte); }
.ctr-doc-icone { display: grid; place-items: center; flex: none; width: 40px; height: 40px; border-radius: 12px; background: rgba(17, 17, 17, .14); color: var(--lagon-700); font-size: 1.05rem; }
.ctr-doc-texte { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.ctr-doc-texte strong { color: var(--ardoise); font-size: .9rem; line-height: 1.3; }
.ctr-doc-texte small { color: var(--texte-secondaire); font-size: .78rem; }
/* les deux actions sur leur propre ligne, sous le titre */
.ctr-doc-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 100%; }
.ctr-bouton {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 36px; padding: 0 12px; border: 1.5px solid var(--gris-300); border-radius: 999px;
  background: transparent; color: var(--ardoise); font: inherit; font-size: .8rem; font-weight: 700; cursor: pointer; transition: border-color var(--transition), background var(--transition);
}
.ctr-bouton:hover:not(:disabled) { border-color: var(--lagon-500); }
.ctr-bouton.actif { border-color: var(--lagon-600); background: rgba(17, 17, 17, .14); }
.ctr-bouton:disabled { opacity: .6; cursor: default; }

/* ---------- Signature ---------- */
.ctr-signature { display: flex; flex-direction: column; gap: 12px; }
.ctr-duo { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.ctr-duo > * { min-width: 0; }
.ctr-duo input { width: 100%; font-family: var(--font-corps); }
.ctr-zone { position: relative; display: flex; flex-direction: column; gap: 6px; }
.ctr-zone-label { color: var(--gris-700); font-weight: 600; font-size: .95rem; }
.ctr-cadre {
  position: relative; height: 120px; border: 1.5px dashed var(--gris-300); border-radius: var(--rayon-sm); background: var(--carte);
  touch-action: none; cursor: crosshair;
}
.ctr-trace { width: 100%; height: 100%; }
.ctr-trace path { fill: none; stroke: var(--ardoise); stroke-width: 3.5; stroke-linecap: round; stroke-linejoin: round; }
.ctr-indice { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--gris-400); font-size: .9rem; pointer-events: none; }
.ctr-effacer { position: absolute; top: 30px; right: 8px; padding: 4px 10px; border: 0; border-radius: 999px; background: var(--gris-100); color: var(--ardoise); font: inherit; font-size: .78rem; font-weight: 600; cursor: pointer; }
.ctr-accord { display: flex; align-items: flex-start; gap: 10px; color: var(--gris-700); font-size: .9rem; cursor: pointer; }
.ctr-accord input { flex: none; width: 18px; height: 18px; margin-top: 2px; accent-color: var(--lagon-600); }
.ctr-signe { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid rgba(16, 185, 129, .35); border-radius: var(--rayon); background: rgba(16, 185, 129, .07); }
.ctr-signe .ctr-trace { height: 70px; }
.ctr-signe p, .ctr-attente { margin: 0; color: var(--ardoise); font-size: .88rem; }
.ctr-signe i { color: #059669; }
.ctr-attente i { color: #d97706; }
@media (max-width: 639px) {
  .ctr-duo input { font-size: 1rem; }
}
</style>

<script setup>
/**
 * Le contrat de partenariat en PDF, dans un bloc de la même taille que le dossier, posé à sa droite (« Lire » sur la
 * carte du contrat). C'est le vrai PDF, celui qu'on télécharge, affiché par le lecteur du navigateur ; regénéré quand
 * le contrat est signé. Sans lecteur PDF intégré (Chrome sur Android…), le texte est mis en page comme une feuille.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { DATE_VERSION, contratDeLaDemande } from '@/donnees/contratPartenaire.js'
import { useContenuSite } from '@/composables/useContenuSite.js'

const props = defineProps({ demande: { type: Object, required: true } })
const emit = defineEmits(['fermer'])

const lecteurIntegre = typeof navigator === 'undefined' || navigator.pdfViewerEnabled !== false
const contenu = useContenuSite()
const contrat = computed(() => contratDeLaDemande(props.demande, contenu.frais.taux))

const pdf = ref(null) // { url, fichier }
const erreur = ref('')
async function generer() {
  try {
    const { creerContratPdf } = await import('@/services/export/exportContrat.js')
    const { doc, fichier } = await creerContratPdf(contrat.value)
    liberer()
    pdf.value = { url: URL.createObjectURL(doc.output('blob')), fichier }
  } catch (e) {
    erreur.value = e?.message || 'Le PDF n’a pas pu être créé.'
  }
}
function liberer() { if (pdf.value) URL.revokeObjectURL(pdf.value.url) }
watch(() => props.demande.contrat_signe_le, generer, { immediate: true })
onBeforeUnmount(liberer)
</script>

<template>
  <section class="apc theme-nuit" aria-label="Contrat de partenariat (PDF)">
    <header class="apc-barre">
      <button type="button" class="apc-retour" @click="emit('fermer')"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i> Retour</button>
      <p class="apc-nom"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i> <span>{{ pdf?.fichier || 'Contrat de partenariat' }}</span></p>
      <a v-if="pdf" :href="pdf.url" :download="pdf.fichier" class="apc-icone" title="Télécharger" aria-label="Télécharger le contrat"><i class="fa-solid fa-download" aria-hidden="true"></i></a>
      <button type="button" class="apc-icone apc-fermer" title="Fermer" aria-label="Fermer le contrat" @click="emit('fermer')"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
    </header>

    <iframe v-if="lecteurIntegre && pdf" :src="`${pdf.url}#toolbar=1&navpanes=0&view=FitH`" class="apc-cadre" :title="pdf.fichier"></iframe>
    <p v-else-if="lecteurIntegre && !erreur" class="apc-attente"><span class="spinner" aria-hidden="true"></span></p>

    <!-- sans lecteur PDF : la même mise en page, en feuille -->
    <div v-else class="apc-bureau">
      <p v-if="erreur" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreur }}</p>
      <article class="apc-feuille" tabindex="0" aria-label="Texte du contrat">
        <header class="apc-feuille-tete">
          <h3>Contrat de partenariat fournisseur</h3>
          <p>Version du {{ DATE_VERSION }}</p>
        </header>
        <section v-for="a in contrat.articles" :key="a.titre">
          <h4>{{ a.titre }}</h4>
          <p v-for="(p, i) in a.texte" :key="i">{{ p }}</p>
        </section>
        <footer class="apc-feuille-signature">
          <strong>Pour {{ demande.entreprise }}</strong>
          <template v-if="contrat.signature">
            <svg viewBox="0 0 600 200" class="apc-trace" aria-label="Signature"><path :d="contrat.signature.trace" /></svg>
            <small>Signé en ligne par {{ contrat.signature.signataire }}<template v-if="contrat.signature.qualite">, {{ contrat.signature.qualite }}</template>, le {{ contrat.signature.date }}</small>
          </template>
          <small v-else>Non signé : le contrat se signe en ligne, dans le dossier de validation du compte.</small>
        </footer>
      </article>
    </div>
  </section>
</template>

<style scoped>
/* même carte que le dossier (DossierFournisseur fixe sa taille) ; le PDF occupe tout le reste */
.apc {
  display: flex; flex-direction: column; overflow: hidden; border-radius: 28px; background: var(--gris-50); color: var(--ardoise);
  box-shadow: 0 30px 80px rgba(17, 17, 17, .45); animation: apc-entrer .32s cubic-bezier(.22, .61, .36, 1);
}
@keyframes apc-entrer { from { transform: translateX(-24px); opacity: 0; } }
.apc-barre { display: flex; align-items: center; gap: 10px; min-height: 60px; padding: 10px 14px 10px 22px; border-bottom: 1px solid var(--gris-200); }
.apc-retour { display: none; }
.apc-nom { display: flex; flex: 1; align-items: center; gap: 10px; min-width: 0; margin: 0; color: var(--ardoise); font-size: .88rem; font-weight: 600; }
.apc-nom i { color: #f87171; font-size: 1.1rem; }
.apc-nom span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.apc-icone {
  display: grid; place-items: center; flex: none; width: 38px; height: 38px; border: 0; border-radius: 50%; background: var(--gris-100); color: var(--ardoise);
  font: inherit; font-size: .9rem; cursor: pointer; transition: background .15s;
}
.apc-icone:hover { background: var(--gris-200); }
.apc-cadre { flex: 1; width: 100%; min-height: 0; border: 0; background: #2a2f33; }
.apc-attente { display: grid; flex: 1; place-items: center; margin: 0; }

/* repli sans lecteur PDF : une feuille sur fond gris, comme dans un lecteur */
.apc-bureau { display: flex; flex: 1; flex-direction: column; gap: 10px; min-height: 0; overflow-y: auto; padding: 16px; background: #2a2f33; scrollbar-width: thin; }
.apc-feuille {
  width: 100%; max-width: 620px; margin: 0 auto; padding: 32px 30px 36px; border-radius: 2px; background: #fff; color: #1f2937;
  box-shadow: 0 2px 10px rgba(0, 0, 0, .45); font-family: Helvetica, Arial, sans-serif; font-size: .78rem; line-height: 1.6;
}
.apc-feuille-tete { margin: -32px -30px 18px; padding: 20px 30px 16px; background: #111111; border-bottom: 4px solid #111111; color: #fff; }
.apc-feuille-tete h3 { margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 1.05rem; letter-spacing: 0; color: #fff; }
.apc-feuille-tete p { margin: 2px 0 0; color: rgba(255, 255, 255, .8); font-size: .72rem; }
.apc-feuille h4 { margin: 12px 0 4px; color: #111111; font-family: Helvetica, Arial, sans-serif; font-size: .84rem; letter-spacing: 0; }
.apc-feuille section p { margin: 0 0 5px; }
.apc-feuille-signature { display: flex; flex-direction: column; gap: 4px; margin-top: 22px; padding-top: 14px; border-top: 1px solid #cbd5e1; }
.apc-feuille-signature strong { color: #111111; }
.apc-feuille-signature small { color: #475569; font-size: .72rem; }
.apc-trace { width: 160px; height: 54px; }
.apc-trace path { fill: none; stroke: #1e293b; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }

/* téléphone et écran étroit : le bloc prend la place du dossier, avec un retour */
@media (max-width: 899px) {
  .apc-retour {
    display: inline-flex; align-items: center; gap: 8px; flex: none; height: 36px; padding: 0 14px 0 10px; border: 0; border-radius: 999px;
    background: var(--gris-100); color: var(--ardoise); font: inherit; font-size: .85rem; font-weight: 600; cursor: pointer;
  }
  .apc-barre { padding-left: 14px; }
  .apc-nom span, .apc-fermer { display: none; }
}
@media (max-width: 639px) {
  .apc { border-radius: 26px 26px 0 0; animation-name: apc-monter; }
  .apc-bureau { padding: 10px 10px calc(10px + env(safe-area-inset-bottom)); }
  .apc-feuille { padding: 24px 18px 28px; }
  .apc-feuille-tete { margin: -24px -18px 16px; padding: 16px 18px 14px; }
}
@keyframes apc-monter { from { transform: translateY(18px); opacity: 0; } }
</style>

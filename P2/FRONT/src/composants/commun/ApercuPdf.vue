<script setup>
/**
 * Fenêtre d'aperçu d'un PDF (devis, reçu) : lecture dans la page, puis téléchargement ou ouverture dans un onglet.
 * Les navigateurs sans lecteur PDF intégré (Chrome sur Android, notamment) affichent les deux boutons à la place.
 */
import { nextTick, watch, ref } from 'vue'
import { apercuPdf, fermerApercuPdf } from '@/services/export/livrerPdf.js'

const lecteurIntegre = typeof navigator === 'undefined' || navigator.pdfViewerEnabled !== false
const boutonFermer = ref(null)

watch(apercuPdf, async (a) => {
  document.body.style.overflow = a ? 'hidden' : ''
  if (a) { await nextTick(); boutonFermer.value?.focus() }
})
</script>

<template>
  <transition name="fondu">
    <div v-if="apercuPdf" class="apdf-fond" @click.self="fermerApercuPdf" @keydown.esc="fermerApercuPdf">
      <div class="apdf" role="dialog" aria-modal="true" aria-labelledby="apdf-titre">
        <header class="apdf-tete">
          <p id="apdf-titre" class="apdf-titre"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i> <span>{{ apercuPdf.fichier }}</span></p>
          <div class="apdf-actions">
            <a :href="apercuPdf.url" :download="apercuPdf.fichier" class="btn btn-primaire btn-sm"><i class="fa-solid fa-download" aria-hidden="true"></i> Télécharger</a>
            <a :href="apercuPdf.url" target="_blank" rel="noopener" class="btn btn-secondaire btn-sm apdf-onglet"><i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i> Nouvel onglet</a>
            <button ref="boutonFermer" type="button" class="apdf-fermer" aria-label="Fermer l’aperçu" @click="fermerApercuPdf"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
          </div>
        </header>
        <iframe v-if="lecteurIntegre" :src="apercuPdf.url" class="apdf-cadre" :title="`Aperçu de ${apercuPdf.fichier}`"></iframe>
        <div v-else class="apdf-sans-lecteur">
          <i class="fa-regular fa-file-pdf" aria-hidden="true"></i>
          <p>Votre appareil ne sait pas afficher un PDF dans la page.</p>
          <p class="texte-secondaire">Ouvrez-le dans un nouvel onglet ou téléchargez-le.</p>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.apdf-fond { position: fixed; inset: 0; z-index: 400; display: grid; place-items: center; padding: 20px; background: rgba(6, 32, 44, .6); backdrop-filter: blur(4px); }
.apdf { display: flex; flex-direction: column; width: min(980px, 100%); height: min(92vh, 1100px); overflow: hidden; border-radius: var(--rayon-lg); background: #fff; box-shadow: var(--ombre-lg); }
.apdf-tete { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px 12px 18px; border-bottom: 1px solid var(--gris-200); }
.apdf-titre { display: flex; align-items: center; gap: 8px; min-width: 0; margin: 0; color: var(--ardoise); font-weight: 700; }
.apdf-titre i { color: #dc2626; }
.apdf-titre span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.apdf-actions { display: flex; align-items: center; gap: 8px; }
.apdf-fermer { width: 38px; height: 38px; display: grid; place-items: center; border: 0; border-radius: 50%; background: transparent; color: var(--gris-500); }
.apdf-fermer:hover { background: var(--gris-100); color: var(--ardoise); }
.apdf-cadre { flex: 1; width: 100%; border: 0; background: var(--gris-100); }
.apdf-sans-lecteur { flex: 1; display: grid; place-content: center; gap: 6px; padding: 24px; text-align: center; color: var(--ardoise); }
.apdf-sans-lecteur > i { font-size: 3rem; color: #dc2626; }
.apdf-sans-lecteur p { margin: 0; }
@media (max-width: 560px) {
  .apdf-fond { padding: 0; }
  .apdf { height: 100%; border-radius: 0; }
}
</style>

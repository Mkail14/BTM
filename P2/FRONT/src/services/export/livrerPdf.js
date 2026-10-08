/**
 * Remise d'un PDF généré par jsPDF : téléchargement direct, ou aperçu dans la fenêtre ApercuPdf
 * (montée une seule fois dans App.vue, disponible sur toutes les pages, espaces admin et fournisseur compris).
 */
import { shallowRef } from 'vue'

/** PDF affiché dans la fenêtre d'aperçu : { url, fichier } ou null */
export const apercuPdf = shallowRef(null)

export function fermerApercuPdf() {
  if (apercuPdf.value) URL.revokeObjectURL(apercuPdf.value.url)
  apercuPdf.value = null
}

/** @param {'telecharger'|'visualiser'} mode */
export function livrerPdf(doc, fichier, mode = 'telecharger') {
  if (mode !== 'visualiser') {
    doc.save(fichier)
    return fichier
  }
  fermerApercuPdf()
  apercuPdf.value = { url: URL.createObjectURL(doc.output('blob')), fichier }
  return fichier
}

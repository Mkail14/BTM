/**
 * Contrat de partenariat fournisseur en PDF (A4) : le texte complété avec l'entreprise, puis la signature quand elle
 * existe (signataire, qualité, date, tracé). C'est la trace que l'entreprise garde de ce qu'elle signe.
 * jsPDF chargé à la demande, comme le devis et le reçu.
 */
import { livrerPdf } from './livrerPdf.js'
import { DATE_VERSION, IDENTITE_BTM } from '@/donnees/contratPartenaire.js'
import { NOIR, CREME, GRIS, ENCRE, chargerLogo, dessinerLogo } from './charte.js'
const propre = (texte) => String(texte ?? '').replace(/[  ]/g, ' ').replace(/−/g, '-')

/**
 * Le PDF du contrat (lu à côté de la signature, ou téléchargé)
 * @param {object} p
 * @param {string} p.entreprise
 * @param {{ titre: string, texte: string[] }[]} p.articles  texte du contrat (articles() de contratPartenaire.js)
 * @param {{ trace: string, signataire: string, qualite?: string, date: string, version?: string } | null} [p.signature]
 * @returns {Promise<{ doc: import('jspdf').jsPDF, fichier: string }>}
 */
export async function creerContratPdf({ entreprise, articles, signature = null }) {
  const { jsPDF } = await import('jspdf')
  const logo = await chargerLogo()
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.setProperties({ title: `Contrat de partenariat BTM — ${propre(entreprise)}` })
  const largeur = doc.internal.pageSize.getWidth()
  const hauteur = doc.internal.pageSize.getHeight()
  const marge = 20
  const utile = largeur - marge * 2
  const bas = hauteur - 20
  let y = 0
  const place = (h) => { if (y + h > bas) { doc.addPage(); y = 22 } }

  // ---- En-tête
  doc.setFillColor(...NOIR)
  doc.rect(0, 0, largeur, 30, 'F')
  doc.setFillColor(...CREME)
  doc.rect(0, 30, largeur, 1.2, 'F')
  doc.setTextColor(...CREME)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('Contrat de partenariat fournisseur', marge, 14)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(propre(`${IDENTITE_BTM.nom}  •  ${entreprise}`), marge, 21.5)
  const logoPose = dessinerLogo(doc, logo, largeur - marge - 12 * 343 / 160, 5, 12)
  doc.text(propre(`Version du ${DATE_VERSION}`), largeur - marge, logoPose ? 24.5 : 14, { align: 'right' })
  y = 44

  // ---- Articles
  for (const a of articles) {
    place(16)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...NOIR)
    doc.text(propre(a.titre), marge, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...ENCRE)
    for (const paragraphe of a.texte) {
      for (const ligne of doc.splitTextToSize(propre(paragraphe), utile)) {
        place(5)
        doc.text(ligne, marge, y)
        y += 4.6
      }
      y += 1.8
    }
    y += 3
  }

  // ---- Signature du Fournisseur
  place(56)
  y += 2
  doc.setDrawColor(...GRIS)
  doc.setLineWidth(0.2)
  doc.line(marge, y, largeur - marge, y)
  y += 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...NOIR)
  doc.text(propre(`Pour ${entreprise}`), marge, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...ENCRE)
  if (signature) {
    doc.text(propre(`Signé en ligne par ${signature.signataire}${signature.qualite ? `, ${signature.qualite}` : ''}, le ${signature.date}`), marge, y)
    if (signature.version) { y += 4.6; doc.setTextColor(...GRIS); doc.text(propre(`Version signée : ${signature.version}`), marge, y) }
    y += 4
    // tracé enregistré dans un cadre 600 × 200 (« M x y L x y … »), reporté sur 72 × 24 mm
    const k = 72 / 600
    doc.setDrawColor(...ENCRE)
    doc.setLineWidth(0.45)
    doc.setLineCap('round')
    let precedent = null
    for (const [, cmd, x, py] of signature.trace.matchAll(/([ML])\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)) {
      const p = [marge + Number(x) * k, y + Number(py) * k]
      if (cmd === 'L' && precedent) doc.line(precedent[0], precedent[1], p[0], p[1])
      precedent = p
    }
  } else {
    doc.setTextColor(...GRIS)
    doc.text('Non signé : le contrat se signe en ligne, dans le dossier de validation du compte.', marge, y)
  }

  // ---- Pied de page
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...GRIS)
    doc.text(propre(`${entreprise}  •  Contrat de partenariat BTM  •  version du ${DATE_VERSION}`), marge, hauteur - 10)
    doc.text(`Page ${i} / ${pages}`, largeur - marge, hauteur - 10, { align: 'right' })
  }

  const nom = propre(entreprise).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'entreprise'
  return { doc, fichier: `Contrat-partenariat-BTM-${nom}.pdf` }
}

/** Téléchargement, ou aperçu dans la fenêtre ApercuPdf (mode « visualiser ») */
export async function exporterContratPdf(contrat, mode = 'telecharger') {
  const { doc, fichier } = await creerContratPdf(contrat)
  return livrerPdf(doc, fichier, mode)
}

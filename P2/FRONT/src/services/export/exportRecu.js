/**
 * Reçu de paiement (espace fournisseur) : émis à chaque encaissement, numéroté par la base.
 * Reprend l'identité du fournisseur, le code de retrait, le moyen de paiement et sa référence,
 * les matériaux remis et ceux non fournis. jsPDF chargé à la demande, comme le devis.
 */
import { livrerPdf } from './livrerPdf.js'
import { formaterEuros, formaterQuantite } from '@/services/calculs/moteurCalculs.js'
import { MOYENS } from '@/services/supabase/serviceEspaceFournisseur.js'

const LAGON = [8, 145, 178]
const OCEAN = [11, 58, 77]
const GRIS = [100, 116, 139]
const LAGON_CLAIR = [236, 254, 255]
const propre = (texte) => String(texte ?? '').replace(/[  ]/g, ' ').replace(/−/g, '-')
const euros = (n) => propre(formaterEuros(n))
const horodatage = (d) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Indian/Mayotte' }).format(new Date(d))

/**
 * @param {object} paiement ligne de la table paiements (0013)
 * @param {object} fiche    fiche du fournisseur (table fournisseurs)
 * @param {string} [encaissePar] nom de la personne connectée
 */
export async function exporterRecuPdf({ paiement: p, fiche, encaissePar }, mode = 'telecharger') {
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const largeur = doc.internal.pageSize.getWidth()
  const marge = 16
  const utile = largeur - marge * 2
  const tableau = { margin: { left: marge, right: marge }, styles: { fontSize: 9.5, cellPadding: 2.4 }, headStyles: { fillColor: LAGON, textColor: 255, fontStyle: 'bold' } }

  // ---- En-tête : le fournisseur (émetteur du reçu)
  doc.setFillColor(...OCEAN)
  doc.rect(0, 0, largeur, 34, 'F')
  doc.setFillColor(...LAGON)
  doc.rect(0, 34, largeur, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(propre(fiche?.nom || 'Fournisseur'), marge, 14)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(propre([fiche?.adresse, fiche?.commune].filter(Boolean).join(', ')), marge, 21)
  doc.text(propre([fiche?.telephone && `Tél. ${fiche.telephone}`, fiche?.email].filter(Boolean).join('   •   ')), marge, 26.5)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('REÇU DE PAIEMENT', largeur - marge, 14, { align: 'right' })
  doc.setFont('courier', 'bold')
  doc.setFontSize(14)
  doc.text(p.numero_recu || '—', largeur - marge, 22, { align: 'right' })
  doc.setFont('helvetica', 'normal')

  // ---- Informations de l'opération
  let y = 48
  const moyen = MOYENS[p.moyen]
  const infos = [
    ['Date et heure', horodatage(p.paye_le)],
    ['Projet', p.projet_nom],
    ['Code de retrait', p.code_retrait || '—'],
    ['Moyen de paiement', moyen?.libelle || '—'],
    ...(p.reference ? [[moyen?.reference || 'Référence', p.reference]] : []),
    ...(encaissePar ? [['Encaissé par', encaissePar]] : [])
  ]
  autoTable(doc, {
    ...tableau, startY: y, theme: 'plain', body: infos.map(([a, b]) => [propre(a), propre(b)]),
    styles: { fontSize: 10, cellPadding: 1.8 }, columnStyles: { 0: { textColor: GRIS, cellWidth: 48 }, 1: { textColor: OCEAN, fontStyle: 'bold' } }
  })
  y = doc.lastAutoTable.finalY + 8

  // ---- Matériaux remis
  const ligne = (l) => [propre(l.libelle), propre(formaterQuantite(l.quantite, l.unite)), euros(l.prixUnitaire), euros(l.sousTotal)]
  autoTable(doc, {
    ...tableau, startY: y, theme: 'striped',
    head: [['Matériaux remis', 'Quantité', 'Prix unitaire', 'Total']],
    body: (p.lignes_fournies || []).map(ligne),
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' } }
  })
  y = doc.lastAutoTable.finalY + 6

  if (p.lignes_manquantes?.length) {
    autoTable(doc, {
      ...tableau, startY: y, theme: 'plain',
      head: [['Non fournis (non facturés)', 'Quantité', '', '']],
      headStyles: { fillColor: [254, 243, 199], textColor: [146, 64, 14], fontStyle: 'bold' },
      body: p.lignes_manquantes.map((l) => [propre(l.libelle), propre(formaterQuantite(l.quantite, l.unite)), '', '']),
      styles: { fontSize: 9, textColor: GRIS, cellPadding: 2 }, columnStyles: { 1: { halign: 'right' } }
    })
    y = doc.lastAutoTable.finalY + 6
  }

  // ---- Totaux
  if (y > 230) { doc.addPage(); y = 20 }
  const promo = Number(p.remise_fournisseur) || 0
  const credit = Number(p.credit_utilise) || 0
  // reste de l'écart : code promo BTM (reçus récents) ou frais de service (anciens reçus)
  const autre = Math.round(((p.montant_devis ?? 0) - ((p.montant_materiaux ?? p.montant_devis ?? 0) - promo - credit)) * 100) / 100
  const totaux = [
    ['Matériaux remis', euros(p.montant_materiaux ?? p.montant_devis)],
    ...(promo ? [[propre(`${p.promotion?.libelle || 'Promotion'}${p.promotion?.code ? ` (${p.promotion.code})` : ''}`), euros(-promo)]] : []),
    ...(autre ? [[autre > 0 ? 'Frais de service BTM' : 'Réduction (code promo BTM)', euros(autre)]] : []),
    ...(credit ? [['Crédit fidélité BTM', euros(-credit)]] : []),
    ...(p.moyen === 'especes' && p.montant_recu != null ? [['Espèces reçues', euros(p.montant_recu)], ['Monnaie rendue', euros(p.rendu || 0)]] : [])
  ]
  const hauteur = 20 + totaux.length * 6.5
  doc.setFillColor(...LAGON_CLAIR)
  doc.roundedRect(marge, y, utile, hauteur, 3, 3, 'F')
  doc.setFontSize(10)
  totaux.forEach(([a, b], i) => {
    doc.setTextColor(...GRIS)
    doc.text(a, marge + 7, y + 8 + i * 6.5)
    doc.setTextColor(...OCEAN)
    doc.text(b, largeur - marge - 7, y + 8 + i * 6.5, { align: 'right' })
  })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('Total payé', marge + 7, y + hauteur - 5)
  doc.setTextColor(...LAGON)
  doc.setFontSize(16)
  doc.text(euros(p.montant_devis), largeur - marge - 7, y + hauteur - 5, { align: 'right' })
  y += hauteur + 12

  // ---- Mentions
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...GRIS)
  if (Number(p.credit_gagne) > 0) {
    doc.setTextColor(4, 120, 87)
    doc.setFontSize(9.5)
    doc.text(propre(`Cet achat vous rapporte ${euros(p.credit_gagne)} de crédit fidélité BTM, utilisable lors de votre prochain retrait.`), marge, y)
    y += 7
    doc.setTextColor(...GRIS)
    doc.setFontSize(8.5)
  }
  doc.text(doc.splitTextToSize(propre(`Prix TTC, sans frais pour le client. Reçu émis via la plateforme BTM (Bâtiment & Travaux Mayotte) et enregistré au journal des opérations du fournisseur. Conservez-le : le n° ${p.numero_recu || ''} et le code ${p.code_retrait || ''} permettent de retrouver cette opération.`), utile), marge, y)
  doc.setFontSize(8)
  doc.text(`BTM — reçu ${p.numero_recu || ''}`, largeur / 2, 290, { align: 'center' })

  const fichier = `Recu_${p.numero_recu || 'BTM'}.pdf`
  return livrerPdf(doc, fichier, mode) // téléchargement direct ou aperçu (ApercuPdf)
}

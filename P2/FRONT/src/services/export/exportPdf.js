/**
 * Export PDF de l'estimation (F06 — BF33 à BF38).
 * Utilise jsPDF + autoTable, chargés à la demande (code splitting).
 */
import { formaterEuros, formaterNombre, resumerDimensions } from '@/services/calculs/moteurCalculs.js'
import { trouverTypeProjet } from '@/donnees/typesProjets.js'

const LAGON = [8, 145, 178]
const OCEAN = [11, 58, 77]
const GRIS = [100, 116, 139]
const CORAIL = [225, 29, 72]

export async function exporterEstimationPdf({ nom, resultat, fournisseur, section = 'total' }) {
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const largeur = doc.internal.pageSize.getWidth()
  const marge = 16
  const type = trouverTypeProjet(resultat.type)
  const titres = {
    materiaux: 'Détail des matériaux',
    mainOeuvre: "Détail de la main-d'œuvre",
    livraison: 'Détail de la livraison',
    total: 'Récapitulatif complet'
  }
  const titreExport = titres[section] || titres.total
  const date = new Date(resultat.calculeLe || Date.now()).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })

  // ---- Bandeau d'en-tête
  doc.setFillColor(...OCEAN)
  doc.rect(0, 0, largeur, 34, 'F')
  doc.setFillColor(...LAGON)
  doc.rect(0, 34, largeur, 2.5, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.text('BTM', marge, 15)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Bâtiment & Travaux Mayotte — Estimation indicative', marge, 22)
  doc.text(`Généré le ${date}`, largeur - marge, 22, { align: 'right' })
  doc.setFontSize(9)
  doc.text('www.btm-mayotte.yt', largeur - marge, 15, { align: 'right' })

  // ---- Titre projet
  let y = 48
  doc.setTextColor(...OCEAN)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.text(nom || `Estimation — ${type?.libelle || resultat.typeLibelle}`, marge, y)
  y += 7
  doc.setFontSize(10.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRIS)
  doc.text(`Type de projet : ${type?.libelle || resultat.typeLibelle} — ${titreExport}`, marge, y)
  y += 8

  // ---- Dimensions (BF34)
  const dims = (type?.champs || []).map((c) => {
    const v = resultat.dimensions?.[c.nom]
    if (c.type === 'select') {
      const opt = c.options.find((o) => o.valeur === v)
      return [c.label, opt ? opt.label.split(' — ')[0] : String(v ?? '')]
    }
    return [c.label, `${formaterNombre(v, 2)} ${c.unite}`]
  })
  const mesures = (resultat.mesures || []).map((m) => [m.label, typeof m.valeur === 'number' ? `${formaterNombre(m.valeur, 3)} ${m.unite}` : `${m.valeur} ${m.unite}`.trim()])

  autoTable(doc, {
    startY: y,
    head: [['Dimensions saisies', 'Valeur']],
    body: [...dims, ...mesures],
    theme: 'grid',
    headStyles: { fillColor: LAGON, textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9.5, cellPadding: 2.5 },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: marge, right: marge }
  })
  y = doc.lastAutoTable.finalY + 8

  // ---- Détail demandé
  if (section === 'materiaux' || section === 'total') {
    autoTable(doc, {
      startY: y,
      head: [['Matériau', 'Quantité', 'Unité', 'Prix unitaire', 'Sous-total']],
      body: resultat.lignes.map((l) => [
        l.libelle, formaterNombre(l.quantite, 2), l.unite, formaterEuros(l.prixUnitaire), formaterEuros(l.sousTotal)
      ]),
      foot: [['Total matériaux', '', '', '', formaterEuros(resultat.totalMateriaux)]],
      theme: 'striped',
      headStyles: { fillColor: LAGON, textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [236, 254, 255], textColor: OCEAN, fontStyle: 'bold' },
      styles: { fontSize: 9.5, cellPadding: 2.5 },
      columnStyles: { 1: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      margin: { left: marge, right: marge }
    })
    y = doc.lastAutoTable.finalY + 8
  }

  if (section === 'mainOeuvre' || section === 'livraison' || section === 'total') {
    const lignesSynthese = section === 'mainOeuvre'
      ? [[`Main-d'œuvre (${formaterNombre(resultat.mainOeuvre.heures, 1)} h × ${formaterEuros(resultat.mainOeuvre.tauxHoraire)}/h)`, formaterEuros(resultat.mainOeuvre.total)]]
      : section === 'livraison'
        ? [['Livraison estimée', formaterEuros(resultat.livraison)]]
        : [
            ['Matériaux', formaterEuros(resultat.totalMateriaux)],
            [`Main-d'œuvre (${formaterNombre(resultat.mainOeuvre.heures, 1)} h × ${formaterEuros(resultat.mainOeuvre.tauxHoraire)}/h)`, formaterEuros(resultat.mainOeuvre.total)],
            ['Livraison estimée', formaterEuros(resultat.livraison)],
            [{ content: 'TOTAL INDICATIF', styles: { fontStyle: 'bold', fontSize: 12, textColor: OCEAN } },
             { content: formaterEuros(resultat.total), styles: { fontStyle: 'bold', fontSize: 12, textColor: LAGON, halign: 'right' } }]
          ]

    autoTable(doc, {
      startY: y,
      body: lignesSynthese,
      theme: 'plain',
      styles: { fontSize: 10.5, cellPadding: 3 },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: marge, right: marge }
    })
    y = doc.lastAutoTable.finalY + 8
  }

  // ---- Fournisseur (BF38)
  if (fournisseur && section === 'total') {
    if (y > 240) { doc.addPage(); y = 20 }
    doc.setFillColor(236, 254, 255)
    doc.roundedRect(marge, y, largeur - marge * 2, 30, 3, 3, 'F')
    doc.setTextColor(...OCEAN)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('Fournisseur sélectionné', marge + 5, y + 7)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(`${fournisseur.nom} — ${fournisseur.categorie}`, marge + 5, y + 14)
    doc.text(`${fournisseur.adresse || fournisseur.commune}`, marge + 5, y + 19.5)
    doc.text(`Tél. ${fournisseur.telephone}${fournisseur.site_web ? '   •   ' + fournisseur.site_web.replace(/^https?:\/\//, '') : ''}`, marge + 5, y + 25)
    y += 38
  }

  // ---- Disclaimer (BNF10 / C05)
  if (y > 255) { doc.addPage(); y = 20 }
  doc.setDrawColor(...CORAIL)
  doc.setLineWidth(0.6)
  doc.line(marge, y, marge + 30, y)
  y += 5
  doc.setTextColor(...CORAIL)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Avertissement', marge, y)
  y += 4.5
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRIS)
  const disclaimer = 'Cette estimation est indicative et à titre informatif. Elle ne constitue pas un devis officiel. Les prix et quantités peuvent varier selon les fournisseurs, la région et les conditions du marché. Contactez directement les fournisseurs locaux pour obtenir un devis précis et validé.'
  doc.text(doc.splitTextToSize(disclaimer, largeur - marge * 2), marge, y)

  // ---- Pied de page
  const pages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(...GRIS)
    doc.text(`BTM — ${resumerDimensions(resultat.type, resultat.dimensions)} — page ${i}/${pages}`, largeur / 2, 290, { align: 'center' })
  }

  const fichier = `BTM_${(nom || type?.libelle || 'estimation').replace(/[^a-z0-9àâçéèêëîïôûùüÿñæœ]+/gi, '_')}_${section}_${new Date().toISOString().slice(0, 10)}.pdf`
  doc.save(fichier)
  return fichier
}

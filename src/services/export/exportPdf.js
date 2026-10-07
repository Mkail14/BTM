/**
 * Export PDF du devis (F06 — BF33 à BF38).
 * Un seul document, dans l'ordre où un particulier le lit : le prix, ce qu'il faut acheter, ses mesures.
 * Utilise jsPDF + autoTable, chargés à la demande (code splitting).
 */
import { livrerPdf } from './livrerPdf.js'
import { formaterEuros, formaterNombre, formaterQuantite, lignesMurs, detailPrix } from '@/services/calculs/moteurCalculs.js'
import { trouverTypeProjet } from '@/donnees/typesProjets.js'

const LAGON = [8, 145, 178]
const OCEAN = [11, 58, 77]
const GRIS = [100, 116, 139]
const LAGON_CLAIR = [236, 254, 255]

// Les polices standard de jsPDF ne connaissent pas les espaces insécables fines du format français
const propre = (texte) => String(texte).replace(/[  ]/g, ' ').replace(/−/g, '-') // « − » des réductions : absent de la police non plus
const euros = (n) => propre(formaterEuros(n))
const nombre = (n, d) => propre(formaterNombre(n, d))

/** @param {string} [code] code de retrait du projet enregistré (présenté au fournisseur pour retirer et payer) */
export async function exporterEstimationPdf({ nom, resultat, fournisseur, code }, mode = 'telecharger') {
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const largeur = doc.internal.pageSize.getWidth()
  const marge = 16
  const utile = largeur - marge * 2
  const type = trouverTypeProjet(resultat.type)
  const libelle = type?.libelle || resultat.typeLibelle
  const date = new Date(resultat.calculeLe || Date.now()).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  const tableau = { margin: { left: marge, right: marge }, styles: { fontSize: 9.5, cellPadding: 2.6 }, headStyles: { fillColor: LAGON, textColor: 255, fontStyle: 'bold' } }

  function titreSection(texte, y) {
    doc.setTextColor(...OCEAN)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12.5)
    doc.text(texte, marge, y)
    return y + 3
  }

  // ---- En-tête
  doc.setFillColor(...OCEAN)
  doc.rect(0, 0, largeur, 30, 'F')
  doc.setFillColor(...LAGON)
  doc.rect(0, 30, largeur, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text('BTM', marge, 14)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  if (code) {
    // Code de retrait : encadré blanc à droite de l'en-tête, lisible d'un coup d'œil au comptoir
    doc.text(`Bâtiment & Travaux Mayotte · Devis du ${date}`, marge, 21)
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(largeur - marge - 56, 6, 56, 19, 2.5, 2.5, 'F')
    doc.setTextColor(...GRIS)
    doc.setFontSize(7.5)
    doc.text('CODE DE RETRAIT', largeur - marge - 28, 11.5, { align: 'center' })
    doc.setTextColor(...OCEAN)
    doc.setFont('courier', 'bold')
    doc.setFontSize(17)
    doc.text(code, largeur - marge - 28, 20.5, { align: 'center' })
    doc.setFont('helvetica', 'normal')
  } else {
    doc.text('Bâtiment & Travaux Mayotte', marge, 21)
    doc.text(`Devis du ${date}`, largeur - marge, 21, { align: 'right' })
  }

  // ---- Titre
  let y = 45
  doc.setTextColor(...OCEAN)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(nom || `Devis — ${libelle}`, marge, y)
  const principale = resultat.mesures?.find((m) => m.principale)
  const nbMurs = (resultat.dimensions?.autresMurs?.length || 0) + 1
  y += 6.5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  doc.setTextColor(...GRIS)
  doc.text(`${nbMurs > 1 ? `${nbMurs} murs` : libelle}${principale ? ` · ${principale.label.toLowerCase()} ${nombre(principale.valeur, 2)} ${principale.unite}` : ''}`, marge, y)

  // ---- 1. Le prix
  y += 8
  // Matériaux (+ frais de service BTM pour les devis récents)
  const detail = detailPrix(resultat).map((l) => [propre(l.label), euros(l.valeur)])
  const hauteurPrix = 25 + detail.length * 6.5
  doc.setFillColor(...LAGON_CLAIR)
  doc.roundedRect(marge, y, utile, hauteurPrix, 3, 3, 'F')
  doc.setTextColor(...OCEAN)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Coût total', marge + 7, y + 10)
  doc.setFontSize(24)
  doc.setTextColor(...LAGON)
  doc.text(euros(resultat.total), largeur - marge - 7, y + 12, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  detail.forEach(([label, valeur], i) => {
    const ly = y + 22 + i * 6.5
    doc.setTextColor(...GRIS)
    doc.text(label, marge + 7, ly)
    doc.setTextColor(...OCEAN)
    doc.text(valeur, largeur - marge - 7, ly, { align: 'right' })
  })
  y += hauteurPrix + 11

  // ---- 1 bis. Projet professionnel : détail par ouvrage
  if (resultat.ouvrages?.length) {
    y = titreSection('Ouvrages du projet', y)
    autoTable(doc, {
      ...tableau,
      startY: y,
      head: [['Ouvrage', 'Composition', 'Matériaux']],
      body: resultat.ouvrages.map((o) => [propre(o.nom), propre(o.parties.map((p) => p.libelle).join(' · ')), euros(o.total)]),
      theme: 'striped',
      columnStyles: { 2: { halign: 'right', fontStyle: 'bold' } }
    })
    y = doc.lastAutoTable.finalY + 11
    if (y > 240) { doc.addPage(); y = 20 }
  }

  // ---- 2. Ce qu'il faut acheter
  y = titreSection('Ce qu’il faut acheter', y)
  autoTable(doc, {
    ...tableau,
    startY: y,
    head: [['Matériau', 'Quantité', 'Prix unitaire', 'Total']],
    body: resultat.lignes.map((l) => [l.libelle, propre(formaterQuantite(l.quantite, l.unite)), `${euros(l.prixUnitaire)} / ${l.unite === 'u' ? 'unité' : l.unite}`, euros(l.sousTotal)]),
    foot: [['Total matériaux', '', '', euros(resultat.totalMateriaux)]],
    theme: 'striped',
    footStyles: { fillColor: LAGON_CLAIR, textColor: OCEAN, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' } }
  })
  y = doc.lastAutoTable.finalY + 11

  // ---- 3. Vos mesures
  const saisies = resultat.dimensions?.autresMurs?.length
    ? lignesMurs(resultat.dimensions).map((l) => [l.label, propre(l.valeur)])
    : (type?.champs || []).map((c) => {
        const v = resultat.dimensions?.[c.nom]
        if (c.type === 'select') return [c.label, c.options.find((o) => o.valeur === v)?.label.split(' — ')[0] || String(v ?? '')]
        return [c.label, `${nombre(v, 2)} ${c.unite}`]
      })
  const mesures = (resultat.mesures || []).map((m) => [m.label, typeof m.valeur === 'number' ? `${nombre(m.valeur, 3)} ${m.unite}`.trim() : `${m.valeur}`])
  if (y > 250) { doc.addPage(); y = 20 }
  y = titreSection('Vos mesures', y)
  autoTable(doc, {
    ...tableau,
    startY: y,
    body: [...saisies, ...mesures],
    theme: 'grid',
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }
  })
  y = doc.lastAutoTable.finalY + 11

  // ---- 4. Fournisseur (BF38)
  if (fournisseur) {
    if (y > 240) { doc.addPage(); y = 20 }
    y = titreSection('Où acheter', y) + 2
    doc.setFillColor(...LAGON_CLAIR)
    doc.roundedRect(marge, y, utile, 24, 3, 3, 'F')
    doc.setTextColor(...OCEAN)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.text(`${fournisseur.nom} — ${fournisseur.categorie}`, marge + 6, y + 8)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.text(`${fournisseur.adresse || fournisseur.commune}`, marge + 6, y + 14)
    doc.text(`Tél. ${fournisseur.telephone}${fournisseur.site_web ? '   •   ' + fournisseur.site_web.replace(/^https?:\/\//, '') : ''}`, marge + 6, y + 19.5)
    y += 34
  }

  // ---- Base de calcul
  if (y > 260) { doc.addPage(); y = 20 }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...OCEAN)
  doc.text('Base de calcul', marge, y)
  y += 4.5
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRIS)
  const retrait = code ? ` Pour retirer vos matériaux, présentez le code ${code} au fournisseur : il retrouve ce devis et vous remet un reçu numéroté.` : ' Enregistrez ce projet sur BTM pour obtenir un code de retrait à présenter au fournisseur.'
  doc.text(doc.splitTextToSize(`Prix TTC, hors terrassement et études. ${type?.hypotheses || ''}${retrait}`, utile), marge, y)

  // ---- Pied de page
  const pages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(...GRIS)
    doc.text(`BTM — devis — page ${i}/${pages}`, largeur / 2, 290, { align: 'center' })
  }

  const fichier = `BTM_Devis_${(nom || libelle || 'projet').replace(/[^a-z0-9àâçéèêëîïôûùüÿñæœ]+/gi, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`
  return livrerPdf(doc, fichier, mode) // téléchargement direct ou aperçu (ApercuPdf)
}

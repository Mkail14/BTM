

// Un seul prix : celui du fournisseur (une colonne « prix comptoir » d'un ancien modèle est ignorée)
export const COLONNES = ['code_btm', 'designation', 'unite', 'prix', 'stock', 'en_vente', 'rupture']

// en-têtes acceptés (minuscules, sans accents ni ponctuation) → colonne
const SYNONYMES = {
  code_btm: ['codebtm', 'materiaubtm', 'idbtm'], // pas « code » seul : c'est souvent la référence interne du fournisseur
  designation: ['designation', 'libelle', 'produit', 'article', 'nom', 'description'],
  unite: ['unite', 'unitedevente', 'uv'],
  prix: ['prix', 'prixbtm', 'prixunitaire', 'prixaveccode', 'prixaveccodebtm', 'prixht', 'prixttc', 'prixdevente', 'prixvente', 'tarif'],
  stock: ['stock', 'quantite', 'qte', 'quantiteenstock'],
  en_vente: ['envente', 'vendu', 'jelevends', 'actif'],
  rupture: ['rupture', 'enrupture', 'rupturedestock']
}
const cle = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const colonneDe = (entete) => { const k = cle(entete); return COLONNES.find((c) => SYNONYMES[c].includes(k)) || null }

// ---------- Écriture du modèle ----------
const cellule = (v) => { const s = v == null ? '' : String(v); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
const nombre = (v) => (v == null ? '' : String(v).replace('.', ','))

/**
 * Modèle prérempli : les matériaux BTM (avec les valeurs actuelles du fournisseur) puis ses articles,
 * ou deux exemples s'il n'en a pas. Séparateur « ; » et BOM UTF-8 : Excel français l'ouvre directement.
 */
export function genererModele(materiauxBtm, catalogue = {}, articles = []) {
  const lignes = [COLONNES]
  for (const m of materiauxBtm) {
    const c = catalogue[m.id]
    lignes.push([m.id, m.libelle, m.unite, nombre(c?.prix_unitaire), nombre(c?.stock), c && !c.vendu ? 'non' : 'oui', c?.rupture ? 'oui' : 'non'])
  }
  const exemples = articles.length ? articles : [
    { libelle: 'Brouette 100 L', unite: 'u', prix_unitaire: 45, stock: 10, vendu: true, rupture: false },
    { libelle: 'Peinture façade blanche 15 L', unite: 'u', prix_unitaire: 68, stock: null, vendu: true, rupture: false }
  ]
  for (const a of exemples) lignes.push(['', a.libelle, a.unite, nombre(a.prix_unitaire), nombre(a.stock), a.vendu === false ? 'non' : 'oui', a.rupture ? 'oui' : 'non'])
  return '﻿' + lignes.map((l) => l.map(cellule).join(';')).join('\r\n') + '\r\n'
}

export function telecharger(contenu, nomFichier) {
  const url = URL.createObjectURL(new Blob([contenu], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: nomFichier })
  document.body.append(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---------- Lecture ----------
/** Découpe un texte CSV en lignes de cellules (guillemets, retours à la ligne dans une cellule) */
export function decouperCsv(texte) {
  texte = texte.replace(/^﻿/, '')
  const premiere = texte.split(/\r?\n/, 1)[0]
  const compte = (c) => premiere.split(c).length - 1
  const sep = ['\t', ';', ','].reduce((a, b) => (compte(b) > compte(a) ? b : a))
  const lignes = []
  let ligne = [], cell = '', guillemets = false
  for (let i = 0; i < texte.length; i++) {
    const ch = texte[i]
    if (guillemets) {
      if (ch === '"' && texte[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') guillemets = false
      else cell += ch
    } else if (ch === '"' && cell === '') guillemets = true
    else if (ch === sep) { ligne.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texte[i + 1] === '\n') i++
      ligne.push(cell); lignes.push(ligne); ligne = []; cell = ''
    } else cell += ch
  }
  if (cell !== '' || ligne.length) { ligne.push(cell); lignes.push(ligne) }
  return lignes.filter((l) => l.some((c) => c.trim() !== ''))
}

/** « 12,50 € », « 1 250 », « 12.5 » → nombre ; vide → null ; illisible ou négatif → NaN */
export function lireNombre(t) {
  const s = String(t ?? '').replace(/[\s  €]/g, '').replace(',', '.')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : NaN
}
const OUI = ['oui', 'o', 'yes', 'y', 'x', '1', 'vrai', 'true']
const NON = ['non', 'n', 'no', '0', 'faux', 'false']
const lireBooleen = (t, defaut) => { const k = cle(t); return !k ? defaut : OUI.includes(k) ? true : NON.includes(k) ? false : undefined }

// ---------- Carreaux (vendeur de carrelage) ----------
const FORMAT = /(\d{2}(?:[.,]\d)?)\s*[x×]\s*\d{2}(?:[.,]\d)?/i
/** Une désignation avec un format (« 60x60 », « 60.5x60.5 ») est un carreau */
export const estCarreau = (designation) => FORMAT.test(designation)
/**
 * « ARMANI GREY CAR 60x60 CARTONS DE 4 PIECES… » → { nom: 'ARMANI GREY', format: '60x60', pieces: 4 }.
 * Format : le plus proche des formats proposés, à 1 cm près (60,5 → 60x60), sinon null.
 * Pièces : par carton (le prix d'un export de caisse est celui du carton), 1 si rien n'est indiqué.
 */
export function lireCarreau(designation, formats) {
  const cote = Number(designation.match(FORMAT)[1].replace(',', '.'))
  const format = formats.find((f) => Math.abs(parseFloat(f) - cote) <= 1) || null
  const pieces = Number(designation.match(/(\d+)\s*(?:pi[eè]ces?|pcs)\b/i)?.[1]) || 1
  let nom = designation.split(/\b(?:car|carrelage|carreaux?)\b|\d{2}(?:[.,]\d)?\s*[x×]/i)[0].replace(/[\s:–-]+$/, '').trim()
  if (nom.length < 2) nom = designation
  return { nom: nom.slice(0, 60).trim(), format, cote, pieces }
}

/**
 * Analyse un fichier rempli.
 * @param {string} texte contenu du fichier
 * @param {Array} materiauxBtm [{ id, libelle, unite }]
 * @param {Array} articles articles existants du fournisseur [{ id, libelle, ... }]
 * @param {{ existants: Array, formats: string[] } | null} carreaux vendeur de carrelage : ses modèles et les
 *   formats proposés ; ses lignes de carreaux deviennent des modèles (onglet Carreaux), pas des articles
 * @returns {{ materiaux, nouveaux, modifies, carreauxNouveaux, carreauxModifies, erreurs: Array<{ ligne, message }> }}
 */
export function analyserCatalogue(texte, materiauxBtm, articles = [], carreaux = null) {
  const lignes = decouperCsv(texte)
  const resultat = { materiaux: [], nouveaux: [], modifies: [], carreauxNouveaux: [], carreauxModifies: [], erreurs: [] }
  if (lignes.length < 2) { resultat.erreurs.push({ ligne: 1, message: 'Le fichier est vide ou ne contient que les en-têtes.' }); return resultat }

  const index = {}
  lignes[0].forEach((e, i) => { const c = colonneDe(e); if (c && index[c] === undefined) index[c] = i })
  if (index.designation === undefined && index.code_btm === undefined) {
    resultat.erreurs.push({ ligne: 1, message: 'Colonnes introuvables : la première ligne doit contenir les en-têtes du modèle (code_btm, designation, prix…).' })
    return resultat
  }
  if (index.prix === undefined) { resultat.erreurs.push({ ligne: 1, message: 'Colonne « prix » introuvable.' }); return resultat }

  const parId = Object.fromEntries(materiauxBtm.map((m) => [m.id, m]))
  const parCodeLibelle = Object.fromEntries(materiauxBtm.map((m) => [cle(m.libelle), m]))
  const existants = Object.fromEntries(articles.map((a) => [cle(a.libelle), a]))
  const carreauxExistants = Object.fromEntries((carreaux?.existants || []).map((c) => [cle(c.nom), c]))
  const vus = new Set()

  lignes.slice(1).forEach((cells, i) => {
    const n = i + 2 // numéro de ligne dans le fichier (en-têtes = 1)
    const val = (c) => (index[c] === undefined ? '' : String(cells[index[c]] ?? '').trim())
    const erreur = (message) => resultat.erreurs.push({ ligne: n, message })

    const prix = lireNombre(val('prix'))
    // stock négatif (export Odoo : ventes non encore réapprovisionnées) → 0
    const stockNegatif = val('stock').startsWith('-')
    const stock = stockNegatif ? lireNombre(val('stock').slice(1)) && 0 : lireNombre(val('stock'))
    const vendu = lireBooleen(val('en_vente'), true)
    const rupture = lireBooleen(val('rupture'), false)
    // 80 caractères au plus en base : un nom plus long (export de logiciel de caisse) est coupé
    const designation = val('designation').slice(0, 80).trim()
    if (Number.isNaN(prix)) return erreur(`prix illisible : « ${val('prix')} ».`)
    if (Number.isNaN(stock)) return erreur(`stock illisible : « ${val('stock')} ».`)
    if (vendu === undefined) return erreur(`en_vente doit valoir « oui » ou « non » (lu : « ${val('en_vente')} »).`)
    if (rupture === undefined) return erreur(`rupture doit valoir « oui » ou « non » (lu : « ${val('rupture')} »).`)

    // Matériau BTM : par son code, ou par son libellé exact
    const code = val('code_btm')
    const materiau = code ? parId[code] || parId[cle(code)] : parCodeLibelle[cle(designation)]
    if (code && !materiau) return erreur(`code_btm inconnu : « ${code} ». Laissez la colonne vide pour un article à vous.`)
    if (materiau) {
      if (vus.has(materiau.id)) return erreur(`« ${materiau.libelle} » apparaît deux fois.`)
      vus.add(materiau.id)
      resultat.materiaux.push({ materiau_id: materiau.id, libelle: materiau.libelle, unite: materiau.unite, vendu, rupture, prix_unitaire: prix, prix_comptoir: null, stock })
      return
    }

    // Carreau : un modèle de l'onglet Carreaux, au carreau ou au carton selon la désignation
    if (carreaux && estCarreau(val('designation'))) {
      const c = lireCarreau(val('designation'), carreaux.formats)
      if (!c.format) return erreur(`format de carreau non proposé (${c.cote} cm) : « ${c.nom} ». Formats possibles : ${carreaux.formats.join(', ')}.`)
      if (!prix) return erreur(`prix manquant pour « ${c.nom} ».`)
      const k = `carreau:${cle(c.nom)}`
      if (vus.has(k)) return erreur(`« ${c.nom} » apparaît deux fois.`)
      vus.add(k)
      // carton de plusieurs pièces : le modèle est vendu au carton, au prix du fichier
      const modele = { nom: c.nom, format: c.format, prix_unitaire: prix, carreaux_par_carton: c.pieces > 1 ? c.pieces : null, prix_comptoir: null, stock, rupture, actif: vendu, pieces: c.pieces }
      const existant = carreauxExistants[cle(c.nom)]
      if (existant) resultat.carreauxModifies.push({ ...existant, ...modele })
      else resultat.carreauxNouveaux.push({ ...modele, finition: '', couleur: '#e9e5de', photo_url: '' })
      return
    }

    // Article du fournisseur
    if (designation.length < 2) return erreur('designation manquante.')
    const unite = val('unite') || 'u'
    if (unite.length > 12) return erreur(`unite trop longue (12 caractères au plus) : « ${unite} ».`)
    if (prix === null) return erreur(`prix manquant pour « ${designation} ».`)
    const k = cle(designation)
    if (vus.has(k)) return erreur(`« ${designation} » apparaît deux fois.`)
    vus.add(k)
    const article = { libelle: designation, unite, prix_unitaire: prix, prix_comptoir: null, stock, vendu, rupture }
    if (existants[k]) resultat.modifies.push({ ...article, id: existants[k].id })
    else resultat.nouveaux.push(article)
  })
  return resultat
}

/**
 * HTML des e-mails écrits dans l'admin : nettoyage par liste blanche (balises, styles, liens sûrs)
 * et conversion d'un texte brut (signature, message cité) en HTML pour l'éditeur riche.
 */
const BALISES = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'SPAN', 'FONT', 'A', 'BR', 'P', 'DIV', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'HR', 'H1', 'H2', 'H3', 'SUB', 'SUP'])
const IGNOREES = new Set(['SCRIPT', 'STYLE', 'HEAD', 'TITLE', 'META', 'LINK', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE'])
const STYLES = ['color', 'background-color', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'text-align']
/** <font size="1…7"> (taille de l'éditeur) → taille en pixels */
export const TAILLES_FONT = { 1: '10px', 2: '13px', 3: '15px', 4: '18px', 5: '22px', 6: '28px', 7: '36px' }
export const urlSure = (u) => /^(https?:|mailto:|tel:)/i.test(String(u || '').trim())

function nettoyerNoeud(n, doc) {
  if (n.nodeType === Node.TEXT_NODE) return doc.createTextNode(n.textContent)
  if (n.nodeType !== Node.ELEMENT_NODE || IGNOREES.has(n.tagName)) return null
  const contenu = () => {
    const f = doc.createDocumentFragment()
    for (const c of n.childNodes) { const r = nettoyerNoeud(c, doc); if (r) f.appendChild(r) }
    return f
  }
  if (!BALISES.has(n.tagName)) return contenu() // balise inconnue : on garde son contenu

  const tag = n.tagName === 'FONT' ? 'SPAN' : n.tagName
  if (tag === 'A' && !urlSure(n.getAttribute('href'))) return contenu()
  const el = doc.createElement(tag)
  const styles = []
  for (const p of STYLES) {
    const v = n.style?.getPropertyValue(p)
    if (!v || /url\(|expression|javascript/i.test(v)) continue
    // tailles relatives (rem, em, %) héritées de la page au collage : sans sens dans un e-mail
    if (p === 'font-size' && !/^(\d+(\.\d+)?(px|pt)|(xx?-)?(small|large)|medium)$/i.test(v.trim())) continue
    styles.push(`${p}:${v}`)
  }
  if (n.tagName === 'FONT') {
    const couleur = n.getAttribute('color')
    if (couleur && /^#?[\w]+$/.test(couleur)) styles.push(`color:${couleur}`)
    if (TAILLES_FONT[n.getAttribute('size')]) styles.push(`font-size:${TAILLES_FONT[n.getAttribute('size')]}`)
  }
  if (tag === 'SPAN' && !styles.length) return contenu() // <span> sans mise en forme : inutile
  if (styles.length) el.setAttribute('style', styles.join(';'))
  if (tag === 'A') el.setAttribute('href', n.getAttribute('href').trim())
  el.appendChild(contenu())
  return el
}

/** Ne garde que la mise en forme utile à un e-mail (pas de script, d'image distante, d'attribut on…) */
export function nettoyerHtml(html = '') {
  const source = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const doc = document.implementation.createHTMLDocument('')
  const conteneur = doc.createElement('div')
  for (const c of source.body.childNodes) { const r = nettoyerNoeud(c, doc); if (r) conteneur.appendChild(r) }
  return conteneur.innerHTML
}

const echapper = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Texte brut → HTML : les lignes « > … » deviennent une citation, les adresses web des liens */
export function texteVersHtml(texte = '') {
  const lier = (l) => echapper(l).replace(/\b(https?:\/\/[^\s<]+|www\.[^\s<]+)/g, (u) => `<a href="${u.startsWith('www.') ? `https://${u}` : u}">${u}</a>`)
  const blocs = []
  for (const ligne of String(texte).split('\n')) {
    const cite = /^>\s?/.test(ligne)
    const contenu = cite ? ligne.replace(/^>\s?/, '') : ligne
    const dernier = blocs[blocs.length - 1]
    if (dernier && dernier.cite === cite) dernier.lignes.push(contenu)
    else blocs.push({ cite, lignes: [contenu] })
  }
  return blocs.map((b) => {
    const corps = b.lignes.map((l) => `<div>${lier(l) || '<br>'}</div>`).join('')
    return b.cite ? `<blockquote>${corps}</blockquote>` : corps
  }).join('')
}

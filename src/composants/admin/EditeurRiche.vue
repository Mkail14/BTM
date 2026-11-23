<script setup>
/**
 * Éditeur de texte riche pour les e-mails : gras, italique, souligné, barré, couleur, surlignage, taille,
 * listes, alignement, citation, liens, séparateur, annuler / rétablir, effacer la mise en forme.
 * Le contenu est nettoyé (liste blanche de balises et de styles) au collage et à la sortie : `lireHtml()`
 * renvoie un HTML prêt pour un e-mail (styles en ligne), `lireTexte()` sa version texte.
 */
import { nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { nettoyerHtml, TAILLES_FONT } from '@/services/htmlMessage.js'

const props = defineProps({
  html: { type: String, default: '' }, // contenu de départ (déjà nettoyé ou issu de texteVersHtml)
  placeholder: { type: String, default: 'Votre message…' }
})
const emit = defineEmits(['saisie'])

const zone = ref(null)
const actifs = reactive({})
const palette = ref(null) // 'couleur' | 'surligner' | 'taille' | null
const lien = reactive({ ouvert: false, url: '', texte: '', existant: null })
const champUrl = ref(null)
let selectionSauvee = null

const COULEURS = ['#0f172a', '#475569', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#1f1f1f', '#2563eb', '#7c3aed', '#db2777']
const SURLIGNAGES = ['#fef08a', '#bbf7d0', '#e3d6c4', '#bfdbfe', '#fbcfe8', '#fed7aa']
const TAILLES = [{ label: 'Petit', valeur: '2' }, { label: 'Normal', valeur: '3' }, { label: 'Grand', valeur: '5' }, { label: 'Très grand', valeur: '6' }]

// ---------- Commandes ----------
function commande(nom, valeur = null) {
  zone.value?.focus()
  document.execCommand('styleWithCSS', false, nom === 'fontSize' ? false : true)
  document.execCommand(nom, false, valeur)
  palette.value = null
  majEtat()
  emit('saisie')
}

function majEtat() {
  for (const c of ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList', 'justifyLeft', 'justifyCenter', 'justifyRight']) {
    try { actifs[c] = document.queryCommandState(c) } catch { actifs[c] = false }
  }
  const sel = window.getSelection()
  const noeud = sel?.anchorNode
  actifs.lien = !!(noeud && zone.value?.contains(noeud) && (noeud.nodeType === 1 ? noeud : noeud.parentElement)?.closest('a'))
  actifs.citation = !!(noeud && zone.value?.contains(noeud) && (noeud.nodeType === 1 ? noeud : noeud.parentElement)?.closest('blockquote'))
}
function surSelection() {
  const sel = window.getSelection()
  if (sel?.anchorNode && zone.value?.contains(sel.anchorNode)) majEtat()
}

const citation = () => commande('formatBlock', actifs.citation ? 'div' : 'blockquote')

// ---------- Liens ----------
function sauverSelection() {
  const sel = window.getSelection()
  selectionSauvee = sel?.rangeCount && zone.value?.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null
}
function restaurerSelection() {
  zone.value?.focus()
  if (!selectionSauvee) return
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(selectionSauvee)
}
async function ouvrirLien() {
  sauverSelection()
  const noeud = selectionSauvee?.commonAncestorContainer
  const a = noeud && (noeud.nodeType === 1 ? noeud : noeud.parentElement)?.closest('a')
  lien.existant = a && zone.value.contains(a) ? a : null
  lien.url = lien.existant?.getAttribute('href') || ''
  lien.texte = lien.existant ? lien.existant.textContent : (selectionSauvee?.toString() || '')
  lien.ouvert = true
  palette.value = null
  await nextTick()
  champUrl.value?.focus()
}
function normaliserUrl(u) {
  const t = u.trim()
  if (!t) return ''
  if (/^(https?:|mailto:|tel:)/i.test(t)) return t
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return `mailto:${t}`
  return `https://${t.replace(/^\/+/, '')}`
}
function appliquerLien() {
  const url = normaliserUrl(lien.url)
  if (!url) return
  const texte = lien.texte.trim() || lien.url.trim()
  if (lien.existant) {
    lien.existant.setAttribute('href', url)
    if (lien.existant.textContent !== texte) lien.existant.textContent = texte
  } else {
    restaurerSelection()
    const sel = window.getSelection()
    if (sel.rangeCount && !sel.isCollapsed && sel.toString() === texte) {
      document.execCommand('createLink', false, url)
    } else {
      const a = document.createElement('a')
      a.href = url
      a.textContent = texte
      document.execCommand('insertHTML', false, a.outerHTML + '&nbsp;')
    }
  }
  fermerLien()
  emit('saisie')
}
function retirerLien() {
  if (lien.existant) {
    const parent = lien.existant.parentNode
    while (lien.existant.firstChild) parent.insertBefore(lien.existant.firstChild, lien.existant)
    parent.removeChild(lien.existant)
  }
  fermerLien()
  emit('saisie')
}
function fermerLien() {
  lien.ouvert = false
  lien.existant = null
  restaurerSelection()
  majEtat()
}

// ---------- Saisie ----------
function coller(e) {
  e.preventDefault()
  const html = e.clipboardData.getData('text/html')
  if (html) document.execCommand('insertHTML', false, nettoyerHtml(html))
  else document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
  emit('saisie')
}
function raccourcis(e) {
  if (!(e.ctrlKey || e.metaKey)) return
  const k = e.key.toLowerCase()
  if (k === 'k') { e.preventDefault(); ouvrirLien() }
  else if (k === 'b') { e.preventDefault(); commande('bold') }
  else if (k === 'i') { e.preventDefault(); commande('italic') }
  else if (k === 'u') { e.preventDefault(); commande('underline') }
}
function cliquerZone(e) {
  // Ctrl + clic sur un lien : l'ouvrir ; clic simple sur un lien : proposer de le modifier
  const a = e.target.closest?.('a')
  if (!a) return
  if (e.ctrlKey || e.metaKey) { window.open(a.href, '_blank', 'noopener'); return }
  const r = document.createRange()
  r.selectNodeContents(a)
  const sel = window.getSelection()
  sel.removeAllRanges(); sel.addRange(r)
  ouvrirLien()
}

// ---------- Sortie ----------
/** HTML prêt pour un e-mail : nettoyé, styles en ligne sur les citations, liens et séparateurs */
function lireHtml() {
  const html = nettoyerHtml(zone.value?.innerHTML || '')
  const d = document.createElement('div')
  d.innerHTML = html
  d.querySelectorAll('blockquote').forEach((b) => b.setAttribute('style', `${b.getAttribute('style') || ''};margin:0 0 0 4px;padding:2px 0 2px 12px;border-left:3px solid #cbd5e1;color:#475569`.replace(/^;/, '')))
  d.querySelectorAll('a').forEach((a) => { if (!/color/.test(a.getAttribute('style') || '')) a.setAttribute('style', `${a.getAttribute('style') || ''};color:#1f1f1f`.replace(/^;/, '')) })
  d.querySelectorAll('hr').forEach((h) => h.setAttribute('style', 'border:0;border-top:1px solid #e2e8f0;margin:16px 0'))
  d.querySelectorAll('ul, ol').forEach((l) => l.setAttribute('style', `${l.getAttribute('style') || ''};margin:0 0 0 4px;padding-left:22px;list-style-type:${l.tagName === 'UL' ? 'disc' : 'decimal'}`.replace(/^;/, '')))
  return d.innerHTML
}
/** Version texte (alternative des e-mails) : les liens gardent leur adresse entre parenthèses */
function lireTexte() {
  const d = document.createElement('div')
  d.innerHTML = nettoyerHtml(zone.value?.innerHTML || '')
  // l'adresse n'est ajoutée que si le texte du lien ne la montre pas déjà
  const sansProtocole = (u) => u.replace(/^(https?:\/\/|mailto:|tel:)/i, '').replace(/\/$/, '').toLowerCase()
  d.querySelectorAll('a').forEach((a) => { const href = a.getAttribute('href'); if (sansProtocole(href) !== sansProtocole(a.textContent.trim())) a.append(` (${href.replace(/^mailto:/i, '')})`) })
  d.querySelectorAll('li').forEach((li) => li.prepend('• '))
  d.style.cssText = 'position:fixed;left:-9999px;white-space:pre-wrap'
  document.body.appendChild(d) // innerText ne rend les retours à la ligne que sur un élément affiché
  d.querySelectorAll('blockquote').forEach((b) => { b.textContent = b.innerText.trim().split('\n').map((l) => `> ${l}`).join('\n') })
  const t = d.innerText
  d.remove()
  return t.replace(/\n{3,}/g, '\n\n').trim()
}
const estVide = () => !(zone.value?.innerText || '').trim()
function focusDebut() {
  zone.value?.focus()
  const r = document.createRange()
  r.setStart(zone.value, 0); r.collapse(true)
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r)
}
defineExpose({ lireHtml, lireTexte, estVide, focusDebut })

onMounted(() => {
  zone.value.innerHTML = nettoyerHtml(props.html)
  document.execCommand('defaultParagraphSeparator', false, 'div')
  document.addEventListener('selectionchange', surSelection)
})
onBeforeUnmount(() => document.removeEventListener('selectionchange', surSelection))
</script>

<template>
  <div class="er">
    <div class="er-outils" role="toolbar" aria-label="Mise en forme" @mousedown="($event.target.closest('button') && $event.preventDefault())">
      <div class="er-groupe">
        <button type="button" title="Annuler (Ctrl+Z)" aria-label="Annuler" @click="commande('undo')"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i></button>
        <button type="button" title="Rétablir (Ctrl+Y)" aria-label="Rétablir" @click="commande('redo')"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i></button>
      </div>
      <div class="er-groupe er-menu">
        <button type="button" class="er-taille" title="Taille du texte" aria-label="Taille du texte" :aria-expanded="palette === 'taille'" @click="palette = palette === 'taille' ? null : 'taille'">
          <i class="fa-solid fa-text-height" aria-hidden="true"></i><i class="fa-solid fa-caret-down er-caret" aria-hidden="true"></i>
        </button>
        <div v-if="palette === 'taille'" class="er-pop er-pop-liste">
          <button v-for="t in TAILLES" :key="t.valeur" type="button" :style="{ fontSize: TAILLES_FONT[t.valeur] }" @click="commande('fontSize', t.valeur)">{{ t.label }}</button>
        </div>
      </div>
      <div class="er-groupe">
        <button type="button" title="Gras (Ctrl+B)" aria-label="Gras" :aria-pressed="!!actifs.bold" @click="commande('bold')"><i class="fa-solid fa-bold" aria-hidden="true"></i></button>
        <button type="button" title="Italique (Ctrl+I)" aria-label="Italique" :aria-pressed="!!actifs.italic" @click="commande('italic')"><i class="fa-solid fa-italic" aria-hidden="true"></i></button>
        <button type="button" title="Souligné (Ctrl+U)" aria-label="Souligné" :aria-pressed="!!actifs.underline" @click="commande('underline')"><i class="fa-solid fa-underline" aria-hidden="true"></i></button>
        <button type="button" title="Barré" aria-label="Barré" :aria-pressed="!!actifs.strikeThrough" @click="commande('strikeThrough')"><i class="fa-solid fa-strikethrough" aria-hidden="true"></i></button>
      </div>
      <div class="er-groupe">
        <div class="er-menu">
          <button type="button" title="Couleur du texte" aria-label="Couleur du texte" :aria-expanded="palette === 'couleur'" @click="palette = palette === 'couleur' ? null : 'couleur'">
            <span class="er-a">A</span><i class="fa-solid fa-caret-down er-caret" aria-hidden="true"></i>
          </button>
          <div v-if="palette === 'couleur'" class="er-pop er-pop-couleurs">
            <button v-for="c in COULEURS" :key="c" type="button" class="er-pastille" :style="{ background: c }" :aria-label="`Couleur ${c}`" @click="commande('foreColor', c)"></button>
          </div>
        </div>
        <div class="er-menu">
          <button type="button" title="Surligner" aria-label="Surligner" :aria-expanded="palette === 'surligner'" @click="palette = palette === 'surligner' ? null : 'surligner'">
            <i class="fa-solid fa-highlighter" aria-hidden="true"></i><i class="fa-solid fa-caret-down er-caret" aria-hidden="true"></i>
          </button>
          <div v-if="palette === 'surligner'" class="er-pop er-pop-couleurs">
            <button v-for="c in SURLIGNAGES" :key="c" type="button" class="er-pastille" :style="{ background: c }" :aria-label="`Surligner en ${c}`" @click="commande('hiliteColor', c)"></button>
            <button type="button" class="er-pastille er-aucun" aria-label="Retirer le surlignage" title="Retirer le surlignage" @click="commande('hiliteColor', 'transparent')"><i class="fa-solid fa-ban" aria-hidden="true"></i></button>
          </div>
        </div>
      </div>
      <div class="er-groupe">
        <button type="button" title="Liste à puces" aria-label="Liste à puces" :aria-pressed="!!actifs.insertUnorderedList" @click="commande('insertUnorderedList')"><i class="fa-solid fa-list-ul" aria-hidden="true"></i></button>
        <button type="button" title="Liste numérotée" aria-label="Liste numérotée" :aria-pressed="!!actifs.insertOrderedList" @click="commande('insertOrderedList')"><i class="fa-solid fa-list-ol" aria-hidden="true"></i></button>
        <button type="button" title="Aligner à gauche" aria-label="Aligner à gauche" :aria-pressed="!!actifs.justifyLeft" @click="commande('justifyLeft')"><i class="fa-solid fa-align-left" aria-hidden="true"></i></button>
        <button type="button" title="Centrer" aria-label="Centrer" :aria-pressed="!!actifs.justifyCenter" @click="commande('justifyCenter')"><i class="fa-solid fa-align-center" aria-hidden="true"></i></button>
        <button type="button" title="Aligner à droite" aria-label="Aligner à droite" :aria-pressed="!!actifs.justifyRight" @click="commande('justifyRight')"><i class="fa-solid fa-align-right" aria-hidden="true"></i></button>
      </div>
      <div class="er-groupe">
        <button type="button" title="Insérer un lien (Ctrl+K)" aria-label="Insérer un lien" :aria-pressed="!!actifs.lien" @click="ouvrirLien"><i class="fa-solid fa-link" aria-hidden="true"></i></button>
        <button type="button" title="Citation" aria-label="Citation" :aria-pressed="!!actifs.citation" @click="citation"><i class="fa-solid fa-quote-right" aria-hidden="true"></i></button>
        <button type="button" title="Ligne de séparation" aria-label="Ligne de séparation" @click="commande('insertHorizontalRule')"><i class="fa-solid fa-minus" aria-hidden="true"></i></button>
        <button type="button" title="Effacer la mise en forme" aria-label="Effacer la mise en forme" @click="commande('removeFormat')"><i class="fa-solid fa-text-slash" aria-hidden="true"></i></button>
      </div>
    </div>

    <form v-if="lien.ouvert" class="er-lien" @submit.prevent="appliquerLien" @keydown.esc.stop.prevent="fermerLien">
      <label><span>Texte</span><input v-model="lien.texte" type="text" placeholder="Texte affiché" /></label>
      <label><span>Lien</span><input ref="champUrl" v-model="lien.url" type="text" inputmode="url" placeholder="https://www.btm.yt ou adresse e-mail" /></label>
      <div class="er-lien-actions">
        <button type="submit" class="adm-btn adm-btn-noir" :disabled="!lien.url.trim()">{{ lien.existant ? 'Modifier' : 'Insérer' }}</button>
        <button v-if="lien.existant" type="button" class="adm-btn adm-btn-clair" @click="retirerLien"><i class="fa-solid fa-link-slash" aria-hidden="true"></i> Retirer le lien</button>
        <button type="button" class="adm-btn adm-btn-fantome" @click="fermerLien">Annuler</button>
      </div>
    </form>

    <div
      ref="zone" class="er-zone" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Message"
      :data-placeholder="placeholder" spellcheck="true"
      @input="emit('saisie')" @mousedown="palette = null" @paste="coller" @keydown="raccourcis" @click="cliquerZone" @keyup="majEtat" @mouseup="majEtat"
    ></div>
  </div>
</template>

<style scoped>
.er { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.er-outils { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 6px 16px; border-bottom: 1px solid var(--adm-ligne-2); background: var(--adm-survol); }
.er-groupe { display: flex; align-items: center; gap: 2px; padding-right: 6px; margin-right: 2px; border-right: 1px solid var(--adm-ligne); }
.er-groupe:last-child { border-right: 0; }
.er-outils button { display: inline-flex; align-items: center; justify-content: center; gap: 3px; min-width: 32px; height: 32px; padding: 0 6px; border: 0; border-radius: 8px; background: transparent; color: var(--adm-encre-2); font: inherit; font-size: .88rem; cursor: pointer; }
.er-outils button:hover { background: var(--adm-ligne-2); color: var(--adm-encre); }
.er-outils button[aria-pressed="true"], .er-outils button[aria-expanded="true"] { background: var(--adm-noir); color: var(--adm-sur-noir); }
.er-caret { font-size: .65rem; opacity: .7; }
.er-a { font-weight: 700; text-decoration: underline; text-decoration-color: #dc2626; text-decoration-thickness: 3px; }
.er-menu { position: relative; display: inline-flex; }
.er-pop { position: absolute; top: calc(100% + 6px); left: 0; z-index: 5; padding: 8px; border: 1px solid var(--adm-ligne); border-radius: 12px; background: var(--adm-carte, #fff); box-shadow: 0 10px 30px rgba(15, 23, 42, .15); }
.er-pop-couleurs { display: grid; grid-template-columns: repeat(5, 26px); gap: 6px; }
.er-outils .er-pastille { min-width: 26px; width: 26px; height: 26px; padding: 0; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .12); }
.er-outils .er-pastille:hover { transform: scale(1.12); background-clip: padding-box; }
.er-outils .er-aucun { background: #fff; color: var(--adm-muet); font-size: .75rem; }
.er-pop-liste { display: flex; flex-direction: column; min-width: 140px; }
.er-pop-liste button { justify-content: flex-start; height: auto; min-height: 34px; padding: 4px 10px; }
.er-lien { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; padding: 10px 22px; border-bottom: 1px solid var(--adm-ligne-2); background: var(--adm-survol); }
.er-lien label { display: flex; align-items: center; gap: 8px; flex: 1 1 220px; }
.er-lien label span { color: var(--adm-muet); font-size: .84rem; }
.er-lien input { flex: 1; min-width: 0; min-height: 36px; padding: 0 10px; border: 1px solid var(--adm-ligne); border-radius: 8px; background: #fff; font: inherit; font-size: .9rem; }
.er-lien-actions { display: flex; gap: 8px; }
.er-zone { flex: 1; min-height: 260px; padding: 16px 22px; overflow-y: auto; outline: 0; color: var(--adm-encre); font-size: .95rem; line-height: 1.6; word-wrap: break-word; }
.er-zone:empty::before { content: attr(data-placeholder); color: var(--adm-muet); pointer-events: none; }
.er-zone :deep(a) { color: #1f1f1f; text-decoration: underline; cursor: pointer; }
.er-zone :deep(blockquote) { margin: 4px 0 4px 4px; padding: 2px 0 2px 12px; border-left: 3px solid #cbd5e1; color: #475569; }
.er-zone :deep(ul), .er-zone :deep(ol) { margin: 4px 0; padding-left: 24px; }
.er-zone :deep(ul) { list-style: disc; }
.er-zone :deep(ol) { list-style: decimal; }
.er-zone :deep(hr) { border: 0; border-top: 1px solid var(--adm-ligne); margin: 14px 0; }
@media (max-width: 640px) { .er-outils { padding: 6px 10px; overflow-x: auto; flex-wrap: nowrap; } .er-groupe { flex: none; } }
</style>

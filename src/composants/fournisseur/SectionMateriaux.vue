<script setup>
/**
 * Matériaux — ce que vend le fournisseur :
 *  - Matériaux BTM : pour chaque matériau des devis, s'il le vend, SON prix (sinon le prix de référence BTM),
 *    son stock (vide = non suivi) et la rupture de stock (le matériau n'est alors plus vendu en caisse) ;
 *  - Mes articles : ses propres produits (brouette, outillage…), vendus en caisse en plus du devis.
 * À l'encaissement, ces prix s'appliquent et les stocks sont décomptés (encaisser_devis, migrations 0014 et 0016).
 * Tout le catalogue peut aussi être rempli d'un coup : modèle CSV à télécharger, puis import du fichier rempli.
 */
import { computed, ref, watch } from 'vue'
import { useAdmin } from '@/composables/useAdmin.js'
import { useEspaceFournisseur } from '@/composables/useEspaceFournisseur.js'
import { useAuth } from '@/composables/useAuth.js'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'
import * as api from '@/services/supabase/serviceEspaceFournisseur.js'
import { analyserCatalogue, genererModele, telecharger } from '@/services/catalogueCsv.js'
import AdminPanneau from '@/composants/admin/AdminPanneau.vue'

const props = defineProps({ recherche: { type: String, default: '' } })
const { notifier, confirmer } = useAdmin()
const { fournisseurLie } = useAuth()
const { fiche, materiauxBtm, catalogue, articles, rechargerCatalogue } = useEspaceFournisseur()

const onglet = ref('btm')
const nombre = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','))
const lire = (t) => { const s = String(t ?? '').replace(/\s/g, '').replace(',', '.'); if (!s) return null; const n = Number(s); return Number.isFinite(n) && n >= 0 ? n : NaN }
const normaliser = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const correspond = (libelle) => { const q = normaliser(props.recherche.trim()); return !q || normaliser(libelle).includes(q) }

// ================= Matériaux BTM : brouillon éditable, une ligne par matériau =================
const brouillon = ref([])
function preparer() {
  brouillon.value = materiauxBtm.value.map((m) => {
    const c = catalogue.value[m.id]
    return { ...m, vendu: c ? c.vendu : true, rupture: !!c?.rupture, prix: nombre(c?.prix_unitaire), comptoir: nombre(c?.prix_comptoir), stock: nombre(c?.stock) }
  })
}
watch([materiauxBtm, catalogue], preparer, { immediate: true })

const origine = (l) => { const c = catalogue.value[l.id]; return { vendu: c ? c.vendu : true, rupture: !!c?.rupture, prix: nombre(c?.prix_unitaire), comptoir: nombre(c?.prix_comptoir), stock: nombre(c?.stock) } }
const modifiees = computed(() => brouillon.value.filter((l) => { const o = origine(l); return o.vendu !== l.vendu || o.rupture !== l.rupture || o.prix !== l.prix.trim() || o.comptoir !== l.comptoir.trim() || o.stock !== l.stock.trim() }))
const invalides = computed(() => brouillon.value.filter((l) => Number.isNaN(lire(l.prix)) || Number.isNaN(lire(l.comptoir)) || Number.isNaN(lire(l.stock))))
const liste = computed(() => brouillon.value.filter((l) => correspond(l.libelle)))
const enRupture = (l) => l.vendu && (l.rupture || lire(l.stock) === 0)
const stats = computed(() => ({
  vendus: brouillon.value.filter((l) => l.vendu).length,
  rupture: brouillon.value.filter(enRupture).length + articles.value.filter((a) => a.vendu && (a.rupture || a.stock === 0)).length,
  articles: articles.value.length
}))
// Économie affichée au client : prix comptoir − prix BTM
const economie = (l) => { const p = lire(l.prix) ?? l.prix_unitaire, c = lire(l.comptoir); return c && !Number.isNaN(c) && !Number.isNaN(p) && c > p ? Math.round(((c - p) / c) * 100) : null }

const enregistrement = ref(false)
async function enregistrer() {
  if (invalides.value.length) { notifier(`Valeur invalide pour : ${invalides.value.map((l) => l.libelle).join(', ')}.`, 'erreur'); return }
  enregistrement.value = true
  try {
    await api.enregistrerCatalogue(fournisseurLie.value, modifiees.value.map((l) => ({ materiau_id: l.id, vendu: l.vendu, rupture: l.rupture, prix_unitaire: lire(l.prix), prix_comptoir: lire(l.comptoir), stock: lire(l.stock) })))
    await rechargerCatalogue()
    notifier('Catalogue enregistré : vos prix, stocks et ruptures s’appliquent aux prochains encaissements.')
  } catch (e) {
    notifier(e?.message || 'Enregistrement impossible.', 'erreur')
  } finally {
    enregistrement.value = false
  }
}

// ================= Mes articles =================
const articlesFiltres = computed(() => articles.value.filter((a) => correspond(a.libelle)))
const UNITES = ['u', 'sac', 'kg', 't', 'm', 'm²', 'm³', 'L', 'rouleau', 'lot']
const formulaire = ref(null)
const erreurForm = ref('')
const envoi = ref(false)
function ouvrirArticle(a = null) {
  erreurForm.value = ''
  formulaire.value = a
    ? { ...a, prix: nombre(a.prix_unitaire), comptoir: nombre(a.prix_comptoir), stockTexte: nombre(a.stock) }
    : { id: null, libelle: '', unite: 'u', prix: '', comptoir: '', stockTexte: '', rupture: false, vendu: true }
}
async function enregistrerArticle() {
  const f = formulaire.value
  const prix = lire(f.prix)
  const stock = lire(f.stockTexte)
  erreurForm.value = f.libelle.trim().length < 2 ? 'Donnez un nom à l’article.'
    : !f.unite.trim() ? 'Indiquez l’unité de vente.'
    : prix === null || Number.isNaN(prix) ? 'Indiquez un prix valide.'
    : Number.isNaN(stock) ? 'Stock invalide.' : ''
  if (erreurForm.value) return
  envoi.value = true
  try {
    const comptoir = lire(f.comptoir)
    await api.enregistrerArticle(fournisseurLie.value, { ...f, prix_unitaire: prix, prix_comptoir: Number.isNaN(comptoir) ? null : comptoir, stock })
    await rechargerCatalogue()
    notifier(f.id ? 'Article modifié.' : 'Article ajouté : vous pouvez le vendre en caisse.')
    formulaire.value = null
  } catch (e) {
    erreurForm.value = e?.message || 'Enregistrement impossible.'
  } finally {
    envoi.value = false
  }
}
async function basculerArticle(a, champ) {
  try {
    await api.enregistrerArticle(fournisseurLie.value, { ...a, [champ]: !a[champ] })
    a[champ] = !a[champ]
    if (champ === 'rupture') notifier(a.rupture ? `« ${a.libelle} » est en rupture.` : `« ${a.libelle} » est de nouveau disponible.`, 'info')
  } catch (e) { notifier(e?.message || 'Modification impossible.', 'erreur') }
}
// ================= Fichier : modèle et import =================
function telechargerModele() {
  const nom = (fiche.value?.nom || 'fournisseur').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()
  telecharger(genererModele(materiauxBtm.value, catalogue.value, articles.value), `catalogue-btm-${nom}.csv`)
}
const champFichier = ref(null)
const apercu = ref(null) // { fichier, materiaux, nouveaux, modifies, erreurs }
const importEnCours = ref(false)
async function lireFichier(e) {
  const fichier = e.target.files?.[0]
  e.target.value = '' // le même fichier pourra être choisi de nouveau après correction
  if (!fichier) return
  if (fichier.size > 2_000_000) { notifier('Fichier trop lourd (2 Mo au plus).', 'erreur'); return }
  if (/\.xlsx?$/i.test(fichier.name)) { notifier('Fichier Excel : enregistrez-le d’abord en CSV (Fichier → Enregistrer sous → CSV, séparateur point-virgule).', 'erreur'); return }
  let texte = await fichier.text()
  // CSV d'un ancien Excel (Windows-1252) : ses accents sont illisibles en UTF-8
  if (texte.includes('�')) texte = new TextDecoder('windows-1252').decode(await fichier.arrayBuffer())
  apercu.value = { fichier: fichier.name, ...analyserCatalogue(texte, materiauxBtm.value, articles.value) }
}
const aImporter = computed(() => (apercu.value ? apercu.value.materiaux.length + apercu.value.nouveaux.length + apercu.value.modifies.length : 0))
const pluriel = (n, mot, s = 's') => `${n} ${mot}${n > 1 ? s : ''}`
async function importer() {
  const a = apercu.value
  importEnCours.value = true
  try {
    if (a.materiaux.length) await api.enregistrerCatalogue(fournisseurLie.value, a.materiaux)
    await api.importerArticles(fournisseurLie.value, a.nouveaux, a.modifies)
    await rechargerCatalogue()
    const bilan = [
      a.materiaux.length && pluriel(a.materiaux.length, 'matériau', 'x') + ' BTM',
      a.nouveaux.length && pluriel(a.nouveaux.length, 'article') + ' ajouté' + (a.nouveaux.length > 1 ? 's' : ''),
      a.modifies.length && pluriel(a.modifies.length, 'article') + ' mis à jour'
    ].filter(Boolean)
    notifier(`Catalogue importé : ${bilan.join(', ')}.`)
    apercu.value = null
  } catch (e) {
    notifier(e?.message || 'Import impossible.', 'erreur')
  } finally {
    importEnCours.value = false
  }
}

async function supprimerArticle(a) {
  if (!(await confirmer({ titre: 'Supprimer cet article ?', texte: `« ${a.libelle} » ne sera plus proposé en caisse. Les reçus déjà émis le conservent.`, libelle: 'Supprimer', danger: true }))) return
  try { await api.supprimerArticle(a.id); await rechargerCatalogue(); notifier('Article supprimé.') } catch (e) { notifier(e?.message || 'Suppression impossible.', 'erreur') }
}
</script>

<template>
  <div class="mat">
    <div class="mat-barre">
      <div class="adm-segments" role="tablist" aria-label="Matériaux">
        <button type="button" role="tab" :aria-selected="onglet === 'btm'" @click="onglet = 'btm'"><i class="fa-solid fa-cubes" aria-hidden="true"></i> Matériaux BTM <small>{{ stats.vendus }}/{{ brouillon.length }}</small></button>
        <button type="button" role="tab" :aria-selected="onglet === 'articles'" @click="onglet = 'articles'"><i class="fa-solid fa-box-open" aria-hidden="true"></i> Mes articles <small>{{ stats.articles }}</small></button>
      </div>
      <span v-if="stats.rupture" class="adm-badge mat-badge-rupture"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> {{ stats.rupture }} en rupture</span>
      <div class="mat-fichier">
        <button type="button" class="adm-btn adm-btn-clair" title="Fichier CSV à ouvrir dans Excel, déjà rempli avec votre catalogue actuel" :disabled="!materiauxBtm.length" @click="telechargerModele"><i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i> Modèle</button>
        <button type="button" class="adm-btn adm-btn-clair" title="Remplir tout le catalogue depuis un fichier CSV" :disabled="!materiauxBtm.length" @click="champFichier.click()"><i class="fa-solid fa-file-import" aria-hidden="true"></i> Importer</button>
        <input ref="champFichier" type="file" accept=".csv,.txt,text/csv,text/plain" hidden @change="lireFichier" />
      </div>
      <div v-if="onglet === 'btm'" class="mat-actions">
        <button type="button" class="adm-btn adm-btn-fantome" :disabled="!modifiees.length || enregistrement" @click="preparer">Annuler</button>
        <button type="button" class="adm-btn adm-btn-noir" :disabled="!modifiees.length || enregistrement" @click="enregistrer">
          <span v-if="enregistrement" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-check" aria-hidden="true"></i>
          Enregistrer<template v-if="modifiees.length"> ({{ modifiees.length }})</template>
        </button>
      </div>
      <button v-else type="button" class="adm-btn adm-btn-noir mat-actions" @click="ouvrirArticle()"><i class="fa-solid fa-plus" aria-hidden="true"></i> Nouvel article</button>
    </div>

    <!-- ========== Matériaux BTM ========== -->
    <section v-if="onglet === 'btm'" class="adm-carte">
      <div v-if="!brouillon.length" class="adm-vide"><i class="fa-solid fa-boxes-stacked" aria-hidden="true"></i><p>Catalogue indisponible : exécutez la migration 0014 sur Supabase.</p></div>
      <div v-else class="adm-table-cadre">
        <table class="adm-table adm-table-empile">
          <thead>
            <tr><th>Matériau</th><th class="num">Référence</th><th>Prix au comptoir</th><th>Prix BTM (avec code)</th><th>Stock</th><th>Rupture</th><th>Je le vends</th></tr>
          </thead>
          <tbody>
            <tr v-for="l in liste" :key="l.id" :class="{ estompe: !l.vendu, modifie: modifiees.includes(l), rupture: enRupture(l) }">
              <td class="principal">
                <span class="mat-nom"><strong>{{ l.libelle }}</strong><small>à l’unité : {{ l.unite === 'u' ? 'pièce' : l.unite }}</small></span>
              </td>
              <td data-label="Référence" class="num mat-ref">{{ formaterEuros(l.prix_unitaire) }}</td>
              <td data-label="Prix au comptoir">
                <span class="mat-champ">
                  <span class="adm-saisie-unite"><input v-model="l.comptoir" inputmode="decimal" :placeholder="l.prix || nombre(l.prix_unitaire)" :disabled="!l.vendu" :aria-invalid="Number.isNaN(lire(l.comptoir)) || undefined" :aria-label="`Prix au comptoir : ${l.libelle}`" /><span>€</span></span>
                </span>
              </td>
              <td data-label="Prix BTM (avec code)">
                <span class="mat-champ">
                  <span class="adm-saisie-unite"><input v-model="l.prix" inputmode="decimal" :placeholder="nombre(l.prix_unitaire)" :disabled="!l.vendu" :aria-invalid="Number.isNaN(lire(l.prix)) || undefined" :aria-label="`Prix BTM : ${l.libelle}`" /><span>€</span></span>
                  <small v-if="economie(l)" class="moins">−{{ economie(l) }} %</small>
                </span>
              </td>
              <td data-label="Stock">
                <span class="mat-champ">
                  <span class="adm-saisie-unite"><input v-model="l.stock" inputmode="decimal" placeholder="non suivi" :disabled="!l.vendu" :aria-invalid="Number.isNaN(lire(l.stock)) || undefined" :aria-label="`Stock : ${l.libelle}`" /><span>{{ l.unite }}</span></span>
                </span>
              </td>
              <td data-label="Rupture">
                <button type="button" role="switch" class="adm-interrupteur mat-rupture" :aria-checked="l.rupture" :disabled="!l.vendu" :aria-label="`En rupture : ${l.libelle}`" @click="l.rupture = !l.rupture"></button>
              </td>
              <td data-label="Je le vends">
                <button type="button" role="switch" class="adm-interrupteur" :aria-checked="l.vendu" :aria-label="`Je vends : ${l.libelle}`" @click="l.vendu = !l.vendu"></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ========== Mes articles ========== -->
    <section v-else class="adm-carte">
      <div v-if="!articles.length" class="mat-vide">
        <span class="mat-vide-icone"><i class="fa-solid fa-box-open" aria-hidden="true"></i></span>
        <h2>Aucun article</h2>
        <p>Ajoutez vos propres produits (brouette, outillage, peinture…) : vous pourrez les vendre en caisse en plus du devis du client.</p>
        <button type="button" class="adm-btn adm-btn-noir" @click="ouvrirArticle()"><i class="fa-solid fa-plus" aria-hidden="true"></i> Ajouter un article</button>
      </div>
      <div v-else-if="!articlesFiltres.length" class="adm-vide"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><p>Aucun article ne correspond.</p></div>
      <div v-else class="adm-table-cadre">
        <table class="adm-table adm-table-empile">
          <thead><tr><th>Article</th><th class="num">Prix</th><th class="num">Stock</th><th>Rupture</th><th>En vente</th><th class="actions"><span class="visually-hidden">Actions</span></th></tr></thead>
          <tbody>
            <tr v-for="a in articlesFiltres" :key="a.id" :class="{ estompe: !a.vendu, rupture: a.vendu && (a.rupture || a.stock === 0) }">
              <td class="principal"><span class="mat-nom"><strong>{{ a.libelle }}</strong><small>vendu à l’unité : {{ a.unite }}</small></span></td>
              <td data-label="Prix" class="num">{{ formaterEuros(a.prix_unitaire) }} / {{ a.unite }}</td>
              <td data-label="Stock" class="num">{{ a.stock == null ? 'non suivi' : `${nombre(a.stock)} ${a.unite}` }}</td>
              <td data-label="Rupture"><button type="button" role="switch" class="adm-interrupteur mat-rupture" :aria-checked="a.rupture" :disabled="!a.vendu" :aria-label="`En rupture : ${a.libelle}`" @click="basculerArticle(a, 'rupture')"></button></td>
              <td data-label="En vente"><button type="button" role="switch" class="adm-interrupteur" :aria-checked="a.vendu" :aria-label="`En vente : ${a.libelle}`" @click="basculerArticle(a, 'vendu')"></button></td>
              <td class="actions">
                <button type="button" class="adm-icone-btn" title="Modifier" :aria-label="`Modifier ${a.libelle}`" @click="ouvrirArticle(a)"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
                <button type="button" class="adm-icone-btn danger" title="Supprimer" :aria-label="`Supprimer ${a.libelle}`" @click="supprimerArticle(a)"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <p class="mat-aide"><i class="fa-solid fa-circle-info" aria-hidden="true"></i>
      <template v-if="onglet === 'btm'">Le prix BTM est celui que paient les clients BTM (avec leur code) ; affichez un prix au comptoir plus élevé pour montrer l’économie. Prix BTM vide : prix de référence. Stock vide : non suivi. Un matériau en rupture n’est pas vendu en caisse.</template>
      <template v-else>Vos articles s’ajoutent en caisse, à l’étape « Préparation ». Leur stock est décompté à chaque vente et restitué en cas d’annulation.</template>
    </p>

    <AdminPanneau v-if="apercu" titre="Importer un catalogue" :sous-titre="apercu.fichier" @fermer="apercu = null">
      <div class="imp">
        <ul class="imp-bilan">
          <li><strong>{{ apercu.materiaux.length }}</strong><span>matériau{{ apercu.materiaux.length > 1 ? 'x' : '' }} BTM mis à jour</span></li>
          <li><strong>{{ apercu.nouveaux.length }}</strong><span>article{{ apercu.nouveaux.length > 1 ? 's' : '' }} ajouté{{ apercu.nouveaux.length > 1 ? 's' : '' }}</span></li>
          <li><strong>{{ apercu.modifies.length }}</strong><span>article{{ apercu.modifies.length > 1 ? 's' : '' }} mis à jour</span></li>
          <li v-if="apercu.erreurs.length" class="erreur"><strong>{{ apercu.erreurs.length }}</strong><span>ligne{{ apercu.erreurs.length > 1 ? 's' : '' }} ignorée{{ apercu.erreurs.length > 1 ? 's' : '' }}</span></li>
        </ul>

        <div v-if="apercu.erreurs.length" class="imp-erreurs" role="alert">
          <p><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Ces lignes ne seront pas importées. Corrigez le fichier puis importez-le de nouveau, ou importez le reste maintenant.</p>
          <ul><li v-for="e in apercu.erreurs.slice(0, 50)" :key="e.ligne + e.message"><b>Ligne {{ e.ligne }}</b> {{ e.message }}</li></ul>
          <p v-if="apercu.erreurs.length > 50">… et {{ apercu.erreurs.length - 50 }} autres.</p>
        </div>

        <div v-if="aImporter" class="adm-table-cadre imp-table">
          <table class="adm-table">
            <thead><tr><th>Produit</th><th class="num">Prix BTM</th><th class="num">Comptoir</th><th class="num">Stock</th><th></th></tr></thead>
            <tbody>
              <tr v-for="l in [...apercu.materiaux, ...apercu.modifies, ...apercu.nouveaux].slice(0, 200)" :key="l.materiau_id || l.id || l.libelle" :class="{ estompe: !l.vendu }">
                <td><span class="mat-nom"><strong>{{ l.libelle }}</strong><small>{{ l.materiau_id ? 'Matériau BTM' : l.id ? 'Article mis à jour' : 'Nouvel article' }} · {{ l.unite }}</small></span></td>
                <td class="num">{{ l.prix_unitaire == null ? 'référence' : formaterEuros(l.prix_unitaire) }}</td>
                <td class="num">{{ l.prix_comptoir == null ? '—' : formaterEuros(l.prix_comptoir) }}</td>
                <td class="num">{{ l.stock == null ? 'non suivi' : nombre(l.stock) }}</td>
                <td><span v-if="!l.vendu" class="adm-badge sans-point">Pas en vente</span><span v-else-if="l.rupture" class="adm-badge mat-badge-rupture">Rupture</span></td>
              </tr>
            </tbody>
          </table>
          <p v-if="aImporter > 200" class="imp-suite">… et {{ aImporter - 200 }} autres lignes.</p>
        </div>
        <p class="mat-aide"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Les produits absents du fichier ne sont ni modifiés ni supprimés.</p>
      </div>
      <template #pied>
        <button type="button" class="adm-btn adm-btn-clair" @click="apercu = null">Annuler</button>
        <button type="button" class="adm-btn adm-btn-noir" :disabled="!aImporter || importEnCours" @click="importer"><span v-if="importEnCours" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-check" aria-hidden="true"></i> Importer {{ aImporter }} ligne{{ aImporter > 1 ? 's' : '' }}</button>
      </template>
    </AdminPanneau>

    <AdminPanneau v-if="formulaire" :titre="formulaire.id ? 'Modifier l’article' : 'Nouvel article'" sous-titre="Un produit que vous vendez en plus des matériaux BTM." @fermer="formulaire = null">
      <form id="form-article" class="adm-grille-form" novalidate @submit.prevent="enregistrerArticle">
        <div class="adm-champ plein"><label for="ar-nom">Nom *</label><input id="ar-nom" v-model="formulaire.libelle" maxlength="80" placeholder="Ex. : Brouette 100 L" /></div>
        <div class="adm-champ">
          <label for="ar-unite">Unité de vente *</label>
          <input id="ar-unite" v-model="formulaire.unite" maxlength="12" list="ar-unites" />
          <datalist id="ar-unites"><option v-for="u in UNITES" :key="u" :value="u" /></datalist>
        </div>
        <div class="adm-champ"><label for="ar-prix">Prix BTM (avec code) *</label><span class="adm-saisie-unite"><input id="ar-prix" v-model="formulaire.prix" inputmode="decimal" placeholder="0,00" /><span>€</span></span></div>
        <div class="adm-champ"><label for="ar-comptoir">Prix au comptoir</label><span class="adm-saisie-unite"><input id="ar-comptoir" v-model="formulaire.comptoir" inputmode="decimal" :placeholder="formulaire.prix || '0,00'" /><span>€</span></span></div>
        <div class="adm-champ plein">
          <label for="ar-stock">Stock</label>
          <span class="adm-saisie-unite"><input id="ar-stock" v-model="formulaire.stockTexte" inputmode="decimal" placeholder="non suivi" /><span>{{ formulaire.unite }}</span></span>
          <span class="adm-champ-aide"><span>Laissez vide si vous ne suivez pas le stock de cet article.</span></span>
        </div>
        <label class="plein mat-option"><button type="button" role="switch" class="adm-interrupteur mat-rupture" :aria-checked="formulaire.rupture" @click="formulaire.rupture = !formulaire.rupture"></button> En rupture de stock</label>
      </form>
      <p v-if="erreurForm" class="adm-erreur-texte" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ erreurForm }}</p>
      <template #pied>
        <button type="button" class="adm-btn adm-btn-clair" @click="formulaire = null">Annuler</button>
        <button type="submit" form="form-article" class="adm-btn adm-btn-noir" :disabled="envoi"><span v-if="envoi" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-check" aria-hidden="true"></i> Enregistrer</button>
      </template>
    </AdminPanneau>
  </div>
</template>

<style scoped>
.mat { display: flex; flex-direction: column; gap: 16px; }
.mat-barre { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.mat-barre .adm-segments small { margin-left: 4px; opacity: .6; font-weight: 500; }
.mat-actions { display: flex; gap: 8px; margin-left: auto; }
.mat-fichier { display: flex; gap: 8px; margin-left: auto; }
.mat-fichier + .mat-actions { margin-left: 0; }
.imp { display: flex; flex-direction: column; gap: 16px; }
.imp-bilan { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
.imp-bilan li { display: flex; flex-direction: column; padding: 12px 14px; border-radius: 12px; background: var(--adm-ligne-2); }
.imp-bilan strong { font-size: 1.4rem; font-variant-numeric: tabular-nums; }
.imp-bilan span { color: var(--adm-encre-2); font-size: .8rem; }
.imp-bilan li.erreur { background: #fff1f2; color: var(--adm-baisse); }
.imp-erreurs { padding: 12px 14px; border-radius: 12px; background: #fff7ed; color: #9a3412; font-size: .86rem; }
.imp-erreurs p { margin: 0; }
.imp-erreurs ul { margin: 8px 0 0; padding-left: 18px; max-height: 180px; overflow: auto; }
.imp-erreurs li { margin: 2px 0; }
.imp-table { max-height: 360px; overflow: auto; }
.imp-suite { margin: 8px 0 0; color: var(--adm-muet); font-size: .82rem; }
.mat-badge-rupture { background: #fff1f2; color: var(--adm-baisse); box-shadow: inset 0 0 0 1px #fecdd3; }
.mat-badge-rupture::before { display: none; }
.mat-nom { display: flex; flex-direction: column; }
.mat-nom strong { font-weight: 600; }
.mat-nom small { color: var(--adm-muet); font-size: .8rem; }
.mat-ref { color: var(--adm-encre-2); }
.mat-champ { display: inline-flex; align-items: center; gap: 8px; }
.mat-champ .adm-saisie-unite { width: 136px; }
.mat-champ input { width: 100%; min-height: 38px; padding: 6px 44px 6px 12px; border: 1px solid var(--adm-ligne); border-radius: 10px; background: #fff; font: inherit; font-size: .9rem; text-align: right; font-variant-numeric: tabular-nums; }
.mat-champ input:focus { outline: none; border-color: var(--adm-accent); box-shadow: 0 0 0 3px rgba(8, 145, 178, .14); }
.mat-champ input[aria-invalid] { border-color: var(--adm-baisse); }
.mat-champ input::placeholder { color: #b8c0cc; }
.mat-champ input:disabled { background: var(--adm-ligne-2); }
.mat-champ small { font-size: .76rem; font-weight: 700; }
.mat-champ small.moins { color: #047857; }
.mat-champ small.plus { color: var(--adm-baisse); }
.mat-rupture[aria-checked="true"] { background: var(--adm-baisse); }
.adm-table tr.modifie td:first-child { box-shadow: inset 3px 0 0 var(--adm-accent); }
.adm-table tr.rupture td.principal strong::after { content: 'Rupture'; margin-left: 8px; padding: 1px 8px; border-radius: 999px; background: #fff1f2; color: var(--adm-baisse); font-size: .7rem; font-weight: 700; }
.mat-aide { display: flex; gap: 8px; margin: 0; color: var(--adm-muet); font-size: .82rem; line-height: 1.5; }
.mat-aide i { margin-top: 3px; }
.mat-option { display: flex; align-items: center; gap: 12px; font-size: .92rem; font-weight: 500; cursor: pointer; }
.mat-vide { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 44px 24px; text-align: center; }
.mat-vide h2 { margin: 6px 0 0; font-family: var(--font-corps); font-size: 1.15rem; font-weight: 600; }
.mat-vide p { margin: 0 0 8px; max-width: 440px; color: var(--adm-encre-2); font-size: .92rem; }
.mat-vide-icone { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 16px; background: var(--adm-noir); color: #fff; font-size: 1.3rem; }
</style>

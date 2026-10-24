<script setup>
/**
 * Catalogue du fournisseur — une seule liste « Mes produits », ce qu'il vend en caisse :
 *  - les matériaux BTM (ceux des devis) qu'il vend, à SON prix (sinon le prix de référence BTM) ;
 *  - ses propres produits (brouette, outillage…), vendus en caisse en plus du devis.
 * Chaque produit s'ajoute, se modifie et se retire dans un panneau, enregistré aussitôt (pas de brouillon).
 * Stock vide = non suivi ; un produit en rupture n'est pas vendu en caisse. À l'encaissement, ces prix
 * s'appliquent et les stocks sont décomptés (encaisser_devis, migrations 0014 et 0016).
 * Vendeur de carrelage : un onglet « Carreaux » en plus (ses modèles proposés dans le calculateur).
 * Tout le catalogue peut aussi être rempli d'un coup : modèle CSV à télécharger, puis import du fichier rempli.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAdmin } from '@/composables/useAdmin.js'
import { useEspaceFournisseur } from '@/composables/useEspaceFournisseur.js'
import { useAuth } from '@/composables/useAuth.js'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'
import * as api from '@/services/supabase/serviceEspaceFournisseur.js'
import * as apiCarreaux from '@/services/supabase/serviceCarreaux.js'
import { analyserCatalogue, genererModele, telecharger } from '@/services/catalogueCsv.js'
import AdminPanneau from '@/composants/admin/AdminPanneau.vue'
import SectionCarreaux from '@/composants/fournisseur/SectionCarreaux.vue'
import { televerserPhoto } from '@/services/supabase/serviceRealisations.js'

const props = defineProps({ recherche: { type: String, default: '' } })
const { notifier, confirmer } = useAdmin()
const { fournisseurLie, utilisateur } = useAuth()
const { fiche, materiauxBtm, vendCarreaux, catalogue, articles, rechargerCatalogue } = useEspaceFournisseur()

const onglet = ref(vendCarreaux.value ? 'carreaux' : 'produits')
const sectionCarreaux = ref(null)

// Le bloc « Mes produits » descend jusqu'au bas de la barre latérale (ordinateur et tablette), même vide.
// La marge du bas de la page est retirée d'autant : sinon la page défilerait et le bas ne serait plus aligné.
const carte = ref(null)
const tailleCarte = ref(null)
function ajusterCarte() {
  const lat = document.querySelector('.adm-lat'), principal = carte.value?.closest('.adm-principal')
  if (!carte.value || !lat || !principal || getComputedStyle(lat).position === 'fixed') { tailleCarte.value = null; return }
  const hauteur = lat.getBoundingClientRect().bottom - carte.value.getBoundingClientRect().top - window.scrollY
  tailleCarte.value = { minHeight: `${Math.max(320, hauteur)}px`, marginBottom: `-${getComputedStyle(principal).paddingBottom}` }
}
onMounted(() => { ajusterCarte(); window.addEventListener('resize', ajusterCarte) })
onBeforeUnmount(() => window.removeEventListener('resize', ajusterCarte))
watch(onglet, () => nextTick(ajusterCarte))
watch(vendCarreaux, (v) => { if (v && onglet.value === 'produits') onglet.value = 'carreaux' })

const nombre = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','))
const lire = (t) => { const s = String(t ?? '').replace(/\s/g, '').replace(',', '.'); if (!s) return null; const n = Number(s); return Number.isFinite(n) && n >= 0 ? n : NaN }
const normaliser = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const correspond = (libelle) => { const q = normaliser(props.recherche.trim()); return !q || normaliser(libelle).includes(q) }
const uniteTexte = (u) => (u === 'u' ? 'à la pièce' : `par ${u}`) // « par » : juste avec toute unité (par boîte, par m²…)
const pluriel = (n, mot, s = 's') => `${n} ${mot}${n > 1 ? s : ''}`

// ================= Mes produits : matériaux BTM vendus + articles du fournisseur =================
// Vendeur de carrelage : les carreaux ne sont que dans l'onglet Carreaux (ni ici, ni dans le modèle, ni à l'import)
const CARREAUX_BTM = ['carrelage_sol', 'carrelage']
const materiaux = computed(() => materiauxBtm.value.filter((m) => !vendCarreaux.value || !CARREAUX_BTM.includes(m.id)))
const vendu = (m) => catalogue.value[m.id]?.vendu !== false
const produits = computed(() => [
  ...materiaux.value.filter(vendu).map((m) => {
    const c = catalogue.value[m.id]
    return { cle: `m:${m.id}`, btm: true, id: m.id, libelle: m.libelle, unite: m.unite, reference: m.prix_unitaire, prix: c?.prix_unitaire ?? null, stock: c?.stock ?? null, rupture: !!c?.rupture, vendu: true, photo_url: c?.photo_url || '', description: c?.description || '' }
  }),
  ...articles.value.map((a) => ({ cle: `a:${a.id}`, btm: false, id: a.id, libelle: a.libelle, unite: a.unite, prix: a.prix_unitaire, stock: a.stock, rupture: !!a.rupture, vendu: a.vendu !== false, photo_url: a.photo_url || '', description: a.description || '', article: a }))
])
const liste = computed(() => produits.value.filter((p) => correspond(p.libelle)))
const enRupture = (p) => p.vendu && (p.rupture || p.stock === 0)
const nbRuptures = computed(() => produits.value.filter(enRupture).length)
const prixDe = (p) => (p.prix ?? p.reference)
// Matériaux BTM pas encore dans sa liste : il peut les ajouter
const nonVendus = computed(() => materiaux.value.filter((m) => !vendu(m)))

// ---------- Ajout : choisir un matériau BTM ou créer son produit ----------
const choixAjout = ref(false)
// Vendeur de carrelage : pas de liste de matériaux BTM à proposer, il crée directement son produit
function ajouter() {
  if (nonVendus.value.length && !vendCarreaux.value) choixAjout.value = true
  else ouvrir()
}
function choisir(m) {
  choixAjout.value = false
  ouvrir({ btm: true, id: m.id, libelle: m.libelle, unite: m.unite, reference: m.prix_unitaire, prix: null, stock: null, rupture: false }, true)
}

// ---------- Panneau d'un produit (ajout ou modification), enregistré aussitôt ----------
// Unités courantes dans un menu ; « Autre… » laisse taper la sienne (12 caractères au plus)
const UNITES = ['u', 'carton', 'paquet', 'boîte', 'sac', 'seau', 'bidon', 'palette', 'plaque', 'barre', 'rouleau', 'lot', 'kg', 't', 'L', 'm', 'm²', 'm³']
const libelleUnite = (u) => (u === 'u' ? 'pièce' : u)
const choixUnite = computed({
  get: () => (formulaire.value?.uniteAutre ? 'autre' : formulaire.value?.unite),
  set: (u) => Object.assign(formulaire.value, u === 'autre' ? { uniteAutre: true, unite: '' } : { uniteAutre: false, unite: u })
})
const formulaire = ref(null)
const erreurForm = ref('')
const envoi = ref(false)
function ouvrir(p = null, nouveau = !p) {
  erreurForm.value = ''
  formulaire.value = p
    ? { ...p, nouveau, uniteAutre: !UNITES.includes(p.unite), prixTexte: nombre(p.prix), stockTexte: nombre(p.stock) }
    : { btm: false, nouveau: true, id: null, libelle: '', unite: 'u', uniteAutre: false, prixTexte: '', stockTexte: '', rupture: false, vendu: true, photo_url: '', description: '' }
}
// Photo du produit : montrée aux clients dans « Je sais ce qu'il me faut », avec le prix et la description
const envoiPhoto = ref(false)
async function choisirPhoto(e) {
  const fichier = e.target.files?.[0]
  e.target.value = ''
  if (!fichier) return
  envoiPhoto.value = true
  try {
    const { url } = await televerserPhoto(fichier, `${utilisateur.value.id}/produits`)
    formulaire.value.photo_url = url
  } catch (err) {
    erreurForm.value = err?.message || 'La photo n’a pas pu être envoyée.'
  } finally {
    envoiPhoto.value = false
  }
}
async function enregistrer() {
  const f = formulaire.value
  const prix = lire(f.prixTexte), stock = lire(f.stockTexte)
  erreurForm.value = !f.btm && f.libelle.trim().length < 2 ? 'Donnez un nom au produit.'
    : !f.btm && !f.unite.trim() ? 'Indiquez l’unité de vente.'
    : Number.isNaN(prix) || (!f.btm && prix === null) ? 'Indiquez un prix valide.'
    : Number.isNaN(stock) ? 'Stock invalide.' : ''
  if (erreurForm.value) return
  envoi.value = true
  try {
    if (f.btm) await api.enregistrerCatalogue(fournisseurLie.value, [{ materiau_id: f.id, vendu: true, rupture: f.rupture, prix_unitaire: prix, prix_comptoir: null, stock, photo_url: f.photo_url, description: f.description }])
    else await api.enregistrerArticle(fournisseurLie.value, { ...f.article, id: f.id, libelle: f.libelle, unite: f.unite, prix_unitaire: prix, prix_comptoir: null, stock, rupture: f.rupture, vendu: f.vendu, photo_url: f.photo_url, description: f.description })
    await rechargerCatalogue()
    notifier(f.nouveau ? `« ${f.libelle.trim()} » ajouté : il est vendu en caisse.` : 'Produit enregistré.')
    formulaire.value = null
  } catch (e) {
    erreurForm.value = e?.message || 'Enregistrement impossible.'
  } finally {
    envoi.value = false
  }
}

// Ligne du catalogue d'un matériau BTM, avec un champ changé
const ligneBtm = (p, champs) => ({ materiau_id: p.id, vendu: true, rupture: p.rupture, prix_unitaire: p.prix, prix_comptoir: null, stock: p.stock, ...champs })
async function basculerRupture(p) {
  try {
    if (p.btm) await api.enregistrerCatalogue(fournisseurLie.value, [ligneBtm(p, { rupture: !p.rupture })])
    else await api.enregistrerArticle(fournisseurLie.value, { ...p.article, rupture: !p.rupture })
    await rechargerCatalogue()
    notifier(!p.rupture ? `« ${p.libelle} » est en rupture.` : `« ${p.libelle} » est de nouveau disponible.`, 'info')
  } catch (e) { notifier(e?.message || 'Modification impossible.', 'erreur') }
}
async function retirer(p) {
  const ok = await confirmer(p.btm
    ? { titre: 'Retirer ce matériau ?', texte: `« ${p.libelle} » ne sera plus facturé en caisse. Vous pourrez l’ajouter de nouveau.`, libelle: 'Retirer', danger: true }
    : { titre: 'Supprimer ce produit ?', texte: `« ${p.libelle} » ne sera plus proposé en caisse. Les reçus déjà émis le conservent.`, libelle: 'Supprimer', danger: true })
  if (!ok) return
  try {
    if (p.btm) await api.enregistrerCatalogue(fournisseurLie.value, [ligneBtm(p, { vendu: false })])
    else await api.supprimerArticle(p.id)
    await rechargerCatalogue()
    notifier(p.btm ? 'Matériau retiré.' : 'Produit supprimé.')
  } catch (e) { notifier(e?.message || 'Suppression impossible.', 'erreur') }
}

// ================= Fichier : modèle et import =================
const importOuvert = ref(false)
function telechargerModele() {
  const nom = (fiche.value?.nom || 'fournisseur').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()
  telecharger(genererModele(materiaux.value, catalogue.value, articles.value), `catalogue-btm-${nom}.csv`)
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
  let carreaux = null
  if (vendCarreaux.value) {
    try { carreaux = { existants: await apiCarreaux.listerMesCarreaux(fournisseurLie.value), formats: Object.keys(apiCarreaux.FORMATS_CARREAUX) } }
    catch (err) { notifier(err?.message || 'Vos carreaux n’ont pas pu être chargés.', 'erreur'); return }
  }
  importOuvert.value = false
  apercu.value = { fichier: fichier.name, ...analyserCatalogue(texte, materiaux.value, articles.value, carreaux) }
}
const aImporter = computed(() => {
  const a = apercu.value
  return a ? a.materiaux.length + a.nouveaux.length + a.modifies.length + a.carreauxNouveaux.length + a.carreauxModifies.length : 0
})
// Aperçu : une ligne par produit ; un carreau en carton de plusieurs pièces est vendu au carton
const lignesApercu = computed(() => {
  const a = apercu.value
  if (!a) return []
  const type = (l) => (l.materiau_id ? 'Matériau BTM' : l.id ? 'Produit mis à jour' : 'Nouveau produit')
  const carreau = (c, nouveau) => ({
    cle: `c:${c.nom}`, libelle: c.nom, unite: c.carreaux_par_carton ? 'carton' : 'carreau', prix_unitaire: c.prix_unitaire, stock: c.stock, vendu: c.actif, rupture: c.rupture,
    type: `${nouveau ? 'Nouveau carreau' : 'Carreau mis à jour'} ${apiCarreaux.libelleFormat(c.format)}${c.pieces > 1 ? ` (carton de ${c.pieces})` : ''}`
  })
  return [
    ...[...a.materiaux, ...a.modifies, ...a.nouveaux].map((l) => ({ ...l, cle: l.materiau_id || l.id || l.libelle, type: type(l) })),
    ...a.carreauxModifies.map((c) => carreau(c, false)),
    ...a.carreauxNouveaux.map((c) => carreau(c, true))
  ]
})
async function importer() {
  const a = apercu.value
  importEnCours.value = true
  try {
    if (a.materiaux.length) await api.enregistrerCatalogue(fournisseurLie.value, a.materiaux)
    await api.importerArticles(fournisseurLie.value, a.nouveaux, a.modifies)
    await apiCarreaux.importerCarreaux(fournisseurLie.value, a.carreauxNouveaux, a.carreauxModifies)
    await rechargerCatalogue()
    const carreaux = a.carreauxNouveaux.length + a.carreauxModifies.length
    const bilan = [
      a.materiaux.length && pluriel(a.materiaux.length, 'matériau', 'x') + ' BTM',
      a.nouveaux.length && pluriel(a.nouveaux.length, 'produit') + ' ajouté' + (a.nouveaux.length > 1 ? 's' : ''),
      a.modifies.length && pluriel(a.modifies.length, 'produit') + ' mis à jour',
      carreaux && pluriel(carreaux, 'carreau', 'x')
    ].filter(Boolean)
    notifier(`Catalogue importé : ${bilan.join(', ')}.`)
    apercu.value = null
    if (carreaux) onglet.value = 'carreaux'
  } catch (e) {
    notifier(e?.message || 'Import impossible.', 'erreur')
  } finally {
    importEnCours.value = false
  }
}
</script>

<template>
  <div class="mat">
    <!-- Vendeur de carrelage : l'import remplit les deux onglets, son bouton est donc au-dessus -->
    <div v-if="vendCarreaux" class="mat-barre">
      <div class="adm-segments mat-onglets" role="tablist" aria-label="Catalogue">
        <button type="button" role="tab" :aria-selected="onglet === 'carreaux'" @click="onglet = 'carreaux'"><i class="fa-solid fa-table-cells" aria-hidden="true"></i> Carreaux</button>
        <button type="button" role="tab" :aria-selected="onglet === 'produits'" @click="onglet = 'produits'"><i class="fa-solid fa-boxes-stacked" aria-hidden="true"></i> Autres produits <small>{{ produits.length }}</small></button>
      </div>
      <div class="mat-entete-actions">
        <button type="button" class="adm-btn adm-btn-clair" @click="importOuvert = true"><i class="fa-solid fa-file-import" aria-hidden="true"></i> Importer un fichier</button>
        <button v-if="onglet === 'carreaux'" type="button" class="adm-btn adm-btn-noir" @click="sectionCarreaux?.ouvrir()"><i class="fa-solid fa-plus" aria-hidden="true"></i> Nouveau modèle</button>
        <button v-else type="button" class="adm-btn adm-btn-noir" @click="ajouter"><i class="fa-solid fa-plus" aria-hidden="true"></i> Ajouter un produit</button>
      </div>
    </div>

    <SectionCarreaux v-if="onglet === 'carreaux'" ref="sectionCarreaux" :recherche="recherche" />

    <!-- ========== Mes produits ========== -->
    <section v-else ref="carte" class="adm-carte mat-carte" :style="tailleCarte">
      <div class="mat-entete">
        <span>
          <strong>Mes produits <small v-if="produits.length">{{ produits.length }}</small></strong>
        </span>
        <span v-if="nbRuptures" class="adm-badge mat-badge-rupture"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> {{ nbRuptures }} en rupture</span>
        <div v-if="produits.length && !vendCarreaux" class="mat-entete-actions">
          <button type="button" class="adm-btn adm-btn-fantome" @click="importOuvert = true"><i class="fa-solid fa-file-import" aria-hidden="true"></i> Importer un fichier</button>
          <button type="button" class="adm-btn adm-btn-noir" @click="ajouter"><i class="fa-solid fa-plus" aria-hidden="true"></i> Ajouter un produit</button>
        </div>
      </div>

      <div v-if="!produits.length" class="mat-vide">
        <span class="mat-vide-icone"><i class="fa-solid fa-boxes-stacked" aria-hidden="true"></i></span>
        <h2>Aucun produit</h2>
        <!-- vendeur de carrelage : ces boutons sont déjà dans la barre du haut -->
        <div v-if="!vendCarreaux" class="mat-vide-actions">
          <button type="button" class="adm-btn adm-btn-noir" @click="ajouter"><i class="fa-solid fa-plus" aria-hidden="true"></i> Ajouter un produit</button>
          <button type="button" class="adm-btn adm-btn-clair" @click="importOuvert = true"><i class="fa-solid fa-file-import" aria-hidden="true"></i> Importer un fichier</button>
        </div>
      </div>
      <div v-else-if="!liste.length" class="adm-vide"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><p>Aucun produit ne correspond.</p></div>

      <ul v-else class="prod-liste">
        <li v-for="p in liste" :key="p.cle" class="prod" :class="{ estompe: !p.vendu }">
          <button type="button" class="prod-nom" :aria-label="`Modifier ${p.libelle}`" @click="ouvrir(p)">
            <strong>{{ p.libelle }} <em v-if="enRupture(p)" class="adm-badge mat-badge-rupture">Rupture</em><em v-else-if="!p.vendu" class="adm-badge sans-point">Pas en vente</em></strong>
            <small>{{ p.btm ? 'Matériau des devis BTM' : 'Votre produit' }} · {{ uniteTexte(p.unite) }}</small>
          </button>
          <span class="prod-val">
            <small>Prix</small>
            <b>{{ formaterEuros(prixDe(p)) }}</b>
            <em v-if="p.btm && p.prix == null">prix de référence</em>
          </span>
          <span class="prod-val">
            <small>Stock</small>
            <span>{{ p.stock == null ? 'non suivi' : `${nombre(p.stock)} ${p.unite}` }}</span>
          </span>
          <label class="prod-rupture"><button type="button" role="switch" class="adm-interrupteur mat-rupture" :aria-checked="p.rupture" :aria-label="`En rupture : ${p.libelle}`" @click="basculerRupture(p)"></button> Rupture</label>
          <span class="prod-actions">
            <button type="button" class="adm-icone-btn" title="Modifier" :aria-label="`Modifier ${p.libelle}`" @click="ouvrir(p)"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
            <button type="button" class="adm-icone-btn danger" :title="p.btm ? 'Retirer' : 'Supprimer'" :aria-label="`${p.btm ? 'Retirer' : 'Supprimer'} ${p.libelle}`" @click="retirer(p)"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
          </span>
        </li>
      </ul>
    </section>

    <!-- Ajouter : un matériau des devis BTM, ou son propre produit -->
    <AdminPanneau v-if="choixAjout" titre="Ajouter un produit" sous-titre="Un matériau des devis BTM, ou votre propre produit." @fermer="choixAjout = false">
      <div class="choix">
        <p class="choix-titre">Matériaux des devis BTM</p>
        <ul class="choix-liste">
          <li v-for="m in nonVendus" :key="m.id">
            <button type="button" @click="choisir(m)">
              <span class="mat-nom"><strong>{{ m.libelle }}</strong><small>{{ uniteTexte(m.unite) }} · référence {{ formaterEuros(m.prix_unitaire) }}</small></span>
              <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
            </button>
          </li>
        </ul>
        <p class="choix-titre">Autre chose</p>
        <button type="button" class="choix-perso" @click="choixAjout = false; ouvrir()">
          <span class="choix-perso-icone"><i class="fa-solid fa-plus" aria-hidden="true"></i></span>
          <span class="mat-nom"><strong>Créer mon produit</strong><small>Brouette, outillage, peinture… vendu en caisse en plus du devis.</small></span>
        </button>
      </div>
    </AdminPanneau>

    <!-- Un produit : ajout ou modification -->
    <AdminPanneau v-if="formulaire" :titre="formulaire.nouveau ? 'Ajouter un produit' : 'Modifier le produit'" :sous-titre="formulaire.btm ? 'Matériau des devis BTM, facturé à votre prix.' : 'Votre produit, vendu en caisse en plus du devis.'" @fermer="formulaire = null">
      <form id="form-produit" class="adm-grille-form" novalidate @submit.prevent="enregistrer">
        <template v-if="formulaire.btm">
          <div class="adm-champ plein mat-fixe"><span class="adm-champ-label">Matériau</span><strong>{{ formulaire.libelle }}</strong><small>{{ uniteTexte(formulaire.unite) }} · prix de référence BTM {{ formaterEuros(formulaire.reference) }}</small></div>
        </template>
        <template v-else>
          <div class="adm-champ plein"><label for="pr-nom">Nom *</label><input id="pr-nom" v-model="formulaire.libelle" maxlength="80" placeholder="Ex. : Brouette 100 L" /></div>
        </template>
        <div class="adm-champ" :class="{ plein: formulaire.btm }">
          <label for="pr-prix">Prix{{ formulaire.btm ? '' : ' *' }}</label>
          <span class="adm-saisie-unite"><input id="pr-prix" v-model="formulaire.prixTexte" inputmode="decimal" :placeholder="formulaire.btm ? nombre(formulaire.reference) : '0,00'" /><span>€ / {{ libelleUnite(formulaire.unite) || '…' }}</span></span>
          <span v-if="formulaire.btm" class="adm-champ-aide"><span>Vide : prix de référence BTM.</span></span>
        </div>
        <div v-if="!formulaire.btm" class="adm-champ">
          <label for="pr-unite">Vendu par *</label>
          <select id="pr-unite" v-model="choixUnite">
            <option v-for="u in UNITES" :key="u" :value="u">{{ libelleUnite(u) }}</option>
            <option value="autre">Autre…</option>
          </select>
          <input v-if="formulaire.uniteAutre" v-model="formulaire.unite" maxlength="12" placeholder="Votre unité : bac, dalle…" aria-label="Votre unité" />
        </div>
        <div class="adm-champ">
          <label for="pr-stock">Stock</label>
          <span class="adm-saisie-unite"><input id="pr-stock" v-model="formulaire.stockTexte" inputmode="decimal" placeholder="Non suivi" /><span>{{ libelleUnite(formulaire.unite) }}</span></span>
          <span class="adm-champ-aide"><span>Décompté à chaque vente.</span></span>
        </div>
        <div class="adm-champ plein">
          <span class="adm-champ-label">Photo du produit (facultative)</span>
          <div class="mat-photo">
            <span class="mat-photo-apercu" aria-hidden="true"><img v-if="formulaire.photo_url" :src="formulaire.photo_url" alt="" /><i v-else class="fa-regular fa-image"></i></span>
            <label class="adm-btn adm-btn-clair">
              <span v-if="envoiPhoto" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-camera" aria-hidden="true"></i>
              {{ formulaire.photo_url ? 'Changer la photo' : 'Ajouter une photo' }}
              <input type="file" accept="image/jpeg,image/png,image/webp" class="visually-hidden" :disabled="envoiPhoto" @change="choisirPhoto" />
            </label>
            <button v-if="formulaire.photo_url" type="button" class="adm-btn adm-btn-clair" @click="formulaire.photo_url = ''">Retirer</button>
          </div>
          <span class="adm-champ-aide"><span>Vue par les clients quand ils comparent les fournisseurs pour ce produit.</span></span>
        </div>
        <div class="adm-champ plein">
          <label for="pr-desc">Description (facultative)</label>
          <textarea id="pr-desc" v-model="formulaire.description" rows="2" maxlength="300" placeholder="Ex. : béton dosé à 350 kg/m³, livré en toupie"></textarea>
        </div>
        <div class="adm-champ">
          <span class="adm-champ-label">Disponibilité</span>
          <label class="mat-dispo" :class="{ rupture: formulaire.rupture }">
            <button type="button" role="switch" class="adm-interrupteur mat-rupture" :aria-checked="formulaire.rupture" @click="formulaire.rupture = !formulaire.rupture"></button>
            {{ formulaire.rupture ? 'En rupture : pas vendu' : 'En vente' }}
          </label>
        </div>
      </form>
      <p v-if="erreurForm" class="adm-erreur-texte" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ erreurForm }}</p>
      <template #pied>
        <button type="button" class="adm-btn adm-btn-clair" @click="formulaire = null">Annuler</button>
        <button type="submit" form="form-produit" class="adm-btn adm-btn-noir" :disabled="envoi"><span v-if="envoi" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-check" aria-hidden="true"></i> {{ formulaire.nouveau ? 'Ajouter' : 'Enregistrer' }}</button>
      </template>
    </AdminPanneau>

    <!-- Importer un fichier : tout le catalogue d'un coup -->
    <AdminPanneau v-if="importOuvert" titre="Importer un fichier" sous-titre="Remplissez tout votre catalogue d’un coup depuis Excel." @fermer="importOuvert = false">
      <ol class="imp-etapes">
        <li>
          <strong>Téléchargez le modèle</strong>
          <span>Un fichier déjà rempli avec votre catalogue actuel, à ouvrir dans Excel.</span>
          <button type="button" class="adm-btn adm-btn-clair" :disabled="!materiauxBtm.length" @click="telechargerModele"><i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i> Télécharger le modèle</button>
        </li>
        <li>
          <strong>Remplissez-le</strong>
          <span>Vos prix, stocks et ruptures ; ajoutez vos propres produits en bas. Enregistrez en CSV (séparateur point-virgule).</span>
        </li>
        <li>
          <strong>Importez-le</strong>
          <span>Vous verrez le résultat avant de valider. Les produits absents du fichier ne changent pas.</span>
          <button type="button" class="adm-btn adm-btn-noir" :disabled="!materiauxBtm.length" @click="champFichier.click()"><i class="fa-solid fa-file-import" aria-hidden="true"></i> Choisir mon fichier</button>
        </li>
      </ol>
    </AdminPanneau>
    <input ref="champFichier" type="file" accept=".csv,.txt,text/csv,text/plain" hidden @change="lireFichier" />

    <AdminPanneau v-if="apercu" titre="Importer un catalogue" :sous-titre="apercu.fichier" @fermer="apercu = null">
      <div class="imp">
        <ul class="imp-bilan">
          <li><strong>{{ apercu.materiaux.length }}</strong><span>matériau{{ apercu.materiaux.length > 1 ? 'x' : '' }} BTM mis à jour</span></li>
          <li><strong>{{ apercu.nouveaux.length }}</strong><span>produit{{ apercu.nouveaux.length > 1 ? 's' : '' }} ajouté{{ apercu.nouveaux.length > 1 ? 's' : '' }}</span></li>
          <li><strong>{{ apercu.modifies.length }}</strong><span>produit{{ apercu.modifies.length > 1 ? 's' : '' }} mis à jour</span></li>
          <li v-if="apercu.carreauxNouveaux.length || apercu.carreauxModifies.length"><strong>{{ apercu.carreauxNouveaux.length + apercu.carreauxModifies.length }}</strong><span>carreau{{ apercu.carreauxNouveaux.length + apercu.carreauxModifies.length > 1 ? 'x' : '' }} (onglet Carreaux)</span></li>
          <li v-if="apercu.erreurs.length" class="erreur"><strong>{{ apercu.erreurs.length }}</strong><span>ligne{{ apercu.erreurs.length > 1 ? 's' : '' }} ignorée{{ apercu.erreurs.length > 1 ? 's' : '' }}</span></li>
        </ul>

        <div v-if="apercu.erreurs.length" class="imp-erreurs" role="alert">
          <p><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Ces lignes ne seront pas importées. Corrigez le fichier puis importez-le de nouveau, ou importez le reste maintenant.</p>
          <ul><li v-for="e in apercu.erreurs.slice(0, 50)" :key="e.ligne + e.message"><b>Ligne {{ e.ligne }}</b> {{ e.message }}</li></ul>
          <p v-if="apercu.erreurs.length > 50">… et {{ apercu.erreurs.length - 50 }} autres.</p>
        </div>

        <div v-if="aImporter" class="adm-table-cadre imp-table">
          <table class="adm-table">
            <thead><tr><th>Produit</th><th class="num">Prix</th><th class="num">Stock</th><th></th></tr></thead>
            <tbody>
              <tr v-for="l in lignesApercu.slice(0, 200)" :key="l.cle" :class="{ estompe: !l.vendu }">
                <td><span class="mat-nom"><strong>{{ l.libelle }}</strong><small>{{ l.type }} · {{ l.unite }}</small></span></td>
                <td class="num">{{ l.prix_unitaire == null ? 'référence' : formaterEuros(l.prix_unitaire) }}</td>
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
  </div>
</template>

<style scoped>
.mat { display: flex; flex-direction: column; gap: 16px; }
/* Hauteur réglée par ajusterCarte ; le message « Aucun produit » reste centré */
.mat-carte { display: flex; flex-direction: column; }
.mat-carte > .mat-vide { flex: 1; justify-content: center; }
.mat-barre { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
.mat-onglets small { margin-left: 4px; opacity: .6; font-weight: 500; }

.mat-entete { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; padding: 16px 18px; border-bottom: 1px solid var(--adm-ligne-2); }
.mat-entete > span:first-child { display: flex; flex-direction: column; gap: 2px; margin-right: auto; }
.mat-entete strong { font-size: 1rem; font-weight: 600; }
.mat-entete strong small { margin-left: 4px; color: var(--adm-muet); font-size: .85rem; font-weight: 500; }
.mat-entete > span:first-child > small { color: var(--adm-muet); font-size: .82rem; }
.mat-entete-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.mat-badge-rupture { background: var(--adm-danger-fond); color: var(--adm-baisse); box-shadow: inset 0 0 0 1px var(--adm-danger-fond-2); }
.mat-badge-rupture::before { display: none; }

/* Une ligne par produit : nom, prix, stock, rupture, actions */
.prod-liste { margin: 0; padding: 0; list-style: none; }
.prod {
  display: grid; grid-template-columns: minmax(0, 2.2fr) repeat(2, minmax(0, 1fr)) auto auto; align-items: center; gap: 12px 18px;
  padding: 14px 18px; border-bottom: 1px solid var(--adm-ligne-2);
}
.prod:last-child { border-bottom: 0; }
.prod.estompe > :not(.prod-actions) { opacity: .55; }
.prod-nom { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.prod-nom strong { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-weight: 600; }
.prod-nom:hover strong { color: var(--adm-accent); }
.prod-nom small, .prod-val small { color: var(--adm-muet); font-size: .78rem; }
.prod-nom em { font-style: normal; font-size: .7rem; }
.prod-val { display: flex; flex-direction: column; gap: 1px; font-size: .9rem; font-variant-numeric: tabular-nums; }
.prod-val b { font-weight: 600; }
.prod-val em { color: var(--adm-muet); font-size: .74rem; font-style: normal; }
.prod-rupture { display: flex; align-items: center; gap: 8px; color: var(--adm-muet); font-size: .8rem; cursor: pointer; }
.prod-actions { display: flex; gap: 4px; }
.mat-rupture[aria-checked="true"] { background: var(--adm-baisse); }

/* Panneau « Ajouter un produit » */
.choix { display: flex; flex-direction: column; gap: 10px; }
.choix-titre { margin: 6px 0 0; color: var(--adm-muet); font-size: .76rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
.choix-liste { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.choix-liste button, .choix-perso {
  display: flex; align-items: center; gap: 14px; width: 100%; padding: 12px 14px; border: 1px solid var(--adm-ligne); border-radius: 12px;
  background: var(--adm-carte); color: var(--adm-encre); font: inherit; text-align: left; cursor: pointer;
}
.choix-liste button:hover, .choix-perso:hover { border-color: var(--adm-accent); }
.choix-liste .mat-nom { flex: 1; min-width: 0; }
.choix-liste i { color: var(--adm-muet); font-size: .8rem; }
.choix-perso { border-style: dashed; }
.choix-perso-icone { flex: none; width: 36px; height: 36px; display: grid; place-items: center; border-radius: 10px; background: var(--adm-ligne-2); color: var(--adm-accent); }

.mat-fixe strong { font-size: 1rem; }
.mat-fixe small { color: var(--adm-muet); font-size: .82rem; }
.mat-nom { display: flex; flex-direction: column; }
.mat-nom strong { font-weight: 600; }
.mat-nom small { color: var(--adm-muet); font-size: .8rem; }
.mat-option { display: flex; align-items: center; gap: 12px; font-size: .92rem; font-weight: 500; cursor: pointer; }
/* Disponibilité : même hauteur qu'un champ, rouge quand le produit est en rupture */
/* Photo du produit (formulaire) */
.mat-photo { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.mat-photo-apercu { display: grid; place-items: center; width: 64px; height: 64px; overflow: hidden; border: 1px solid var(--adm-ligne); border-radius: 12px; background: var(--adm-ligne-2); color: var(--adm-muet); font-size: 1.3rem; }
.mat-photo-apercu img { width: 100%; height: 100%; object-fit: cover; }
.mat-dispo {
  display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 0 14px; border: 1px solid var(--adm-ligne); border-radius: 12px;
  background: var(--adm-champ); font-size: .9rem; font-weight: 500; cursor: pointer;
}
#pr-prix { padding-right: 100px; } /* place pour « € / carton » */
.mat-dispo.rupture { border-color: var(--adm-danger-fond-2); background: var(--adm-danger-fond); color: var(--adm-baisse); }
.mat-aide { display: flex; gap: 8px; margin: 0; color: var(--adm-muet); font-size: .82rem; line-height: 1.5; }
.mat-aide i { margin-top: 3px; }

.mat-vide { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 44px 24px; text-align: center; }
.mat-vide h2 { margin: 6px 0 0; font-family: var(--font-corps); font-size: 1.15rem; font-weight: 600; }
.mat-vide p { margin: 0 0 8px; max-width: 460px; color: var(--adm-encre-2); font-size: .92rem; }
.mat-vide-icone { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 16px; background: var(--adm-noir); color: #fff; font-size: 1.3rem; }
.mat-vide-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }

/* Import */
.imp-etapes { display: flex; flex-direction: column; gap: 18px; margin: 0; padding: 0; list-style: none; counter-reset: etape; }
.imp-etapes li { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding-left: 44px; counter-increment: etape; }
.imp-etapes li::before { content: counter(etape); position: absolute; left: 0; top: -2px; width: 30px; height: 30px; display: grid; place-items: center; border-radius: 50%; background: var(--adm-ligne-2); font-weight: 700; font-size: .86rem; }
.imp-etapes span { color: var(--adm-encre-2); font-size: .88rem; }
.imp-etapes .adm-btn { margin-top: 4px; }
.imp { display: flex; flex-direction: column; gap: 16px; }
.imp-bilan { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
.imp-bilan li { display: flex; flex-direction: column; padding: 12px 14px; border-radius: 12px; background: var(--adm-ligne-2); }
.imp-bilan strong { font-size: 1.4rem; font-variant-numeric: tabular-nums; }
.imp-bilan span { color: var(--adm-encre-2); font-size: .8rem; }
.imp-bilan li.erreur { background: var(--adm-danger-fond); color: var(--adm-baisse); }
.imp-erreurs { padding: 12px 14px; border-radius: 12px; background: var(--adm-attention-fond); color: var(--adm-attention-texte-2); font-size: .86rem; }
.imp-erreurs p { margin: 0; }
.imp-erreurs ul { margin: 8px 0 0; padding-left: 18px; max-height: 180px; overflow: auto; }
.imp-erreurs li { margin: 2px 0; }
.imp-table { max-height: 360px; overflow: auto; }
.imp-suite { margin: 8px 0 0; color: var(--adm-muet); font-size: .82rem; }

/* Tablette et téléphone : nom en tête, valeurs dessous, rupture et actions en bas */
@media (max-width: 1023px) {
  .prod { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 12px; }
  .prod-nom { grid-column: 1 / -1; }
  .prod-rupture { grid-column: 1 / 3; }
  .prod-actions { grid-column: 3; justify-content: flex-end; }
}
@media (max-width: 767px) {
  .mat { gap: 12px; }
  .mat-barre > * { flex: 1 1 100%; }
  .mat-onglets button { flex: 1; justify-content: center; }
  .mat-entete { padding: 14px; }
  .mat-entete-actions { flex: 1 1 100%; }
  .mat-entete-actions .adm-btn { flex: 1; justify-content: center; }
  .prod { padding: 14px; }
  .mat-vide { padding: 32px 18px; }
}
</style>

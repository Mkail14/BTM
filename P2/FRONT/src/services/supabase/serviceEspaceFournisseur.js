/**
 * Espace fournisseur : devis qui ont choisi l'entreprise, retrait au comptoir par code, encaissement
 * tracé (reçu numéroté + journal), fiche de l'annuaire. La RLS et les fonctions SQL (migrations 0010,
 * 0012, 0013) limitent tout à la fiche liée au compte : un fournisseur ne voit jamais les devis d'un concurrent.
 */
import { supabase } from './client.js'
import { normaliserResultat } from '@/services/calculs/moteurCalculs.js'
import { arrondi } from '@/services/calculs/utilitaires.js'

const ok = ({ data, error }) => { if (error) throw error; return data }
const MONTANTS = ['montant_devis', 'revenu_btm', 'montant_recu', 'rendu', 'montant_materiaux', 'remise_fournisseur', 'commission', 'credit_utilise', 'credit_gagne']
const versPaiement = (p) => p && ({ ...p, ...Object.fromEntries(MONTANTS.map((c) => [c, p[c] == null ? null : Number(p[c])])) })
/** Message lisible : les fonctions SQL renvoient déjà des phrases en français */
const erreurSql = (error, migration) => new Error(/function .* does not exist|Could not find the function/i.test(error.message) ? `Exécutez la migration ${migration} sur Supabase.` : error.message)

export const MOYENS = {
  carte: { libelle: 'Carte bancaire (TPE)', court: 'Carte', icone: 'fa-solid fa-credit-card', reference: 'N° de transaction du ticket TPE', exemple: 'ex. 004512' },
  especes: { libelle: 'Espèces', court: 'Espèces', icone: 'fa-solid fa-money-bill-wave' },
  virement: { libelle: 'Virement', court: 'Virement', icone: 'fa-solid fa-building-columns', reference: 'Référence du virement', exemple: 'ex. VIR-2026-0912' },
  cheque: { libelle: 'Chèque', court: 'Chèque', icone: 'fa-solid fa-money-check', reference: 'N° du chèque', exemple: 'ex. 1234567' }
}

// ---------- Fiche de l'annuaire (0012) ----------
export async function lireMaFiche(fournisseurId) {
  // toute la fiche (0012 : lisible par le fournisseur lié, même masquée de l'annuaire)
  const lignes = ok(await supabase.from('fournisseurs').select('*').eq('id', fournisseurId))
  return lignes[0] || null
}

/** Coordonnées et présentation de la fiche ; nom, catégorie et visibilité restent à l'admin (migration 0012) */
export async function modifierMaFiche(f) {
  const { data, error } = await supabase.rpc('modifier_ma_fiche', {
    p_telephone: f.telephone, p_email: f.email, p_adresse: f.adresse, p_commune: f.commune, p_site_web: f.site_web,
    p_description: f.description, p_horaires: f.horaires, p_logo_url: f.logo_url, p_livraison: !!f.livraison
  })
  if (error) throw erreurSql(error, '0012')
  return data
}

// ---------- Devis et encaissements ----------
export async function listerMesDevis(fournisseurId) {
  const lignes = ok(await supabase.from('projets')
    .select('id, nom, type_projet_id, cout_total, resultat, cree_le, code_retrait')
    .eq('fournisseur_id', fournisseurId)
    .order('cree_le', { ascending: false }))
  return lignes.map((p) => ({ ...p, cout_total: Number(p.cout_total), resultat: normaliserResultat(p.resultat) }))
}

export async function listerMesPaiements() {
  return ok(await supabase.from('paiements').select('*').order('paye_le', { ascending: false })).map(versPaiement)
}

/** Journal des opérations (encaissements et annulations), le plus récent d'abord */
export async function listerJournal() {
  const { data, error } = await supabase.from('journal_operations').select('*').order('le', { ascending: false }).limit(500)
  if (error) throw erreurSql(error, '0013')
  return data.map((j) => ({ ...j, montant: j.montant == null ? null : Number(j.montant) }))
}

/** Code tapé au comptoir (casse, espaces et tiret indifférents) → devis, s'il est pour ce fournisseur ou sans fournisseur */
export async function trouverDevisParCode(code) {
  const { data, error } = await supabase.rpc('trouver_devis_par_code', { p_code: code })
  if (error) throw erreurSql(error, '0013')
  return { ...data, cout_total: Number(data.cout_total), resultat: normaliserResultat(data.resultat), paiement: versPaiement(data.paiement), credit_disponible: Number(data.credit_disponible) || 0, commission: Number(data.commission) || 0 }
}

/**
 * Encaisse les quantités remises (0 = non fourni), aux prix du catalogue du fournisseur, avec une promotion
 * éventuelle. Le montant est recalculé par la base (encaisser_devis, migration 0014) ;
 * `calculerEncaissement` ci-dessous n'en est que l'affichage.
 */
export async function encaisserDevis({ projetId, lignes, articles = [], moyen, reference, montantRecu, promotionId, credit = 0 }) {
  const { data, error } = await supabase.rpc('encaisser_devis', {
    p_projet: projetId, p_lignes: lignes, p_moyen: moyen, p_reference: reference || null, p_montant_recu: montantRecu ?? null,
    p_promotion: promotionId || null, p_articles: articles, p_credit: credit || 0
  })
  if (error) throw erreurSql(error, '0017')
  return versPaiement(data)
}

export async function annulerEncaissement(projetId, motif) {
  const { error } = await supabase.rpc('annuler_encaissement', { p_projet: projetId, p_motif: motif })
  if (error) throw erreurSql(error, '0013')
}

/**
 * Même calcul que encaisser_devis (SQL, migration 0017) : quantités remises × prix du catalogue (sinon prix du devis),
 * articles du fournisseur ajoutés, promotion du fournisseur, code promo BTM du client (une fois par compte)
 * et crédit fidélité utilisé. Le client ne paie aucun frais : la commission BTM (en % du montant après
 * promotion) est à la charge du fournisseur et affichée à part.
 * @param {object} quantites { [materiauId]: quantité remise }
 * @param {object} catalogue { [materiauId]: { vendu, rupture, prix_unitaire, stock } }
 * @param {Array} articles [{ id, libelle, unite, prix_unitaire, stock, quantite }] articles vendus en plus
 */
export function calculerEncaissement(resultat, quantites = {}, catalogue = {}, promotion = null, { articles = [], codeBtmIgnore = false, tauxCommission = 0, credit = 0 } = {}) {
  const lignes = (resultat?.lignes || []).map((l) => {
    const c = catalogue[l.id]
    const indisponible = !!c && (!c.vendu || c.rupture)
    const quantite = indisponible ? 0 : Math.max(0, Math.min(Number(quantites[l.id] ?? l.quantite) || 0, l.quantite))
    const prixUnitaire = c?.prix_unitaire != null ? Number(c.prix_unitaire) : Number(l.prixUnitaire) || 0
    return { ...l, quantiteDevis: l.quantite, quantite, prixUnitaire, sousTotal: arrondi(quantite * prixUnitaire), stock: c?.stock ?? null, nonVendu: !!c && !c.vendu, rupture: !!c?.rupture }
  })
  const extras = articles.filter((a) => Number(a.quantite) > 0).map((a) => ({
    id: `article:${a.id}`, articleId: a.id, libelle: a.libelle, unite: a.unite, quantite: Number(a.quantite), prixUnitaire: Number(a.prix_unitaire),
    sousTotal: arrondi(Number(a.quantite) * Number(a.prix_unitaire)), stock: a.stock ?? null, article: true
  }))
  const fournies = [...lignes.filter((l) => l.quantite > 0), ...extras]
  const materiaux = arrondi(fournies.reduce((s, l) => s + l.sousTotal, 0))
  let remiseFournisseur = 0
  if (promotion) {
    const base = fournies.filter((l) => !promotion.materiau_id || l.id === promotion.materiau_id).reduce((s, l) => s + l.sousTotal, 0)
    remiseFournisseur = arrondi(Math.min(base, promotion.type === 'montant' ? Number(promotion.valeur) : (base * Number(promotion.valeur)) / 100))
  }
  const net = arrondi(materiaux - remiseFournisseur)
  const taux = Number(tauxCommission) || 0
  const commission = arrondi((net * taux) / 100)
  const r = resultat?.remise
  let reduction = 0
  if (r && Number(r.valeur) > 0 && !codeBtmIgnore) {
    const brut = r.type === 'montant' ? Number(r.valeur) : (net * Number(r.valeur)) / 100
    reduction = arrondi(Math.min(net, Math.max(0, brut)))
  }
  const creditUtilise = arrondi(Math.min(Math.max(0, Number(credit) || 0), net - reduction))
  const stockInsuffisant = fournies.filter((l) => l.stock != null && l.quantite > Number(l.stock))
  return {
    lignes, extras, fournies, materiaux, remiseFournisseur, taux, commission, reduction, creditUtilise, remise: r || null,
    codeBtmIgnore: !!(r && codeBtmIgnore), montant: arrondi(net - reduction - creditUtilise), stockInsuffisant
  }
}

// ---------- Catalogue du fournisseur (0014) ----------
/** Matériaux BTM (prix de référence) */
export async function listerMateriauxBtm() {
  return ok(await supabase.from('materiaux').select('id, libelle, unite, prix_unitaire').order('libelle'))
    .map((m) => ({ ...m, prix_unitaire: Number(m.prix_unitaire) }))
}
export async function listerMonCatalogue() {
  const { data, error } = await supabase.from('catalogue_fournisseur').select('*')
  if (error) throw erreurSql(error, '0014')
  return data.map((c) => ({ ...c, prix_unitaire: c.prix_unitaire == null ? null : Number(c.prix_unitaire), prix_comptoir: c.prix_comptoir == null ? null : Number(c.prix_comptoir), stock: c.stock == null ? null : Number(c.stock) }))
}
export async function enregistrerCatalogue(fournisseurId, lignes) {
  const { error } = await supabase.from('catalogue_fournisseur').upsert(lignes.map((l) => ({
    fournisseur_id: fournisseurId, materiau_id: l.materiau_id, vendu: !!l.vendu, rupture: !!l.rupture, prix_unitaire: l.prix_unitaire, prix_comptoir: l.prix_comptoir ?? null, stock: l.stock, mis_a_jour_le: new Date().toISOString()
  })))
  if (error) throw erreurSql(error, '0014')
}

// ---------- Articles du fournisseur (0016) : ses produits, vendus en caisse en plus du devis ----------
const versArticle = (a) => ({ ...a, prix_unitaire: Number(a.prix_unitaire), prix_comptoir: a.prix_comptoir == null ? null : Number(a.prix_comptoir), stock: a.stock == null ? null : Number(a.stock) })
export async function listerArticles() {
  const { data, error } = await supabase.from('articles_fournisseur').select('*').order('libelle')
  if (error) throw erreurSql(error, '0016')
  return data.map(versArticle)
}
export async function enregistrerArticle(fournisseurId, a) {
  const champs = { libelle: a.libelle.trim(), unite: a.unite.trim(), prix_unitaire: a.prix_unitaire, prix_comptoir: a.prix_comptoir ?? null, stock: a.stock, rupture: !!a.rupture, vendu: a.vendu !== false, mis_a_jour_le: new Date().toISOString() }
  const requete = a.id
    ? supabase.from('articles_fournisseur').update(champs).eq('id', a.id)
    : supabase.from('articles_fournisseur').insert({ ...champs, fournisseur_id: fournisseurId })
  const { data, error } = await requete.select().single()
  if (error) throw erreurSql(error, '0016')
  return versArticle(data)
}
export async function supprimerArticle(id) {
  const { error } = await supabase.from('articles_fournisseur').delete().eq('id', id)
  if (error) throw erreurSql(error, '0016')
}

// ---------- Promotions (0014) ----------
export async function listerPromotions() {
  const { data, error } = await supabase.from('promotions_fournisseur').select('*').order('cree_le', { ascending: false })
  if (error) throw erreurSql(error, '0014')
  return data.map((p) => ({ ...p, valeur: Number(p.valeur) }))
}
export async function enregistrerPromotion(fournisseurId, p) {
  const champs = { libelle: p.libelle.trim(), code: p.code ? p.code.trim().toUpperCase() : null, type: p.type, valeur: p.valeur, materiau_id: p.materiau_id || null, debut: p.debut, fin: p.fin || null, actif: p.actif }
  const requete = p.id
    ? supabase.from('promotions_fournisseur').update(champs).eq('id', p.id)
    : supabase.from('promotions_fournisseur').insert({ ...champs, fournisseur_id: fournisseurId })
  const { data, error } = await requete.select().single()
  if (error) throw new Error(/idx_promotions_code|duplicate/.test(error.message) ? 'Ce code est déjà utilisé par une autre de vos promotions.' : erreurSql(error, '0014').message)
  return { ...data, valeur: Number(data.valeur) }
}
export async function supprimerPromotion(id) {
  const { error } = await supabase.from('promotions_fournisseur').delete().eq('id', id)
  if (error) throw erreurSql(error, '0014')
}
/** Valable aujourd'hui : active, commencée, pas terminée */
export function promotionValable(p, jour = new Date()) {
  const iso = `${jour.getFullYear()}-${String(jour.getMonth() + 1).padStart(2, '0')}-${String(jour.getDate()).padStart(2, '0')}`
  return p.actif && p.debut <= iso && (!p.fin || p.fin >= iso)
}

// ---------- Reversements à BTM (0014) ----------
export async function lireRibBtm() {
  const { data, error } = await supabase.rpc('rib_btm')
  if (error) throw erreurSql(error, '0014')
  return data
}
export async function listerReversements() {
  const { data, error } = await supabase.from('reversements').select('*').order('declare_le', { ascending: false })
  if (error) throw erreurSql(error, '0014')
  return data.map((r) => ({ ...r, montant: Number(r.montant) }))
}
export async function declarerReversement(montant, reference) {
  const { data, error } = await supabase.rpc('declarer_reversement', { p_montant: montant, p_reference: reference })
  if (error) throw erreurSql(error, '0014')
  return { ...data, montant: Number(data.montant) }
}

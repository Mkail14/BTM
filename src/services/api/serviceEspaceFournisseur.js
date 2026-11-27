/**
 * Espace fournisseur : devis qui ont choisi l'entreprise, retrait au comptoir par code, encaissement
 * tracé (reçu numéroté + journal), fiche de l'annuaire, catalogue, promotions, virements avec BTM.
 * L'API limite tout à la fiche liée au compte : un fournisseur ne voit jamais les devis d'un concurrent.
 */
import { api } from './client.js'
import { normaliserResultat } from '@/services/calculs/moteurCalculs.js'
import { arrondi } from '@/services/calculs/utilitaires.js'

const E = '/espace-fournisseur'

export const MOYENS = {
  carte: { libelle: 'Carte bancaire (TPE)', court: 'Carte', icone: 'fa-solid fa-credit-card', reference: 'N° de transaction du ticket TPE', exemple: 'ex. 004512' },
  especes: { libelle: 'Espèces', court: 'Espèces', icone: 'fa-solid fa-money-bill-wave' },
  virement: { libelle: 'Virement', court: 'Virement', icone: 'fa-solid fa-building-columns', reference: 'Référence du virement', exemple: 'ex. VIR-2026-0912' },
  cheque: { libelle: 'Chèque', court: 'Chèque', icone: 'fa-solid fa-money-check', reference: 'N° du chèque', exemple: 'ex. 1234567' }
}

// ---------- Fiche de l'annuaire ----------
export const lireMaFiche = () => api.get(`${E}/fiche`)

/** Coordonnées et présentation de la fiche ; nom, catégorie et visibilité restent à l'admin */
export const modifierMaFiche = (f) => api.put(`${E}/fiche`, {
  telephone: f.telephone, email: f.email || null, adresse: f.adresse || null, commune: f.commune, site_web: f.site_web || null,
  description: f.description || null, horaires: f.horaires || null, logo_url: f.logo_url || null, livraison: !!f.livraison,
  livraison_payante: !!f.livraison_payante, livraison_tarif: f.livraison_tarif || null
})

// ---------- Avis des clients ----------
/** Demandes d'avis envoyées par le fournisseur et réponses des clients (les plus récentes d'abord) */
export const listerMesAvis = () => api.get(`${E}/avis`)
/** Demande au client d'un encaissement de noter l'entreprise (renvoie la demande existante si déjà faite) */
export const demanderAvis = (paiementId) => api.post(`${E}/avis/demander`, { paiement_id: paiementId })

// ---------- Devis et encaissements ----------
export async function listerMesDevis() {
  return (await api.get(`${E}/devis`)).map((p) => ({ ...p, resultat: normaliserResultat(p.resultat) }))
}
export const listerMesPaiements = () => api.get(`${E}/paiements`)
/** Journal des opérations (encaissements et annulations), le plus récent d'abord */
export const listerJournal = () => api.get(`${E}/journal`)

/** Code tapé au comptoir (casse, espaces et tiret indifférents) → devis, s'il est pour ce fournisseur ou sans fournisseur */
export async function trouverDevisParCode(code) {
  const data = await api.post(`${E}/retrait/rechercher`, { code })
  // code inconnu : l'API répond null (l'essai est compté contre la devinette des codes)
  if (!data) throw new Error('Aucun devis ne correspond à ce code.')
  return { ...data, resultat: normaliserResultat(data.resultat) }
}

/**
 * Encaisse les quantités remises (0 = non fourni), aux prix du catalogue du fournisseur, avec une promotion
 * éventuelle. Le montant est recalculé par l'API ; `calculerEncaissement` ci-dessous n'en est que l'affichage.
 */
export const encaisserDevis = ({ projetId, lignes, articles = [], moyen, reference, montantRecu, promotionId, credit = 0 }) =>
  api.post(`${E}/retrait/encaisser`, {
    projet_id: projetId, lignes: (lignes || []).map((l) => ({ id: l.id, quantite: Number(l.quantite) || 0 })),
    articles: (articles || []).map((a) => ({ id: a.id, quantite: Number(a.quantite) || 0 })),
    moyen, reference: reference || null, montant_recu: montantRecu ?? null, promotion_id: promotionId || null, credit: credit || 0
  })

export async function annulerEncaissement(projetId, motif) {
  await api.post(`${E}/retrait/annuler`, { projet_id: projetId, motif })
}

/**
 * Même calcul que l’encaissement de l’API (encaissementService) : quantités remises × prix du catalogue (sinon prix du devis),
 * articles du fournisseur ajoutés, promotion du fournisseur, code promo BTM du client (une fois par compte)
 * et crédit fidélité utilisé. Le client ne paie aucun frais : la commission BTM (en % du montant après
 * promotion) est à la charge du fournisseur et affichée à part.
 * @param {object} quantites { [materiauId]: quantité remise }
 * @param {object} catalogue { [materiauId]: { vendu, rupture, prix_unitaire, stock } }
 * @param {Array} articles [{ id, libelle, unite, prix_unitaire, stock, quantite }] articles vendus en plus
 */
export function calculerEncaissement(resultat, quantites = {}, catalogue = {}, promotion = null, { articles = [], codeBtmIgnore = false, tauxCommission = 0, credit = 0, remiseDejaAppliquee = 0 } = {}) {
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
    // code en € : partagé entre les fournisseurs du devis (déjà offert chez un autre = déduit)
    const brut = r.type === 'montant' ? Number(r.valeur) - remiseDejaAppliquee : (net * Number(r.valeur)) / 100
    reduction = arrondi(Math.min(net, Math.max(0, brut))) // payée par BTM : déduite de la commission, ou remboursée au fournisseur
  }
  const creditUtilise = arrondi(Math.min(Math.max(0, Number(credit) || 0), net - reduction))
  const stockInsuffisant = fournies.filter((l) => l.stock != null && l.quantite > Number(l.stock))
  return {
    lignes, extras, fournies, materiaux, remiseFournisseur, taux, commission, reduction, creditUtilise, remise: r || null,
    codeBtmIgnore: !!(r && codeBtmIgnore), montant: arrondi(net - reduction - creditUtilise), stockInsuffisant
  }
}

// ---------- Catalogue du fournisseur ----------
/** Matériaux BTM (prix de référence) */
export const listerMateriauxBtm = () => api.get('/materiaux')
export const listerMonCatalogue = () => api.get(`${E}/catalogue`)
// Photo et description du produit : envoyées seulement quand le formulaire du produit les donne,
// pour qu'un import de fichier ou un simple « rupture » n'efface jamais la photo déjà mise en ligne
const photoEtDescription = (p) => ({
  ...('photo_url' in p ? { photo_url: p.photo_url || null } : {}),
  ...('description' in p ? { description: String(p.description ?? '').trim().slice(0, 300) || null } : {})
})
export async function enregistrerCatalogue(_fournisseurId, lignes) {
  await api.put(`${E}/catalogue`, { lignes: lignes.map((l) => ({
    materiau_id: l.materiau_id, vendu: !!l.vendu, rupture: !!l.rupture, prix_unitaire: l.prix_unitaire ?? null,
    prix_comptoir: l.prix_comptoir ?? null, stock: l.stock ?? null, ...photoEtDescription(l)
  })) })
}

// ---------- Articles du fournisseur : ses produits, vendus en caisse en plus du devis ----------
const champsArticle = (a) => ({
  libelle: a.libelle.trim(), unite: a.unite.trim(), prix_unitaire: a.prix_unitaire, prix_comptoir: a.prix_comptoir ?? null,
  stock: a.stock ?? null, rupture: !!a.rupture, vendu: a.vendu !== false
})
export const listerArticles = () => api.get(`${E}/articles`)
export const enregistrerArticle = (_fournisseurId, a) => (a.id
  ? api.put(`${E}/articles/${a.id}`, { ...champsArticle(a), ...photoEtDescription(a) })
  : api.post(`${E}/articles`, { ...champsArticle(a), ...photoEtDescription(a) }))
/** Import de fichier : ajoute les nouveaux articles et met à jour les existants, en une requête */
export async function importerArticles(_fournisseurId, nouveaux, modifies) {
  await api.post(`${E}/articles/import`, { nouveaux: nouveaux.map(champsArticle), modifies: modifies.map((a) => ({ id: a.id, ...champsArticle(a) })) })
}
export async function supprimerArticle(id) {
  await api.delete(`${E}/articles/${id}`)
}

// ---------- Promotions ----------
export const listerPromotions = () => api.get(`${E}/promotions`)
export function enregistrerPromotion(_fournisseurId, p) {
  const champs = { libelle: p.libelle.trim(), code: p.code ? p.code.trim().toUpperCase() : null, type: p.type, valeur: p.valeur, materiau_id: p.materiau_id || null, debut: p.debut, fin: p.fin || null, actif: !!p.actif }
  return p.id ? api.put(`${E}/promotions/${p.id}`, champs) : api.post(`${E}/promotions`, champs)
}
export async function supprimerPromotion(id) {
  await api.delete(`${E}/promotions/${id}`)
}
/** Valable aujourd'hui : active, commencée, pas terminée */
export function promotionValable(p, jour = new Date()) {
  const iso = `${jour.getFullYear()}-${String(jour.getMonth() + 1).padStart(2, '0')}-${String(jour.getDate()).padStart(2, '0')}`
  return p.actif && p.debut <= iso && (!p.fin || p.fin >= iso)
}

// ---------- Virements avec BTM ----------
export const lireRibBtm = () => api.get(`${E}/rib-btm`)
export const listerReversements = () => api.get(`${E}/virements`)
/** Virement fait vers BTM : compté tout de suite, sans validation */
export const declarerReversement = (montant, reference) => api.post(`${E}/virements`, { montant, reference })

// ---------- RIB du fournisseur (BTM y rembourse les codes promo BTM qui dépassent la commission) ----------
export const lireMonRib = () => api.get(`${E}/rib`)
/** iban vide : retire le RIB */
export const enregistrerMonRib = ({ titulaire, iban, bic, banque }) =>
  api.put(`${E}/rib`, { titulaire: titulaire || null, iban: iban || null, bic: bic || null, banque: banque || null })
export const supprimerMonRib = () => enregistrerMonRib({ titulaire: '', iban: '' })

/**
 * useEspaceFournisseur — données partagées par les sections de l'espace fournisseur, chargées une fois :
 * fiche, devis qui ont choisi l'entreprise, encaissements, journal, catalogue (prix et stock),
 * promotions, reversements à BTM et RIB de BTM.
 * Vidées à chaque changement de compte : les données d'un fournisseur n'apparaissent jamais chez un autre.
 */
import { computed, ref } from 'vue'
import { useAuth, surChangementCompte } from '@/composables/useAuth.js'
import * as api from '@/services/supabase/serviceEspaceFournisseur.js'

const fiche = ref(null)
const devis = ref(null)       // null = pas encore chargé
const paiements = ref([])
const journal = ref([])
const materiauxBtm = ref([])
const catalogueListe = ref([])
const articles = ref([])      // produits propres au fournisseur (0016)
const promotions = ref([])
const reversements = ref([])
const rib = ref(null)
const erreur = ref('')
const journalIndisponible = ref(false) // migration 0013 absente

surChangementCompte(() => {
  fiche.value = null; devis.value = null; paiements.value = []; journal.value = []; erreur.value = ''
  catalogueListe.value = []; articles.value = []; promotions.value = []; reversements.value = []; rib.value = null
})

const paiementDe = computed(() => Object.fromEntries(paiements.value.filter((p) => p.projet_id).map((p) => [p.projet_id, p])))
/** Devis dont le client a choisi ce fournisseur, pas encore encaissés */
const enAttente = computed(() => (devis.value || []).filter((d) => !paiementDe.value[d.id]))
/** { [materiauId]: { vendu, prix_unitaire, stock } } */
const catalogue = computed(() => Object.fromEntries(catalogueListe.value.map((c) => [c.materiau_id, c])))
const promotionsValables = computed(() => promotions.value.filter((p) => api.promotionValable(p)))
/** Matériaux BTM et articles en rupture (tableau de bord, caisse) */
const ruptures = computed(() => [
  ...catalogueListe.value.filter((c) => c.vendu && (c.rupture || c.stock === 0)).map((c) => materiauxBtm.value.find((m) => m.id === c.materiau_id)?.libelle || c.materiau_id),
  ...articles.value.filter((a) => a.vendu && (a.rupture || a.stock === 0)).map((a) => a.libelle)
])

// Reversements : frais BTM encaissés − virements déjà faits (pris en compte dès leur déclaration)
const somme = (liste, champ) => Math.round(liste.reduce((s, x) => s + (Number(x[champ]) || 0), 0) * 100) / 100
const soldeBtm = computed(() => {
  const du = somme(paiements.value, 'revenu_btm')
  const reverse = somme(reversements.value.filter((r) => r.statut === 'valide'), 'montant')
  return { du, reverse, reste: Math.max(0, Math.round((du - reverse) * 100) / 100) }
})

/** Charge une donnée facultative sans bloquer le reste (migration absente, réseau…) */
const tenter = async (promesse, repli) => { try { return await promesse } catch (e) { console.warn(e); return repli } }

export function useEspaceFournisseur() {
  const { fournisseurLie, utilisateur } = useAuth()

  async function charger() {
    if (!fournisseurLie.value) return
    erreur.value = ''
    try {
      const [f, d, p] = await Promise.all([api.lireMaFiche(fournisseurLie.value), api.listerMesDevis(fournisseurLie.value), api.listerMesPaiements()])
      fiche.value = f; devis.value = d; paiements.value = p
    } catch (e) {
      console.warn(e)
      erreur.value = 'Impossible de charger vos données pour le moment.'
      devis.value = devis.value || []
    }
    const [m, c, pr, rv, rb, ar] = await Promise.all([
      tenter(api.listerMateriauxBtm(), []), tenter(api.listerMonCatalogue(), []), tenter(api.listerPromotions(), []),
      tenter(api.listerReversements(), []), tenter(api.lireRibBtm(), null), tenter(api.listerArticles(), []), chargerJournal()
    ])
    materiauxBtm.value = m; catalogueListe.value = c; promotions.value = pr; reversements.value = rv; rib.value = rb; articles.value = ar
  }

  async function chargerJournal() {
    try {
      journal.value = await api.listerJournal()
      journalIndisponible.value = false
    } catch (e) {
      console.warn(e)
      journalIndisponible.value = true
    }
  }
  const rechargerCatalogue = async () => {
    const [c, a] = await Promise.all([tenter(api.listerMonCatalogue(), catalogueListe.value), tenter(api.listerArticles(), articles.value)])
    catalogueListe.value = c; articles.value = a
  }
  const rechargerPromotions = async () => { promotions.value = await tenter(api.listerPromotions(), promotions.value) }

  /** Après un encaissement : le paiement rejoint la liste ; journal, stock et compteurs de promotions relus */
  function ajouterPaiement(p) {
    paiements.value = [p, ...paiements.value.filter((x) => x.projet_id !== p.projet_id)]
    chargerJournal(); rechargerCatalogue(); rechargerPromotions()
  }
  function retirerPaiement(projetId) {
    paiements.value = paiements.value.filter((x) => x.projet_id !== projetId)
    chargerJournal(); rechargerCatalogue(); rechargerPromotions()
  }

  const nomCompte = computed(() => {
    const m = utilisateur.value?.user_metadata || {}
    return [m.prenom, m.nom].filter(Boolean).join(' ') || m.pseudo || utilisateur.value?.email?.split('@')[0] || 'Fournisseur'
  })

  return {
    fiche, devis, paiements, journal, erreur, journalIndisponible, paiementDe, enAttente, nomCompte,
    materiauxBtm, catalogueListe, catalogue, articles, ruptures, promotions, promotionsValables, reversements, rib, soldeBtm,
    charger, chargerJournal, rechargerCatalogue, rechargerPromotions, ajouterPaiement, retirerPaiement
  }
}

export const formatDate = (d, o = { day: 'numeric', month: 'long', year: 'numeric' }) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Indian/Mayotte', ...o }).format(new Date(d))
export const formatHeure = (d) => formatDate(d, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

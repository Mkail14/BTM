/**
 * useCalculateur — état du calcul en cours (type, dimensions, résultat, erreurs).
 * Persisté en sessionStorage (section 12).
 */
import { ref, reactive, computed, shallowRef, toRaw } from 'vue'
import { calculerEstimation, validerDimensions, normaliserResultat, appliquerCodePromo, MESSAGES } from '@/services/calculs/moteurCalculs.js'
import { fusionnerResultats, TYPE_ACHAT } from '@/services/calculs/fusion.js'
import { arrondi } from '@/services/calculs/utilitaires.js'
import { lireCalcul, ecrireCalcul, effacerCalcul, mettreDeCoteCalcul, reprendreCalculMisDeCote, oublierCalculMisDeCote } from '@/services/stockage/stockageCalcul.js'
import { chargerCatalogue } from '@/services/supabase/serviceMateriaux.js'
import { trouverTypeProjet } from '@/donnees/typesProjets.js'
import { useContenuSite, chargerContenus } from '@/composables/useContenuSite.js'
import { surChangementCompte } from '@/composables/useAuth.js'
import { verifierCode, codeDejaUtilise } from '@/services/supabase/serviceCodesPromo.js'
import { utilisateurCourant } from '@/services/supabase/serviceAuth.js'

// État partagé (singleton module) — reste vivant entre les vues.
// Onglet neuf (lien de confirmation d'inscription) : on reprend le devis que le visiteur avait mis de côté.
const misDeCote = lireCalcul() ? null : reprendreCalculMisDeCote()
const sauvegarde = lireCalcul() || misDeCote
if (misDeCote) ecrireCalcul(misDeCote)
const typeId = ref(sauvegarde?.typeId || '')
const dimensions = reactive({ ...(sauvegarde?.dimensions || {}) })
const resultat = ref(normaliserResultat(sauvegarde?.resultat) || null)
const fournisseurId = ref(sauvegarde?.fournisseurId || '')
// code promo appliqué au devis ({ code, type, valeur, portee }), revérifié à chaque calcul
const codePromo = ref(sauvegarde?.codePromo || null)
// Devis pro : estimations déjà ajoutées au devis (ouvrages mesurés ou achats directs), sans code promo
const cumul = ref(sauvegarde?.cumul || [])
const messageCode = ref('')
// Code de retrait du projet enregistré affiché : valable tant que le résultat affiché est exactement celui du projet
// (un nouveau calcul produit un autre objet résultat, donc plus de code)
const retrait = shallowRef(null) // { code, resultat }
const codeRetrait = computed(() => (retrait.value && resultat.value && toRaw(resultat.value) === retrait.value.resultat ? retrait.value.code : ''))
function associerCodeRetrait(code) { retrait.value = code && resultat.value ? { code, resultat: toRaw(resultat.value) } : null }
const erreurs = reactive({})
const erreurGlobale = ref('')
const chargement = ref(false)
const sourcePrix = ref('local')
let catalogue = null
const contenu = useContenuSite()

function viderCalcul() {
  typeId.value = ''
  for (const k of Object.keys(dimensions)) delete dimensions[k]
  for (const k of Object.keys(erreurs)) delete erreurs[k]
  resultat.value = null
  fournisseurId.value = ''
  codePromo.value = null
  messageCode.value = ''
  erreurGlobale.value = ''
  cumul.value = []
  effacerCalcul()
  oublierCalculMisDeCote()
}

/** Le devis affiché : l'estimation en cours, ou (pro) toutes les estimations cumulées réunies, code promo appliqué */
const devis = computed(() => {
  if (!cumul.value.length) return resultat.value
  const fusion = fusionnerResultats([...cumul.value, resultat.value].filter(Boolean))
  return fusion ? appliquerCodePromo(fusion, codePromo.value) : null
})

// Déconnexion ou passage à un autre compte : le devis en cours du compte précédent disparaît.
// Un visiteur qui se connecte (aucun compte avant) garde son devis : il se connecte justement pour l'enregistrer.
surChangementCompte((nouveau, ancien) => { if (ancien) viderCalcul() })

/** Code promo d'un projet enregistré (celui utilisé dans son devis) */
const projetCode = (projet) => {
  const r = projet?.resultat?.remise
  return r ? { code: r.code, type: r.type, valeur: r.valeur, portee: r.portee } : null
}

/** Première réponse entre la promesse et le délai (valeur de repli si le délai gagne) */
const avecDelai = (promesse, ms, repli) => Promise.race([promesse, new Promise((r) => setTimeout(() => r(repli), ms))])

/** L'admin vient de modifier des prix : le prochain calcul relira le catalogue */
export function oublierCatalogue() { catalogue = null }

const etatCalcul = () => ({ typeId: typeId.value, dimensions: { ...dimensions }, resultat: resultat.value, fournisseurId: fournisseurId.value, codePromo: codePromo.value, cumul: cumul.value })
function persister() {
  ecrireCalcul(etatCalcul())
}

export function useCalculateur() {
  const type = computed(() => trouverTypeProjet(typeId.value))

  function choisirType(id) {
    if (typeId.value === id) return
    typeId.value = id
    for (const k of Object.keys(dimensions)) delete dimensions[k]
    for (const k of Object.keys(erreurs)) delete erreurs[k]
    const t = trouverTypeProjet(id)
    t?.champs.forEach((c) => { if (c.type === 'select') dimensions[c.nom] = c.defaut })
    resultat.value = null
    erreurGlobale.value = ''
    persister()
  }

  function definirDimensions(nouvelles) {
    Object.assign(dimensions, nouvelles)
    persister()
  }

  function ajouterMur() {
    dimensions.autresMurs = [...(dimensions.autresMurs || []), { longueur: '', hauteur: '', ouvertures: '' }]
    persister()
  }

  function retirerMur(index) {
    dimensions.autresMurs = (dimensions.autresMurs || []).filter((_, i) => i !== index)
    // les indices des murs suivants changent : on retire leurs erreurs
    for (const k of Object.keys(erreurs)) if (k.startsWith('autresMurs.')) delete erreurs[k]
    persister()
  }

  function validerChamp(nom) {
    const { erreurs: e } = validerDimensions(typeId.value, dimensions)
    if (e[nom]) erreurs[nom] = e[nom]
    else delete erreurs[nom]
    persister()
  }

  async function calculer() {
    erreurGlobale.value = ''
    const { valide, erreurs: e } = validerDimensions(typeId.value, dimensions)
    for (const k of Object.keys(erreurs)) delete erreurs[k]
    Object.assign(erreurs, e)
    if (!valide) return false

    chargement.value = true
    try {
      // Le calcul ne doit jamais rester bloqué sur le réseau : sans réponse de Supabase à temps,
      // on calcule avec les prix locaux et le taux de frais par défaut (et on réessaiera au prochain calcul)
      // prix, taux des frais et petite latence volontaire (10.2) en parallèle : 3 s d'attente au plus
      // le code promo est revérifié (l'admin a pu le désactiver, il a pu expirer) ;
      // sans réponse de Supabase, on garde le code déjà validé plutôt que de le retirer à tort
      const [c, codeVerifie] = await Promise.all([
        catalogue ? null : avecDelai(chargerCatalogue(), 3000, null),
        codePromo.value ? avecDelai(verifierCode(codePromo.value.code).catch(() => 'injoignable'), 3000, 'injoignable') : null,
        avecDelai(chargerContenus(), 3000, null),
        new Promise((r) => setTimeout(r, 450))
      ])
      if (c) { catalogue = c.catalogue; sourcePrix.value = c.source }
      else if (!catalogue) console.warn('Prix Supabase trop longs à charger : prix locaux utilisés pour ce calcul')
      if (codePromo.value && codeVerifie === null) {
        messageCode.value = `Le code ${codePromo.value.code} n’est plus valable : il a été retiré du devis.`
        codePromo.value = null
      } else if (codeVerifie && codeVerifie !== 'injoignable') {
        codePromo.value = codeVerifie // réduction à jour si l'admin l'a modifiée
      }
      resultat.value = calculerEstimation(typeId.value, dimensions, { catalogue, remise: codePromo.value })
      persister()
      return true
    } catch (err) {
      console.error(err)
      erreurGlobale.value = MESSAGES.erreurCalcul
      return false
    } finally {
      chargement.value = false
    }
  }

  /**
   * Applique un code promo au devis en cours puis recalcule.
   * @returns {Promise<string>} '' si appliqué, sinon le message d'erreur à afficher
   */
  async function appliquerCode(saisie) {
    messageCode.value = ''
    let code
    try {
      code = await verifierCode(saisie)
    } catch (e) {
      console.warn(e)
      return 'Vérification impossible pour le moment, réessayez dans un instant.'
    }
    if (!code) return 'Ce code n’existe pas ou n’est plus valable.'
    if (code.portee === 'frais') return 'Ce code portait sur les frais de service, qui n’existent plus : BTM est gratuit pour vous.'
    // usage unique par compte : il faut être connecté, et ne pas l'avoir déjà utilisé
    if (!(await utilisateurCourant())) return 'Connectez-vous pour utiliser un code promo : il ne sert qu’une fois par compte.'
    if (await codeDejaUtilise(code.code)) return 'Vous avez déjà utilisé ce code : il ne sert qu’une fois par compte.'
    codePromo.value = code
    if (sansFormulaire()) { resultat.value = appliquerCodePromo(resultat.value, code); persister(); return '' }
    return (await calculer()) ? '' : 'Le devis n’a pas pu être recalculé.'
  }

  async function retirerCode() {
    codePromo.value = null
    messageCode.value = ''
    if (sansFormulaire()) { resultat.value = appliquerCodePromo(resultat.value, null); persister(); return }
    await calculer()
  }

  /** Achat direct, devis pro : pas de formulaire à recalculer */
  const sansFormulaire = () => !!resultat.value && !trouverTypeProjet(resultat.value.type)

  /**
   * « Je sais ce qu'il me faut » : devis à partir de quantités choisies, sans mesures.
   * @param {Array} choix [{ id, libelle, unite, prixUnitaire, quantite }]
   */
  function achatDirect(choix) {
    const lignes = choix.filter((l) => Number(l.quantite) > 0).map((l) => ({
      id: l.id, libelle: l.libelle, unite: l.unite, quantite: arrondi(Number(l.quantite), 3), prixUnitaire: l.prixUnitaire, sousTotal: arrondi(Number(l.quantite) * l.prixUnitaire)
    }))
    const totalMateriaux = arrondi(lignes.reduce((s, l) => s + l.sousTotal, 0))
    typeId.value = ''
    for (const k of Object.keys(dimensions)) delete dimensions[k]
    resultat.value = appliquerCodePromo({
      type: TYPE_ACHAT, typeLibelle: 'Achat direct', calculeLe: new Date().toISOString(), dimensions: {}, lignes, totalMateriaux, total: totalMateriaux,
      mesures: [{ label: 'Matériaux', valeur: lignes.length, unite: '', principale: true }]
    }, codePromo.value)
    persister()
  }

  /** Devis pro : l'estimation en cours rejoint le devis, on peut en calculer une autre */
  function ajouterAuDevis() {
    if (!resultat.value) return
    cumul.value = [...cumul.value, appliquerCodePromo(resultat.value, null)]
    typeId.value = ''
    for (const k of Object.keys(dimensions)) delete dimensions[k]
    resultat.value = null
    persister()
  }
  /** Retire un ouvrage du devis pro (index dans la liste affichée : cumul puis estimation en cours) */
  function retirerDuDevis(index) {
    if (index < cumul.value.length) cumul.value = cumul.value.filter((_, i) => i !== index)
    else if (cumul.value.length) { resultat.value = cumul.value.at(-1); cumul.value = cumul.value.slice(0, -1) }
    persister()
  }

  function choisirFournisseur(id) {
    fournisseurId.value = id
    persister()
  }

  /** Recharge un projet sauvegardé (BF29/BF30 : duplication modifiable) */
  function chargerDepuisProjet(projet) {
    typeId.value = projet.type
    for (const k of Object.keys(dimensions)) delete dimensions[k]
    Object.assign(dimensions, projet.dimensions || {})
    resultat.value = null
    fournisseurId.value = projet.fournisseur_id || ''
    codePromo.value = projetCode(projet) // revérifié au prochain calcul
    for (const k of Object.keys(erreurs)) delete erreurs[k]
    persister()
  }

  function afficherResultat(projet) {
    typeId.value = projet.type
    for (const k of Object.keys(dimensions)) delete dimensions[k]
    Object.assign(dimensions, projet.dimensions || {})
    resultat.value = normaliserResultat(projet.resultat)
    associerCodeRetrait(projet.code_retrait)
    codePromo.value = projetCode(projet)
    fournisseurId.value = projet.fournisseur_id || ''
    persister()
  }

  const reinitialiser = viderCalcul

  /** Inscription d'un visiteur : son devis le suivra dans l'onglet ouvert par le lien de confirmation */
  function mettreDeCote() {
    if (resultat.value || cumul.value.length) mettreDeCoteCalcul(etatCalcul())
  }
  /** Devis enregistré dans le compte : la copie mise de côté a servi (pas à la connexion : l'autre onglet ne l'a peut-être pas encore lue) */
  const oublierMiseDeCote = oublierCalculMisDeCote

  return {
    typeId, type, dimensions, resultat, devis, cumul, erreurs, erreurGlobale, chargement, fournisseurId, sourcePrix, codePromo, messageCode, codeRetrait, associerCodeRetrait,
    achatDirect, ajouterAuDevis, retirerDuDevis,
    choisirType, definirDimensions, ajouterMur, retirerMur, validerChamp, calculer, choisirFournisseur,
    chargerDepuisProjet, afficherResultat, reinitialiser, appliquerCode, retirerCode, mettreDeCote, oublierMiseDeCote
  }
}

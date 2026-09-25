/**
 * useCalculateur — état du calcul en cours (type, dimensions, résultat, erreurs).
 * Persisté en sessionStorage (section 12).
 */
import { ref, reactive, computed } from 'vue'
import { calculerEstimation, validerDimensions, MESSAGES } from '@/services/calculs/moteurCalculs.js'
import { lireCalcul, ecrireCalcul, effacerCalcul } from '@/services/stockage/stockageCalcul.js'
import { chargerCatalogue } from '@/services/supabase/serviceMateriaux.js'
import { trouverTypeProjet } from '@/donnees/typesProjets.js'

// État partagé (singleton module) — reste vivant entre les vues
const sauvegarde = lireCalcul()
const typeId = ref(sauvegarde?.typeId || '')
const dimensions = reactive({ ...(sauvegarde?.dimensions || {}) })
const resultat = ref(sauvegarde?.resultat || null)
const fournisseurId = ref(sauvegarde?.fournisseurId || '')
const erreurs = reactive({})
const erreurGlobale = ref('')
const chargement = ref(false)
const sourcePrix = ref('local')
let catalogue = null

function persister() {
  ecrireCalcul({ typeId: typeId.value, dimensions: { ...dimensions }, resultat: resultat.value, fournisseurId: fournisseurId.value })
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
      if (!catalogue) {
        const c = await chargerCatalogue()
        catalogue = c.catalogue
        sourcePrix.value = c.source
      }
      // petite latence volontaire pour l'état de chargement (10.2)
      await new Promise((r) => setTimeout(r, 450))
      resultat.value = calculerEstimation(typeId.value, dimensions, { catalogue })
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
    for (const k of Object.keys(erreurs)) delete erreurs[k]
    persister()
  }

  function afficherResultat(projet) {
    typeId.value = projet.type
    for (const k of Object.keys(dimensions)) delete dimensions[k]
    Object.assign(dimensions, projet.dimensions || {})
    resultat.value = projet.resultat
    fournisseurId.value = projet.fournisseur_id || ''
    persister()
  }

  function reinitialiser() {
    typeId.value = ''
    for (const k of Object.keys(dimensions)) delete dimensions[k]
    for (const k of Object.keys(erreurs)) delete erreurs[k]
    resultat.value = null
    fournisseurId.value = ''
    erreurGlobale.value = ''
    effacerCalcul()
  }

  return {
    typeId, type, dimensions, resultat, erreurs, erreurGlobale, chargement, fournisseurId, sourcePrix,
    choisirType, definirDimensions, ajouterMur, retirerMur, validerChamp, calculer, choisirFournisseur,
    chargerDepuisProjet, afficherResultat, reinitialiser
  }
}

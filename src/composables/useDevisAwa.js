/**
 * useDevisAwa — le devis fait dans la discussion avec Awa, sans passer par le calculateur.
 * Awa pose les questions du formulaire (celles de `typesProjets`), calcule avec le même moteur et les mêmes prix
 * que le calculateur, puis enregistre le projet dans « Mes projets » : dans le compte s'il est connecté, sinon sur
 * l'appareil (il rejoint le compte à la prochaine connexion, comme tout projet créé sans compte).
 * Tout se passe dans le navigateur : ces messages ne sont pas envoyés à l'assistante IA du serveur.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { typesProjets, trouverTypeProjet } from '@/donnees/typesProjets.js'
import { calculerEstimation, validerDimensions, resumerDimensions, formaterEuros, formaterQuantite, formaterNombre } from '@/services/calculs/moteurCalculs.js'
import { chargerCatalogue } from '@/services/supabase/serviceMateriaux.js'
import { exporterEstimationPdf } from '@/services/export/exportPdf.js'
import { useProjets } from '@/composables/useProjets.js'
import { useCalculateur } from '@/composables/useCalculateur.js'

const sansAccent = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// mots qui désignent un ouvrage dans une phrase (les identifiants des ouvrages sont fixes)
const MOTS_OUVRAGES = { mur: ['mur', 'cloture', 'parpaing'], dalle: ['dalle'], fondation: ['fondation', 'semelle', 'tranchee'], terrasse: ['terrasse'] }
function ouvrageDans(texte) {
  const t = sansAccent(texte)
  return typesProjets.find((type) => [sansAccent(type.libelle), ...(MOTS_OUVRAGES[type.id] || [])].some((mot) => new RegExp(`\\b${mot}s?\\b`).test(t))) || null
}

/**
 * « Fais-moi un devis pour un mur », « combien coûte une dalle de 8 m sur 6 ? » : une demande de nouveau devis,
 * qu'Awa traite elle-même. Une question sur un devis existant (retrouvé, payé, code de retrait…) n'en est pas une.
 */
export function demandeDeDevis(texte) {
  const t = sansAccent(texte)
  if (/\b(retrouv|disparu|perdu|supprim|modifi|code|retrait|paiement|paye|enregistr|probleme|erreur|bug|marche pas|recu)/.test(t)) return false
  const nouveau = /\b(devis|estimation)\b/.test(t) && /\b(fai[st]|faire|veux|voudrais|besoin|aimerais|prepare\w*|calcule\w*|chiffre\w*)\b/.test(t)
  const prix = !!ouvrageDans(t) && /\b(combien|prix|cout\w*|devis|chiffr\w*|estim\w*)\b/.test(t)
  return nouveau || prix
}

// ---------- Lecture des réponses ----------
/** Nombres d'une phrase, avec l'unité écrite derrière s'il y en a une : « 10 m sur 2,5 » → [{ n: 10, unite: 'm' }, { n: 2.5 }] */
function nombresDans(texte) {
  return [...String(texte).matchAll(/(\d+(?:[.,]\d+)?)\s*(m²|m2|cm|mm|m(?![a-z²\d]))?/gi)]
    .map((m) => ({ n: parseFloat(m[1].replace(',', '.')), unite: (m[2] || '').toLowerCase().replace('m2', 'm²') }))
}
const EN_METRES = { mm: 0.001, cm: 0.01, m: 1 }
/** Valeur dans l'unité du champ : « 12 cm » pour une longueur en mètres donne 0,12 */
function dansUnite({ n, unite }, champ) {
  let v = unite && EN_METRES[unite] && EN_METRES[champ.unite] ? (n * EN_METRES[unite]) / EN_METRES[champ.unite] : n
  // épaisseur attendue en cm, donnée en mètres sans le dire (« 0,12 ») : on comprend 12 cm
  if (!unite && champ.unite === 'cm' && v < (champ.min ?? 0) && v * 100 <= (champ.max ?? Infinity)) v *= 100
  return Math.round(v * 1000) / 1000
}
function erreurValeur(champ, v) {
  if (!Number.isFinite(v) || (champ.optionnel ? v < 0 : v <= 0)) return 'Il me faut un nombre supérieur à 0.'
  if (champ.min !== undefined && v < champ.min && !(champ.optionnel && v === 0)) return `C’est trop petit : au moins ${formaterNombre(champ.min)} ${champ.unite}.`
  if (champ.max !== undefined && v > champ.max) return `C’est trop grand : au maximum ${formaterNombre(champ.max)} ${champ.unite}.`
  return ''
}
/** « 10 m × 2,5 m » : les mesures données, sans une option laissée à zéro (mur sans ouverture) */
function mesuresDe(type, valeurs) {
  const utiles = Object.fromEntries(Object.entries(valeurs).filter(([nom, v]) => !(type.champs.find((c) => c.nom === nom)?.optionnel && !Number(v))))
  return resumerDimensions(type.id, utiles).replace(/\./g, ',')
}
const UNITES = { m: 'mètres', cm: 'centimètres', 'm²': 'm²' }
function question(champ) {
  if (champ.type === 'select') return champ.question
  const exemple = champ.placeholder ? `, par exemple ${String(champ.placeholder).replace('.', ',')}` : ''
  return `${champ.question}\nRépondez en ${UNITES[champ.unite] || champ.unite}${exemple}.${champ.optionnel ? ' S’il n’y en a pas, dites « aucune ».' : ''}`
}

export function useDevisAwa() {
  const router = useRouter()
  const { sauvegarder } = useProjets()
  const calc = useCalculateur()

  const messages = ref([]) // { id, auteur: 'ia' | 'client', texte, cree_le, local: true }
  // null (pas de devis en cours) | { etape: 'ouvrage' } | { etape: 'champ', type, valeurs, champ } | { etape: 'calcul' }
  const etat = ref(null)
  const dernier = ref(null) // devis terminé : { idMessage, nom, resultat, projet, code, dansCompte }
  const actif = computed(() => !!etat.value)
  const occupe = computed(() => etat.value?.etape === 'calcul')

  let compteur = 0
  function ecrire(auteur, texte) {
    const id = `devis-${++compteur}`
    messages.value.push({ id, auteur, texte, cree_le: new Date().toISOString(), local: true })
    return id
  }
  const dire = (texte) => ecrire('ia', texte)

  /** Réponses proposées en boutons pour la question en cours */
  const choix = computed(() => {
    const e = etat.value
    if (!e || e.etape === 'calcul') return []
    if (e.etape === 'ouvrage') return typesProjets.map((t) => ({ label: t.libelle, icone: t.icone, valeur: t.id }))
    if (e.champ.type === 'select') return e.champ.options.map((o) => ({ label: o.label, valeur: o.valeur }))
    return e.champ.optionnel ? [{ label: 'Aucune', valeur: 0 }] : []
  })

  /** `texte` : la phrase du client quand il a demandé son devis en l'écrivant (l'ouvrage et les mesures y sont lus) */
  function demarrer(texte = '') {
    dernier.value = null
    if (texte) ecrire('client', texte)
    const type = texte ? ouvrageDans(texte) : null
    if (type) return choisirOuvrage(type, texte)
    etat.value = { etape: 'ouvrage' }
    dire('Avec plaisir ! Je fais votre devis ici : quelques questions, et il est enregistré dans « Mes projets ». Quel ouvrage voulez-vous chiffrer ?')
  }

  function choisirOuvrage(type, texte = '') {
    const valeurs = {}
    // mesures déjà données dans la phrase : prises dans l'ordre des questions, tant qu'elles sont plausibles
    const lus = nombresDans(texte)
    for (const [i, champ] of type.champs.filter((c) => c.type !== 'select' && !c.optionnel).entries()) {
      if (!lus[i]) break
      const v = dansUnite(lus[i], champ)
      if (erreurValeur(champ, v)) break
      valeurs[champ.nom] = v
    }
    etat.value = { etape: 'champ', type, valeurs, champ: null }
    const notees = mesuresDe(type, valeurs)
    suivant(notees ? `C’est noté : ${type.libelle.toLowerCase()}, ${notees}. ` : `Très bien, un devis pour : ${type.libelle.toLowerCase()}. `)
  }

  function suivant(debut = '') {
    const e = etat.value
    const champ = e.type.champs.find((c) => e.valeurs[c.nom] === undefined)
    if (!champ) return terminer()
    e.champ = champ
    dire(debut + question(champ))
  }

  /** Clic sur une réponse proposée */
  function choisir(c) {
    const e = etat.value
    if (!e || e.etape === 'calcul') return
    ecrire('client', c.label)
    if (e.etape === 'ouvrage') return choisirOuvrage(trouverTypeProjet(c.valeur))
    e.valeurs[e.champ.nom] = c.valeur
    suivant()
  }

  /** Réponse écrite par le client pendant le devis. Renvoie false si aucun devis n'est en cours. */
  function repondre(texte) {
    const e = etat.value
    if (!e) return false
    if (e.etape === 'calcul') return true // calcul en cours : la saisie attend
    ecrire('client', texte)
    const t = sansAccent(texte).trim()
    if (/^(annule\w*|stop|arrete\w*|laisse tomber|non merci)\b/.test(t)) { annuler(); return true }

    if (e.etape === 'ouvrage') {
      const type = ouvrageDans(t)
      if (type) choisirOuvrage(type, texte)
      else dire(`Je chiffre ${typesProjets.map((x) => x.libelle.toLowerCase()).join(', ')}. Lequel vous intéresse ?`)
      return true
    }

    const champ = e.champ
    if (champ.type === 'select') {
      const option = champ.options.find((o) => t === sansAccent(o.valeur) || t.includes(sansAccent(o.label.split('—')[0]).trim()))
      if (!option) { dire('Choisissez l’une des réponses proposées ci-dessous.'); return true }
      e.valeurs[champ.nom] = option.valeur
    } else {
      const [lu] = nombresDans(texte)
      const aucune = champ.optionnel && /^(aucun\w*|non|pas|rien|zero)\b/.test(t)
      if (!lu && !aucune) { dire(`Je n’ai pas reconnu de nombre. ${question(champ)}`); return true }
      const v = aucune ? 0 : dansUnite(lu, champ)
      const erreur = erreurValeur(champ, v)
      if (erreur) { dire(`${erreur} ${champ.question}`); return true }
      e.valeurs[champ.nom] = v
    }
    suivant()
    return true
  }

  function annuler() {
    etat.value = null
    dire('D’accord, j’arrête ce devis. Dites-moi si vous voulez le reprendre.')
  }

  async function terminer() {
    const { type, valeurs } = etat.value
    // contrôles croisés du moteur (ex. ouvertures plus grandes que le mur) : on repose la question concernée
    const { valide, erreurs } = validerDimensions(type.id, valeurs)
    const fautif = valide ? null : type.champs.find((c) => erreurs[c.nom])
    if (fautif) {
      delete valeurs[fautif.nom]
      etat.value.champ = fautif
      dire(`${erreurs[fautif.nom]}. ${question(fautif)}`)
      return
    }
    etat.value = { etape: 'calcul' }
    try {
      // prix à jour de la base ; sans réponse en 3 s, prix locaux (comme le calculateur)
      const prix = await Promise.race([chargerCatalogue().catch(() => null), new Promise((r) => setTimeout(() => r(null), 3000))])
      const resultat = calculerEstimation(type.id, valeurs, { catalogue: prix?.catalogue })
      const mesures = mesuresDe(type, resultat.dimensions)
      const nom = `${type.libelle} ${mesures} (Awa)`
      const projet = await sauvegarder({ nom, resultat, fournisseur: null })
      const code = projet?.code_retrait || ''
      const lignes = resultat.lignes.map((l) => `• ${l.libelle} : ${formaterQuantite(l.quantite, l.unite)} — ${formaterEuros(l.sousTotal)}`).join('\n')
      const suite = projet?.cloud
        ? `Je l’ai enregistré dans « Mes projets » sous le nom « ${nom} ».${code ? ` Votre code de retrait : ${code}.` : ''}`
        : 'Il est gardé sur cet appareil : connectez-vous (compte gratuit) pour le retrouver dans « Mes projets » et obtenir votre code de retrait.'
      const idMessage = dire(`Voilà votre devis — ${type.libelle.toLowerCase()} ${mesures} :\n${lignes}\nTotal des matériaux : ${formaterEuros(resultat.total)}\n\n${suite} Le PDF est prêt.`)
      dernier.value = { idMessage, nom, resultat, projet, code, dansCompte: !!projet?.cloud }
    } catch (e) {
      console.error(e)
      dire('Je n’ai pas réussi à calculer ce devis. Réessayez dans un instant, ou passez par le calculateur.')
    } finally {
      etat.value = null
    }
  }

  /** @param {'visualiser'|'telecharger'} mode */
  function pdf(mode) {
    const d = dernier.value
    return d ? exporterEstimationPdf({ nom: d.nom, resultat: d.resultat, fournisseur: null, code: d.code }, mode) : null
  }

  /** Ouvre le devis dans la page Résultats : détail, comparaison des fournisseurs, code promo */
  function ouvrir() {
    const d = dernier.value
    if (!d) return
    calc.afficherResultat({ type: d.resultat.type, dimensions: d.resultat.dimensions, resultat: d.resultat, code_retrait: d.code })
    router.push('/resultats')
  }

  function reinitialiser() {
    messages.value = []
    etat.value = null
    dernier.value = null
  }

  return { messages, actif, occupe, choix, dernier, demarrer, choisir, repondre, annuler, pdf, ouvrir, reinitialiser }
}

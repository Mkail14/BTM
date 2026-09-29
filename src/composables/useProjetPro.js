/**
 * useProjetPro — projet professionnel en cours d'édition (ouvrages, nom, fournisseur, code de retrait).
 * Conservé pour l'onglet (sessionStorage) ; rouvert depuis « Mes projets » avec ouvrirProjetPro().
 * Vidé à chaque changement de compte.
 */
import { ref, watch } from 'vue'
import { surChangementCompte } from '@/composables/useAuth.js'
import { creerOuvrage } from '@/services/calculs/projetPro.js'

const CLE = 'btm-projet-pro'
const vide = () => ({ nom: '', ouvrages: [creerOuvrage('maison')], fournisseurId: '' })
function lire() {
  try {
    const p = JSON.parse(sessionStorage.getItem(CLE) || 'null')
    return p?.ouvrages?.length ? p : vide()
  } catch { return vide() }
}

const projet = ref(lire())
/** Projet tel qu'enregistré (JSON), avec son code de retrait : le code n'est valable que si rien n'a changé depuis */
const enregistre = ref(null) // { signature, code, id }

watch(projet, (p) => { try { sessionStorage.setItem(CLE, JSON.stringify(p)) } catch { /* stockage indisponible */ } }, { deep: true })
surChangementCompte(() => { projet.value = vide(); enregistre.value = null })

export const signatureProjet = (p) => JSON.stringify({ nom: p.nom.trim(), ouvrages: p.ouvrages, fournisseurId: p.fournisseurId || '' })

export function useProjetPro() {
  return { projet, enregistre }
}

/** Rouvre un projet sauvegardé (« Mes projets ») ; copie = duplication sans code de retrait */
export function ouvrirProjetPro(sauvegarde, { copie = false } = {}) {
  const source = sauvegarde.resultat?.projet
  if (!source?.ouvrages?.length) return false
  projet.value = {
    nom: copie ? `${sauvegarde.nom} (copie)` : sauvegarde.nom,
    ouvrages: JSON.parse(JSON.stringify(source.ouvrages)),
    fournisseurId: sauvegarde.fournisseur_id || source.fournisseurId || ''
  }
  enregistre.value = copie ? null : { signature: signatureProjet(projet.value), code: sauvegarde.code_retrait || '', id: sauvegarde.id }
  return true
}

export function nouveauProjetPro() {
  projet.value = vide()
  enregistre.value = null
}

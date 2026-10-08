/**
 * useCookies — information du visiteur sur ce que BTM enregistre dans son navigateur.
 * BTM ne dépose aucun cookie publicitaire ni de mesure d'audience : seuls des éléments indispensables au service
 * (session de connexion, devis en cours, préférences) sont utilisés. Ils sont exemptés de consentement
 * (CNIL, art. 82 de la loi Informatique et Libertés) mais le visiteur doit en être informé : c'est le rôle du bandeau.
 * Le choix est conservé 13 mois (durée maximale recommandée par la CNIL), puis le bandeau réapparaît.
 * Changer VERSION (nouveau traceur, nouveau service tiers) réaffiche le bandeau à tout le monde.
 */
import { ref } from 'vue'

const CLE = 'btm:cookies'
const VERSION = 1
const DUREE = 395 * 24 * 3600 * 1000 // 13 mois

function lireChoix() {
  try {
    const choix = JSON.parse(localStorage.getItem(CLE) || 'null')
    return choix && choix.version === VERSION && Date.now() - choix.le < DUREE ? choix : null
  } catch {
    return null
  }
}

const bandeauVisible = ref(!lireChoix())

export function useCookies() {
  function confirmer() {
    try { localStorage.setItem(CLE, JSON.stringify({ version: VERSION, le: Date.now() })) } catch { /* stockage bloqué : le bandeau reviendra */ }
    bandeauVisible.value = false
  }
  const rouvrir = () => { bandeauVisible.value = true }

  /** Efface tout ce que BTM a enregistré sur cet appareil (devis non enregistrés, préférences). La session de connexion est conservée. */
  function effacerDonneesLocales() {
    for (const stockage of [localStorage, sessionStorage]) {
      try {
        Object.keys(stockage).filter((k) => /^btm[:-]/.test(k) && k !== CLE).forEach((k) => stockage.removeItem(k))
      } catch { /* stockage indisponible */ }
    }
  }

  return { bandeauVisible, confirmer, rouvrir, effacerDonneesLocales }
}

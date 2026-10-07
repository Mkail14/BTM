/**
 * useFenetreAuth — fenêtre de connexion / inscription, superposée au site (fond flouté).
 * C'est le seul moyen de se connecter : il n'y a pas de page de connexion.
 * Ouverte depuis n'importe où (en-tête, page protégée, bouton « Créer un compte »…) ;
 * `redirect` : page à rejoindre une fois connecté ; `profil` : type de compte présélectionné à l'inscription.
 */
import { reactive } from 'vue'

const etat = reactive({ ouverte: false, mode: 'connexion', redirect: null, suspendu: null, profil: null })

// seules les adresses internes au site sont acceptées comme destination
const interne = (chemin) => (typeof chemin === 'string' && chemin.startsWith('/') && !chemin.startsWith('//') ? chemin : null)

export function ouvrirAuth(mode = 'connexion', { redirect = null, suspendu = null, profil = null } = {}) {
  Object.assign(etat, { ouverte: true, mode: mode === 'inscription' ? 'inscription' : 'connexion', redirect: interne(redirect), suspendu, profil })
}
export function fermerAuth() {
  etat.ouverte = false
}

export function useFenetreAuth() {
  return { etat, ouvrirAuth, fermerAuth }
}

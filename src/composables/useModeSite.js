/**
 * Mode « Voir le site » d'un compte fournisseur : il navigue sur le site public comme un professionnel
 * (calculateur, projets pro…), puis revient à son espace. Mémorisé pour l'onglet (sessionStorage) :
 * fermer l'onglet ou se déconnecter le ramène à son espace à la prochaine connexion.
 */
import { ref } from 'vue'
import { surChangementCompte } from '@/composables/useAuth.js'

const CLE = 'btm-mode-site'
const lire = () => { try { return sessionStorage.getItem(CLE) === '1' } catch { return false } }
const ecrire = (v) => { try { v ? sessionStorage.setItem(CLE, '1') : sessionStorage.removeItem(CLE) } catch { /* stockage indisponible */ } }

export const modeSite = ref(lire())
export function activerModeSite() { modeSite.value = true; ecrire(true) }
export function quitterModeSite() { modeSite.value = false; ecrire(false) }

// Un autre compte (ou une déconnexion) ne garde jamais ce mode
surChangementCompte((nouveau, ancien) => { if (ancien) quitterModeSite() })

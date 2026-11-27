/** useAuth — état d'authentification (API BTM : jeton JWT, compte relu par /api/auth/moi) */
import { ref, computed, watch } from 'vue'
import { apiConfiguree } from '@/services/api/client.js'
import * as auth from '@/services/api/serviceAuth.js'

const utilisateur = ref(null)
const pret = ref(false)
const admin = ref(false)
const fournisseurLie = ref(null) // fiche de l'annuaire d'un compte fournisseur (sinon null)
const typeProfil = ref(null)   // 'particulier' | 'professionnel' | 'fournisseur'
const demandePro = ref(null)   // { statut: 'en_attente'|'verifie'|'refuse', raisonSociale, siret, motif } ou null
const demandeFournisseur = ref(null) // compte d'une entreprise pas encore validé par BTM (« Devenir partenaire »)

/** Rôle et type du compte : ils arrivent avec le compte (l'API les revérifie à chaque requête) */
function appliquerRole(compte) {
  const r = auth.roleDe(compte)
  admin.value = r.role === 'admin'
  fournisseurLie.value = r.role === 'fournisseur' ? r.fournisseur_id : null
  typeProfil.value = r.type_profil
  demandePro.value = r.pro
  demandeFournisseur.value = r.demandeFournisseur
}
/** Relit le compte (après une demande de vérification pro validée, par exemple) */
async function chargerRole() {
  const compte = await auth.utilisateurCourant({ relire: true })
  utilisateur.value = compte
  appliquerRole(compte)
}
let initialise = false

/**
 * Changement de compte (connexion, déconnexion, passage d'un compte à un autre) :
 * chaque module qui garde des données d'un utilisateur (projets, calcul en cours, cache admin)
 * s'abonne ici pour les vider — les données d'un compte ne doivent jamais apparaître sur un autre.
 */
const abonnesCompte = new Set()
export function surChangementCompte(callback) {
  abonnesCompte.add(callback)
  return () => abonnesCompte.delete(callback)
}
watch(() => utilisateur.value?.id ?? null, (nouveau, ancien) => {
  if (nouveau !== ancien) abonnesCompte.forEach((cb) => cb(nouveau, ancien))
})

export function useAuth() {
  if (!initialise) {
    initialise = true
    auth.utilisateurCourant().then((u) => { utilisateur.value = u; appliquerRole(u); pret.value = true })
    auth.surChangementAuth((u) => { utilisateur.value = u; appliquerRole(u) })
  }
  const connecte = computed(() => !!utilisateur.value)
  // Outils professionnels : ouverts seulement une fois le SIRET validé par l'équipe BTM, ou pour un compte fournisseur.
  // Pendant la vérification (« en_attente »), le compte est bien professionnel mais ses outils pro restent fermés.
  const estPro = computed(() => demandePro.value?.statut === 'verifie' || !!fournisseurLie.value)
  return {
    utilisateur, connecte, pret, admin, fournisseurLie, typeProfil, demandePro, demandeFournisseur, estPro, rechargerRole: () => chargerRole(), backendDisponible: apiConfiguree,
    connexion: auth.connexion, inscription: auth.inscription,
    mettreAJourProfil: auth.mettreAJourProfil, confirmerNouvelEmail: auth.confirmerNouvelEmail, supprimerCompte: auth.supprimerCompte,
    deconnexion: async () => { await auth.deconnexion(); utilisateur.value = null },
    deconnexionAppareil: async () => { await auth.deconnexionAppareil(); utilisateur.value = null },
    deconnexionPartout: async () => { await auth.deconnexionPartout(); utilisateur.value = null },
    envoyerLienMotDePasse: auth.envoyerLienMotDePasse
  }
}

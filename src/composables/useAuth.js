/** useAuth — état d'authentification Supabase (optionnel) */
import { ref, computed, watch } from 'vue'
import { supabaseConfigure } from '@/services/supabase/client.js'
import * as auth from '@/services/supabase/serviceAuth.js'
import { lireRoleCompte } from '@/services/supabase/serviceAdmin.js'
import { memoriserSuspension } from '@/services/suspension.js'

const utilisateur = ref(null)
const pret = ref(false)
const admin = ref(false)
const fournisseurLie = ref(null) // fiche de l'annuaire d'un compte fournisseur (sinon null)
const typeProfil = ref(null)   // 'particulier' | 'professionnel' | 'fournisseur'
const demandePro = ref(null)   // { statut: 'en_attente'|'verifie'|'refuse', raisonSociale, siret, motif } ou null

/** Relit le rôle et le type du compte connecté (après une demande de vérification pro, par exemple) */
async function chargerRole(id = utilisateur.value?.id) {
  let r = await lireRoleCompte(id)
  if (id !== utilisateur.value?.id) return // le compte a changé entre-temps
  if (r.banni) {
    // compte banni encore connecté (session ouverte avant le ban) : déconnexion, puis page « Compte suspendu »
    memoriserSuspension({ jusqua: r.bannieJusqua || 'vie', motif: r.bannieMotif })
    await auth.deconnexion()
    utilisateur.value = null
    window.location.assign('/compte-suspendu')
    return
  }
  r = await deposerDemandePro(id, r)
  if (id !== utilisateur.value?.id) return
  admin.value = r.role === 'admin'
  fournisseurLie.value = r.role === 'fournisseur' ? r.fournisseur_id : null
  typeProfil.value = r.type_profil
  demandePro.value = r.pro
}
let initialise = false

/**
 * Inscription « professionnel » : le SIRET et la raison sociale saisis sont gardés avec le compte, et la demande de
 * vérification doit être déposée à sa création. Si la base ne l'a pas fait (compte resté « particulier »), on la dépose
 * à la première connexion : l'administrateur la reçoit dans « Pros à vérifier ». Une fois par compte et par visite.
 */
const demandesProDeposees = new Set()
async function deposerDemandePro(id, r) {
  const infos = utilisateur.value?.user_metadata || {}
  const attendue = r.role === 'user' && !r.pro && r.type_profil !== 'professionnel'
    && infos.type_profil === 'professionnel' && infos.pro_siret && infos.pro_raison_sociale
  if (!attendue || demandesProDeposees.has(id)) return r
  demandesProDeposees.add(id)
  try {
    await auth.demanderVerificationPro(infos.pro_raison_sociale, infos.pro_siret)
    return await lireRoleCompte(id)
  } catch (e) {
    console.warn('Demande de compte professionnel non déposée', e)
    return r
  }
}

/**
 * Changement de compte (connexion, déconnexion, passage d'un compte à un autre) :
 * chaque module qui garde des données d'un utilisateur (projets, calcul en cours, cache admin)
 * s'abonne ici pour les vider — les données d'un compte ne doivent jamais apparaître sur un autre.
 * Le rafraîchissement du jeton (même compte) ne déclenche rien : on compare les identifiants.
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
    auth.utilisateurCourant().then((u) => { utilisateur.value = u; pret.value = true })
    auth.surChangementAuth((u) => { utilisateur.value = u })
    // rôle (contrôlé côté base par la RLS : ces valeurs ne servent qu'à afficher les bons liens)
    watch(() => utilisateur.value?.id, (id) => chargerRole(id), { immediate: true })
  }
  const connecte = computed(() => !!utilisateur.value)
  // Professionnel : compte pro vérifié, ou compte fournisseur (qui visite le site comme un pro)
  // Outils professionnels : ouverts seulement une fois le SIRET validé par l'équipe BTM.
// Pendant la vérification (« en_attente »), le compte est bien professionnel mais ses outils pro restent fermés.
const estPro = computed(() => demandePro.value?.statut === 'verifie' || !!fournisseurLie.value)
  return {
    utilisateur, connecte, pret, admin, fournisseurLie, typeProfil, demandePro, estPro, rechargerRole: () => chargerRole(), backendDisponible: supabaseConfigure,
    connexion: auth.connexion, inscription: auth.inscription,
    mettreAJourProfil: auth.mettreAJourProfil, supprimerCompte: auth.supprimerCompte,
    deconnexion: async () => { await auth.deconnexion(); utilisateur.value = null }
  }
}

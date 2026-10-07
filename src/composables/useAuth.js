/** useAuth — état d'authentification Supabase (optionnel) */
import { ref, computed, watch } from 'vue'
import { supabaseConfigure } from '@/services/supabase/client.js'
import * as auth from '@/services/supabase/serviceAuth.js'
import { lireRoleCompte } from '@/services/supabase/serviceAdmin.js'

const utilisateur = ref(null)
const pret = ref(false)
const admin = ref(false)
const fournisseurLie = ref(null) // fiche de l'annuaire d'un compte fournisseur (sinon null)
const typeProfil = ref(null)   // 'particulier' | 'professionnel' | 'fournisseur'
const demandePro = ref(null)   // { statut: 'en_attente'|'verifie'|'refuse', raisonSociale, siret, motif } ou null

/** Relit le rôle et le type du compte connecté (après une demande de vérification pro, par exemple) */
async function chargerRole(id = utilisateur.value?.id) {
  const r = await lireRoleCompte(id)
  if (id !== utilisateur.value?.id) return // le compte a changé entre-temps
  if (r.banni) {
    // compte banni encore connecté (session ouverte avant le ban) : déconnexion, puis page « Compte suspendu »
    await auth.deconnexion()
    utilisateur.value = null
    window.location.assign(`/compte-suspendu?jusqua=${encodeURIComponent(r.bannieJusqua || 'vie')}`)
    return
  }
  admin.value = r.role === 'admin'
  fournisseurLie.value = r.role === 'fournisseur' ? r.fournisseur_id : null
  typeProfil.value = r.type_profil
  demandePro.value = r.pro
}
let initialise = false

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
  const estPro = computed(() => demandePro.value?.statut === 'verifie' || !!fournisseurLie.value)
  return {
    utilisateur, connecte, pret, admin, fournisseurLie, typeProfil, demandePro, estPro, rechargerRole: () => chargerRole(), backendDisponible: supabaseConfigure,
    connexion: auth.connexion, inscription: auth.inscription,
    mettreAJourProfil: auth.mettreAJourProfil, supprimerCompte: auth.supprimerCompte,
    deconnexion: async () => { await auth.deconnexion(); utilisateur.value = null }
  }
}

/**
 * useProjets — gestion des projets sauvegardés (F05).
 * localStorage toujours actif ; synchronisation Supabase si l'utilisateur est connecté.
 *
 * Cloisonnement entre comptes (le navigateur peut être partagé) :
 *  - un projet local porte `proprietaire` : l'id du compte qui l'a enregistré, ou null s'il a été
 *    créé sans connexion ;
 *  - un compte ne voit et n'envoie au cloud que ses projets locaux et les projets « sans compte »
 *    (parcours : estimer, puis créer un compte pour enregistrer) — jamais ceux d'un autre compte ;
 *  - hors connexion, seuls les projets « sans compte » sont visibles.
 */
import { ref, computed } from 'vue'
import * as local from '@/services/stockage/stockageProjets.js'
import { listerProjetsCloud, creerProjetCloud, supprimerProjetCloud } from '@/services/supabase/serviceProjets.js'
import { useAuth, surChangementCompte } from './useAuth.js'

/** Projets locaux visibles pour ce compte (null = visiteur non connecté) */
const locauxVisibles = (compteId) => local.lireProjets().filter((p) => (p.proprietaire ?? null) === null || (compteId && p.proprietaire === compteId))

const projets = ref(locauxVisibles(null))
const chargement = ref(false)
const erreur = ref('')

// Changement de compte : on retire immédiatement la liste de l'ancien compte
surChangementCompte((nouveau) => {
  projets.value = locauxVisibles(nouveau)
  erreur.value = ''
})

export function useProjets() {
  const { utilisateur, connecte } = useAuth()

  async function rafraichir() {
    erreur.value = ''
    const compteId = connecte.value ? utilisateur.value.id : null
    const locaux = locauxVisibles(compteId)
    if (!compteId) { projets.value = locaux; return }
    chargement.value = true
    try {
      let cloud = await listerProjetsCloud(compteId)
      const idsCloud = new Set(cloud.map((p) => p.id))
      // Projets créés sans compte ou dont l'envoi avait échoué : on les envoie au cloud puis on les retire du stockage local
      let envoyes = 0
      for (const p of locaux.filter((x) => !idsCloud.has(x.id))) {
        try {
          await creerProjetCloud(compteId, {
            ...p,
            fournisseur_uuid: p.fournisseur_uuid || (/^[0-9a-f-]{36}$/i.test(p.fournisseur_id || '') ? p.fournisseur_id : null),
            cout_total: p.cout_total ?? p.resultat?.total ?? 0
          })
          local.supprimerProjet(p.id)
          envoyes++
        } catch (e) { console.warn('Envoi cloud impossible pour', p.nom, e) }
      }
      if (envoyes) cloud = await listerProjetsCloud(compteId)
      // le compte a pu changer pendant la synchronisation : on n'affiche pas un résultat périmé
      if (utilisateur.value?.id !== compteId) return
      const idsFinal = new Set(cloud.map((p) => p.id))
      projets.value = [...cloud, ...locauxVisibles(compteId).filter((p) => !idsFinal.has(p.id))]
        .sort((a, b) => new Date(b.cree_le) - new Date(a.cree_le))
    } catch (e) {
      console.warn(e)
      erreur.value = `Synchronisation cloud impossible — projets locaux affichés.${e?.message ? ` (${e.message})` : ''}`
      projets.value = locaux
    } finally {
      chargement.value = false
    }
  }

  async function sauvegarder({ nom, resultat, fournisseur }) {
    const base = {
      nom: nom.trim(),
      type: resultat.type,
      dimensions: resultat.dimensions,
      resultat,
      fournisseur_id: fournisseur?.id || null,
      fournisseur_uuid: fournisseur?.id && /^[0-9a-f-]{36}$/i.test(fournisseur.id) ? fournisseur.id : null,
      cout_total: resultat.total
    }
    const compteId = connecte.value ? utilisateur.value?.id : null
    if (compteId) {
      try {
        const cree = await creerProjetCloud(compteId, base)
        await rafraichir()
        return cree
      } catch (e) {
        console.warn('Sauvegarde cloud échouée, repli local', e)
      }
    }
    // repli local : rattaché au compte, pour qu'aucun autre compte ne le récupère
    const cree = local.ajouterProjet({ ...base, proprietaire: compteId })
    projets.value = locauxVisibles(compteId)
    return cree
  }

  async function supprimer(id) {
    const p = projets.value.find((x) => x.id === id)
    if (!p) return
    if (p.cloud) {
      try { await supprimerProjetCloud(id) } catch (e) { console.warn(e) }
    }
    local.supprimerProjet(id)
    await rafraichir()
  }

  /** Uniquement parmi les projets visibles par le compte actuel */
  function trouver(id) {
    const compteId = connecte.value ? utilisateur.value?.id : null
    return projets.value.find((p) => p.id === id) || locauxVisibles(compteId).find((p) => p.id === id) || null
  }

  const vide = computed(() => projets.value.length === 0)

  return { projets, vide, chargement, erreur, rafraichir, sauvegarder, supprimer, trouver }
}

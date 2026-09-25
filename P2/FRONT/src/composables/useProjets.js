/**
 * useProjets — gestion des projets sauvegardés (F05).
 * localStorage toujours actif ; synchronisation Supabase si l'utilisateur est connecté.
 */
import { ref, computed } from 'vue'
import * as local from '@/services/stockage/stockageProjets.js'
import { listerProjetsCloud, creerProjetCloud, supprimerProjetCloud } from '@/services/supabase/serviceProjets.js'
import { useAuth } from './useAuth.js'

const projets = ref(local.lireProjets())
const chargement = ref(false)
const erreur = ref('')

export function useProjets() {
  const { utilisateur, connecte } = useAuth()

  async function rafraichir() {
    erreur.value = ''
    const locaux = local.lireProjets()
    if (!connecte.value) { projets.value = locaux; return }
    chargement.value = true
    try {
      let cloud = await listerProjetsCloud()
      const idsCloud = new Set(cloud.map((p) => p.id))
      // Projets créés hors connexion : on les envoie au cloud puis on les retire du stockage local
      let envoyes = 0
      for (const p of locaux.filter((x) => !idsCloud.has(x.id))) {
        try {
          await creerProjetCloud(utilisateur.value.id, {
            ...p,
            fournisseur_uuid: p.fournisseur_uuid || (/^[0-9a-f-]{36}$/i.test(p.fournisseur_id || '') ? p.fournisseur_id : null),
            cout_total: p.cout_total ?? p.resultat?.total ?? 0
          })
          local.supprimerProjet(p.id)
          envoyes++
        } catch (e) { console.warn('Envoi cloud impossible pour', p.nom, e) }
      }
      if (envoyes) cloud = await listerProjetsCloud()
      const idsFinal = new Set(cloud.map((p) => p.id))
      projets.value = [...cloud, ...local.lireProjets().filter((p) => !idsFinal.has(p.id))]
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
    if (connecte.value && utilisateur.value) {
      try {
        const cree = await creerProjetCloud(utilisateur.value.id, base)
        await rafraichir()
        return cree
      } catch (e) {
        console.warn('Sauvegarde cloud échouée, repli local', e)
      }
    }
    const cree = local.ajouterProjet(base)
    projets.value = local.lireProjets()
    return cree
  }

  async function supprimer(id) {
    const p = projets.value.find((x) => x.id === id)
    if (p?.cloud) {
      try { await supprimerProjetCloud(id) } catch (e) { console.warn(e) }
    }
    local.supprimerProjet(id)
    await rafraichir()
  }

  function trouver(id) {
    return projets.value.find((p) => p.id === id) || local.trouverProjet(id)
  }

  const vide = computed(() => projets.value.length === 0)

  return { projets, vide, chargement, erreur, rafraichir, sauvegarder, supprimer, trouver }
}

<script setup>
/**
 * Proposer à un utilisateur de mettre l'un de ses projets en avant sur la page d'accueil (réalisations, migration 0025).
 * L'utilisateur reçoit l'invitation dans « Mes projets » : il ajoute une photo et ses infos, puis l'admin valide.
 * Une proposition déclinée (« Non merci ») peut être relancée.
 * Sans `profil` (ouvert depuis Contenus du site → Réalisations), l'admin choisit d'abord l'utilisateur.
 */
import { computed, ref, watch } from 'vue'
import { useAdmin, formatDate } from '@/composables/useAdmin.js'
import { typesProjets } from '@/donnees/typesProjets.js'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'
import AdminPanneau from './AdminPanneau.vue'

const props = defineProps({ profil: { type: Object, default: null } })
const emit = defineEmits(['fermer', 'envoyee'])
const { api, donnees, executer } = useAdmin()

// proposition en cours pour un projet : pas de seconde proposition tant qu'elle existe
const ETATS = {
  publiee: { label: 'En ligne', classe: 'adm-badge-ok' },
  soumise: { label: 'À valider', classe: 'adm-badge-attention' },
  proposee: { label: 'Déjà proposé', classe: 'adm-badge-info' }
}
const TYPES = computed(() => Object.fromEntries(typesProjets.map((t) => [t.id, t.libelle])))
const nomFournisseur = computed(() => Object.fromEntries((donnees.fournisseurs || []).map((f) => [f.id, f.nom])))
const nomDe = (p) => p.nom_affiche || p.email

// utilisateurs qui ont au moins un projet enregistré
const candidats = computed(() => {
  const nombre = {}
  for (const p of donnees.projets || []) nombre[p.utilisateur_id] = (nombre[p.utilisateur_id] || 0) + 1
  return (donnees.profils || []).filter((p) => nombre[p.id]).map((p) => ({ id: p.id, nom: nomDe(p), projets: nombre[p.id] }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
})
const utilisateurId = ref(props.profil?.id || '')
const profil = computed(() => props.profil || (donnees.profils || []).find((p) => p.id === utilisateurId.value) || null)
const nom = computed(() => (profil.value ? nomDe(profil.value) : ''))

const projets = computed(() => {
  const id = profil.value?.id
  if (!id) return []
  const realisations = (donnees.realisations || []).filter((r) => r.utilisateur_id === id)
  return (donnees.projets || []).filter((p) => p.utilisateur_id === id).map((p) => {
    const liees = realisations.filter((r) => r.projet_id === p.id)
    const etat = liees.find((r) => ETATS[r.statut]) || null
    return { ...p, etat, declinee: etat ? null : liees.find((r) => r.statut === 'declinee') || null }
  })
})

const premierLibre = () => projets.value.find((p) => !p.etat && !p.declinee)?.id || ''
const projetId = ref(premierLibre())
watch(utilisateurId, () => { projetId.value = premierLibre() })
const message = ref('Votre projet nous plaît ! Acceptez-vous qu’il apparaisse sur la page d’accueil de BTM, avec une photo de votre chantier ?')
const envoi = ref('') // id du projet en cours d'envoi

async function envoyer(projet) {
  if (!projet || envoi.value) return
  envoi.value = projet.id
  const ok = await executer(async () => {
    if (projet.declinee) {
      Object.assign(projet.declinee, await api.relancerRealisation(projet.declinee.id, message.value))
      return
    }
    const ligne = await api.proposerRealisation({
      utilisateur_id: profil.value.id, projet_id: projet.id, titre: projet.nom,
      type_projet: TYPES.value[projet.type_projet_id] ? projet.type_projet_id : null,
      fournisseur_id: projet.fournisseur_id || null, fournisseur_nom: nomFournisseur.value[projet.fournisseur_id] || null,
      message_admin: message.value
    })
    donnees.realisations = [ligne, ...(donnees.realisations || [])]
  }, `Proposition ${projet.declinee ? 'relancée' : 'envoyée'} : ${nom.value} la verra dans « Mes projets ».`)
  envoi.value = ''
  if (ok) { emit('envoyee'); emit('fermer') }
}
</script>

<template>
  <AdminPanneau titre="Proposer de publier un projet" :sous-titre="props.profil ? nom : 'Mise en avant sur la page d’accueil'" @fermer="emit('fermer')">
    <form id="form-proposition" class="pp" novalidate @submit.prevent="envoyer(projets.find((p) => p.id === projetId))">
      <div v-if="!props.profil" class="adm-champ">
        <label for="pp-utilisateur">Utilisateur</label>
        <select id="pp-utilisateur" v-model="utilisateurId">
          <option value="" disabled>{{ candidats.length ? 'Choisir un utilisateur…' : 'Aucun utilisateur n’a encore de projet' }}</option>
          <option v-for="c in candidats" :key="c.id" :value="c.id">{{ c.nom }} — {{ c.projets }} projet{{ c.projets > 1 ? 's' : '' }}</option>
        </select>
      </div>

      <div class="adm-champ">
        <label for="pp-message">Message à l’utilisateur</label>
        <textarea id="pp-message" v-model="message" rows="3" maxlength="400"></textarea>
      </div>

      <fieldset v-if="profil" class="adm-champ pp-bloc">
        <legend class="adm-champ-label">Projet à mettre en avant</legend>
        <ul class="pp-projets">
          <li v-for="pr in projets" :key="pr.id">
            <label class="pp-projet" :class="{ choisi: projetId === pr.id, pris: pr.etat || pr.declinee }">
              <input v-model="projetId" type="radio" name="pp-projet" :value="pr.id" :disabled="!!(pr.etat || pr.declinee)" />
              <span class="pp-projet-texte">
                <strong>{{ pr.nom }}</strong>
                <small>{{ TYPES[pr.type_projet_id] || pr.type_projet_id }} · {{ formaterEuros(pr.cout_total) }} · {{ formatDate(pr.cree_le) }}</small>
              </span>
              <span v-if="pr.etat" class="adm-badge" :class="ETATS[pr.etat.statut].classe">{{ ETATS[pr.etat.statut].label }}</span>
              <template v-else-if="pr.declinee">
                <span class="adm-badge">Décliné</span>
                <button type="button" class="adm-btn adm-btn-clair adm-btn-sm" :disabled="!!envoi" @click="envoyer(pr)">
                  <span v-if="envoi === pr.id" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-rotate-right" aria-hidden="true"></i> Relancer
                </button>
              </template>
            </label>
          </li>
        </ul>
      </fieldset>
    </form>
    <template #pied>
      <button type="button" class="adm-btn adm-btn-clair" @click="emit('fermer')">Annuler</button>
      <button type="submit" form="form-proposition" class="adm-btn adm-btn-noir" :disabled="!!envoi || !projetId">
        <span v-if="envoi === projetId" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-paper-plane" aria-hidden="true"></i> Envoyer la proposition
      </button>
    </template>
  </AdminPanneau>
</template>

<style scoped>
.pp { display: flex; flex-direction: column; gap: 20px; }
.pp-bloc { margin: 0; padding: 0; border: 0; }
.pp-bloc > legend { margin-bottom: 8px; padding: 0; }
.pp-projets { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.pp-projet { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 12px 14px; border: 1.5px solid var(--adm-ligne); border-radius: 14px; cursor: pointer; }
.pp-projet.choisi { border-color: var(--adm-noir); background: var(--adm-ligne-2); }
.pp-projet.pris { cursor: default; }
.pp-projet.pris .pp-projet-texte { opacity: .6; }
.pp-projet input { width: 18px; height: 18px; min-height: 0; flex: none; margin: 0; padding: 0; accent-color: var(--adm-noir); }
.pp-projet-texte { display: flex; flex: 1; flex-direction: column; min-width: 140px; }
.pp-projet-texte strong { font-size: .92rem; }
.pp-projet-texte small { color: var(--adm-muet); font-size: .78rem; }
</style>

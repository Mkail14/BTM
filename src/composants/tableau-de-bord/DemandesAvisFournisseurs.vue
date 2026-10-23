<script setup>
/**
 * Demandes d'avis des fournisseurs : après un retrait au comptoir, le fournisseur demande au client de le noter.
 * Le client choisit ses étoiles, écrit un commentaire (facultatif) et publie, ou répond « Non merci ».
 * Un avis publié reste affiché 30 jours ici (corrigeable), puis disparaît de « Mes projets ».
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useAuth } from '@/composables/useAuth.js'
import { mesDemandesAvis, publierAvisFournisseur, declinerAvisFournisseur } from '@/services/supabase/serviceAvisFournisseurs.js'
import BoutonBase from '@/composants/commun/BoutonBase.vue'

const { utilisateur } = useAuth()
const liste = ref([])
const charger = async () => { liste.value = utilisateur.value ? await mesDemandesAvis() : [] }
onMounted(charger)
watch(() => utilisateur.value?.id, charger)

const RECENT = 30 * 86400000
const visibles = computed(() => liste.value.filter((a) => a.statut === 'demande'
  || (a.statut === 'publie' && Date.now() - new Date(a.repondu_le) < RECENT)))
const remplacer = (ligne) => { liste.value = liste.value.map((a) => (a.id === ligne.id ? ligne : a)) }

// « Amina M. » à partir du compte : prénom + initiale du nom (le nom complet n'est jamais affiché)
const nomPublic = computed(() => {
  const m = utilisateur.value?.user_metadata || {}
  if (m.prenom) return `${m.prenom}${m.nom ? ` ${String(m.nom).charAt(0).toUpperCase()}.` : ''}`
  return m.pseudo || ''
})

const ouvert = ref(null)
const form = ref({ note: 0, commentaire: '', nom: '' })
const survol = ref(0)
const envoi = ref(false)
const erreur = ref('')

function ouvrir(a) {
  ouvert.value = a.id
  erreur.value = ''
  form.value = { note: a.note || 0, commentaire: a.commentaire || '', nom: a.nom || nomPublic.value }
}

async function publier(a) {
  const f = form.value
  if (!f.note) { erreur.value = 'Choisissez une note de 1 à 5 étoiles.'; return }
  if (!f.nom.trim()) { erreur.value = 'Indiquez le nom affiché avec votre avis.'; return }
  envoi.value = true
  erreur.value = ''
  try {
    remplacer(await publierAvisFournisseur(a.id, { note: f.note, commentaire: f.commentaire.trim(), nom: f.nom.trim() }))
    ouvert.value = null
  } catch (e) {
    erreur.value = e?.message || 'Publication impossible pour le moment.'
  } finally {
    envoi.value = false
  }
}

async function decliner(a) {
  try { remplacer(await declinerAvisFournisseur(a.id)) } catch (e) { erreur.value = e?.message || 'Action impossible.' }
}
</script>

<template>
  <section v-if="visibles.length" class="da" aria-label="Avis sur vos fournisseurs">
    <article v-for="a in visibles" :key="a.id" class="da-carte" :class="`da-${a.statut}`">
      <header class="da-tete">
        <span class="da-icone" aria-hidden="true"><i :class="a.statut === 'publie' ? 'fa-solid fa-circle-check' : 'fa-solid fa-star'"></i></span>
        <div>
          <template v-if="a.statut === 'demande'">
            <strong>{{ a.fournisseur_nom }} aimerait avoir votre avis</strong>
            <p>Vous avez retiré « {{ a.projet_nom }} » chez eux. Votre note aide les autres clients à choisir leur fournisseur.</p>
          </template>
          <template v-else>
            <strong>Merci pour votre avis sur {{ a.fournisseur_nom }}</strong>
            <p>Il s’affiche sur sa fiche, dans l’annuaire des fournisseurs.</p>
          </template>
        </div>
      </header>

      <div v-if="ouvert !== a.id" class="da-actions">
        <BoutonBase v-if="a.statut === 'demande'" icone="fa-solid fa-star" @click="ouvrir(a)">Donner mon avis</BoutonBase>
        <template v-else>
          <span class="da-etoiles" :aria-label="`${a.note} sur 5`"><i v-for="n in 5" :key="n" class="fa-solid fa-star" :class="{ eteinte: n > a.note }" aria-hidden="true"></i></span>
          <button type="button" class="da-lien" @click="ouvrir(a)">Modifier</button>
        </template>
        <button v-if="a.statut === 'demande'" type="button" class="da-lien" @click="decliner(a)">Non merci</button>
      </div>

      <form v-else class="da-form" novalidate @submit.prevent="publier(a)">
        <fieldset class="da-notes">
          <legend>Votre note</legend>
          <button
            v-for="n in 5" :key="n" type="button" class="da-note" :class="{ allumee: n <= (survol || form.note) }"
            :aria-label="`${n} étoile${n > 1 ? 's' : ''}`" :aria-pressed="form.note === n"
            @click="form.note = n" @mouseenter="survol = n" @mouseleave="survol = 0"
          ><i class="fa-solid fa-star" aria-hidden="true"></i></button>
        </fieldset>
        <div class="champ">
          <label :for="`da-com-${a.id}`">Commentaire <small>(facultatif)</small></label>
          <textarea :id="`da-com-${a.id}`" v-model="form.commentaire" rows="3" maxlength="600" placeholder="Accueil, conseils, disponibilité des matériaux…"></textarea>
        </div>
        <div class="champ da-nom">
          <label :for="`da-nom-${a.id}`">Nom affiché</label>
          <input :id="`da-nom-${a.id}`" v-model="form.nom" maxlength="60" placeholder="Ex. : Amina M." />
        </div>
        <p v-if="erreur" class="da-erreur" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ erreur }}</p>
        <div class="da-actions">
          <BoutonBase type="submit" icone="fa-solid fa-paper-plane" :chargement="envoi">Publier mon avis</BoutonBase>
          <button type="button" class="da-lien" @click="ouvert = null">Annuler</button>
        </div>
      </form>
    </article>
  </section>
</template>

<style scoped>
.da { display: flex; flex-direction: column; gap: 12px; margin-bottom: 28px; }
.da-carte { display: flex; flex-direction: column; gap: 16px; padding: 20px 22px; border: 1px solid var(--gris-200); border-radius: var(--rayon-lg); background: var(--carte); }
.da-demande { border-color: #fde68a; background: linear-gradient(180deg, #fffbeb, #fff 70%); }
.da-tete { display: flex; align-items: flex-start; gap: 14px; }
.da-tete strong { display: block; color: var(--ardoise); font-size: 1.02rem; }
.da-tete p { margin: 4px 0 0; color: var(--texte-secondaire); font-size: .92rem; line-height: 1.5; }
.da-icone { width: 40px; height: 40px; flex: none; display: grid; place-items: center; border-radius: 12px; background: #fef3c7; color: #d97706; }
.da-publie .da-icone { background: #d1fae5; color: #047857; }
.da-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.da-lien { padding: 6px 0; border: 0; background: none; color: var(--texte-secondaire); font: inherit; font-size: .9rem; font-weight: 600; cursor: pointer; }
.da-lien:hover { color: var(--ardoise); text-decoration: underline; text-underline-offset: 3px; }
.da-etoiles { display: inline-flex; gap: 3px; color: #f59e0b; }
.da-etoiles .eteinte { color: var(--gris-300); }

.da-form { display: flex; flex-direction: column; gap: 14px; max-width: 560px; }
.da-notes { display: flex; gap: 4px; margin: 0; padding: 0; border: 0; }
.da-notes legend { margin-bottom: 6px; color: var(--ardoise); font-size: .9rem; font-weight: 600; }
.da-note { width: 44px; height: 44px; display: grid; place-items: center; border: 0; border-radius: 12px; background: none; color: var(--gris-300); font-size: 1.6rem; cursor: pointer; transition: color var(--transition), transform var(--transition); }
.da-note.allumee { color: #f59e0b; }
.da-note:hover { transform: scale(1.08); }
.da-note:focus-visible { outline: 3px solid var(--lagon-400); outline-offset: 2px; }
.da-form textarea, .da-form input { font-family: var(--font-corps); } /* .champ est en chasse fixe (chiffres du calculateur) */
.da-form .champ label small { color: var(--gris-500); font-weight: 400; }
.da-nom { max-width: 280px; }
.da-erreur { display: flex; align-items: center; gap: 8px; margin: 0; color: var(--erreur); font-size: .9rem; font-weight: 500; }
</style>

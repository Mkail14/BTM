<script setup>
/**
 * Invitation de BTM à mettre un projet en avant sur la page d'accueil (réalisations).
 * L'utilisateur ajoute une photo de son chantier et ses infos, donne son accord, puis envoie : BTM valide avant publication.
 * Affiche aussi le suivi : en attente de validation, en ligne, ou refusée (avec le motif).
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useAuth } from '@/composables/useAuth.js'
import { useMesRealisations } from '@/composables/useMesRealisations.js'
import { envoyerRealisation, declinerRealisation } from '@/services/supabase/serviceRealisations.js'
import { typesProjets } from '@/donnees/typesProjets.js'
import BoutonBase from '@/composants/commun/BoutonBase.vue'

const { utilisateur } = useAuth()
const { liste, charger, remplacer } = useMesRealisations()
onMounted(charger)
watch(() => utilisateur.value?.id, charger)

const TYPES = Object.fromEntries(typesProjets.map((t) => [t.id, t.libelle]))
const RECENT = 30 * 86400000 // une réponse de BTM reste affichée 30 jours
const visibles = computed(() => liste.value.filter((r) => ['proposee', 'soumise'].includes(r.statut)
  || (['publiee', 'refusee'].includes(r.statut) && Date.now() - new Date(r.publiee_le || r.soumise_le || r.cree_le) < RECENT)))

// « Amina M. » à partir du compte : prénom + initiale du nom (le nom complet n'est jamais affiché)
const nomPublic = computed(() => {
  const m = utilisateur.value?.user_metadata || {}
  if (m.prenom) return `${m.prenom}${m.nom ? ` ${String(m.nom).charAt(0).toUpperCase()}.` : ''}`
  return m.pseudo || ''
})

const ouvert = ref(null) // id de la réalisation dont le formulaire est ouvert
const form = ref({})
const fichier = ref(null)
const apercu = ref('')
const envoi = ref(false)
const erreur = ref('')

function ouvrir(r) {
  ouvert.value = r.id
  erreur.value = ''
  fichier.value = null
  apercu.value = r.photo_url || ''
  form.value = {
    titre: r.titre || '', auteur: r.auteur || nomPublic.value, commune: r.commune || '', quartier: r.quartier || '',
    detail: r.detail || '', annee: r.annee || new Date().getFullYear(), consentement: r.statut === 'soumise'
  }
}
function choisirPhoto(e) {
  const f = e.target.files?.[0]
  if (!f) return
  if (!f.type.startsWith('image/')) { erreur.value = 'Choisissez une photo (JPEG, PNG ou WebP).'; return }
  erreur.value = ''
  fichier.value = f
  apercu.value = URL.createObjectURL(f)
}

async function envoyer(r) {
  const f = form.value
  if (!fichier.value && !r.photo_url) { erreur.value = 'Ajoutez une photo de votre chantier.'; return }
  if (!f.titre.trim() || !f.commune.trim() || !f.auteur.trim()) { erreur.value = 'Le titre, la commune et votre nom sont nécessaires.'; return }
  if (!f.consentement) { erreur.value = 'Cochez la case pour accepter la diffusion sur le site.'; return }
  envoi.value = true
  erreur.value = ''
  try {
    const ligne = await envoyerRealisation(r, {
      titre: f.titre.trim(), auteur: f.auteur.trim(), commune: f.commune.trim(), quartier: f.quartier.trim() || null,
      detail: f.detail.trim() || null, annee: Number(f.annee) || null
    }, fichier.value)
    remplacer(ligne)
    ouvert.value = null
  } catch (e) {
    erreur.value = e?.message || 'Envoi impossible pour le moment.'
  } finally {
    envoi.value = false
  }
}

async function decliner(r) {
  if (!window.confirm('Ne pas publier ce projet sur la page d’accueil ? BTM ne vous le proposera plus.')) return
  try { remplacer(await declinerRealisation(r.id)) } catch (e) { erreur.value = e?.message || 'Action impossible.' }
}
</script>

<template>
  <section v-if="visibles.length" class="pr" aria-label="Mise en avant de vos projets">
    <article v-for="r in visibles" :key="r.id" class="pr-carte" :class="`pr-${r.statut}`">
      <header class="pr-tete">
        <span class="pr-icone" aria-hidden="true">
          <i :class="{ proposee: 'fa-solid fa-star', soumise: 'fa-solid fa-hourglass-half', publiee: 'fa-solid fa-circle-check', refusee: 'fa-solid fa-circle-info' }[r.statut]"></i>
        </span>
        <div>
          <template v-if="r.statut === 'proposee'">
            <strong>BTM aimerait mettre votre projet « {{ r.titre }} » en avant</strong>
            <p>Sur la page d’accueil, avec une photo de votre chantier, votre prénom et la commune. Rien n’est publié sans votre accord.</p>
          </template>
          <template v-else-if="r.statut === 'soumise'">
            <strong>« {{ r.titre }} » est en cours de validation</strong>
            <p>BTM vérifie votre photo et vos infos avant de les publier. Vous pouvez encore les modifier.</p>
          </template>
          <template v-else-if="r.statut === 'publiee'">
            <strong>« {{ r.titre }} » est en ligne sur la page d’accueil</strong>
            <p>Merci d’avoir partagé votre chantier !</p>
          </template>
          <template v-else>
            <strong>BTM n’a pas pu publier « {{ r.titre }} »</strong>
            <p v-if="r.message_admin">{{ r.message_admin }}</p>
          </template>
        </div>
      </header>

      <blockquote v-if="r.statut === 'proposee' && r.message_admin" class="pr-message">{{ r.message_admin }}</blockquote>

      <div v-if="ouvert !== r.id" class="pr-actions">
        <BoutonBase v-if="r.statut === 'proposee'" icone="fa-solid fa-camera" @click="ouvrir(r)">Ajouter ma photo et mes infos</BoutonBase>
        <BoutonBase v-if="r.statut === 'soumise'" variante="secondaire" icone="fa-solid fa-pen" @click="ouvrir(r)">Modifier</BoutonBase>
        <BoutonBase v-if="r.statut === 'publiee'" variante="secondaire" to="/#realisations" icone-droite="fa-solid fa-arrow-right">Voir sur l’accueil</BoutonBase>
        <button v-if="r.statut === 'proposee' || r.statut === 'soumise'" type="button" class="pr-lien" @click="decliner(r)">Non merci</button>
      </div>

      <!-- Photo + infos -->
      <form v-else class="pr-form" novalidate @submit.prevent="envoyer(r)">
        <label class="pr-depot" :class="{ rempli: apercu }">
          <img v-if="apercu" :src="apercu" alt="Aperçu de votre photo" />
          <span v-else><i class="fa-solid fa-camera" aria-hidden="true"></i> Ajouter une photo de votre chantier</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" class="visually-hidden" @change="choisirPhoto" />
        </label>
        <div class="pr-champs">
          <div class="champ pr-plein"><label :for="`pr-titre-${r.id}`">Titre</label><input :id="`pr-titre-${r.id}`" v-model="form.titre" maxlength="80" placeholder="Ex. : Maison familiale" /></div>
          <div class="champ"><label :for="`pr-auteur-${r.id}`">Votre nom affiché</label><input :id="`pr-auteur-${r.id}`" v-model="form.auteur" maxlength="60" placeholder="Ex. : Amina M." /></div>
          <div class="champ"><label :for="`pr-annee-${r.id}`">Année des travaux</label><input :id="`pr-annee-${r.id}`" v-model="form.annee" type="number" min="2000" max="2100" /></div>
          <div class="champ"><label :for="`pr-commune-${r.id}`">Commune</label><input :id="`pr-commune-${r.id}`" v-model="form.commune" maxlength="60" placeholder="Ex. : Koungou" autocomplete="address-level2" /></div>
          <div class="champ"><label :for="`pr-quartier-${r.id}`">Quartier <small>(facultatif)</small></label><input :id="`pr-quartier-${r.id}`" v-model="form.quartier" maxlength="60" placeholder="Ex. : Longoni" /></div>
          <div class="champ pr-plein"><label :for="`pr-detail-${r.id}`">En quelques mots <small>(facultatif)</small></label><input :id="`pr-detail-${r.id}`" v-model="form.detail" maxlength="160" placeholder="Ex. : 32 m² de dalle béton armé" /></div>
          <p class="pr-infos pr-plein">
            <span v-if="r.type_projet && TYPES[r.type_projet]"><i class="fa-solid fa-trowel-bricks" aria-hidden="true"></i> {{ TYPES[r.type_projet] }}</span>
            <span v-if="r.fournisseur_nom"><i class="fa-solid fa-store" aria-hidden="true"></i> Matériaux chez {{ r.fournisseur_nom }}</span>
          </p>
          <label class="pr-accord pr-plein">
            <input v-model="form.consentement" type="checkbox" />
            <span>J’accepte que cette photo, mon nom affiché, la commune et le fournisseur apparaissent sur la page d’accueil de BTM. Je peux demander leur retrait à tout moment.</span>
          </label>
        </div>
        <p v-if="erreur" class="pr-erreur" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ erreur }}</p>
        <div class="pr-actions">
          <BoutonBase type="submit" icone="fa-solid fa-paper-plane" :chargement="envoi">Envoyer à BTM pour validation</BoutonBase>
          <button type="button" class="pr-lien" @click="ouvert = null">Annuler</button>
        </div>
      </form>
    </article>
  </section>
</template>

<style scoped>
.pr { display: flex; flex-direction: column; gap: 12px; margin-bottom: 28px; }
.pr-carte { display: flex; flex-direction: column; gap: 16px; padding: 20px 22px; border: 1px solid var(--gris-200); border-radius: var(--rayon-lg); background: #fff; }
.pr-proposee { border-color: var(--lagon-200, #a5f3fc); background: linear-gradient(180deg, var(--lagon-50), #fff 70%); }
.pr-tete { display: flex; align-items: flex-start; gap: 14px; }
.pr-tete strong { display: block; color: var(--ardoise); font-size: 1.02rem; }
.pr-tete p { margin: 4px 0 0; color: var(--texte-secondaire); font-size: .92rem; line-height: 1.5; }
.pr-icone { width: 40px; height: 40px; flex: none; display: grid; place-items: center; border-radius: 12px; background: var(--lagon-100); color: var(--lagon-700); }
.pr-soumise .pr-icone { background: #fef3c7; color: #b45309; }
.pr-publiee .pr-icone { background: #d1fae5; color: #047857; }
.pr-refusee .pr-icone { background: var(--gris-100); color: var(--gris-500); }
.pr-message { margin: 0; padding: 12px 16px; border-left: 3px solid var(--lagon-500); border-radius: 0 10px 10px 0; background: #fff; color: var(--ardoise); font-size: .92rem; font-style: italic; }
.pr-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.pr-lien { padding: 6px 0; border: 0; background: none; color: var(--texte-secondaire); font: inherit; font-size: .9rem; font-weight: 600; cursor: pointer; }
.pr-lien:hover { color: var(--ardoise); text-decoration: underline; text-underline-offset: 3px; }

.pr-form { display: grid; grid-template-columns: minmax(220px, 320px) minmax(0, 1fr); gap: 20px; align-items: start; }
.pr-form > .pr-erreur, .pr-form > .pr-actions { grid-column: 1 / -1; }
.pr-depot {
  display: grid; place-items: center; aspect-ratio: 4 / 3; overflow: hidden; border: 1.5px dashed var(--gris-300); border-radius: var(--rayon-lg);
  background: var(--gris-50); color: var(--texte-secondaire); font-weight: 600; font-size: .9rem; text-align: center; padding: 12px; cursor: pointer;
}
.pr-depot.rempli { padding: 0; border-style: solid; }
.pr-depot img { width: 100%; height: 100%; object-fit: cover; }
.pr-depot i { display: block; margin: 0 auto 8px; font-size: 1.4rem; color: var(--lagon-600); }
.pr-depot:hover { border-color: var(--lagon-500); }
.pr-depot:focus-within { outline: 3px solid var(--lagon-400); outline-offset: 2px; }
.pr-champs { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; }
.pr-plein { grid-column: 1 / -1; }
.pr-champs label small { color: var(--gris-500); font-weight: 400; }
.pr-champs input { font-family: var(--font-corps); } /* .champ est en chasse fixe (chiffres du calculateur) */
.pr-infos { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0; color: var(--texte-secondaire); font-size: .88rem; }
.pr-infos i { margin-right: 6px; color: var(--lagon-600); }
.pr-accord { display: flex; align-items: flex-start; gap: 10px; color: var(--ardoise); font-size: .88rem; line-height: 1.5; cursor: pointer; }
.pr-accord input { width: 18px; height: 18px; margin-top: 2px; flex: none; accent-color: var(--lagon-600); }
.pr-erreur { display: flex; align-items: center; gap: 8px; margin: 0; color: var(--erreur); font-size: .9rem; font-weight: 500; }

@media (max-width: 760px) {
  .pr-form, .pr-champs { grid-template-columns: minmax(0, 1fr); }
}
</style>

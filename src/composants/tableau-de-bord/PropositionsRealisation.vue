<script setup>
/**
 * Invitation de BTM à mettre un projet en avant sur la page d'accueil (réalisations).
 * L'utilisateur ajoute une photo de son chantier et ses infos, donne son accord, puis envoie : BTM valide avant publication.
 * Affiche aussi le suivi : en attente de validation, en ligne, ou refusée (avec le motif).
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useAuth } from '@/composables/useAuth.js'
import { useMesRealisations } from '@/composables/useMesRealisations.js'
import { envoyerRealisation, declinerRealisation } from '@/services/supabase/serviceRealisations.js'
import { typesProjets } from '@/donnees/typesProjets.js'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import RecadragePhoto from '@/composants/commun/RecadragePhoto.vue'

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
// cadre au format des cartes de l'accueil (4:5) : c'est la partie visible qui est envoyée
const RATIO = 4 / 5
const recadrage = ref(null)
const zoom = ref(1)
const recadre = ref(false) // la photo déjà en ligne a été recadrée : à renvoyer
const envoi = ref(false)
const erreur = ref('')
const fenetre = ref(null)
const enCours = computed(() => visibles.value.find((r) => r.id === ouvert.value) || null)
// la fenêtre prend le focus à l'ouverture (Échap la ferme)
watch(ouvert, async (id) => { if (id) { await nextTick(); fenetre.value?.focus() } })
function fermer() { if (!envoi.value) ouvert.value = null }

function ouvrir(r) {
  ouvert.value = r.id
  erreur.value = ''
  fichier.value = null
  apercu.value = r.photo_url || ''
  zoom.value = 1
  recadre.value = false
  form.value = {
    titre: r.titre || '', auteur: r.auteur || nomPublic.value, commune: r.commune || '', quartier: r.quartier || '',
    detail: r.detail || '', annee: r.annee || new Date().getFullYear(), consentement: r.statut === 'soumise'
  }
}
function choisirPhoto(e) {
  const f = e.target.files?.[0]
  e.target.value = '' // la même photo pourra être choisie à nouveau
  if (!f) return
  if (!f.type.startsWith('image/')) { erreur.value = 'Choisissez une photo (JPEG, PNG ou WebP).'; return }
  erreur.value = ''
  if (fichier.value) URL.revokeObjectURL(apercu.value)
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
    // nouvelle photo, ou photo en ligne recadrée : on envoie ce que montre le cadre
    const photo = fichier.value || recadre.value ? await recadrage.value.exporter() : null
    const ligne = await envoyerRealisation(r, {
      titre: f.titre.trim(), auteur: f.auteur.trim(), commune: f.commune.trim(), quartier: f.quartier.trim() || null,
      detail: f.detail.trim() || null, annee: Number(f.annee) || null
    }, photo)
    remplacer(ligne)
    ouvert.value = null
  } catch (e) {
    erreur.value = e?.message || 'Envoi impossible pour le moment.'
  } finally {
    envoi.value = false
  }
}

async function decliner(r) {
  if (!window.confirm('Ne pas publier ce projet sur la page d’accueil ?')) return
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

      <div class="pr-actions">
        <BoutonBase v-if="r.statut === 'proposee'" icone="fa-solid fa-camera" @click="ouvrir(r)">Ajouter ma photo et mes infos</BoutonBase>
        <BoutonBase v-if="r.statut === 'soumise'" variante="secondaire" icone="fa-solid fa-pen" @click="ouvrir(r)">Modifier</BoutonBase>
        <BoutonBase v-if="r.statut === 'publiee'" variante="secondaire" to="/#realisations" icone-droite="fa-solid fa-arrow-right">Voir sur l’accueil</BoutonBase>
        <button v-if="r.statut === 'proposee' || r.statut === 'soumise'" type="button" class="pr-lien" @click="decliner(r)">Non merci</button>
      </div>
    </article>

    <!-- Photo + infos : fenêtre par-dessus la page (voile flouté, comme la fidélité) -->
    <Teleport to="body">
      <div v-if="enCours" class="pr-voile" @click.self="fermer" @keydown.esc="fermer">
        <section ref="fenetre" class="pr-fenetre" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="pr-fenetre-titre">
          <button type="button" class="pr-fermer" aria-label="Fermer" @click="fermer"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
          <header class="pr-tete">
            <span class="pr-icone" aria-hidden="true"><i class="fa-solid fa-star"></i></span>
            <div>
              <h2 id="pr-fenetre-titre">Mettre « {{ enCours.titre }} » en avant</h2>
              <p>Une photo de votre chantier et quelques infos : BTM vérifie tout avant de publier.</p>
            </div>
          </header>

          <form class="pr-form" novalidate @submit.prevent="envoyer(enCours)">
            <div class="pr-photo" :class="{ 'avec-photo': apercu }">
              <RecadragePhoto v-if="apercu" ref="recadrage" v-model:zoom="zoom" :src="apercu" :ratio="RATIO" class="pr-cadre" @recadre="recadre = true" />
              <label v-else class="pr-depot pr-cadre">
                <span><i class="fa-solid fa-camera" aria-hidden="true"></i> Ajouter une photo de votre chantier</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" class="visually-hidden" @change="choisirPhoto" />
              </label>
              <div v-if="apercu" class="pr-outils">
                <p class="pr-outils-aide">Glissez la photo pour choisir ce qui apparaîtra sur l’accueil.</p>
                <label class="pr-zoom">
                  <i class="fa-solid fa-image" aria-hidden="true"></i>
                  <input v-model.number="zoom" type="range" min="1" max="3" step="0.01" aria-label="Zoom" @input="recadre = true" />
                  <i class="fa-solid fa-image fa-lg" aria-hidden="true"></i>
                </label>
                <label class="pr-changer">
                  <i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> Changer de photo
                  <input type="file" accept="image/jpeg,image/png,image/webp" class="visually-hidden" @change="choisirPhoto" />
                </label>
              </div>
            </div>
            <div class="pr-champs">
              <div class="champ pr-plein"><label for="pr-titre">Titre</label><input id="pr-titre" v-model="form.titre" maxlength="80" placeholder="Ex. : Maison familiale" /></div>
              <div class="champ"><label for="pr-auteur">Votre nom affiché</label><input id="pr-auteur" v-model="form.auteur" maxlength="60" placeholder="Ex. : Amina M." /></div>
              <div class="champ"><label for="pr-annee">Année des travaux</label><input id="pr-annee" v-model="form.annee" type="number" min="2000" max="2100" /></div>
              <div class="champ"><label for="pr-commune">Commune</label><input id="pr-commune" v-model="form.commune" maxlength="60" placeholder="Ex. : Koungou" autocomplete="address-level2" /></div>
              <div class="champ"><label for="pr-quartier">Quartier <small>(facultatif)</small></label><input id="pr-quartier" v-model="form.quartier" maxlength="60" placeholder="Ex. : Longoni" /></div>
              <div class="champ pr-plein"><label for="pr-detail">En quelques mots <small>(facultatif)</small></label><input id="pr-detail" v-model="form.detail" maxlength="160" placeholder="Ex. : 32 m² de dalle béton armé" /></div>
              <p v-if="(enCours.type_projet && TYPES[enCours.type_projet]) || enCours.fournisseur_nom" class="pr-infos pr-plein">
                <span v-if="enCours.type_projet && TYPES[enCours.type_projet]"><i class="fa-solid fa-trowel-bricks" aria-hidden="true"></i> {{ TYPES[enCours.type_projet] }}</span>
                <span v-if="enCours.fournisseur_nom"><i class="fa-solid fa-store" aria-hidden="true"></i> Matériaux chez {{ enCours.fournisseur_nom }}</span>
              </p>
            </div>
            <label class="pr-accord">
              <input v-model="form.consentement" type="checkbox" />
              <span>J’accepte que cette photo, mon nom affiché, la commune et le fournisseur apparaissent sur la page d’accueil de BTM. Je peux demander leur retrait à tout moment.</span>
            </label>
            <p v-if="erreur" class="pr-erreur" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ erreur }}</p>
            <div class="pr-actions pr-pied">
              <button type="button" class="pr-lien" @click="fermer">Annuler</button>
              <BoutonBase type="submit" icone="fa-solid fa-paper-plane" :chargement="envoi">Envoyer à BTM pour validation</BoutonBase>
            </div>
          </form>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.pr { display: flex; flex-direction: column; gap: 12px; margin-bottom: 28px; }
.pr-carte { display: flex; flex-direction: column; gap: 16px; padding: 20px 22px; border: 1px solid var(--gris-200); border-radius: var(--rayon-lg); background: var(--carte); }
.pr-proposee { border-color: color-mix(in srgb, var(--lagon-500) 30%, var(--bordure)); background: linear-gradient(180deg, var(--lagon-50), var(--carte) 70%); }
.pr-tete { display: flex; align-items: flex-start; gap: 14px; }
.pr-tete strong { display: block; color: var(--ardoise); font-size: 1.02rem; }
.pr-tete p { margin: 4px 0 0; color: var(--texte-secondaire); font-size: .92rem; line-height: 1.5; }
.pr-icone { width: 40px; height: 40px; flex: none; display: grid; place-items: center; border-radius: 12px; background: var(--lagon-100); color: var(--lagon-700); }
.pr-soumise .pr-icone { background: var(--alerte-pastille); color: #d97706; }
.pr-publiee .pr-icone { background: var(--succes-pastille); color: var(--succes-texte); }
.pr-refusee .pr-icone { background: var(--gris-100); color: var(--gris-500); }
.pr-message { margin: 0; padding: 12px 16px; border-left: 3px solid var(--lagon-500); border-radius: 0 10px 10px 0; background: color-mix(in srgb, var(--lagon-500) 8%, var(--carte)); color: var(--ardoise); font-size: .92rem; font-style: italic; }
.pr-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.pr-lien { padding: 6px 0; border: 0; background: none; color: var(--texte-secondaire); font: inherit; font-size: .9rem; font-weight: 600; cursor: pointer; }
.pr-lien:hover { color: var(--ardoise); text-decoration: underline; text-underline-offset: 3px; }

/* ---------- Fenêtre : voile flouté par-dessus la page ---------- */
.pr-voile {
  position: fixed; inset: 0; z-index: 260; display: grid; place-items: center; padding: 24px;
  background: rgba(6, 32, 44, .58); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); animation: pr-fondu .2s ease;
}
@keyframes pr-fondu { from { opacity: 0; } }
.pr-fenetre {
  position: relative; display: flex; flex-direction: column; gap: 18px; width: min(100%, 820px); max-height: calc(100dvh - 48px); overflow: hidden auto; overscroll-behavior: contain;
  padding: 24px 28px 22px; border-radius: 28px; background: var(--carte); color: var(--ardoise);
  box-shadow: 0 30px 80px rgba(6, 32, 44, .45); animation: pr-monter .34s cubic-bezier(.22, .61, .36, 1);
  scrollbar-width: none; /* tout tient dans l'écran ; sur un très petit écran, la fenêtre défile sans barre */
}
.pr-fenetre::-webkit-scrollbar { display: none; }
@keyframes pr-monter { from { transform: translateY(18px); opacity: 0; } }
.pr-fenetre:focus { outline: none; }
.pr-fenetre > * { flex-shrink: 0; }
.pr-fenetre .pr-tete { padding-right: 44px; }
.pr-fenetre h2 { margin: 0; color: var(--ardoise); font-size: 1.2rem; line-height: 1.3; }
.pr-fermer {
  position: absolute; top: 18px; right: 18px; display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 50%;
  background: var(--gris-100); color: var(--texte-secondaire); font-size: 1rem; cursor: pointer; transition: background var(--transition), color var(--transition);
}
.pr-fermer:hover { background: var(--gris-200); color: var(--ardoise); }

/* photo à gauche (cadre au format de la carte de l'accueil), champs à droite */
.pr-form { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 16px 22px; align-items: start; }
.pr-form > .pr-accord, .pr-form > .pr-erreur, .pr-form > .pr-actions { grid-column: 1 / -1; }
.pr-pied { justify-content: flex-end; gap: 18px; padding-top: 14px; border-top: 1px solid var(--bordure); }
.pr-photo { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.pr-cadre { width: 100%; }
.pr-depot {
  display: grid; place-items: center; aspect-ratio: 4 / 5; border: 1.5px dashed var(--gris-300); border-radius: var(--rayon-lg);
  background: var(--gris-50); color: var(--texte-secondaire); font-weight: 600; font-size: .9rem; text-align: center; padding: 12px; cursor: pointer;
  transition: border-color var(--transition), background var(--transition);
}
.pr-depot i { display: block; margin: 0 auto 8px; font-size: 1.6rem; color: var(--lagon-600); }
.pr-depot:hover { border-color: var(--lagon-500); background: var(--lagon-50); }
.pr-depot:focus-within { outline: 3px solid var(--lagon-400); outline-offset: 2px; }
/* sous la photo : zoom et changement de photo */
.pr-outils { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.pr-outils-aide { display: none; margin: 0; color: var(--texte-secondaire); font-size: .8rem; line-height: 1.4; }
.pr-zoom { display: flex; align-items: center; gap: 10px; color: var(--gris-400); font-size: .75rem; }
.pr-zoom input { flex: 1; min-width: 0; height: 4px; accent-color: var(--lagon-600); cursor: pointer; }
.pr-changer {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 8px 12px; border: 1px solid var(--bordure); border-radius: 999px;
  color: var(--texte-secondaire); font-size: .82rem; font-weight: 600; cursor: pointer; transition: border-color var(--transition), color var(--transition);
}
.pr-changer:hover { border-color: var(--lagon-500); color: var(--ardoise); }
.pr-changer:focus-within { outline: 3px solid var(--lagon-400); outline-offset: 2px; }
.pr-champs { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; align-content: start; }
.pr-champs .champ { gap: 4px; }
.pr-champs .champ label { font-size: .88rem; }
.pr-plein { grid-column: 1 / -1; }
.pr-champs label small { color: var(--gris-500); font-weight: 400; }
.pr-champs input { padding: 10px 14px; font-family: var(--font-corps); font-size: .95rem; } /* .champ est en chasse fixe (chiffres du calculateur) */
.pr-infos { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0; color: var(--texte-secondaire); font-size: .88rem; }
.pr-infos i { margin-right: 6px; color: var(--lagon-600); }
.pr-accord {
  display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 12px; background: var(--gris-50);
  color: var(--ardoise); font-size: .86rem; line-height: 1.5; cursor: pointer;
}
.pr-accord input { width: 18px; height: 18px; margin-top: 2px; flex: none; accent-color: var(--lagon-600); }
.pr-erreur { display: flex; align-items: center; gap: 8px; margin: 0; color: var(--erreur); font-size: .9rem; font-weight: 500; }

@media (max-width: 760px) {
  .pr-form { grid-template-columns: minmax(0, 1fr); }
  .pr-depot { aspect-ratio: 16 / 9; }
  /* photo choisie : petit cadre à gauche, outils à droite */
  .pr-photo.avec-photo { display: grid; grid-template-columns: 132px minmax(0, 1fr); align-items: center; gap: 14px; }
  .pr-outils-aide { display: block; }
  .pr-changer { align-self: flex-start; }
}
/* écran peu haut : espacements resserrés pour que la fenêtre tienne sans défiler */
@media (min-width: 640px) and (max-height: 760px) {
  .pr-voile { padding: 12px; }
  .pr-fenetre { gap: 12px; max-height: calc(100dvh - 24px); padding: 18px 24px 16px; }
  .pr-fenetre .pr-tete p { display: none; }
  .pr-champs { gap: 8px 14px; }
  .pr-champs input { padding: 8px 12px; }
  .pr-accord { padding: 8px 12px; font-size: .82rem; }
  .pr-pied { padding-top: 10px; }
}
/* téléphone : feuille qui monte du bas */
@media (max-width: 639px) {
  .pr-voile { place-items: end center; padding: 0; }
  .pr-fenetre { gap: 14px; width: 100%; max-height: calc(100dvh - 12px); padding: 18px 16px calc(16px + env(safe-area-inset-bottom)); border-radius: 26px 26px 0 0; }
  .pr-fenetre h2 { font-size: 1.05rem; }
  .pr-fenetre .pr-tete p { display: none; }
  .pr-fermer { top: 14px; right: 14px; }
  .pr-form { gap: 12px; }
  .pr-depot { aspect-ratio: 5 / 2; }
  .pr-photo.avec-photo { grid-template-columns: 112px minmax(0, 1fr); }
  .pr-champs { gap: 8px 10px; }
  .pr-champs input { padding: 9px 12px; }
  .pr-accord { padding: 10px 12px; font-size: .8rem; line-height: 1.4; }
  .pr-pied { flex-direction: column-reverse; align-items: stretch; gap: 8px; }
  .pr-pied .pr-lien { text-align: center; }
}
</style>

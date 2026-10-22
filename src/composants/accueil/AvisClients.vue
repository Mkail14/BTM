<script setup>
/**
 * AvisClients — synthèse des notes (moyenne + répartition) à gauche,
 * mur d'avis défilant verticalement à droite : avis du site à gauche et à droite, avis Trustpilot au centre (sens opposé).
 * Un utilisateur qui a déjà publié peut modifier son avis (migration 0024).
 * Les avis sont stockés dans Supabase (table avis) ; à défaut de connexion au back-end, des avis de démonstration s'affichent.
 * « Donner mon avis » propose d'abord le choix : sur le site (compte requis, sinon fenêtre de connexion / inscription)
 * ou sur Trustpilot (page Trustpilot de BTM dans un nouvel onglet).
 */
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import { useAuth } from '@/composables/useAuth.js'
import { ouvrirAuth } from '@/composables/useFenetreAuth.js'
import { listerAvis, publierAvis, monAvis, modifierAvis } from '@/services/supabase/serviceAvis.js'
import { useContenuSite } from '@/composables/useContenuSite.js'

const { utilisateur, connecte, backendDisponible } = useAuth()
const contenu = useContenuSite()
const route = useRoute()
const router = useRouter()
const compteRequis = ref(false)
// connexion / inscription dans la fenêtre du site, puis retour sur les avis
function ouvrirCompte(mode) {
  compteRequis.value = false
  ouvrirAuth(mode, { redirect: '/#avis' })
}

// Nom affiché sous l'avis, tiré du compte : « Mario R. » (ou le pseudo, ou le début de l'e-mail)
const nomDuCompte = computed(() => {
  const infos = utilisateur.value?.user_metadata || {}
  if (infos.prenom && infos.nom) return `${infos.prenom} ${String(infos.nom).charAt(0).toUpperCase()}.`
  return infos.pseudo || utilisateur.value?.email?.split('@')[0] || ''
})

// Avis de démonstration : uniquement si le back-end n'est PAS configuré (développement sans Supabase)
const avisInitiaux = [
  { id: 'initial-1', nom: 'Amina M.', ville: 'Mamoudzou', note: 5, commentaire: 'Une estimation claire et rapide pour préparer mon projet.', date: '2026-09-12' },
  { id: 'initial-2', nom: 'Youssouf B.', ville: 'Koungou', note: 4, commentaire: 'Les quantités sont faciles à comprendre. Très pratique avant de demander un devis.', date: '2026-09-10' },
  { id: 'initial-3', nom: 'Sarah A.', ville: 'Dzaoudzi', note: 5, commentaire: 'Enfin un outil pensé pour les projets de construction à Mayotte.', date: '2026-09-06' },
  { id: 'initial-4', nom: 'Nassim R.', ville: 'Pamandzi', note: 4, commentaire: 'Simple, lisible et utile pour comparer les matériaux.', date: '2026-09-02' }
]

const avis = ref([])
// 'chargement' | 'pret' | 'erreur' : « Aucun avis » ne s'affiche qu'une fois la liste réellement reçue (et vide)
const etatAvis = ref('chargement')
const modalOuverte = ref(false)
const envoiEffectue = ref(false)
const envoiEnCours = ref(false)
const erreurEnvoi = ref('')
const mien = ref(null) // avis déjà publié par l'utilisateur connecté : il peut le modifier
const formulaire = ref({ nom: '', ville: '', note: 0, commentaire: '' })

const moyenne = computed(() => (avis.value.length ? avis.value.reduce((s, a) => s + a.note, 0) / avis.value.length : 0))
const moyenneTexte = computed(() => moyenne.value.toFixed(1).replace('.', ','))
const repartition = computed(() => [5, 4, 3, 2, 1].map((note) => {
  const nombre = avis.value.filter((a) => a.note === note).length
  return { note, nombre, part: avis.value.length ? (nombre / avis.value.length) * 100 : 0 }
}))

// Trois colonnes qui défilent en boucle : avis du site à gauche et à droite, avis Trustpilot au centre (sens inverse).
// Chaque colonne boucle sur une séquence assez longue pour remplir la hauteur visible ; une seule rangée sur mobile.
const avisSite = computed(() => avis.value.filter((a) => a.source !== 'trustpilot'))
const avisTrustpilot = computed(() => avis.value.filter((a) => a.source === 'trustpilot'))
const allonger = (liste, minimum) => {
  if (!liste.length) return []
  let sequence = [...liste]
  while (sequence.length < minimum) sequence = [...sequence, ...liste]
  return sequence
}
const colonnes = computed(() => {
  const site = allonger(avisSite.value, 8)
  return [
    { cle: 'gauche', avis: site.filter((_, i) => i % 2 === 0), classe: 'avis-colonne-site' },
    { cle: 'centre', avis: allonger(avisTrustpilot.value, 4), classe: 'avis-colonne-trustpilot avis-colonne-inverse', trustpilot: true },
    { cle: 'droite', avis: site.filter((_, i) => i % 2 === 1), classe: 'avis-colonne-site avis-colonne-lente' }
  ]
})
// mobile : une rangée qui alterne avis du site et avis Trustpilot
const rangeeMobile = computed(() => {
  const s = avisSite.value, g = avisTrustpilot.value, r = []
  for (let i = 0; i < Math.max(s.length, g.length); i++) { if (s[i]) r.push(s[i]); if (g[i]) r.push(g[i]) }
  return r
})
// mobile : la rangée passe seule à l'avis suivant toutes les 2,8 s, en boucle (retour au premier après le dernier).
// Un doigt posé sur la rangée met en pause 8 s ; si l'utilisateur limite les animations, le passage se fait sans glissé.
const rangee = ref(null)
let minuterieRangee = null
let repriseRangee = null
function avisSuivant() {
  const el = rangee.value
  if (!el || !el.offsetParent || document.hidden) return // rangée masquée (ordinateur) ou onglet en arrière-plan
  const cartes = [...el.querySelectorAll('.avis-carte')]
  if (cartes.length < 2) return
  // carte affichée = la plus proche du début de la rangée ; on vise la suivante d'après sa position réelle
  const positions = cartes.map((c) => c.offsetLeft - cartes[0].offsetLeft)
  const actuelle = positions.reduce((meilleure, p, i) => (Math.abs(p - el.scrollLeft) < Math.abs(positions[meilleure] - el.scrollLeft) ? i : meilleure), 0)
  const fin = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4
  const suivante = fin ? 0 : (actuelle + 1) % cartes.length
  const doux = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollTo({ left: positions[suivante], behavior: doux ? 'smooth' : 'auto' })
}
function demarrerDefilement() {
  if (minuterieRangee) return
  minuterieRangee = setInterval(avisSuivant, 2800)
}
function arreterDefilement() { clearInterval(minuterieRangee); minuterieRangee = null; clearTimeout(repriseRangee) }
function pauseDefilement() {
  arreterDefilement()
  repriseRangee = setTimeout(demarrerDefilement, 8000)
}
onMounted(demarrerDefilement)
onActivated(demarrerDefilement) // accueil gardé en mémoire (keep-alive)
onDeactivated(arreterDefilement)
onBeforeUnmount(arreterDefilement)
// lien « laisser un avis » de la page Trustpilot de BTM (réglé dans l'admin → Contenus → Accueil — avis)
const lienTrustpilot = computed(() => (/^https:\/\//.test(contenu.avis.lienTrustpilot || '') ? contenu.avis.lienTrustpilot : ''))

async function chargerAvis() {
  try {
    avis.value = backendDisponible ? await listerAvis() : avisInitiaux
    etatAvis.value = 'pret'
  } catch (e) {
    console.warn('Avis indisponibles', e) // on n'affiche jamais d'avis qui ne sont pas en base
    avis.value = []
    etatAvis.value = 'erreur'
  }
}

// l'avis de l'utilisateur connecté est recherché dès la connexion : le bouton devient « Modifier mon avis »
async function chargerMonAvis() {
  mien.value = connecte.value && utilisateur.value ? await monAvis(utilisateur.value.id) : null
}
watch(() => utilisateur.value?.id, chargerMonAvis)

// « Donner mon avis » : choix entre le site et Trustpilot (sans lien Trustpilot réglé, on va directement au site)
const choixOuvert = ref(false)
function donnerAvis() {
  if (lienTrustpilot.value) choixOuvert.value = true
  else ouvrirModal()
}
// retour de connexion depuis l'onglet « Laisser un avis » (/?avis=site#avis) : le formulaire s'ouvre directement,
// puis le paramètre est retiré (?avis=1 : le choix site / Trustpilot)
watch(() => route.query.avis, (demande) => {
  if (!demande) return
  router.replace({ path: route.path, hash: route.hash })
  if (demande !== 'site') return donnerAvis()
  // arrivée par le lien de confirmation (page rechargée) : la session est relue juste après, on l'attend
  if (connecte.value || !backendDisponible) return ouvrirModal()
  const arreter = watch(connecte, (oui) => { if (oui) { arreter(); ouvrirModal() } })
  setTimeout(arreter, 10000)
}, { immediate: true })
function choisirSite() {
  choixOuvert.value = false
  ouvrirModal()
}

async function ouvrirModal() {
  if (backendDisponible && !connecte.value) { compteRequis.value = true; return }
  if (connecte.value && !mien.value) await chargerMonAvis()
  // avis déjà publié : formulaire prérempli pour le modifier
  formulaire.value = mien.value
    ? { nom: mien.value.nom, ville: mien.value.ville === 'Mayotte' ? '' : mien.value.ville, note: mien.value.note, commentaire: mien.value.commentaire }
    : { nom: nomDuCompte.value, ville: '', note: 0, commentaire: '' }
  envoiEffectue.value = false
  erreurEnvoi.value = ''
  modalOuverte.value = true
}

function fermerModal() {
  modalOuverte.value = false
}

async function envoyerAvis() {
  if (backendDisponible && !connecte.value) { modalOuverte.value = false; compteRequis.value = true; return }
  if (!formulaire.value.nom.trim() || !formulaire.value.note || envoiEnCours.value) return
  erreurEnvoi.value = ''
  envoiEnCours.value = true
  const champs = { ville: formulaire.value.ville.trim(), note: formulaire.value.note, commentaire: formulaire.value.commentaire.trim() }
  try {
    if (mien.value) {
      const modifie = await modifierAvis(mien.value.id, champs)
      avis.value = avis.value.map((a) => (a.id === modifie.id ? modifie : a))
      mien.value = modifie
    } else {
      const nouvelAvis = await publierAvis(utilisateur.value.id, { nom: formulaire.value.nom.trim(), ...champs })
      avis.value = [nouvelAvis, ...avis.value.filter((a) => !String(a.id).startsWith('initial-'))]
      mien.value = nouvelAvis
    }
    envoiEffectue.value = true
  } catch (e) {
    console.warn(e)
    erreurEnvoi.value = e?.message || 'Impossible de publier votre avis pour le moment.'
  } finally {
    envoiEnCours.value = false
  }
}

/** « MARIO JAMES MIKAIL » → « Mario James Mikail » (noms Trustpilot parfois tout en majuscules) */
const nomAffiche = (nom) => (nom === nom.toUpperCase() ? nom.toLowerCase() : nom)

function formaterDate(date) {
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(date))
}

onMounted(() => { chargerAvis(); chargerMonAvis() })
</script>

<template>
  <section id="avis" class="section avis-section" aria-labelledby="avis-titre">
    <div class="conteneur avis-grille">
      <!-- Synthèse -->
      <header class="avis-synthese">
        <span class="section-surtitre">{{ contenu.avis.surtitre }}</span>
        <h2 id="avis-titre" class="section-titre">{{ contenu.avis.titre }}</h2>

        <!-- téléphone : note et répartition côte à côte dans une carte -->
        <div v-if="avis.length" class="avis-resume">
          <div class="avis-score">
            <strong>{{ moyenneTexte }}</strong>
            <div>
              <span class="etoiles" :style="{ '--remplissage': `${(moyenne / 5) * 100}%` }" :aria-label="`Note moyenne ${moyenneTexte} sur 5`"></span>
              <small>{{ avis.length }} avis</small>
            </div>
          </div>

          <ul class="avis-repartition" aria-label="Répartition des notes">
            <li v-for="r in repartition" :key="r.note">
              <span>{{ r.note }}</span>
              <span class="avis-barre"><span :style="{ width: `${r.part}%` }"></span></span>
              <span class="avis-barre-nombre">{{ r.nombre }}</span>
            </li>
          </ul>
        </div>

        <p v-else-if="etatAvis === 'chargement'" class="avis-vide" aria-live="polite"><span class="spinner" aria-hidden="true"></span> Chargement des avis…</p>
        <p v-else-if="etatAvis === 'erreur'" class="avis-vide">Les avis ne peuvent pas s’afficher pour le moment. Réessayez dans quelques instants.</p>
        <p v-else class="avis-vide">{{ contenu.avis.vide }}</p>

        <BoutonBase class="avis-action" variante="primaire" :icone-droite="mien ? 'fa-solid fa-pen' : 'fa-solid fa-arrow-right'" @click="donnerAvis">{{ mien ? 'Modifier mon avis' : contenu.avis.bouton }}</BoutonBase>
      </header>

      <!-- Mur d'avis : site | Trustpilot | site -->
      <div v-if="avis.length" class="avis-mur" aria-label="Avis clients">
        <div v-for="colonne in colonnes" :key="colonne.cle" class="avis-colonne" :class="colonne.classe">
          <!-- colonne Trustpilot encore vide : carte d'invitation (jamais de faux avis) ; on donne son avis via « Donner mon avis » -->
          <div v-if="colonne.trustpilot && !colonne.avis.length" class="avis-carte avis-trustpilot avis-trustpilot-invitation">
            <span class="avis-trustpilot-marque"><i class="fa-solid fa-star" aria-hidden="true"></i> Trustpilot</span>
            <span class="avis-note" aria-hidden="true"><i v-for="n in 5" :key="n" class="fa-solid fa-star"></i></span>
            <p class="avis-commentaire">Vous avez travaillé avec BTM ? Votre avis sur Trustpilot aide les autres Mahorais à choisir.</p>
          </div>
          <div v-else class="avis-piste" :style="{ '--duree': `${colonne.avis.length * 7}s` }">
            <article
              v-for="(element, index) in [...colonne.avis, ...colonne.avis]" :key="`${element.id}-${index}`"
              class="avis-carte" :class="{ 'avis-trustpilot': element.source === 'trustpilot' }" :aria-hidden="index >= colonne.avis.length || undefined"
            >
              <span v-if="element.source === 'trustpilot'" class="avis-trustpilot-marque"><i class="fa-solid fa-star" aria-hidden="true"></i> Trustpilot</span>
              <span class="avis-note" :aria-label="`${element.note} étoiles sur 5`">
                <i v-for="n in 5" :key="n" class="fa-solid fa-star" :class="{ eteinte: n > element.note }" aria-hidden="true"></i>
              </span>
              <p v-if="element.commentaire" class="avis-commentaire">{{ element.commentaire }}</p>
              <footer class="avis-auteur">
                <span class="avis-avatar" aria-hidden="true">{{ element.nom.charAt(0).toUpperCase() }}</span>
                <span>
                  <strong>{{ nomAffiche(element.nom) }}</strong>
                  <small>
                    {{ element.source === 'trustpilot' ? 'Trustpilot' : element.ville }} · <time :datetime="element.date">{{ formaterDate(element.date) }}</time>
                    <template v-if="element.modifie"> · modifié</template>
                  </small>
                </span>
                <a v-if="element.lien" :href="element.lien" target="_blank" rel="noopener noreferrer" class="avis-source" :tabindex="index >= colonne.avis.length ? -1 : undefined" :aria-label="`Voir l’avis de ${element.nom} sur Trustpilot`">
                  <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
                </a>
              </footer>
            </article>
          </div>
        </div>

        <!-- Téléphone : une rangée qui alterne avis du site et avis Trustpilot -->
        <div ref="rangee" class="avis-colonne avis-colonne-mobile" @pointerdown="pauseDefilement" @focusin="pauseDefilement">
          <div class="avis-piste">
            <article v-for="element in rangeeMobile" :key="`m-${element.id}`" class="avis-carte" :class="{ 'avis-trustpilot': element.source === 'trustpilot' }">
              <span v-if="element.source === 'trustpilot'" class="avis-trustpilot-marque"><i class="fa-solid fa-star" aria-hidden="true"></i> Trustpilot</span>
              <span class="avis-note" :aria-label="`${element.note} étoiles sur 5`">
                <i v-for="n in 5" :key="n" class="fa-solid fa-star" :class="{ eteinte: n > element.note }" aria-hidden="true"></i>
              </span>
              <p v-if="element.commentaire" class="avis-commentaire">{{ element.commentaire }}</p>
              <footer class="avis-auteur">
                <span class="avis-avatar" aria-hidden="true">{{ element.nom.charAt(0).toUpperCase() }}</span>
                <span>
                  <strong>{{ nomAffiche(element.nom) }}</strong>
                  <small>{{ element.source === 'trustpilot' ? 'Trustpilot' : element.ville }} · <time :datetime="element.date">{{ formaterDate(element.date) }}</time></small>
                </span>
              </footer>
            </article>
          </div>
        </div>
      </div>
    </div>

    <!-- Choix : avis sur le site ou sur Trustpilot -->
    <div v-if="choixOuvert" class="avis-modal-fond" @click.self="choixOuvert = false">
      <button class="avis-fermer" type="button" aria-label="Fermer" @click="choixOuvert = false">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
      <section class="avis-modal avis-choix" role="dialog" aria-modal="true" aria-labelledby="avis-choix-titre">
        <h2 id="avis-choix-titre">Où donner votre avis ?</h2>
        <p>Merci de prendre une minute pour BTM : votre avis aide les autres Mahorais à préparer leur chantier.</p>
        <div class="avis-choix-options">
          <button type="button" class="avis-choix-option" @click="choisirSite">
            <span class="avis-choix-icone"><i class="fa-solid fa-house" aria-hidden="true"></i></span>
            <span>
              <strong>{{ mien ? 'Modifier mon avis sur le site' : 'Sur le site BTM' }}</strong>
              <small>Affiché sur cette page · compte BTM requis</small>
            </span>
            <i class="fa-solid fa-arrow-right avis-choix-fleche" aria-hidden="true"></i>
          </button>
          <a :href="lienTrustpilot" target="_blank" rel="noopener noreferrer" class="avis-choix-option" @click="choixOuvert = false">
            <span class="avis-choix-icone avis-choix-icone-trustpilot"><i class="fa-solid fa-star" aria-hidden="true"></i></span>
            <span>
              <strong>Sur Trustpilot</strong>
              <small>Avis public · s’ouvre dans un nouvel onglet</small>
            </span>
            <i class="fa-solid fa-arrow-up-right-from-square avis-choix-fleche" aria-hidden="true"></i>
          </a>
        </div>
      </section>
    </div>

    <!-- Compte requis pour publier -->
    <div v-if="compteRequis" class="avis-modal-fond" @click.self="compteRequis = false">
      <button class="avis-fermer" type="button" aria-label="Fermer" @click="compteRequis = false">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
      <section class="avis-modal avis-compte" role="dialog" aria-modal="true" aria-labelledby="avis-compte-titre">
        <div class="avis-succes-icone avis-compte-icone"><i class="fa-solid fa-user-lock" aria-hidden="true"></i></div>
        <h2 id="avis-compte-titre">Un compte est nécessaire</h2>
        <p>Pour garder des avis authentiques, seuls les utilisateurs connectés peuvent en publier. Créez un compte gratuit en moins d’une minute.</p>
        <div class="avis-compte-actions">
          <BoutonBase icone="fa-solid fa-user-plus" @click="ouvrirCompte('inscription')">Créer un compte</BoutonBase>
          <BoutonBase variante="secondaire" @click="ouvrirCompte('connexion')">J’ai déjà un compte</BoutonBase>
        </div>
      </section>
    </div>

    <!-- Formulaire -->
    <div v-if="modalOuverte" class="avis-modal-fond" @click.self="fermerModal">
      <button class="avis-fermer" type="button" aria-label="Fermer" @click="fermerModal">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
      <section class="avis-modal" role="dialog" aria-modal="true" aria-labelledby="avis-modal-titre">
        <template v-if="!envoiEffectue">
          <h2 id="avis-modal-titre">{{ mien ? 'Modifier votre avis' : 'Votre avis' }}</h2>
          <p v-if="mien" class="avis-modal-note">Vous avez changé d’avis ? Ajustez votre note ou votre commentaire : la date de modification sera indiquée.</p>
          <form @submit.prevent="envoyerAvis">
            <fieldset class="avis-rating">
              <legend>Note</legend>
              <div class="avis-rating-choix">
                <button
                  v-for="note in 5" :key="note" type="button"
                  :class="{ actif: note <= formulaire.note }"
                  :aria-label="`${note} étoile${note > 1 ? 's' : ''}`"
                  :aria-pressed="note === formulaire.note"
                  @click="formulaire.note = note"
                ><i class="fa-solid fa-star" aria-hidden="true"></i></button>
              </div>
            </fieldset>
            <div class="avis-ligne">
              <div>
                <label class="avis-label" for="avis-nom">Nom</label>
                <input id="avis-nom" v-model="formulaire.nom" required maxlength="60" autocomplete="name" placeholder="Amina M." :readonly="connecte" :class="{ 'avis-lecture': connecte }" />
              </div>
              <div>
                <label class="avis-label" for="avis-ville">Ville <span>(facultatif)</span></label>
                <input id="avis-ville" v-model="formulaire.ville" maxlength="60" autocomplete="address-level2" placeholder="Mamoudzou" />
              </div>
            </div>
            <label class="avis-label" for="avis-commentaire">Commentaire <span>(facultatif)</span></label>
            <textarea id="avis-commentaire" v-model="formulaire.commentaire" maxlength="300" rows="4" placeholder="Qu’avez-vous pensé de BTM ?"></textarea>
            <p v-if="erreurEnvoi" class="avis-erreur" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ erreurEnvoi }}</p>
            <button class="btn btn-primaire avis-submit" type="submit" :disabled="!formulaire.nom.trim() || !formulaire.note || envoiEnCours">{{ envoiEnCours ? 'Enregistrement…' : mien ? 'Enregistrer les modifications' : 'Publier' }}</button>
          </form>
        </template>
        <div v-else class="avis-succes">
          <div class="avis-succes-icone"><i class="fa-solid fa-check" aria-hidden="true"></i></div>
          <h2>Merci !</h2>
          <p>{{ mien?.modifie ? 'Votre avis est mis à jour.' : 'Votre avis est publié.' }}</p>
          <button class="btn btn-secondaire" type="button" @click="fermerModal">Fermer</button>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.avis-section { background: var(--fond); overflow: hidden; }
.avis-grille { display: grid; grid-template-columns: minmax(280px, 380px) 1fr; gap: clamp(40px, 6vw, 88px); align-items: center; }

/* ---------- Synthèse ---------- */
.avis-vide { margin: 28px 0 32px; color: var(--texte-secondaire); line-height: 1.6; }
.avis-vide .spinner { width: 14px; height: 14px; border-width: 2px; vertical-align: -2px; margin-right: 6px; }
.avis-score { display: flex; align-items: center; gap: 16px; margin: 32px 0 20px; }
.avis-score > strong { font-family: var(--font-display); font-size: 4rem; line-height: .9; color: var(--ardoise); }
.avis-score small { display: block; margin-top: 4px; color: var(--gris-500); font-size: .85rem; }

/* Étoiles remplies proportionnellement à la moyenne */
.etoiles { --remplissage: 100%; position: relative; display: inline-block; font-size: 1.2rem; letter-spacing: 3px; line-height: 1; }
.etoiles::before { content: '★★★★★'; color: var(--gris-200); }
.etoiles::after {
  content: '★★★★★'; position: absolute; inset: 0; color: #f59e0b;
  width: var(--remplissage); overflow: hidden; white-space: nowrap;
}

.avis-repartition { list-style: none; margin: 0 0 32px; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.avis-repartition li { display: grid; grid-template-columns: 12px 1fr 20px; gap: 12px; align-items: center; font-size: .82rem; color: var(--gris-500); }
.avis-barre { height: 6px; border-radius: 99px; background: var(--gris-200); overflow: hidden; }
.avis-barre > span { display: block; height: 100%; border-radius: inherit; background: var(--ardoise); transition: width .6s ease; }
.avis-barre-nombre { text-align: right; font-variant-numeric: tabular-nums; }

/* ---------- Mur défilant ---------- */
.avis-mur {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; height: 640px; overflow: hidden;
  mask-image: linear-gradient(transparent, #000 14%, #000 86%, transparent);
  -webkit-mask-image: linear-gradient(transparent, #000 14%, #000 86%, transparent);
}
.avis-piste { display: flex; flex-direction: column; gap: 16px; animation: defiler var(--duree, 30s) linear infinite; }
.avis-colonne-inverse .avis-piste { animation-direction: reverse; }
.avis-colonne-lente .avis-piste { animation-duration: calc(var(--duree, 30s) * 1.3); } /* les deux colonnes du site ne vont pas au même pas */

/* ---------- Avis Trustpilot (colonne centrale) : couleurs de Trustpilot ---------- */
/* Même taille que les avis du site (la marque se place en haut à droite), fond sombre et étoiles vertes en carrés */
.avis-carte.avis-trustpilot { position: relative; overflow: hidden; border-color: #2c2c2c; background: linear-gradient(160deg, #232323 0%, #191919 100%); box-shadow: 0 10px 24px -14px rgba(0, 0, 0, .6); }
.avis-carte.avis-trustpilot::before { content: ''; position: absolute; inset: 0 0 auto; height: 3px; background: #00b67a; }
.avis-trustpilot-marque { display: inline-flex; align-items: center; gap: 6px; color: #e5e5dd; font-size: .74rem; font-weight: 600; letter-spacing: .02em; }
.avis-trustpilot-marque i { color: #00b67a; font-size: .9rem; }
.avis-carte.avis-trustpilot > .avis-trustpilot-marque { position: absolute; top: 22px; right: 22px; }
.avis-trustpilot .avis-note { gap: 2px; }
.avis-trustpilot .avis-note i { width: 18px; height: 18px; display: grid; place-items: center; background: #00b67a; color: #fff; font-size: .62rem; }
.avis-trustpilot .avis-note .eteinte { background: #3a3a3a; color: #8c8c8c; }
.avis-trustpilot .avis-commentaire { color: #f1f1ec; }
.avis-carte.avis-trustpilot { gap: 14px; padding: 22px 24px; border-radius: 18px; }
.avis-trustpilot .avis-auteur strong { color: #fff; }
.avis-trustpilot .avis-auteur small { color: #a3a39b; }
.avis-trustpilot .avis-avatar { background: #2c2c2c; color: #00b67a; }
.avis-source { margin-left: auto; width: 32px; height: 32px; flex: none; display: grid; place-items: center; border-radius: 50%; color: #5f6368; font-size: .78rem; }
.avis-trustpilot .avis-source { color: #a3a39b; }
.avis-trustpilot .avis-source:hover { background: #2c2c2c; color: #00b67a; }
.avis-source:hover { background: #f1f3f4; color: var(--lagon-800); }
.avis-modal-note { margin: 6px 0 0; color: var(--texte-secondaire); font-size: .9rem; line-height: 1.5; }
.avis-trustpilot-invitation { align-self: center; margin-top: 160px; }
.avis-carte.avis-trustpilot-invitation > .avis-trustpilot-marque { position: static; }
.avis-colonne-mobile { display: none; }
.avis-resume { display: contents; } /* ordinateur : note et répartition l'une sous l'autre */
@keyframes defiler { from { transform: translateY(0); } to { transform: translateY(calc(-50% - 8px)); } }

.avis-carte { display: flex; flex-direction: column; gap: 16px; padding: 24px; background: #fff; border: 1px solid var(--bordure); border-radius: 18px; }
.avis-note { display: flex; gap: 3px; font-size: .8rem; color: #f59e0b; }
.avis-note .eteinte { color: var(--gris-200); }
/* toutes les cartes (site et Trustpilot) gardent la même taille : 3 lignes d'avis au plus, auteur sur une ligne */
.avis-commentaire {
  margin: 0; color: var(--ardoise); font-size: 1rem; line-height: 1.6;
  display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.avis-auteur { display: flex; align-items: center; gap: 12px; }
.avis-auteur > span:not(.avis-avatar) { min-width: 0; }
.avis-avatar { width: 36px; height: 36px; flex-shrink: 0; display: grid; place-items: center; border-radius: 50%; background: var(--lagon-50); color: var(--lagon-800); font-weight: 700; font-size: .9rem; }
.avis-auteur strong, .avis-auteur small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.avis-auteur strong { font-size: .9rem; color: var(--ardoise); text-transform: capitalize; }
.avis-auteur small { color: var(--gris-500); font-size: .78rem; }

/* ---------- Formulaire ---------- */
.avis-modal-fond { position: fixed; inset: 0; z-index: 300; display: grid; place-items: center; padding: 20px; background: rgba(6, 32, 44, .62); backdrop-filter: blur(5px); }
.avis-fermer {
  position: fixed; top: 22px; right: 24px; z-index: 2; width: 44px; height: 44px; display: grid; place-items: center;
  border: 1px solid rgba(255,255,255,.45); border-radius: 50%; background: rgba(255,255,255,.14); color: #fff; font-size: 1.2rem;
  cursor: pointer; transition: background .2s, transform .2s;
}
.avis-fermer:hover { background: rgba(255,255,255,.25); transform: rotate(90deg); }
.avis-modal { width: min(100%, 480px); max-height: calc(100dvh - 40px); overflow-y: auto; padding: 32px; background: #fff; border-radius: var(--rayon-lg); box-shadow: var(--ombre-lg); animation: apparaitre .25s ease; }
.avis-modal h2 { color: var(--ardoise); font-size: 1.7rem; }
.avis-ligne { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.avis-label, .avis-rating legend { display: block; margin: 18px 0 7px; color: var(--ardoise); font-weight: 600; font-size: .86rem; }
.avis-label span { color: var(--gris-500); font-weight: 400; }
.avis-modal input, .avis-modal textarea { width: 100%; padding: 12px 14px; border: 1.5px solid var(--gris-300); border-radius: var(--rayon-sm); background: #fff; color: var(--texte); font: inherit; resize: vertical; }
.avis-modal input:focus, .avis-modal textarea:focus { outline: none; border-color: var(--lagon-500); box-shadow: 0 0 0 4px rgba(6, 182, 212, .18); }
.avis-rating { border: 0; padding: 0; margin: 0; }
.avis-rating-choix { display: flex; gap: 6px; }
.avis-rating-choix button { padding: 2px; border: 0; background: transparent; color: var(--gris-200); font-size: 1.9rem; line-height: 1; cursor: pointer; transition: color .15s, transform .15s; }
.avis-rating-choix button:hover, .avis-rating-choix button.actif { color: #f59e0b; }
.avis-rating-choix button:hover { transform: scale(1.1); }
.avis-submit { margin-top: 24px; width: 100%; justify-content: center; }
.avis-succes { padding: 20px 0 4px; text-align: center; }
.avis-succes-icone { width: 56px; height: 56px; display: grid; place-items: center; margin: 0 auto 16px; border-radius: 50%; background: #d1fae5; color: #047857; font-size: 1.3rem; }
.avis-succes p { margin: 8px 0 24px; color: var(--texte-secondaire); }

.avis-modal input.avis-lecture { background: var(--gris-100, #f3f4f6); color: var(--gris-700); cursor: default; }
.avis-erreur { display: flex; align-items: center; gap: 8px; margin: 16px 0 0; color: var(--erreur); font-size: .9rem; font-weight: 500; }
.avis-compte { text-align: center; }
.avis-compte-icone { background: var(--lagon-50); color: var(--lagon-700, var(--lagon-600)); }
.avis-compte p { margin: 10px 0 24px; color: var(--texte-secondaire); line-height: 1.6; }
.avis-compte-actions { display: flex; flex-direction: column; gap: 10px; }
.avis-compte-actions :deep(.btn) { width: 100%; justify-content: center; min-height: 48px; }

/* ---------- Choix : site ou Trustpilot ---------- */
.avis-choix p { margin: 8px 0 22px; color: var(--texte-secondaire); line-height: 1.6; }
.avis-modal.avis-choix { width: min(100%, 520px); }
.avis-choix-options { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.avis-choix-option {
  display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; text-align: left;
  border: 1.5px solid var(--bordure); border-radius: var(--rayon-sm, 12px); background: #fff; color: var(--ardoise);
  font: inherit; text-decoration: none; cursor: pointer; transition: border-color .2s, box-shadow .2s, transform .2s;
}
.avis-choix-option:hover, .avis-choix-option:focus-visible { border-color: var(--lagon-500); box-shadow: 0 0 0 4px rgba(6, 182, 212, .12); transform: translateY(-1px); }
.avis-choix-option strong { display: block; font-size: .88rem; }
.avis-choix-option small { display: block; margin-top: 2px; color: var(--gris-500); font-size: .72rem; line-height: 1.35; }
.avis-choix-icone { width: 32px; height: 32px; flex: none; display: grid; place-items: center; border-radius: 9px; background: var(--lagon-50); color: var(--lagon-800); font-size: .85rem; }
.avis-choix-icone-trustpilot { background: #00b67a; color: #fff; }
.avis-choix-fleche { margin-left: auto; flex: none; color: var(--gris-500); font-size: .7rem; }

/* ---------- Adaptations ---------- */
@media (prefers-reduced-motion: reduce) {
  .avis-piste { animation: none; }
  .avis-mur { overflow-y: auto; }
  .avis-carte[aria-hidden] { display: none; }
}
/* écran moyen : avis du site + avis Trustpilot (la deuxième colonne du site est masquée) */
@media (max-width: 1280px) {
  .avis-mur { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .avis-colonne-site.avis-colonne-lente { display: none; }}
@media (max-width: 900px) {
  .avis-grille { grid-template-columns: minmax(0, 1fr); }
  .avis-grille > * { min-width: 0; }
  .avis-synthese { max-width: 520px; }
  .avis-mur { height: 520px; }
}
/* Téléphone : comme la fiche d'une app sur un store. Note en carte, avis qu'on fait glisser (la carte suivante
   dépasse pour inviter au geste), bouton pleine largeur sous la note ; les fenêtres montent du bas de l'écran. */
@media (max-width: 600px) {
  .avis-grille { gap: 0; }
  .avis-synthese { max-width: none; }
  .avis-synthese .section-titre { font-size: 1.75rem; }
  .avis-synthese .avis-action { width: 100%; min-height: 52px; margin-bottom: 18px; justify-content: center; border-radius: 999px; }
  .avis-vide { margin: 16px 0 20px; }

  /* Synthèse : grande note à gauche, répartition à droite, dans une carte */
  .avis-resume {
    display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 20px;
    margin: 20px 0 16px; padding: 18px; background: #fff; border: 1px solid var(--bordure); border-radius: 20px;
  }
  .avis-score { flex-direction: column; align-items: center; gap: 6px; margin: 0; padding-right: 20px; border-right: 1px solid var(--bordure); }
  .avis-score > strong { font-size: 3.2rem; }
  .avis-score .etoiles { font-size: .9rem; letter-spacing: 1px; }
  .avis-score small { margin-top: 2px; font-size: .78rem; text-align: center; }
  .avis-repartition { gap: 5px; margin: 0; }
  .avis-repartition li { grid-template-columns: 10px 1fr 16px; gap: 8px; font-size: .74rem; }

  /* Rangée d'avis : on glisse d'une carte à l'autre, cartes de même hauteur */
  .avis-mur {
    display: block; height: auto; overflow: visible; mask-image: none; -webkit-mask-image: none;
    margin-inline: calc(-1 * var(--gouttiere));
  }
  .avis-colonne-site, .avis-colonne-trustpilot { display: none; }
  .avis-colonne-mobile {
    display: block; overflow-x: auto; scroll-snap-type: x mandatory; scroll-padding-inline: var(--gouttiere); scrollbar-width: none;
    padding: 2px var(--gouttiere) 6px; overscroll-behavior-x: contain;
  }
  .avis-colonne-mobile::-webkit-scrollbar { display: none; }
  .avis-colonne-mobile .avis-piste { flex-direction: row; animation: none; width: max-content; gap: 12px; }
  .avis-colonne-mobile .avis-carte { width: 80vw; max-width: 320px; gap: 12px; padding: 18px; border-radius: 20px; scroll-snap-align: start; flex: none; }
  .avis-colonne-mobile .avis-commentaire { display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; font-size: .95rem; line-height: 1.55; }
  .avis-colonne-mobile .avis-auteur { margin-top: auto; } /* l'auteur reste en bas quand une carte voisine est plus longue */
  .avis-colonne-mobile .avis-carte.avis-trustpilot > .avis-trustpilot-marque { top: 18px; right: 18px; }
  .avis-colonne-mobile .avis-carte[aria-hidden] { display: none; }

  /* Fenêtres : feuille qui monte du bas, bouton fermer posé juste au-dessus */
  .avis-modal-fond { display: flex; flex-direction: column; justify-content: flex-end; padding: 0; }
  .avis-fermer { position: static; align-self: flex-end; width: 40px; height: 40px; margin: 0 14px 10px; font-size: 1.05rem; }
  .avis-fermer:hover { transform: none; }
  .avis-modal, .avis-modal.avis-choix {
    width: 100%; max-height: calc(100dvh - 72px); padding: 26px 20px calc(22px + env(safe-area-inset-bottom));
    border-radius: 24px 24px 0 0; animation: avis-feuille .3s cubic-bezier(.22, .61, .36, 1);
  }
  .avis-modal h2 { font-size: 1.5rem; }
  .avis-modal input, .avis-modal textarea { font-size: 16px; } /* 16 px : iOS ne zoome pas sur le champ */
  .avis-rating-choix { justify-content: space-between; max-width: 280px; }
  .avis-rating-choix button { font-size: 2.3rem; }
  .avis-ligne { grid-template-columns: 1fr; gap: 0; }
  .avis-submit, .avis-succes .btn { width: 100%; min-height: 52px; justify-content: center; border-radius: 999px; }
  .avis-choix-options { grid-template-columns: 1fr; }
  .avis-choix-option { min-height: 64px; padding: 12px 14px; }
  .avis-choix-option strong { font-size: .95rem; }
  .avis-choix-option small { font-size: .78rem; }
}
@keyframes avis-feuille { from { transform: translateY(100%); } }
@media (prefers-reduced-motion: reduce) { .avis-modal { animation: none !important; } }
</style>

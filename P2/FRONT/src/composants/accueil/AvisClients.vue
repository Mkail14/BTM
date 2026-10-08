<script setup>
/**
 * AvisClients — synthèse des notes (moyenne + répartition) à gauche,
 * mur d'avis défilant verticalement à droite : avis du site à gauche et à droite, avis Google au centre (sens opposé).
 * Un utilisateur qui a déjà publié peut modifier son avis (migration 0024).
 * Les avis sont stockés dans Supabase (table avis) ; à défaut de connexion au back-end, des avis de démonstration s'affichent.
 * Publier un avis exige d'être connecté : sinon une fenêtre propose de se connecter ou de créer un compte.
 */
import { computed, onMounted, ref, watch } from 'vue'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import { useAuth } from '@/composables/useAuth.js'
import { ouvrirAuth } from '@/composables/useFenetreAuth.js'
import { listerAvis, publierAvis, monAvis, modifierAvis } from '@/services/supabase/serviceAvis.js'
import { useContenuSite } from '@/composables/useContenuSite.js'

const { utilisateur, connecte, backendDisponible } = useAuth()
const contenu = useContenuSite()
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
  { id: 'initial-1', nom: 'Amina M.', ville: 'Mamoudzou', note: 5, commentaire: 'Un devis clair et rapide pour préparer mon projet.', date: '2026-09-12' },
  { id: 'initial-2', nom: 'Youssouf B.', ville: 'Koungou', note: 4, commentaire: 'Les quantités sont faciles à comprendre. Très pratique avant de demander un devis.', date: '2026-09-10' },
  { id: 'initial-3', nom: 'Sarah A.', ville: 'Dzaoudzi', note: 5, commentaire: 'Enfin un outil pensé pour les projets de construction à Mayotte.', date: '2026-09-06' },
  { id: 'initial-4', nom: 'Nassim R.', ville: 'Pamandzi', note: 4, commentaire: 'Simple, lisible et utile pour comparer les matériaux.', date: '2026-09-02' }
]

const avis = ref([])
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

// Trois colonnes qui défilent en boucle : avis du site à gauche et à droite, avis Google au centre (sens inverse).
// Chaque colonne boucle sur une séquence assez longue pour remplir la hauteur visible ; une seule rangée sur mobile.
const avisSite = computed(() => avis.value.filter((a) => a.source !== 'google'))
const avisGoogle = computed(() => avis.value.filter((a) => a.source === 'google'))
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
    { cle: 'centre', avis: allonger(avisGoogle.value, 4), classe: 'avis-colonne-google avis-colonne-inverse', google: true },
    { cle: 'droite', avis: site.filter((_, i) => i % 2 === 1), classe: 'avis-colonne-site avis-colonne-lente' }
  ]
})
// mobile : une rangée qui alterne avis du site et avis Google
const rangeeMobile = computed(() => {
  const s = avisSite.value, g = avisGoogle.value, r = []
  for (let i = 0; i < Math.max(s.length, g.length); i++) { if (s[i]) r.push(s[i]); if (g[i]) r.push(g[i]) }
  return r
})
const lienGoogle = computed(() => (/^https:\/\//.test(contenu.avis.lienGoogle || '') ? contenu.avis.lienGoogle : ''))

async function chargerAvis() {
  try {
    avis.value = backendDisponible ? await listerAvis() : avisInitiaux
  } catch (e) {
    console.warn('Avis indisponibles', e) // on n'affiche jamais d'avis qui ne sont pas en base
    avis.value = []
  }
}

// l'avis de l'utilisateur connecté est recherché dès la connexion : le bouton devient « Modifier mon avis »
async function chargerMonAvis() {
  mien.value = connecte.value && utilisateur.value ? await monAvis(utilisateur.value.id) : null
}
watch(() => utilisateur.value?.id, chargerMonAvis)

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

        <div v-if="avis.length" class="avis-score">
          <strong>{{ moyenneTexte }}</strong>
          <div>
            <span class="etoiles" :style="{ '--remplissage': `${(moyenne / 5) * 100}%` }" :aria-label="`Note moyenne ${moyenneTexte} sur 5`"></span>
            <small>{{ avis.length }} avis</small>
          </div>
        </div>

        <p v-else class="avis-vide">{{ contenu.avis.vide }}</p>

        <ul v-if="avis.length" class="avis-repartition" aria-label="Répartition des notes">
          <li v-for="r in repartition" :key="r.note">
            <span>{{ r.note }}</span>
            <span class="avis-barre"><span :style="{ width: `${r.part}%` }"></span></span>
            <span class="avis-barre-nombre">{{ r.nombre }}</span>
          </li>
        </ul>

        <BoutonBase variante="primaire" :icone-droite="mien ? 'fa-solid fa-pen' : 'fa-solid fa-arrow-right'" @click="ouvrirModal">{{ mien ? 'Modifier mon avis' : contenu.avis.bouton }}</BoutonBase>
      </header>

      <!-- Mur d'avis : site | Google | site -->
      <div v-if="avis.length" class="avis-mur" aria-label="Avis clients">
        <div v-for="colonne in colonnes" :key="colonne.cle" class="avis-colonne" :class="colonne.classe">
          <!-- colonne Google encore vide : invitation à laisser un avis (jamais de faux avis) -->
          <div v-if="colonne.google && !colonne.avis.length" class="avis-carte avis-google avis-google-invitation">
            <span class="avis-google-marque"><i class="fa-brands fa-google" aria-hidden="true"></i> Avis Google</span>
            <p class="avis-commentaire">Vous avez travaillé avec BTM ? Votre avis sur Google aide les autres Mahorais à choisir.</p>
            <a v-if="lienGoogle" :href="lienGoogle" target="_blank" rel="noopener noreferrer" class="avis-google-lien">Laisser un avis sur Google <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>
          </div>
          <div v-else class="avis-piste" :style="{ '--duree': `${colonne.avis.length * 7}s` }">
            <article
              v-for="(element, index) in [...colonne.avis, ...colonne.avis]" :key="`${element.id}-${index}`"
              class="avis-carte" :class="{ 'avis-google': element.source === 'google' }" :aria-hidden="index >= colonne.avis.length || undefined"
            >
              <span v-if="element.source === 'google'" class="avis-google-marque"><i class="fa-brands fa-google" aria-hidden="true"></i> Avis Google</span>
              <span class="avis-note" :aria-label="`${element.note} étoiles sur 5`">
                <i v-for="n in 5" :key="n" class="fa-solid fa-star" :class="{ eteinte: n > element.note }" aria-hidden="true"></i>
              </span>
              <p v-if="element.commentaire" class="avis-commentaire">{{ element.commentaire }}</p>
              <footer class="avis-auteur">
                <span class="avis-avatar" aria-hidden="true">{{ element.nom.charAt(0).toUpperCase() }}</span>
                <span>
                  <strong>{{ element.nom }}</strong>
                  <small>
                    {{ element.source === 'google' ? 'Google' : element.ville }} · <time :datetime="element.date">{{ formaterDate(element.date) }}</time>
                    <template v-if="element.modifie"> · modifié</template>
                  </small>
                </span>
                <a v-if="element.lien" :href="element.lien" target="_blank" rel="noopener noreferrer" class="avis-source" :tabindex="index >= colonne.avis.length ? -1 : undefined" :aria-label="`Voir l’avis de ${element.nom} sur Google`">
                  <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
                </a>
              </footer>
            </article>
          </div>
        </div>

        <!-- Téléphone : une rangée qui alterne avis du site et avis Google -->
        <div class="avis-colonne avis-colonne-mobile">
          <div class="avis-piste">
            <article v-for="element in rangeeMobile" :key="`m-${element.id}`" class="avis-carte" :class="{ 'avis-google': element.source === 'google' }">
              <span v-if="element.source === 'google'" class="avis-google-marque"><i class="fa-brands fa-google" aria-hidden="true"></i> Avis Google</span>
              <span class="avis-note" :aria-label="`${element.note} étoiles sur 5`">
                <i v-for="n in 5" :key="n" class="fa-solid fa-star" :class="{ eteinte: n > element.note }" aria-hidden="true"></i>
              </span>
              <p v-if="element.commentaire" class="avis-commentaire">{{ element.commentaire }}</p>
              <footer class="avis-auteur">
                <span class="avis-avatar" aria-hidden="true">{{ element.nom.charAt(0).toUpperCase() }}</span>
                <span>
                  <strong>{{ element.nom }}</strong>
                  <small>{{ element.source === 'google' ? 'Google' : element.ville }} · <time :datetime="element.date">{{ formaterDate(element.date) }}</time></small>
                </span>
              </footer>
            </article>
          </div>
        </div>
      </div>
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

/* ---------- Avis Google (colonne centrale) : couleurs et marque Google ---------- */
.avis-carte.avis-google { position: relative; overflow: hidden; border-color: #dadce0; background: #fff; box-shadow: 0 1px 3px rgba(60, 64, 67, .12); }
.avis-carte.avis-google::before { content: ''; position: absolute; inset: 0 0 auto; height: 4px; background: linear-gradient(90deg, #4285f4 0 25%, #ea4335 25% 50%, #fbbc04 50% 75%, #34a853 75%); }
.avis-google-marque { display: inline-flex; align-items: center; gap: 8px; color: #5f6368; font-size: .78rem; font-weight: 600; letter-spacing: .02em; }
.avis-google-marque i {
  font-size: 1rem; background: conic-gradient(from -45deg, #ea4335 0 25%, #4285f4 25% 50%, #34a853 50% 75%, #fbbc04 75%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.avis-google .avis-note { color: #fbbc04; }
.avis-google .avis-note .eteinte { color: #dadce0; }
.avis-google .avis-commentaire { color: #3c4043; }
.avis-google .avis-auteur strong { color: #1a73e8; }
.avis-google .avis-avatar { background: #e8f0fe; color: #1967d2; }
.avis-source { margin-left: auto; width: 32px; height: 32px; flex: none; display: grid; place-items: center; border-radius: 50%; color: #5f6368; font-size: .78rem; }
.avis-source:hover { background: #f1f3f4; color: #1a73e8; }
.avis-google-invitation { align-self: center; margin-top: 160px; }
.avis-google-lien { align-self: flex-start; display: inline-flex; align-items: center; gap: 8px; padding: 9px 16px; border-radius: 999px; background: #1a73e8; color: #fff; font-size: .86rem; font-weight: 600; }
.avis-google-lien:hover { background: #1765cc; }
.avis-google-lien i { font-size: .72rem; }
.avis-modal-note { margin: 6px 0 0; color: var(--texte-secondaire); font-size: .9rem; line-height: 1.5; }
.avis-colonne-mobile { display: none; }
.avis-mur:hover .avis-piste { animation-play-state: paused; }
@keyframes defiler { from { transform: translateY(0); } to { transform: translateY(calc(-50% - 8px)); } }

.avis-carte { display: flex; flex-direction: column; gap: 16px; padding: 24px; background: #fff; border: 1px solid var(--bordure); border-radius: 18px; }
.avis-note { display: flex; gap: 3px; font-size: .8rem; color: #f59e0b; }
.avis-note .eteinte { color: var(--gris-200); }
.avis-commentaire { margin: 0; color: var(--ardoise); font-size: 1rem; line-height: 1.6; }
.avis-auteur { display: flex; align-items: center; gap: 12px; }
.avis-avatar { width: 36px; height: 36px; flex-shrink: 0; display: grid; place-items: center; border-radius: 50%; background: var(--lagon-50); color: var(--lagon-800); font-weight: 700; font-size: .9rem; }
.avis-auteur strong { display: block; font-size: .9rem; color: var(--ardoise); }
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

/* ---------- Adaptations ---------- */
@media (prefers-reduced-motion: reduce) {
  .avis-piste { animation: none; }
  .avis-mur { overflow-y: auto; }
  .avis-carte[aria-hidden] { display: none; }
}
/* écran moyen : avis du site + avis Google (la deuxième colonne du site est masquée) */
@media (max-width: 1280px) {
  .avis-mur { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .avis-colonne-site.avis-colonne-lente { display: none; }
}
@media (max-width: 900px) {
  .avis-grille { grid-template-columns: minmax(0, 1fr); }
  .avis-grille > * { min-width: 0; }
  .avis-synthese { max-width: 520px; }
  .avis-mur { height: 520px; }
}
@media (max-width: 600px) {
  .avis-mur {
    display: block; height: auto; overflow: visible; mask-image: none; -webkit-mask-image: none;
    margin-inline: calc(-1 * var(--gouttiere));
  }
  .avis-colonne-site, .avis-colonne-google { display: none; }
  .avis-colonne-mobile { display: block; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; padding: 4px var(--gouttiere) 16px; -webkit-overflow-scrolling: touch; }
  .avis-colonne-mobile::-webkit-scrollbar { display: none; }
  .avis-colonne-mobile .avis-piste { flex-direction: row; animation: none; width: max-content; gap: 12px; }
  .avis-colonne-mobile .avis-carte { width: min(82vw, 320px); scroll-snap-align: center; flex: none; }
  .avis-colonne-mobile .avis-carte[aria-hidden] { display: none; }
  .avis-fermer { top: 10px; right: 12px; }
  .avis-modal { padding: 26px 20px; }
  .avis-ligne { grid-template-columns: 1fr; gap: 0; }
}
</style>

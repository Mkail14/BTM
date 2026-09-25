<script setup>
/**
 * Connexion / Inscription — connectées à Supabase Auth si configuré,
 * sinon affichées comme structure d'interface (stub, section 10.6 du CDC).
 */
import { ref, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth.js'
import ChampTelephone from '@/composants/commun/ChampTelephone.vue'
import SaisieMotDePasse from '@/composants/commun/SaisieMotDePasse.vue'
import { formaterTelephone } from '@/services/telephone.js'
import { nettoyerPseudo, erreurPseudo, nettoyerNom, capitaliserNom, erreurNom, erreurEmail, suggestionEmail } from '@/services/validation.js'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import BandeauAvertissement from '@/composants/commun/BandeauAvertissement.vue'
import LogoBtm from '@/composants/commun/LogoBtm.vue'

const props = defineProps({
  mode: { type: String, default: 'connexion' },
  modal: { type: Boolean, default: false }
})
const emit = defineEmits(['fermer', 'changer-mode'])
const router = useRouter()
const route = useRoute()
// Retour à la page d'origine (ex. Résultats après « Enregistrer »), sinon accueil
const destination = () => (typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/')
// Connecté : on ferme la fenêtre (mode modal) puis on rejoint la destination
const terminerConnexion = () => { emit('fermer'); router.push(destination()) }
const versAutreMode = (chemin) => ({ path: chemin, query: route.query.redirect ? { redirect: route.query.redirect } : {} })
const { connexion, inscription, backendDisponible, connecte } = useAuth()

const email = ref('')
const civilite = ref('')
const nom = ref('')
const prenom = ref('')
const pseudo = ref('')
const telephone = ref('')
const motDePasse = ref('')
const confirmation = ref('')
const resterConnecte = ref(true)
const cgu = ref(false)
const erreurs = ref({})
const erreurGlobale = ref('')
const succes = ref('')
const chargement = ref(false)
const estInscription = computed(() => props.mode === 'inscription')
const etape = ref(1)
const ETAPES = ['Identité', 'Sécurité', 'Validation']
const derniereEtape = computed(() => !estInscription.value || etape.value === ETAPES.length)

watch(() => props.mode, () => { erreurs.value = {}; erreurGlobale.value = ''; succes.value = ''; etape.value = 1 })
watch(connecte, (v) => { if (v) terminerConnexion() })

const retirerErreur = (cle) => { const { [cle]: _, ...reste } = erreurs.value; erreurs.value = reste }
const poserErreur = (cle, m) => { erreurs.value = { ...erreurs.value, [cle]: m } }

// Nom / prénom : chiffres et symboles refusés dès la frappe, majuscules mises en forme à la sortie du champ
const champsNom = { nom, prenom }
function saisieNom(cle, cible) {
  const valeur = cible.value
  const propre = nettoyerNom(valeur)
  champsNom[cle].value = propre
  cible.value = propre
  if (propre !== valeur) poserErreur(cle, 'Seules les lettres sont acceptées'); else retirerErreur(cle)
}
function sortieNom(cle, libelle) {
  const champ = champsNom[cle]
  champ.value = capitaliserNom(champ.value)
  const m = champ.value ? erreurNom(champ.value, libelle) : ''
  if (m) poserErreur(cle, m); else retirerErreur(cle)
}

// E-mail : contrôle du format à la sortie du champ + suggestion en cas de faute de frappe (gmial.com…)
const suggestion = computed(() => suggestionEmail(email.value))
function appliquerSuggestion() { email.value = suggestion.value; retirerErreur('email') }
function sortieEmail() {
  email.value = email.value.trim()
  const m = email.value ? erreurEmail(email.value) : ''
  if (m) poserErreur('email', m); else retirerErreur('email')
}

function saisiePseudo(cible) {
  const propre = nettoyerPseudo(cible.value)
  const refuse = propre !== cible.value
  pseudo.value = propre
  cible.value = propre
  if (refuse) poserErreur('pseudo', 'Ni espaces ni caractères spéciaux (lettres, chiffres, . - _)'); else retirerErreur('pseudo')
}
function sortiePseudo() {
  const m = pseudo.value ? erreurPseudo(pseudo.value) : ''
  if (m) poserErreur('pseudo', m); else retirerErreur('pseudo')
}

function validerEmail(e) {
  const msg = erreurEmail(email.value)
  if (msg) e.email = msg
}

function validerMotDePasse(e) {
  if (!motDePasse.value) e.motDePasse = 'Ce champ est obligatoire'
  else if (motDePasse.value.length < 8) e.motDePasse = 'Au moins 8 caractères'
}

function valider() {
  const e = {}
  if (!estInscription.value) {
    validerEmail(e)
    validerMotDePasse(e)
  } else if (etape.value === 1) {
    if (!civilite.value) e.civilite = 'Choisissez une civilité'
    { const m = erreurNom(nom.value, 'nom'); if (m) e.nom = m }
    { const m = erreurNom(prenom.value, 'prénom'); if (m) e.prenom = m }
    { const m = erreurPseudo(pseudo.value); if (m) e.pseudo = m }
    validerEmail(e)
  } else if (etape.value === 2) {
    if (!telephone.value) e.telephone = 'Saisissez un numéro de téléphone valide'
    validerMotDePasse(e)
    if (confirmation.value !== motDePasse.value) e.confirmation = 'Les mots de passe ne correspondent pas'
  } else if (!cgu.value) {
    e.cgu = 'Vous devez accepter les conditions d’utilisation'
  }
  erreurs.value = e
  return Object.keys(e).length === 0
}

function etapePrecedente() {
  erreurs.value = {}; erreurGlobale.value = ''
  etape.value--
}

async function soumettre() {
  erreurGlobale.value = ''; succes.value = ''
  if (!valider()) return
  if (!derniereEtape.value) { etape.value++; return }
  if (!backendDisponible) { erreurGlobale.value = 'Le backend Supabase n’est pas encore configuré : ce formulaire est une maquette fonctionnelle.'; return }
  chargement.value = true
  try {
    if (estInscription.value) {
      await inscription(email.value.trim(), motDePasse.value, { civilite: civilite.value, nom: nom.value.trim(), prenom: prenom.value.trim(), pseudo: pseudo.value.trim(), telephone: telephone.value })
      succes.value = 'Compte créé ! Vérifiez votre boîte mail si une confirmation est requise, puis connectez-vous.'
    } else {
      await connexion(email.value.trim(), motDePasse.value)
      terminerConnexion()
    }
  } catch (err) {
    erreurGlobale.value = traduire(err.message)
  } finally {
    chargement.value = false
  }
}

function traduire(m = '') {
  if (/invalid login/i.test(m)) return 'E-mail ou mot de passe incorrect.'
  if (/already registered/i.test(m)) return 'Un compte existe déjà avec cet e-mail.'
  if (/rate limit/i.test(m)) return 'Trop de tentatives, réessayez dans quelques instants.'
  if (/confirm/i.test(m)) return 'Veuillez confirmer votre e-mail avant de vous connecter.'
  return m || 'Une erreur est survenue.'
}
</script>

<template>
  <div id="page-auth" class="page auth" :class="{ 'auth-modal-mode': modal }" @click.self="modal && emit('fermer')">
    <button v-if="modal" class="auth-fermer" type="button" aria-label="Fermer la fenêtre" @click="emit('fermer')">
      <i class="fa-solid fa-xmark" aria-hidden="true"></i>
    </button>
    <div class="conteneur auth-grille">
      <aside class="auth-visuel" aria-hidden="true">
        <LogoBtm :taille="72" />
        <h2>{{ estInscription ? 'Rejoignez BTM' : 'Bon retour !' }}</h2>
        <p>Synchronisez vos devis entre vos appareils et retrouvez vos projets où que vous soyez sur l’île.</p>
        <ul>
          <li><i class="fa-solid fa-cloud"></i> Sauvegarde cloud sécurisée (Supabase)</li>
          <li><i class="fa-solid fa-mobile-screen"></i> Accès depuis mobile, tablette et PC</li>
          <li><i class="fa-solid fa-file-pdf"></i> Export PDF illimité</li>
        </ul>
      </aside>

      <section class="carte auth-carte">
        <h1>{{ estInscription ? 'Créer un compte' : 'Connexion' }}</h1>
        <p class="texte-secondaire auth-intro">{{ estInscription ? 'Gratuit, en moins d’une minute.' : 'Accédez à vos projets sauvegardés.' }}</p>

        <BandeauAvertissement v-if="!backendDisponible" type="info" compact class="auth-note">
          Authentification prévue avec Supabase — renseignez <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> pour l’activer.
        </BandeauAvertissement>

        <ol v-if="estInscription" class="auth-etapes" :aria-label="`Étape ${etape} sur ${ETAPES.length}`">
          <li v-for="(libelle, index) in ETAPES" :key="libelle" :class="{ 'auth-etape-active': index + 1 === etape, 'auth-etape-faite': index + 1 < etape }">
            <span class="auth-etape-numero">
              <i v-if="index + 1 < etape" class="fa-solid fa-check" aria-hidden="true"></i>
              <template v-else>{{ index + 1 }}</template>
            </span>
            <span class="auth-etape-libelle">{{ libelle }}</span>
          </li>
        </ol>

        <form novalidate @submit.prevent="soumettre" class="auth-form">
          <template v-if="!estInscription || etape === 1">
            <div v-if="estInscription" class="champ">
              <label for="auth-civilite">Civilité</label>
              <select id="auth-civilite" v-model="civilite" :aria-invalid="!!erreurs.civilite" required>
                <option value="" disabled>Choisir</option>
                <option value="M.">Monsieur</option>
                <option value="Mme">Madame</option>
              </select>
              <p v-if="erreurs.civilite" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.civilite }}</p>
            </div>
            <div v-if="estInscription" class="auth-identite-grille">
              <div class="champ"><label for="auth-nom">Nom</label><input id="auth-nom" :value="nom" @input="saisieNom('nom', $event.target)" @blur="sortieNom('nom', 'nom')" type="text" maxlength="60" autocomplete="family-name" placeholder="Votre nom" :aria-invalid="!!erreurs.nom" required /><p v-if="erreurs.nom" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.nom }}</p></div>
              <div class="champ"><label for="auth-prenom">Prénom</label><input id="auth-prenom" :value="prenom" @input="saisieNom('prenom', $event.target)" @blur="sortieNom('prenom', 'prénom')" type="text" maxlength="60" autocomplete="given-name" placeholder="Votre prénom" :aria-invalid="!!erreurs.prenom" required /><p v-if="erreurs.prenom" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.prenom }}</p></div>
            </div>
            <div v-if="estInscription" class="champ">
              <label for="auth-pseudo">Pseudo</label>
              <input id="auth-pseudo" :value="pseudo" @input="saisiePseudo($event.target)" @blur="sortiePseudo" type="text" maxlength="20" autocomplete="username" placeholder="Ex. mario976" :aria-invalid="!!erreurs.pseudo" required />
              <p v-if="erreurs.pseudo" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.pseudo }}</p>
              <p v-else class="champ-aide">Le nom affiché dans l’application (3 à 20 caractères).</p>
            </div>
            <div class="champ">
              <label for="auth-email">Adresse e-mail</label>
              <input id="auth-email" v-model="email" @blur="sortieEmail" type="email" maxlength="254" autocomplete="email" placeholder="vous@exemple.yt" :aria-invalid="!!erreurs.email" style="font-family: var(--font-corps)" />
              <p v-if="erreurs.email" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.email }}</p>
              <p v-else-if="suggestion" class="champ-aide auth-suggestion">Vouliez-vous écrire <button type="button" @click="appliquerSuggestion">{{ suggestion }}</button> ?</p>
            </div>
          </template>

          <ChampTelephone v-if="estInscription && etape === 2" id="auth-telephone" v-model="telephone" requis :erreur="erreurs.telephone" />
          <div v-if="!estInscription || etape === 2" class="champ">
            <label for="auth-mdp">Mot de passe</label>
            <SaisieMotDePasse id="auth-mdp" v-model="motDePasse"  :autocomplete="estInscription ? 'new-password' : 'current-password'" placeholder="8 caractères minimum" :aria-invalid="!!erreurs.motDePasse" style="font-family: var(--font-corps)" />
            <p v-if="erreurs.motDePasse" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.motDePasse }}</p>
          </div>
          <div v-if="estInscription && etape === 2" class="champ">
            <label for="auth-conf">Confirmer le mot de passe</label>
            <SaisieMotDePasse id="auth-conf" v-model="confirmation"  autocomplete="new-password" :aria-invalid="!!erreurs.confirmation" style="font-family: var(--font-corps)" />
            <p v-if="erreurs.confirmation" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.confirmation }}</p>
          </div>

          <template v-if="estInscription && etape === 3">
            <dl class="auth-recap">
              <div><dt>Nom complet</dt><dd>{{ civilite === 'Mme' ? 'Madame' : 'Monsieur' }} {{ prenom }} {{ nom }}</dd></div>
              <div><dt>Pseudo</dt><dd>{{ pseudo }}</dd></div>
              <div><dt>E-mail</dt><dd>{{ email }}</dd></div>
              <div><dt>Téléphone</dt><dd>{{ formaterTelephone(telephone) }}</dd></div>
            </dl>
            <div>
              <label class="auth-case"><input v-model="cgu" type="checkbox" :aria-invalid="!!erreurs.cgu" /> J’accepte les <router-link to="/conditions" target="_blank" rel="noopener">conditions générales d’utilisation</router-link></label>
              <p v-if="erreurs.cgu" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.cgu }}</p>
            </div>
          </template>

          <label v-if="!estInscription" class="auth-case"><input v-model="resterConnecte" type="checkbox" /> Rester connecté</label>

          <BandeauAvertissement v-if="erreurGlobale" type="erreur" compact>{{ erreurGlobale }}</BandeauAvertissement>
          <BandeauAvertissement v-if="succes" type="succes" compact>{{ succes }}</BandeauAvertissement>

          <div class="auth-actions">
            <BoutonBase v-if="estInscription && etape > 1" type="button" variante="secondaire" icone="fa-solid fa-arrow-left" @click="etapePrecedente">
              Retour
            </BoutonBase>
            <BoutonBase
              type="submit"
              bloc
              :chargement="chargement"
              :icone="!estInscription ? 'fa-solid fa-right-to-bracket' : derniereEtape ? 'fa-solid fa-user-plus' : ''"
              :icone-droite="derniereEtape ? '' : 'fa-solid fa-arrow-right'"
            >
              {{ !estInscription ? 'Se connecter' : derniereEtape ? 'Créer mon compte' : 'Continuer' }}
            </BoutonBase>
          </div>
        </form>

        <p class="auth-bascule">
          <template v-if="estInscription">
            Déjà un compte ?
            <button v-if="modal" type="button" @click="emit('changer-mode', 'connexion')">Se connecter</button>
            <router-link v-else :to="versAutreMode('/connexion')">Se connecter</router-link>
          </template>
          <template v-else>
            Pas encore de compte ?
            <button v-if="modal" type="button" @click="emit('changer-mode', 'inscription')">S’inscrire</button>
            <router-link v-else :to="versAutreMode('/inscription')">S’inscrire</router-link>
          </template>
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.auth-grille { display: grid; gap: 32px; grid-template-columns: 1fr; align-items: stretch; max-width: 1000px; }
@media (min-width: 900px) { .auth-grille { grid-template-columns: 1fr 1fr; } }
.auth-visuel { display: none; padding: 40px; border-radius: var(--rayon-lg); color: #fff; background: var(--ardoise); }
@media (min-width: 900px) { .auth-visuel { display: block; } }
.auth-visuel h2 { font-size: 2.4rem; margin: 22px 0 12px; }
.auth-visuel p { opacity: .9; line-height: 1.6; }
.auth-visuel ul { margin-top: 26px; display: flex; flex-direction: column; gap: 12px; }
.auth-visuel li { display: flex; gap: 12px; align-items: center; font-weight: 500; }
.auth-visuel li i { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: rgba(255,255,255,.15); color: var(--sable); }
.auth-carte { display: flex; flex-direction: column; padding: 36px; border-radius: var(--rayon-lg); }
.auth-carte h1 { font-size: 2.2rem; color: var(--ardoise); }
.auth-intro { margin: 4px 0 20px; }
.auth-note { margin-bottom: 20px; }
.auth-note code { font-family: var(--font-mono); font-size: .8rem; background: rgba(0,0,0,.06); padding: 1px 5px; border-radius: 4px; }
.auth-form { display: flex; flex: 1; flex-direction: column; gap: 18px; }
.auth-etapes { display: flex; gap: 8px; margin: 0 0 22px; padding: 0; list-style: none; }
.auth-etapes li { display: flex; flex: 1; flex-direction: column; gap: 8px; padding-top: 10px; border-top: 3px solid var(--gris-200); color: var(--gris-500); font-size: .8rem; font-weight: 600; transition: border-color .2s, color .2s; }
.auth-etapes .auth-etape-active { border-color: var(--lagon-600); color: var(--ardoise); }
.auth-etapes .auth-etape-faite { border-color: var(--lagon-400); color: var(--lagon-700); }
.auth-etape-numero { width: 24px; height: 24px; display: grid; place-items: center; border-radius: 50%; background: var(--gris-100); font-size: .75rem; }
.auth-etape-active .auth-etape-numero { background: var(--lagon-600); color: #fff; }
.auth-etape-faite .auth-etape-numero { background: var(--lagon-100); }
.auth-recap { display: flex; flex-direction: column; gap: 12px; margin: 0; padding: 16px 18px; border: 1px solid var(--gris-200); border-radius: var(--rayon-sm); background: var(--gris-50); }
.auth-recap div { display: flex; justify-content: space-between; gap: 16px; }
.auth-recap dt { color: var(--texte-secondaire); font-size: .88rem; }
.auth-recap dd { margin: 0; color: var(--ardoise); font-weight: 600; text-align: right; overflow-wrap: anywhere; }
.auth-actions { display: flex; gap: 12px; margin-top: auto; }
.auth-actions .btn-bloc { flex: 1; }
.auth-identite-grille { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.auth-case { display: flex; gap: 10px; align-items: center; font-size: .92rem; color: var(--gris-700); cursor: pointer; }
.auth-case input { width: 18px; height: 18px; accent-color: var(--lagon-600); }
.auth-case a { color: var(--lagon-700); font-weight: 600; text-decoration: underline; }
.auth-bascule { margin-top: 22px; text-align: center; font-size: .95rem; color: var(--texte-secondaire); }
.auth-bascule a { color: var(--lagon-700); font-weight: 700; }
.auth-bascule button { border: 0; padding: 0; background: transparent; color: var(--lagon-700); font: inherit; font-weight: 700; cursor: pointer; }
.auth-modal-mode { position: fixed; inset: 0; z-index: 250; display: grid; place-items: center; padding: 24px; background: rgba(6, 32, 44, .58); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); overflow-y: auto; }
.auth-modal-mode .auth-grille { width: min(100%, 1000px); max-height: calc(100dvh - 48px); overflow-y: auto; }
.auth-modal-mode .auth-visuel { display: block; }
.auth-modal-mode .auth-carte { box-shadow: var(--ombre-lg); }
.auth-fermer { position: fixed; top: 22px; right: 24px; z-index: 2; width: 44px; height: 44px; border: 1px solid rgba(255,255,255,.45); border-radius: 50%; background: rgba(255,255,255,.14); color: #fff; font-size: 1.2rem; cursor: pointer; transition: background .2s, transform .2s; }
.auth-fermer:hover { background: rgba(255,255,255,.25); transform: rotate(90deg); }
@media (max-width: 899px) { .auth-modal-mode .auth-visuel { display: none; } .auth-modal-mode .auth-grille { max-width: 520px; } }
@media (max-width: 560px) { .auth-modal-mode { padding: 14px; } .auth-modal-mode .auth-grille { max-height: calc(100dvh - 28px); } .auth-modal-mode .auth-carte { padding: 26px 22px; } .auth-fermer { top: 10px; right: 12px; } }
@media (max-width: 480px) { .auth-identite-grille { grid-template-columns: 1fr; gap: 18px; } }
@media (max-width: 480px) {
  .auth-carte { padding: 26px 18px; }
  .auth-carte h1 { font-size: 1.9rem; }
}
.auth-suggestion button { border: 0; background: none; padding: 0; font: inherit; font-weight: 600; color: var(--lagon-700, var(--lagon-600)); text-decoration: underline; cursor: pointer; }
</style>

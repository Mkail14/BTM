<script setup>
/**
 * Mot de passe oublié, dans la fenêtre de connexion :
 *  1. l'utilisateur saisit son e-mail et reçoit un lien (e-mail « Reset Password » de Supabase, gabarit
 *     emails/mot-de-passe-oublie.html) ;
 *  2. le lien ramène sur /nouveau-mot-de-passe, qui ouvre la session du compte et rouvre cette fenêtre
 *     (parLien) pour qu'il choisisse son nouveau mot de passe.
 * Que l'adresse ait un compte ou non, l'écran dit la même chose : on ne révèle pas qui est inscrit.
 */
import { onBeforeUnmount, ref } from 'vue'
import { envoyerLienMotDePasse, definirMotDePasse } from '@/services/supabase/serviceAuth.js'
import { erreurEmail } from '@/services/validation.js'
import SaisieMotDePasse from '@/composants/commun/SaisieMotDePasse.vue'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import BandeauAvertissement from '@/composants/commun/BandeauAvertissement.vue'

const props = defineProps({
  emailInitial: { type: String, default: '' },
  connecte: Boolean, // ouvert depuis le profil d'un compte déjà connecté : « Annuler » au lieu de « Retour à la connexion »
  parLien: Boolean, // arrivé par le lien de l'e-mail : la session est ouverte, il ne reste qu'à choisir le mot de passe
  lienExpire: Boolean // lien de l'e-mail expiré ou déjà utilisé : on propose d'en redemander un
})
const emit = defineEmits(['retour', 'termine'])

const DELAI_RENVOI = 60 // secondes : Supabase n'envoie qu'un e-mail par minute à une même adresse
const etape = ref(props.parLien ? 'mot-de-passe' : 'email') // 'email' | 'envoye' | 'mot-de-passe' | 'fini'
const email = ref(props.emailInitial.trim())
const motDePasse = ref('')
const confirmation = ref('')
const erreurs = ref({})
const erreurGlobale = ref(props.lienExpire ? 'Ce lien a expiré ou a déjà servi : demandez-en un nouveau ci-dessous.' : '')
const info = ref('')
const chargement = ref(false)

// ---------- Renvoi du lien ----------
const attente = ref(0)
let minuteur = null
function lancerAttente() {
  attente.value = DELAI_RENVOI
  clearInterval(minuteur)
  minuteur = setInterval(() => { if (--attente.value <= 0) clearInterval(minuteur) }, 1000)
}
onBeforeUnmount(() => clearInterval(minuteur))

function traduire(m = '') {
  if (/rate limit|security purposes|only request this after/i.test(m)) return 'Patientez une minute avant de demander un nouveau lien.'
  if (/banned/i.test(m)) return 'Ce compte a été suspendu par l’équipe BTM. Pour toute question : contact@btm.yt.'
  if (/same|different from the old/i.test(m)) return 'Choisissez un mot de passe différent de l’ancien.'
  if (/weak|should be at least|characters/i.test(m)) return 'Ce mot de passe est trop simple : au moins 8 caractères.'
  if (/session|jwt|not authenticated/i.test(m)) return 'Votre lien n’est plus valable : demandez-en un nouveau depuis « Mot de passe oublié ».'
  if (/http 50[234]|timeout|deadline|sending .*email/i.test(m)) return 'Notre service d’envoi d’e-mails ne répond pas pour le moment. Réessayez dans quelques minutes.'
  if (/failed to fetch|network/i.test(m)) return 'Connexion impossible : vérifiez votre accès à Internet.'
  return m || 'Une erreur est survenue.'
}

async function envoyerLien() {
  erreurGlobale.value = ''
  info.value = ''
  email.value = email.value.trim()
  const m = erreurEmail(email.value, { accepterJetable: true }) // un ancien compte doit pouvoir récupérer son accès
  erreurs.value = m ? { email: m } : {}
  if (m) return
  chargement.value = true
  try {
    await envoyerLienMotDePasse(email.value)
    if (etape.value === 'envoye') info.value = 'Nouvel e-mail envoyé : seul le dernier lien reçu fonctionne.'
    etape.value = 'envoye'
    lancerAttente()
  } catch (e) {
    erreurGlobale.value = traduire(e?.message)
  } finally {
    chargement.value = false
  }
}

async function changer() {
  erreurGlobale.value = ''
  const e = {}
  if (motDePasse.value.length < 8) e.motDePasse = 'Au moins 8 caractères'
  if (confirmation.value !== motDePasse.value) e.confirmation = 'Les mots de passe ne correspondent pas'
  erreurs.value = e
  if (Object.keys(e).length) return
  chargement.value = true
  try {
    await definirMotDePasse(motDePasse.value)
    etape.value = 'fini'
    setTimeout(() => emit('termine'), 1800)
  } catch (err) {
    erreurGlobale.value = traduire(err?.message)
  } finally {
    chargement.value = false
  }
}

function modifierAdresse() {
  etape.value = 'email'
  erreurs.value = {}
  erreurGlobale.value = ''
  info.value = ''
}
</script>

<template>
  <div class="mo">
    <!-- Mot de passe enregistré -->
    <div v-if="etape === 'fini'" class="mo-fini" role="status">
      <span class="mo-icone mo-icone-ok"><i class="fa-solid fa-check" aria-hidden="true"></i></span>
      <h2 id="auth-titre" class="mo-titre">Mot de passe modifié</h2>
      <p class="texte-secondaire">Vous êtes connecté avec votre nouveau mot de passe.</p>
    </div>

    <!-- E-mail envoyé : il reste à cliquer sur le lien -->
    <div v-else-if="etape === 'envoye'" class="mo-envoye" role="status">
      <span class="mo-icone mo-icone-mail"><i class="fa-solid fa-envelope-open-text" aria-hidden="true"></i></span>
      <h2 id="auth-titre" class="mo-titre">Vérifiez vos e-mails</h2>
      <p class="texte-secondaire mo-intro">
        Si un compte existe pour <strong>{{ email }}</strong>, un e-mail vient d’y être envoyé.
        <strong>Cliquez sur le lien qu’il contient</strong> : il ouvre le site pour choisir votre nouveau mot de passe. Il est valable 1 heure.
      </p>
      <p class="champ-aide">
        Rien reçu ? Regardez dans les indésirables, ou
        <button type="button" class="mo-lien" :disabled="attente > 0 || chargement" @click="envoyerLien">{{ attente > 0 ? `renvoyer l’e-mail dans ${attente} s` : 'renvoyer l’e-mail' }}</button>.
      </p>
      <BandeauAvertissement v-if="erreurGlobale" type="erreur" compact>{{ erreurGlobale }}</BandeauAvertissement>
      <BandeauAvertissement v-if="info" type="info" compact>{{ info }}</BandeauAvertissement>
    </div>

    <template v-else>
      <h2 id="auth-titre" class="mo-titre">{{ parLien ? 'Nouveau mot de passe' : 'Mot de passe oublié' }}</h2>
      <p class="texte-secondaire mo-intro">
        <template v-if="parLien">Votre lien est valide : choisissez votre nouveau mot de passe (8 caractères minimum).</template>
        <template v-else>Indiquez l’adresse e-mail de votre compte : nous vous envoyons un lien pour choisir un nouveau mot de passe.</template>
      </p>

      <!-- 1. Adresse e-mail -->
      <form v-if="etape === 'email'" class="mo-form" novalidate @submit.prevent="envoyerLien">
        <div class="champ">
          <label for="mo-email">Adresse e-mail</label>
          <input id="mo-email" v-model="email" type="email" maxlength="254" autocomplete="email" placeholder="vous@exemple.yt" :aria-invalid="!!erreurs.email" style="font-family: var(--font-corps)" />
          <p v-if="erreurs.email" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.email }}</p>
        </div>
        <BandeauAvertissement v-if="erreurGlobale" type="erreur" compact>{{ erreurGlobale }}</BandeauAvertissement>
        <div class="mo-actions">
          <BoutonBase type="submit" bloc :chargement="chargement" icone="fa-solid fa-paper-plane">Recevoir le lien</BoutonBase>
        </div>
      </form>

      <!-- 2. Arrivé par le lien : nouveau mot de passe -->
      <form v-else class="mo-form" novalidate @submit.prevent="changer">
        <div class="champ">
          <label for="mo-mdp">Nouveau mot de passe</label>
          <SaisieMotDePasse id="mo-mdp" v-model="motDePasse" autocomplete="new-password" placeholder="8 caractères minimum" :aria-invalid="!!erreurs.motDePasse" />
          <p v-if="erreurs.motDePasse" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.motDePasse }}</p>
        </div>
        <div class="champ">
          <label for="mo-conf">Confirmer le mot de passe</label>
          <SaisieMotDePasse id="mo-conf" v-model="confirmation" autocomplete="new-password" :aria-invalid="!!erreurs.confirmation" />
          <p v-if="erreurs.confirmation" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.confirmation }}</p>
        </div>

        <BandeauAvertissement v-if="erreurGlobale" type="erreur" compact>{{ erreurGlobale }}</BandeauAvertissement>
        <div class="mo-actions">
          <BoutonBase type="submit" bloc :chargement="chargement" icone="fa-solid fa-key">Changer mon mot de passe</BoutonBase>
        </div>
      </form>
    </template>

    <p v-if="etape !== 'fini'" class="mo-pied">
      <button v-if="etape === 'envoye'" type="button" class="mo-lien" @click="modifierAdresse">Modifier l’adresse</button>
      <button type="button" class="mo-lien" @click="emit('retour')"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> {{ parLien ? 'Plus tard' : connecte ? 'Annuler' : 'Retour à la connexion' }}</button>
    </p>
  </div>
</template>

<style scoped>
.mo { display: flex; flex: 1; flex-direction: column; }
.mo-titre { font-size: 2.2rem; color: var(--ardoise); }
.mo-intro { margin: 4px 0 20px; line-height: 1.55; }
.mo-intro strong { color: var(--ardoise); overflow-wrap: anywhere; }
.mo-form { display: flex; flex: 1; flex-direction: column; gap: 18px; }
.mo-actions { display: flex; margin-top: auto; }
.mo-envoye { display: flex; flex: 1; flex-direction: column; gap: 14px; }
.mo-envoye .mo-intro { margin: 0; }
.mo-lien { padding: 0; border: 0; background: transparent; color: var(--lagon-700); font: inherit; font-weight: 700; cursor: pointer; }
.mo-lien:hover:not(:disabled) { text-decoration: underline; text-underline-offset: 3px; }
.mo-lien:disabled { color: var(--texte-secondaire); font-weight: 500; cursor: default; }
.mo-lien i { margin-right: 4px; font-size: .85em; }
.mo-pied { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 24px; margin-top: 22px; font-size: .95rem; }
.mo-fini { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 24px 0; text-align: center; }
.mo-icone { width: 64px; height: 64px; display: grid; place-items: center; border-radius: 50%; font-size: 1.5rem; }
.mo-icone-ok { background: var(--succes-pastille); color: var(--succes-texte); }
.mo-icone-mail { background: var(--lagon-100); color: var(--lagon-700); }
@media (max-width: 480px) { .mo-titre { font-size: 1.9rem; } }
</style>

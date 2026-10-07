<script setup>
/**
 * Mot de passe oublié, dans la fenêtre de connexion :
 *  1. l'utilisateur saisit son e-mail et reçoit un code (e-mail « Reset Password » de Supabase, gabarit
 *     emails/mot-de-passe-oublie.html) ;
 *  2. il saisit ce code et choisit lui-même son nouveau mot de passe.
 * Le code vérifié ouvre la session du compte : c'est elle qui autorise le changement de mot de passe.
 * Que l'adresse ait un compte ou non, l'écran dit la même chose : on ne révèle pas qui est inscrit.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { demanderCodeMotDePasse, verifierCodeMotDePasse, definirMotDePasse } from '@/services/supabase/serviceAuth.js'
import { erreurEmail } from '@/services/validation.js'
import SaisieMotDePasse from '@/composants/commun/SaisieMotDePasse.vue'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import BandeauAvertissement from '@/composants/commun/BandeauAvertissement.vue'

const props = defineProps({
  emailInitial: { type: String, default: '' },
  connecte: Boolean // ouvert depuis le profil d'un compte déjà connecté : « Annuler » au lieu de « Retour à la connexion »
})
const emit = defineEmits(['retour', 'termine'])

const DELAI_RENVOI = 60 // secondes : Supabase n'envoie qu'un e-mail par minute à une même adresse
const etape = ref('email') // 'email' | 'code' | 'fini'
const email = ref(props.emailInitial.trim())
const code = ref('')
const motDePasse = ref('')
const confirmation = ref('')
const erreurs = ref({})
const erreurGlobale = ref('')
const info = ref('')
const chargement = ref(false)
const codeVerifie = ref(false) // le code ne sert qu'une fois : après lui, seul le mot de passe reste à enregistrer

// ---------- Renvoi du code ----------
const attente = ref(0)
let minuteur = null
function lancerAttente() {
  attente.value = DELAI_RENVOI
  clearInterval(minuteur)
  minuteur = setInterval(() => { if (--attente.value <= 0) clearInterval(minuteur) }, 1000)
}
onBeforeUnmount(() => clearInterval(minuteur))

const codePropre = computed(() => code.value.replace(/\D/g, ''))

function traduire(m = '') {
  if (/rate limit|security purposes|only request this after/i.test(m)) return 'Patientez une minute avant de demander un nouveau code.'
  if (/banned/i.test(m)) return 'Ce compte a été suspendu par l’équipe BTM. Pour toute question : contact@btm.yt.'
  if (/same|different from the old/i.test(m)) return 'Choisissez un mot de passe différent de l’ancien.'
  if (/weak|should be at least|characters/i.test(m)) return 'Ce mot de passe est trop simple : au moins 8 caractères.'
  if (/http 50[234]|timeout|deadline|sending .*email/i.test(m)) return 'Notre service d’envoi d’e-mails ne répond pas pour le moment. Réessayez dans quelques minutes.'
  if (/failed to fetch|network/i.test(m)) return 'Connexion impossible : vérifiez votre accès à Internet.'
  return m || 'Une erreur est survenue.'
}

async function envoyerCode() {
  erreurGlobale.value = ''
  info.value = ''
  email.value = email.value.trim()
  const m = erreurEmail(email.value, { accepterJetable: true }) // un ancien compte doit pouvoir récupérer son accès
  erreurs.value = m ? { email: m } : {}
  if (m) return
  chargement.value = true
  try {
    await demanderCodeMotDePasse(email.value)
    const renvoi = etape.value === 'code'
    etape.value = 'code'
    if (renvoi) { code.value = ''; info.value = 'Nouveau code envoyé : seul le dernier code reçu fonctionne.' }
    lancerAttente()
  } catch (e) {
    erreurGlobale.value = traduire(e?.message)
  } finally {
    chargement.value = false
  }
}

async function changer() {
  erreurGlobale.value = ''
  info.value = ''
  const e = {}
  if (!codeVerifie.value && codePropre.value.length < 6) e.code = 'Saisissez le code reçu par e-mail'
  if (motDePasse.value.length < 8) e.motDePasse = 'Au moins 8 caractères'
  if (confirmation.value !== motDePasse.value) e.confirmation = 'Les mots de passe ne correspondent pas'
  erreurs.value = e
  if (Object.keys(e).length) return
  chargement.value = true
  try {
    if (!codeVerifie.value) {
      try {
        await verifierCodeMotDePasse(email.value, codePropre.value)
      } catch (err) {
        const message = err?.message || ''
        if (/banned|failed to fetch|network/i.test(message)) throw err
        erreurs.value = { code: 'Code incorrect ou expiré. Vérifiez-le, ou demandez un nouveau code.' }
        return
      }
      codeVerifie.value = true
    }
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
  code.value = ''
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

    <template v-else>
      <h2 id="auth-titre" class="mo-titre">Mot de passe oublié</h2>
      <p class="texte-secondaire mo-intro">
        <template v-if="etape === 'email'">Indiquez l’adresse e-mail de votre compte : nous vous envoyons un code pour choisir un nouveau mot de passe.</template>
        <template v-else>Si un compte existe pour <strong>{{ email }}</strong>, un code vient d’y être envoyé. Il est valable 1 heure.</template>
      </p>

      <!-- 1. Adresse e-mail -->
      <form v-if="etape === 'email'" class="mo-form" novalidate @submit.prevent="envoyerCode">
        <div class="champ">
          <label for="mo-email">Adresse e-mail</label>
          <input id="mo-email" v-model="email" type="email" maxlength="254" autocomplete="email" placeholder="vous@exemple.yt" :aria-invalid="!!erreurs.email" style="font-family: var(--font-corps)" />
          <p v-if="erreurs.email" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.email }}</p>
        </div>
        <BandeauAvertissement v-if="erreurGlobale" type="erreur" compact>{{ erreurGlobale }}</BandeauAvertissement>
        <div class="mo-actions">
          <BoutonBase type="submit" bloc :chargement="chargement" icone="fa-solid fa-paper-plane">Recevoir le code</BoutonBase>
        </div>
      </form>

      <!-- 2. Code reçu + nouveau mot de passe -->
      <form v-else class="mo-form" novalidate @submit.prevent="changer">
        <div v-if="!codeVerifie" class="champ">
          <label for="mo-code">Code reçu par e-mail</label>
          <input id="mo-code" v-model="code" class="mo-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="12" placeholder="••••••" :aria-invalid="!!erreurs.code" />
          <p v-if="erreurs.code" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.code }}</p>
          <p v-else class="champ-aide">
            Rien reçu ? Regardez dans les indésirables, ou
            <button type="button" class="mo-lien" :disabled="attente > 0 || chargement" @click="envoyerCode">{{ attente > 0 ? `renvoyer le code dans ${attente} s` : 'renvoyer le code' }}</button>.
          </p>
        </div>
        <p v-else class="mo-verifie"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Code vérifié : il ne reste qu’à choisir votre mot de passe.</p>

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
        <BandeauAvertissement v-if="info" type="info" compact>{{ info }}</BandeauAvertissement>
        <div class="mo-actions">
          <BoutonBase type="submit" bloc :chargement="chargement" icone="fa-solid fa-key">Changer mon mot de passe</BoutonBase>
        </div>
      </form>

      <p class="mo-pied">
        <button v-if="etape === 'code' && !codeVerifie" type="button" class="mo-lien" @click="modifierAdresse">Modifier l’adresse</button>
        <button type="button" class="mo-lien" @click="emit('retour')"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> {{ connecte ? 'Annuler' : 'Retour à la connexion' }}</button>
      </p>
    </template>
  </div>
</template>

<style scoped>
.mo { display: flex; flex: 1; flex-direction: column; }
.mo-titre { font-size: 2.2rem; color: var(--ardoise); }
.mo-intro { margin: 4px 0 20px; line-height: 1.55; }
.mo-intro strong { color: var(--ardoise); overflow-wrap: anywhere; }
.mo-form { display: flex; flex: 1; flex-direction: column; gap: 18px; }
.mo-actions { display: flex; margin-top: auto; }
.mo-code { font-family: var(--font-mono); font-size: 1.5rem; font-weight: 600; letter-spacing: .32em; text-align: center; }
.mo-code::placeholder { color: var(--gris-300); }
.mo-verifie { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: var(--rayon); background: #ecfdf5; color: #065f46; font-size: .92rem; font-weight: 500; }
.mo-lien { padding: 0; border: 0; background: transparent; color: var(--lagon-700); font: inherit; font-weight: 700; cursor: pointer; }
.mo-lien:hover:not(:disabled) { text-decoration: underline; text-underline-offset: 3px; }
.mo-lien:disabled { color: var(--texte-secondaire); font-weight: 500; cursor: default; }
.mo-lien i { margin-right: 4px; font-size: .85em; }
.mo-pied { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 24px; margin-top: 22px; font-size: .95rem; }
.mo-fini { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 24px 0; text-align: center; }
.mo-icone { width: 64px; height: 64px; display: grid; place-items: center; border-radius: 50%; font-size: 1.5rem; }
.mo-icone-ok { background: #d1fae5; color: #047857; }
@media (max-width: 480px) { .mo-titre { font-size: 1.9rem; } .mo-code { font-size: 1.3rem; letter-spacing: .24em; } }
</style>

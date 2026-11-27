<script setup>
/**
 * Mot de passe oublié, dans la fenêtre de connexion :
 *  1. l'utilisateur saisit son e-mail et reçoit un code à 6 chiffres (valable 10 minutes, une seule fois) ;
 *  2. il saisit ce code et choisit son nouveau mot de passe : la session s'ouvre, ses autres appareils sont déconnectés.
 * Que l'adresse ait un compte ou non, l'écran dit la même chose : on ne révèle pas qui est inscrit.
 */
import { onBeforeUnmount, ref } from 'vue'
import { envoyerCodeMotDePasse, reinitialiserMotDePasse } from '@/services/api/serviceAuth.js'
import { erreurEmail } from '@/services/validation.js'
import SaisieMotDePasse from '@/composants/commun/SaisieMotDePasse.vue'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import BandeauAvertissement from '@/composants/commun/BandeauAvertissement.vue'

const props = defineProps({
  emailInitial: { type: String, default: '' },
  connecte: Boolean, // ouvert depuis le profil d'un compte déjà connecté : « Annuler » au lieu de « Retour à la connexion »
  parLien: Boolean, // ancien parcours par lien (gardé pour compatibilité, sans effet)
  lienExpire: Boolean
})
const emit = defineEmits(['retour', 'termine'])

const DELAI_RENVOI = 60 // secondes : l'API n'envoie qu'un code par minute à une même adresse
const etape = ref('email') // 'email' | 'code' | 'fini'
const email = ref(props.emailInitial.trim())
const code = ref('')
const motDePasse = ref('')
const confirmation = ref('')
const erreurs = ref({})
const erreurGlobale = ref(props.lienExpire ? 'Ce lien n’est plus utilisé : demandez un code ci-dessous.' : '')
const info = ref('')
const chargement = ref(false)

// ---------- Renvoi du code ----------
const attente = ref(0)
let minuteur = null
function lancerAttente() {
  attente.value = DELAI_RENVOI
  clearInterval(minuteur)
  minuteur = setInterval(() => { if (--attente.value <= 0) clearInterval(minuteur) }, 1000)
}
onBeforeUnmount(() => clearInterval(minuteur))

async function envoyerCode() {
  erreurGlobale.value = ''
  info.value = ''
  email.value = email.value.trim()
  const m = erreurEmail(email.value, { accepterJetable: true }) // un ancien compte doit pouvoir récupérer son accès
  erreurs.value = m ? { email: m } : {}
  if (m) return
  chargement.value = true
  try {
    await envoyerCodeMotDePasse(email.value)
    if (etape.value === 'code') info.value = 'Nouveau code envoyé : seul le dernier reçu fonctionne.'
    etape.value = 'code'
    lancerAttente()
  } catch (e) {
    erreurGlobale.value = e?.message || 'Une erreur est survenue.'
  } finally {
    chargement.value = false
  }
}

async function changer() {
  erreurGlobale.value = ''
  const e = {}
  code.value = code.value.replace(/\D/g, '')
  if (code.value.length !== 6) e.code = 'Le code contient 6 chiffres'
  if (motDePasse.value.length < 8) e.motDePasse = 'Au moins 8 caractères'
  else if (!/\p{Lu}/u.test(motDePasse.value) || !/\p{Ll}/u.test(motDePasse.value) || !/[0-9]/.test(motDePasse.value)) e.motDePasse = 'Au moins une majuscule, une minuscule et un chiffre'
  if (confirmation.value !== motDePasse.value) e.confirmation = 'Les mots de passe ne correspondent pas'
  erreurs.value = e
  if (Object.keys(e).length) return
  chargement.value = true
  try {
    await reinitialiserMotDePasse(email.value, code.value, motDePasse.value)
    etape.value = 'fini'
    setTimeout(() => emit('termine'), 1800)
  } catch (err) {
    erreurGlobale.value = err?.message || 'Une erreur est survenue.'
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
        <template v-if="etape === 'code'">Si un compte existe pour <strong>{{ email }}</strong>, un code à 6 chiffres vient d’y être envoyé (valable 10 minutes). Saisissez-le, puis choisissez votre nouveau mot de passe.</template>
        <template v-else>Indiquez l’adresse e-mail de votre compte : nous vous envoyons un code pour choisir un nouveau mot de passe.</template>
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
        <div class="champ">
          <label for="mo-code">Code reçu par e-mail</label>
          <input id="mo-code" v-model="code" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="123456" class="mono" :aria-invalid="!!erreurs.code" />
          <p v-if="erreurs.code" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.code }}</p>
          <p v-else class="champ-aide">
            Rien reçu ? Regardez dans les indésirables, ou
            <button type="button" class="mo-lien" :disabled="attente > 0 || chargement" @click="envoyerCode">{{ attente > 0 ? `renvoyer un code dans ${attente} s` : 'renvoyer un code' }}</button>.
          </p>
        </div>
        <div class="champ">
          <label for="mo-mdp">Nouveau mot de passe</label>
          <SaisieMotDePasse id="mo-mdp" v-model="motDePasse" autocomplete="new-password" placeholder="8 caractères, majuscule, minuscule, chiffre" :aria-invalid="!!erreurs.motDePasse" />
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
    </template>

    <p v-if="etape !== 'fini'" class="mo-pied">
      <button v-if="etape === 'code'" type="button" class="mo-lien" @click="modifierAdresse">Modifier l’adresse</button>
      <button type="button" class="mo-lien" @click="emit('retour')"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> {{ connecte ? 'Annuler' : 'Retour à la connexion' }}</button>
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

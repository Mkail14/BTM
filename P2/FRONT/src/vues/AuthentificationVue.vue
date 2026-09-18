<script setup>
/**
 * Connexion / Inscription — connectées à Supabase Auth si configuré,
 * sinon affichées comme structure d'interface (stub, section 10.6 du CDC).
 */
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth.js'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import BandeauAvertissement from '@/composants/commun/BandeauAvertissement.vue'
import LogoBtm from '@/composants/commun/LogoBtm.vue'

const props = defineProps({
  mode: { type: String, default: 'connexion' },
  modal: { type: Boolean, default: false }
})
const emit = defineEmits(['fermer', 'changer-mode'])
const router = useRouter()
const { connexion, inscription, backendDisponible, connecte } = useAuth()

const email = ref('')
const motDePasse = ref('')
const confirmation = ref('')
const resterConnecte = ref(true)
const cgu = ref(false)
const erreurs = ref({})
const erreurGlobale = ref('')
const succes = ref('')
const chargement = ref(false)
const estInscription = computed(() => props.mode === 'inscription')

watch(() => props.mode, () => { erreurs.value = {}; erreurGlobale.value = ''; succes.value = '' })
watch(connecte, (v) => { if (v) router.push('/dashboard') })

function valider() {
  const e = {}
  if (!email.value.trim()) e.email = 'Ce champ est obligatoire'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) e.email = 'Adresse e-mail invalide'
  if (!motDePasse.value) e.motDePasse = 'Ce champ est obligatoire'
  else if (motDePasse.value.length < 8) e.motDePasse = 'Au moins 8 caractères'
  if (estInscription.value) {
    if (confirmation.value !== motDePasse.value) e.confirmation = 'Les mots de passe ne correspondent pas'
    if (!cgu.value) e.cgu = 'Vous devez accepter les conditions d’utilisation'
  }
  erreurs.value = e
  return Object.keys(e).length === 0
}

async function soumettre() {
  erreurGlobale.value = ''; succes.value = ''
  if (!valider()) return
  if (!backendDisponible) { erreurGlobale.value = 'Le backend Supabase n’est pas encore configuré : ce formulaire est une maquette fonctionnelle.'; return }
  chargement.value = true
  try {
    if (estInscription.value) {
      await inscription(email.value.trim(), motDePasse.value)
      succes.value = 'Compte créé ! Vérifiez votre boîte mail si une confirmation est requise, puis connectez-vous.'
    } else {
      await connexion(email.value.trim(), motDePasse.value)
      router.push('/dashboard')
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
        <p>Synchronisez vos estimations entre vos appareils et retrouvez vos projets où que vous soyez sur l’île.</p>
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

        <form novalidate @submit.prevent="soumettre" class="auth-form">
          <div class="champ">
            <label for="auth-email">Adresse e-mail</label>
            <input id="auth-email" v-model="email" type="email" autocomplete="email" placeholder="vous@exemple.yt" :aria-invalid="!!erreurs.email" style="font-family: var(--font-corps)" />
            <p v-if="erreurs.email" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.email }}</p>
          </div>
          <div class="champ">
            <label for="auth-mdp">Mot de passe</label>
            <input id="auth-mdp" v-model="motDePasse" type="password" :autocomplete="estInscription ? 'new-password' : 'current-password'" placeholder="8 caractères minimum" :aria-invalid="!!erreurs.motDePasse" style="font-family: var(--font-corps)" />
            <p v-if="erreurs.motDePasse" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.motDePasse }}</p>
          </div>
          <div v-if="estInscription" class="champ">
            <label for="auth-conf">Confirmer le mot de passe</label>
            <input id="auth-conf" v-model="confirmation" type="password" autocomplete="new-password" :aria-invalid="!!erreurs.confirmation" style="font-family: var(--font-corps)" />
            <p v-if="erreurs.confirmation" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.confirmation }}</p>
          </div>

          <label v-if="!estInscription" class="auth-case"><input v-model="resterConnecte" type="checkbox" /> Rester connecté</label>
          <div v-else>
            <label class="auth-case"><input v-model="cgu" type="checkbox" :aria-invalid="!!erreurs.cgu" /> J’accepte les <a href="#" @click.prevent>conditions générales d’utilisation</a></label>
            <p v-if="erreurs.cgu" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.cgu }}</p>
          </div>

          <BandeauAvertissement v-if="erreurGlobale" type="erreur" compact>{{ erreurGlobale }}</BandeauAvertissement>
          <BandeauAvertissement v-if="succes" type="succes" compact>{{ succes }}</BandeauAvertissement>

          <BoutonBase type="submit" bloc :chargement="chargement" :icone="estInscription ? 'fa-solid fa-user-plus' : 'fa-solid fa-right-to-bracket'">
            {{ estInscription ? 'Créer mon compte' : 'Se connecter' }}
          </BoutonBase>
        </form>

        <p class="auth-bascule">
          <template v-if="estInscription">
            Déjà un compte ?
            <button v-if="modal" type="button" @click="emit('changer-mode', 'connexion')">Se connecter</button>
            <router-link v-else to="/connexion">Se connecter</router-link>
          </template>
          <template v-else>
            Pas encore de compte ?
            <button v-if="modal" type="button" @click="emit('changer-mode', 'inscription')">S’inscrire</button>
            <router-link v-else to="/inscription">S’inscrire</router-link>
          </template>
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.auth-grille { display: grid; gap: 32px; grid-template-columns: 1fr; align-items: center; max-width: 1000px; }
@media (min-width: 900px) { .auth-grille { grid-template-columns: 1fr 1fr; } }
.auth-visuel { display: none; padding: 40px; border-radius: var(--rayon-lg); color: #fff; background: var(--ardoise); }
@media (min-width: 900px) { .auth-visuel { display: block; } }
.auth-visuel h2 { font-size: 2.4rem; margin: 22px 0 12px; }
.auth-visuel p { opacity: .9; line-height: 1.6; }
.auth-visuel ul { margin-top: 26px; display: flex; flex-direction: column; gap: 12px; }
.auth-visuel li { display: flex; gap: 12px; align-items: center; font-weight: 500; }
.auth-visuel li i { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: rgba(255,255,255,.15); color: var(--sable); }
.auth-carte { padding: 36px; border-radius: var(--rayon-lg); }
.auth-carte h1 { font-size: 2.2rem; color: var(--ardoise); }
.auth-intro { margin: 4px 0 20px; }
.auth-note { margin-bottom: 20px; }
.auth-note code { font-family: var(--font-mono); font-size: .8rem; background: rgba(0,0,0,.06); padding: 1px 5px; border-radius: 4px; }
.auth-form { display: flex; flex-direction: column; gap: 18px; }
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
</style>

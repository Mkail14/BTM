<script setup>
/**
 * Page ouverte depuis le lien de l'e-mail « réinitialisation du mot de passe » : envoyé par un admin, ou lien de secours
 * de « Mot de passe oublié » (le parcours normal utilise le code du même e-mail, dans la fenêtre de connexion).
 * Supabase ouvre une session temporaire à partir du lien ; on y définit le nouveau mot de passe.
 */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase, supabaseConfigure } from '@/services/supabase/client.js'
import { lireRoleCompte } from '@/services/supabase/serviceAdmin.js'
import SaisieMotDePasse from '@/composants/commun/SaisieMotDePasse.vue'
import BoutonBase from '@/composants/commun/BoutonBase.vue'

const router = useRouter()
const pret = ref(false)
const lienValide = ref(false)
const motDePasse = ref('')
const confirmation = ref('')
const erreur = ref('')
const chargement = ref(false)
const termine = ref(false)

onMounted(async () => {
  if (supabaseConfigure) {
    // laisse à Supabase le temps de lire le lien (#access_token=…) et d'ouvrir la session
    for (let i = 0; i < 10 && !lienValide.value; i++) {
      const { data } = await supabase.auth.getSession()
      lienValide.value = !!data.session
      if (!lienValide.value) await new Promise((r) => setTimeout(r, 300))
    }
  }
  pret.value = true
})

async function enregistrer() {
  erreur.value = ''
  if (motDePasse.value.length < 8) { erreur.value = 'Le mot de passe doit contenir au moins 8 caractères.'; return }
  if (motDePasse.value !== confirmation.value) { erreur.value = 'Les mots de passe ne correspondent pas.'; return }
  chargement.value = true
  try {
    const { error } = await supabase.auth.updateUser({ password: motDePasse.value })
    if (error) throw error
    termine.value = true
    // chacun rejoint son espace : tableau de bord (admin), espace fournisseur (compte créé par l'admin), accueil
    const { data } = await supabase.auth.getUser()
    const { role, fournisseur_id: fid } = await lireRoleCompte(data.user?.id)
    const destination = role === 'admin' ? '/admin' : role === 'fournisseur' && fid ? '/espace-fournisseur' : '/'
    setTimeout(() => router.push(destination), 2500)
  } catch (e) {
    erreur.value = /same|different/i.test(e?.message || '') ? 'Choisissez un mot de passe différent de l’ancien.' : (e?.message || 'Impossible de modifier le mot de passe.')
  } finally {
    chargement.value = false
  }
}
</script>

<template>
  <div id="page-nouveau-mdp" class="page">
    <div class="conteneur nmdp">
      <section class="carte nmdp-carte">
        <div v-if="!pret" class="nmdp-centre"><span class="spinner spinner-grand"></span></div>

        <template v-else-if="termine">
          <div class="nmdp-icone nmdp-ok"><i class="fa-solid fa-check" aria-hidden="true"></i></div>
          <h1>Mot de passe modifié</h1>
          <p class="texte-secondaire">Vous êtes connecté. Redirection vers l’accueil…</p>
        </template>

        <template v-else-if="!lienValide">
          <div class="nmdp-icone nmdp-ko"><i class="fa-solid fa-link-slash" aria-hidden="true"></i></div>
          <h1>Lien invalide ou expiré</h1>
          <p class="texte-secondaire">Ce lien de réinitialisation n’est plus valable. Ouvrez « Connexion », puis « Mot de passe oublié ? » pour en recevoir un nouveau.</p>
          <BoutonBase to="/" variante="secondaire">Retour à l’accueil</BoutonBase>
        </template>

        <template v-else>
          <div class="nmdp-icone"><i class="fa-solid fa-key" aria-hidden="true"></i></div>
          <h1>Nouveau mot de passe</h1>
          <p class="texte-secondaire">Choisissez un mot de passe d’au moins 8 caractères.</p>
          <form novalidate @submit.prevent="enregistrer">
            <div class="champ">
              <label for="nmdp-1">Nouveau mot de passe</label>
              <SaisieMotDePasse id="nmdp-1" v-model="motDePasse" autocomplete="new-password" placeholder="8 caractères minimum" />
            </div>
            <div class="champ">
              <label for="nmdp-2">Confirmer le mot de passe</label>
              <SaisieMotDePasse id="nmdp-2" v-model="confirmation" autocomplete="new-password" />
            </div>
            <p v-if="erreur" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreur }}</p>
            <BoutonBase type="submit" :chargement="chargement" icone="fa-solid fa-check" class="nmdp-valider">Enregistrer</BoutonBase>
          </form>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.nmdp { display: grid; place-items: start center; }
.nmdp-carte { width: min(100%, 460px); padding: 34px 30px; text-align: center; }
.nmdp-carte h1 { margin: 14px 0 6px; font-size: 1.9rem; color: var(--ardoise); }
.nmdp-carte p { margin: 0 0 20px; }
.nmdp-carte form { display: grid; gap: 16px; text-align: left; }
.nmdp-carte form :deep(.btn) { width: 100%; justify-content: center; min-height: 48px; }
.nmdp-centre { display: grid; place-items: center; min-height: 160px; }
.nmdp-icone { width: 56px; height: 56px; margin: 0 auto; display: grid; place-items: center; border-radius: 50%; background: var(--lagon-50); color: var(--lagon-700, var(--lagon-600)); font-size: 1.3rem; }
.nmdp-ok { background: #d1fae5; color: #047857; }
.nmdp-ko { background: var(--erreur-clair); color: var(--erreur); }
@media (max-width: 480px) { .nmdp-carte { padding: 26px 18px; } }
</style>

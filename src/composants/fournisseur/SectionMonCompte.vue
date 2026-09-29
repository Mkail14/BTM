<script setup>
/**
 * Mon compte (fournisseur) : identifiants de connexion du responsable — nom d'utilisateur,
 * téléphone, e-mail et mot de passe. Même logique que le profil du site public (mettreAJourProfil).
 */
import { computed, ref, watch } from 'vue'
import { useAuth } from '@/composables/useAuth.js'
import { useAdmin } from '@/composables/useAdmin.js'
import { nettoyerPseudo, erreurPseudo, erreurEmail } from '@/services/validation.js'
import ChampTelephone from '@/composants/commun/ChampTelephone.vue'
import SaisieMotDePasse from '@/composants/commun/SaisieMotDePasse.vue'

const { utilisateur, mettreAJourProfil } = useAuth()
const { notifier } = useAdmin()

// ---------- Informations ----------
const depuisCompte = () => {
  const m = utilisateur.value?.user_metadata || {}
  return { pseudo: m.pseudo || '', telephone: m.telephone || '', email: utilisateur.value?.email || '' }
}
const infos = ref(depuisCompte())
watch(() => utilisateur.value?.id, () => { infos.value = depuisCompte() })
const telephoneValide = ref(true)
const modifie = computed(() => Object.entries(depuisCompte()).some(([c, v]) => infos.value[c] !== v))
const erreurInfos = ref('')
const enregistrementInfos = ref(false)

async function enregistrerInfos() {
  const i = infos.value
  // le pseudo créé avec l'accès reprend le nom de l'entreprise (espaces compris) : on ne le contrôle que s'il est modifié
  const pseudoModifie = i.pseudo !== depuisCompte().pseudo
  erreurInfos.value = (pseudoModifie && erreurPseudo(i.pseudo)) || erreurEmail(i.email) || (!telephoneValide.value ? 'Numéro de téléphone incomplet ou invalide.' : '')
  if (erreurInfos.value) return
  const ancienEmail = utilisateur.value?.email
  enregistrementInfos.value = true
  try {
    utilisateur.value = await mettreAJourProfil({ pseudo: i.pseudo, telephone: i.telephone, email: i.email.trim().toLowerCase() })
    notifier(i.email.trim().toLowerCase() !== ancienEmail ? 'Un e-mail de confirmation a été envoyé à la nouvelle adresse.' : 'Vos informations ont été enregistrées.')
  } catch (e) {
    erreurInfos.value = e?.message || 'Impossible d’enregistrer vos informations.'
  } finally {
    enregistrementInfos.value = false
  }
}

// ---------- Mot de passe ----------
const mdp = ref({ ancien: '', nouveau: '', confirmation: '' })
const erreurMdp = ref('')
const enregistrementMdp = ref(false)

async function changerMotDePasse() {
  const m = mdp.value
  erreurMdp.value = !m.ancien ? 'Renseignez votre mot de passe actuel.'
    : m.nouveau.length < 8 ? 'Le nouveau mot de passe doit contenir au moins 8 caractères.'
    : m.nouveau !== m.confirmation ? 'Les mots de passe ne correspondent pas.' : ''
  if (erreurMdp.value) return
  enregistrementMdp.value = true
  try {
    await mettreAJourProfil({ ancienMotDePasse: m.ancien, motDePasse: m.nouveau })
    mdp.value = { ancien: '', nouveau: '', confirmation: '' }
    notifier('Votre mot de passe a été modifié.')
  } catch (e) {
    erreurMdp.value = e?.message || 'Impossible de modifier le mot de passe.'
  } finally {
    enregistrementMdp.value = false
  }
}
</script>

<template>
  <div class="mc">
    <form class="adm-carte adm-carte-pad" novalidate @submit.prevent="enregistrerInfos">
      <div class="adm-carte-tete"><div><h2>Informations du compte</h2><p>La personne qui se connecte à l’espace fournisseur.</p></div></div>
      <div class="adm-grille-form">
        <div class="adm-champ">
          <label for="mc-pseudo">Nom d’utilisateur</label>
          <input id="mc-pseudo" :value="infos.pseudo" autocomplete="username" maxlength="20" @input="infos.pseudo = nettoyerPseudo($event.target.value)" />
        </div>
        <div class="adm-champ">
          <label for="mc-email">E-mail de connexion</label>
          <input id="mc-email" v-model="infos.email" type="email" autocomplete="email" />
        </div>
        <div class="plein">
          <ChampTelephone id="mc-tel" v-model="infos.telephone" v-model:valide="telephoneValide" label="Téléphone du responsable" />
        </div>
      </div>
      <p class="mc-aide"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Changer l’e-mail envoie un lien de confirmation à la nouvelle adresse. Le téléphone de l’entreprise se modifie dans « Ma fiche ».</p>
      <p v-if="erreurInfos" class="adm-erreur-texte" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ erreurInfos }}</p>
      <div class="mc-actions">
        <button type="submit" class="adm-btn adm-btn-noir" :disabled="!modifie || enregistrementInfos">
          <span v-if="enregistrementInfos" class="spinner" aria-hidden="true"></span> Enregistrer
        </button>
      </div>
    </form>

    <form class="adm-carte adm-carte-pad" novalidate @submit.prevent="changerMotDePasse">
      <div class="adm-carte-tete"><div><h2>Mot de passe</h2><p>8 caractères minimum.</p></div></div>
      <div class="mc-mdp">
        <div class="adm-champ"><label for="mc-mdp-ancien">Mot de passe actuel</label><SaisieMotDePasse id="mc-mdp-ancien" v-model="mdp.ancien" autocomplete="current-password" /></div>
        <div class="adm-champ"><label for="mc-mdp-nouveau">Nouveau mot de passe</label><SaisieMotDePasse id="mc-mdp-nouveau" v-model="mdp.nouveau" autocomplete="new-password" /></div>
        <div class="adm-champ"><label for="mc-mdp-conf">Confirmer le nouveau mot de passe</label><SaisieMotDePasse id="mc-mdp-conf" v-model="mdp.confirmation" autocomplete="new-password" /></div>
      </div>
      <p v-if="erreurMdp" class="adm-erreur-texte" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ erreurMdp }}</p>
      <div class="mc-actions">
        <button type="submit" class="adm-btn adm-btn-noir" :disabled="!mdp.ancien || !mdp.nouveau || enregistrementMdp">
          <span v-if="enregistrementMdp" class="spinner" aria-hidden="true"></span> Changer le mot de passe
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.mc { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 20px; align-items: start; }
.mc-mdp { display: flex; flex-direction: column; gap: 16px; }
.mc-aide { display: flex; align-items: flex-start; gap: 8px; margin: 16px 0 0; font-size: .82rem; color: var(--adm-encre-2); line-height: 1.5; }
.mc-aide i { margin-top: 3px; }
.mc-actions { display: flex; justify-content: flex-end; margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--adm-ligne-2); }
@media (max-width: 1100px) { .mc { grid-template-columns: 1fr; } }
@media (min-width: 1101px) and (min-height: 640px) {
  .mc { height: 100%; align-items: stretch; }
  .mc > form { display: flex; flex-direction: column; min-height: 0; overflow-y: auto; }
  .mc-actions { margin-top: auto; }
}
</style>

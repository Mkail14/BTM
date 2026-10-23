<script setup>
/**
 * Connexion et sécurité (Mon compte du fournisseur), sur deux colonnes :
 *  - identifiants du responsable (nom d'utilisateur, e-mail, téléphone) et sécurité (mot de passe, lien de
 *    réinitialisation par e-mail, e-mail vérifié) ;
 *  - activité du compte (création, dernière connexion, méthodes) et déconnexion de tous les appareils.
 * Lecture d'abord ; « Modifier » ouvre les identifiants, « Changer » le mot de passe.
 */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth.js'
import { useAdmin } from '@/composables/useAdmin.js'
import { nettoyerPseudo, erreurPseudo, erreurEmail } from '@/services/validation.js'
import { formaterTelephone } from '@/services/telephone.js'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'
import { useEspaceFournisseur } from '@/composables/useEspaceFournisseur.js'
import ChampTelephone from '@/composants/commun/ChampTelephone.vue'
import SaisieMotDePasse from '@/composants/commun/SaisieMotDePasse.vue'

const { utilisateur, mettreAJourProfil, envoyerLienMotDePasse, deconnexionPartout, supprimerCompte, deconnexion } = useAuth()
const { notifier, confirmer } = useAdmin()

// ---------- Informations ----------
const depuisCompte = () => {
  const m = utilisateur.value?.user_metadata || {}
  return { pseudo: m.pseudo || '', telephone: m.telephone || '', email: utilisateur.value?.email || '' }
}
const compte = computed(depuisCompte)
const edition = ref(null) // null : lecture ; 'infos' ; 'email' ; 'mdp'
const infos = ref(depuisCompte())
watch(() => utilisateur.value?.id, () => { infos.value = depuisCompte(); edition.value = null })
const telephoneValide = ref(true)
const erreurInfos = ref('')
const enregistrementInfos = ref(false)

function modifier() { infos.value = depuisCompte(); erreurInfos.value = ''; edition.value = 'infos' }
function changerMdp() { mdp.value = { ancien: '', nouveau: '', confirmation: '' }; erreurMdp.value = ''; edition.value = 'mdp' }

async function enregistrerInfos() {
  const i = infos.value
  // le pseudo créé avec l'accès reprend le nom de l'entreprise (espaces compris) : on ne le contrôle que s'il est modifié
  const pseudoModifie = i.pseudo !== depuisCompte().pseudo
  erreurInfos.value = (pseudoModifie && erreurPseudo(i.pseudo)) || (!telephoneValide.value ? 'Numéro de téléphone incomplet ou invalide.' : '')
  if (erreurInfos.value) return
  enregistrementInfos.value = true
  try {
    // l'e-mail ne passe pas par ici : il se change avec un code (changement d'e-mail plus bas)
    utilisateur.value = await mettreAJourProfil({ pseudo: i.pseudo, telephone: i.telephone })
    notifier('Vos informations ont été enregistrées.')
    edition.value = null
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
    edition.value = null
  } catch (e) {
    erreurMdp.value = e?.message || 'Impossible de modifier le mot de passe.'
  } finally {
    enregistrementMdp.value = false
  }
}

// ---------- Changement d'e-mail : Supabase envoie un lien, l'adresse change quand on clique dessus ----------
const flux = ref(null) // { nouvel, envoi, erreur }
function changerEmail() {
  flux.value = { nouvel: '', envoi: false, erreur: '' }
  edition.value = 'email'
}
async function envoyerLienEmail() {
  const f = flux.value
  const nouvel = f.nouvel.trim().toLowerCase()
  f.erreur = erreurEmail(nouvel) || (nouvel === utilisateur.value?.email ? 'C’est déjà votre adresse actuelle.' : '')
  if (f.erreur) return
  f.envoi = true
  try {
    utilisateur.value = await mettreAJourProfil({ email: nouvel })
    notifier(`Lien de confirmation envoyé à ${nouvel} : l’adresse changera quand vous cliquerez dessus.`)
    edition.value = null
  } catch (e) {
    f.erreur = e?.message || 'Envoi du lien impossible.'
    f.envoi = false
  }
}

// ---------- Mot de passe oublié : lien de réinitialisation par e-mail ----------
const lienEnvoye = ref(false)
const envoiLien = ref(false)
async function envoyerLien() {
  envoiLien.value = true
  try {
    await envoyerLienMotDePasse(utilisateur.value.email)
    lienEnvoye.value = true
    notifier(`Lien envoyé à ${utilisateur.value.email}.`)
  } catch (e) {
    notifier(e?.message || 'Envoi impossible pour le moment.', 'erreur')
  } finally {
    envoiLien.value = false
  }
}

// ---------- Activité du compte (données de Supabase Auth) ----------
const dateHeure = (d) => (d ? new Intl.DateTimeFormat('fr-FR', { timeZone: 'Indian/Mayotte', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d)) : null)
const date = (d) => (d ? new Intl.DateTimeFormat('fr-FR', { timeZone: 'Indian/Mayotte', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d)) : null)
const METHODES = { email: 'E-mail et mot de passe', google: 'Google' }
const methodes = computed(() => (utilisateur.value?.app_metadata?.providers || ['email']).map((p) => METHODES[p] || p).join(', '))

// ---------- Se déconnecter de tous les appareils ----------
const router = useRouter()
const deconnexionEnCours = ref(false)
async function toutDeconnecter() {
  const ok = await confirmer({
    titre: 'Se déconnecter partout ?',
    texte: 'Votre session sera fermée sur tous les appareils, celui-ci compris. Il faudra vous reconnecter.',
    libelle: 'Tout déconnecter', danger: true
  })
  if (!ok) return
  deconnexionEnCours.value = true
  try {
    await deconnexionPartout()
    router.push('/')
  } catch (e) {
    notifier(e?.message || 'Déconnexion impossible pour le moment.', 'erreur')
    deconnexionEnCours.value = false
  }
}

// ---------- Fermer le compte : mot de passe + phrase tapée au clavier (vérifiés aussi par la fonction supprimer-compte) ----------
const { fiche, soldeBtm } = useEspaceFournisseur()
const phraseAttendue = computed(() => `Je supprime mon compte ${fiche.value?.nom || ''}`.trim())
// guillemets, espaces et majuscules indifférents (même règle que la fonction)
const normaliser = (s) => String(s || '').normalize('NFC').replace(/["«»“”]/g, '').replace(/[’‘]/g, '\'').replace(/\s+/g, ' ').trim().toLowerCase()
const fermeture = ref(null) // { motDePasse, phrase, envoi, erreur }
const phraseOk = computed(() => !!fermeture.value && normaliser(fermeture.value.phrase) === normaliser(phraseAttendue.value))
function ouvrirFermeture() { fermeture.value = { motDePasse: '', phrase: '', envoi: false, erreur: '' } }
function quitterFermeture() { if (!fermeture.value?.envoi) fermeture.value = null }
async function fermerCompte() {
  const f = fermeture.value
  if (!f.motDePasse || !phraseOk.value || soldeBtm.value.aDeclarer > 0) return
  f.envoi = true; f.erreur = ''
  try {
    await supprimerCompte({ motDePasse: f.motDePasse, confirmation: f.phrase })
    await deconnexion().catch(() => {})
    router.push('/')
  } catch (e) {
    f.erreur = e?.message || 'Fermeture impossible pour le moment.'
    f.envoi = false
  }
}
</script>

<template>
  <!-- Lecture : identifiants et mot de passe -->
  <!-- À gauche ce qui se règle (identifiants, sécurité, activité), à droite les actions sur le compte (appareils, fermeture) -->
  <div v-if="!edition" class="cp-vue">
    <header class="cp-tete">
      <div><h2>Connexion et sécurité</h2><p>La personne qui se connecte à l’espace fournisseur.</p></div>
    </header>
    <div class="cp-colonnes cp-compte">
      <div class="cp-colonne">
        <section class="cp-groupe">
          <div class="cp-groupe-tete">
            <h3>Identifiants</h3>
            <button type="button" class="cp-lien-action" @click="modifier"><i class="fa-solid fa-pen" aria-hidden="true"></i> Modifier</button>
          </div>
          <dl class="cp-lignes cp-lignes-larges">
            <div><dt>Nom d’utilisateur</dt><dd :class="{ vide: !compte.pseudo }"><span>{{ compte.pseudo || 'Non renseigné' }}</span></dd></div>
            <div>
              <dt>E-mail</dt>
              <dd>
                <span>{{ compte.email }}</span>
                <i v-if="utilisateur?.email_confirmed_at" class="fa-solid fa-circle-check cp-verifie" title="E-mail vérifié" aria-label="E-mail vérifié"></i>
                <span v-else class="adm-badge adm-badge-attention">À confirmer</span>
                <button type="button" class="cp-lien-action" @click="changerEmail">Changer</button>
              </dd>
            </div>
            <div v-if="utilisateur?.new_email"><dt>En attente</dt><dd class="attention"><span>{{ utilisateur.new_email }} : cliquez sur le lien reçu</span></dd></div>
            <div><dt>Téléphone</dt><dd :class="{ vide: !compte.telephone }"><span>{{ formaterTelephone(compte.telephone) || 'Non renseigné' }}</span></dd></div>
          </dl>
        </section>
        <section class="cp-groupe">
          <h3>Mot de passe</h3>
          <dl class="cp-lignes cp-lignes-larges">
            <div>
              <dt>Actuel</dt>
              <dd><span class="cp-masque">••••••••••</span><button type="button" class="cp-lien-action" @click="changerMdp">Changer</button></dd>
            </div>
            <div>
              <dt>Oublié</dt>
              <dd>
                <span class="cp-discret">{{ lienEnvoye ? 'Lien envoyé, regardez vos e-mails' : 'Recevoir un lien par e-mail' }}</span>
                <button type="button" class="cp-lien-action" :disabled="envoiLien || lienEnvoye" @click="envoyerLien">{{ lienEnvoye ? 'Envoyé' : 'Recevoir' }}</button>
              </dd>
            </div>
          </dl>
        </section>
        <section class="cp-groupe">
          <h3>Activité</h3>
          <dl class="cp-lignes cp-lignes-larges">
            <div><dt>Dernière connexion</dt><dd :class="{ vide: !utilisateur?.last_sign_in_at }"><span>{{ dateHeure(utilisateur?.last_sign_in_at) || 'Inconnue' }}</span></dd></div>
            <div><dt>Compte créé le</dt><dd><span>{{ date(utilisateur?.created_at) || '—' }}</span></dd></div>
            <div><dt>Se connecte avec</dt><dd><span>{{ methodes }}</span></dd></div>
          </dl>
        </section>
      </div>

      <div class="cp-colonne">
        <section class="cp-groupe">
          <h3>Appareils</h3>
          <div class="cp-encart">
            <i class="fa-solid fa-mobile-screen" aria-hidden="true"></i>
            <span>
              <strong>Se déconnecter partout</strong>
              Un téléphone perdu, un ordinateur prêté au comptoir ? Fermez la session sur tous les appareils, celui-ci compris.
            </span>
            <button type="button" class="adm-btn adm-btn-clair adm-btn-sm" :disabled="deconnexionEnCours" @click="toutDeconnecter">
              <span v-if="deconnexionEnCours" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-right-from-bracket" aria-hidden="true"></i> Tout déconnecter
            </button>
          </div>
        </section>
        <section class="cp-groupe">
          <h3>Fermer le compte</h3>
          <div class="cp-encart cp-encart-danger">
            <i class="fa-solid fa-store-slash" aria-hidden="true"></i>
            <span>
              <strong>Quitter BTM</strong>
              Votre accès est supprimé et votre fiche disparaît de l’annuaire.
            </span>
            <button type="button" class="adm-btn adm-btn-danger adm-btn-sm" @click="ouvrirFermeture"><i class="fa-solid fa-trash" aria-hidden="true"></i> Fermer mon compte</button>
          </div>
        </section>
      </div>
    </div>

    <!-- Fermeture : mot de passe puis phrase recopiée au clavier ; le bouton reste bloqué tant que les deux manquent -->
    <div v-if="fermeture" class="cp-fenetre-fond" @click.self="quitterFermeture">
      <form class="cp-fenetre" role="dialog" aria-modal="true" aria-labelledby="mc-fermer-titre" novalidate @submit.prevent="fermerCompte">
        <header class="cp-fenetre-tete">
          <div>
            <h2 id="mc-fermer-titre">Fermer le compte</h2>
            <p>Votre accès sera supprimé et « {{ fiche?.nom }} » retiré de l’annuaire. Cette action est définitive.</p>
          </div>
          <button type="button" class="adm-icone-btn adm-icone-btn-bord" aria-label="Fermer" :disabled="fermeture.envoi" @click="quitterFermeture"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </header>

        <p v-if="soldeBtm.aDeclarer > 0" class="cp-alerte cp-alerte-bloc" role="alert">
          <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Vous devez encore {{ formaterEuros(soldeBtm.aDeclarer) }} à BTM : reversez-les (Paiements) avant de fermer le compte.
        </p>
        <template v-else>
          <div class="adm-champ">
            <label for="mc-fermer-mdp">1. Mot de passe du compte</label>
            <SaisieMotDePasse id="mc-fermer-mdp" v-model="fermeture.motDePasse" autocomplete="current-password" />
          </div>
          <div class="adm-champ">
            <label for="mc-fermer-phrase">2. Écrivez <strong class="cp-phrase">{{ phraseAttendue }}</strong></label>
            <input
              id="mc-fermer-phrase" v-model="fermeture.phrase" autocomplete="off" spellcheck="false" :placeholder="phraseAttendue"
              @paste.prevent @drop.prevent
            />
          </div>
          <p v-if="fermeture.erreur" class="adm-erreur-texte" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ fermeture.erreur }}</p>
        </template>

        <footer class="cp-fenetre-pied">
          <button type="button" class="adm-btn adm-btn-clair" :disabled="fermeture.envoi" @click="quitterFermeture">Annuler</button>
          <button type="submit" class="adm-btn cp-btn-rouge" :disabled="fermeture.envoi || !fermeture.motDePasse || !phraseOk || soldeBtm.aDeclarer > 0">
            <span v-if="fermeture.envoi" class="spinner" aria-hidden="true"></span> Fermer définitivement
          </button>
        </footer>
      </form>
    </div>
  </div>

  <!-- Identifiants : modification -->
  <form v-else-if="edition === 'infos'" class="cp-vue" novalidate @submit.prevent="enregistrerInfos">
    <header class="cp-tete">
      <div><h2>Modifier les identifiants</h2><p>L’e-mail de connexion se change à part, avec un code de vérification.</p></div>
      <div class="cp-tete-boutons">
        <button type="button" class="adm-btn adm-btn-clair adm-btn-sm" :disabled="enregistrementInfos" @click="edition = null">Annuler</button>
        <button type="submit" class="adm-btn adm-btn-noir adm-btn-sm" :disabled="enregistrementInfos"><span v-if="enregistrementInfos" class="spinner" aria-hidden="true"></span> Enregistrer</button>
      </div>
    </header>
    <p v-if="erreurInfos" class="adm-erreur-texte cp-erreur" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ erreurInfos }}</p>
    <div class="adm-grille-form cp-etroit">
      <div class="adm-champ">
        <label for="mc-pseudo">Nom d’utilisateur</label>
        <input id="mc-pseudo" :value="infos.pseudo" autocomplete="username" maxlength="20" @input="infos.pseudo = nettoyerPseudo($event.target.value)" />
      </div>
      <div class="plein">
        <ChampTelephone id="mc-tel" v-model="infos.telephone" v-model:valide="telephoneValide" label="Téléphone du responsable" />
      </div>
    </div>
  </form>

  <!-- E-mail : nouvelle adresse, Supabase y envoie un lien de confirmation -->
  <form v-else-if="edition === 'email'" class="cp-vue" novalidate @submit.prevent="envoyerLienEmail">
    <header class="cp-tete">
      <div><h2>Changer l’e-mail de connexion</h2><p>Un lien de confirmation sera envoyé à la nouvelle adresse. Rien ne change avant que vous cliquiez dessus.</p></div>
      <div class="cp-tete-boutons">
        <button type="button" class="adm-btn adm-btn-clair adm-btn-sm" :disabled="flux.envoi" @click="edition = null">Annuler</button>
        <button type="submit" class="adm-btn adm-btn-noir adm-btn-sm" :disabled="flux.envoi"><span v-if="flux.envoi" class="spinner" aria-hidden="true"></span> Envoyer le lien</button>
      </div>
    </header>
    <p v-if="flux.erreur" class="adm-erreur-texte cp-erreur" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ flux.erreur }}</p>
    <div class="cp-mdp">
      <div class="adm-champ"><label>Adresse actuelle</label><input :value="utilisateur?.email" disabled /></div>
      <div class="adm-champ"><label for="mc-email">Nouvelle adresse</label><input id="mc-email" v-model="flux.nouvel" type="email" autocomplete="email" placeholder="contact@entreprise.yt" /></div>
    </div>
  </form>

  <!-- Mot de passe : modification -->
  <form v-else class="cp-vue" novalidate @submit.prevent="changerMotDePasse">
    <header class="cp-tete">
      <div><h2>Changer le mot de passe</h2><p>Votre mot de passe actuel, puis le nouveau : 8 caractères minimum.</p></div>
      <div class="cp-tete-boutons">
        <button type="button" class="adm-btn adm-btn-clair adm-btn-sm" :disabled="enregistrementMdp" @click="edition = null">Annuler</button>
        <button type="submit" class="adm-btn adm-btn-noir adm-btn-sm" :disabled="!mdp.ancien || !mdp.nouveau || enregistrementMdp"><span v-if="enregistrementMdp" class="spinner" aria-hidden="true"></span> Enregistrer</button>
      </div>
    </header>
    <p v-if="erreurMdp" class="adm-erreur-texte cp-erreur" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ erreurMdp }}</p>
    <div class="cp-mdp">
      <div class="adm-champ"><label for="mc-mdp-ancien">Mot de passe actuel</label><SaisieMotDePasse id="mc-mdp-ancien" v-model="mdp.ancien" autocomplete="current-password" /></div>
      <div class="adm-champ"><label for="mc-mdp-nouveau">Nouveau mot de passe</label><SaisieMotDePasse id="mc-mdp-nouveau" v-model="mdp.nouveau" autocomplete="new-password" /></div>
      <div class="adm-champ"><label for="mc-mdp-conf">Confirmer le nouveau mot de passe</label><SaisieMotDePasse id="mc-mdp-conf" v-model="mdp.confirmation" autocomplete="new-password" /></div>
    </div>
  </form>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth.js'
import { ouvrirAuth as ouvrirFenetreAuth, useFenetreAuth } from '@/composables/useFenetreAuth.js'
import LogoBtm from './LogoBtm.vue'
import ChampTelephone from './ChampTelephone.vue'
import SaisieMotDePasse from './SaisieMotDePasse.vue'
import ProfilTypeCompte from './ProfilTypeCompte.vue'
import { formaterTelephone } from '@/services/telephone.js'
import { useContenuSite } from '@/composables/useContenuSite.js'
import { useCreditFidelite } from '@/composables/useCreditFidelite.js'
import { useMesRealisations } from '@/composables/useMesRealisations.js'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'

const contenu = useContenuSite()
const route = useRoute()
const router = useRouter()
const { connecte, utilisateur, deconnexion, backendDisponible, fournisseurLie, typeProfil, demandePro } = useAuth()
const libelleTypeCompte = computed(() => ({ verifie: 'Professionnel vérifié', en_attente: 'Professionnel · SIRET en vérification', refuse: 'Pro : demande refusée' })[demandePro.value?.statut] || (fournisseurLie.value || typeProfil.value === 'fournisseur' ? 'Professionnel (fournisseur)' : 'Particulier'))
const { mettreAJourProfil, supprimerCompte: supprimerCompteAuth } = useAuth()
const defile = ref(false)
const profilOuvert = ref(false)
const telephoneProfilValide = ref(true)
const telephoneProfilErreur = ref('')
const profilFormulaire = ref({ pseudo: '', email: '', telephone: '' })
const profilMessage = ref('')
const profilErreur = ref('')
const profilChargement = ref(false)
const correctionIdentite = ref(false)
const pieceIdentite = ref(null)
const profilVue = ref('infos')
// Téléphone : le compte s'affiche comme un écran d'application (liste des rubriques, puis la rubrique en sous-écran)
const detailOuvert = ref(false)
const TITRES_PROFIL = { infos: 'Infos du compte', modifier: 'Modifier mes informations', type: 'Type de compte', 'mot-de-passe': 'Mot de passe', supprimer: 'Supprimer mon compte' }
const ancienMotDePasse = ref('')
const nouveauMotDePasse = ref('')
const confirmationMotDePasse = ref('')
const suppressionConfirmee = ref(false)

const liens = [
  { to: '/', label: 'Accueil', icone: 'fa-solid fa-house' },
  { to: '/calculateur', label: 'Calculateur', icone: 'fa-solid fa-calculator' },
  { to: '/fournisseurs', label: 'Fournisseurs', icone: 'fa-solid fa-truck' },
  { to: '/dashboard', label: 'Mes projets', icone: 'fa-solid fa-folder-open' }
]
const liensVisibles = computed(() => [
  ...liens.filter((l) => l.to !== '/dashboard' || connecte.value),
  ...(fournisseurLie.value ? [{ to: '/espace-fournisseur', label: 'Espace fournisseur', icone: 'fa-solid fa-store' }] : [])
])
// pastille sur « Mes projets » : une proposition de BTM (mettre un projet en avant sur l'accueil) attend une réponse
const { enAttente: propositions, charger: chargerPropositions } = useMesRealisations()
watch(() => utilisateur.value?.id, (id) => { if (id) chargerPropositions() }, { immediate: true })
const pseudo = computed(() => utilisateur.value?.user_metadata?.pseudo || utilisateur.value?.email?.split('@')[0] || '')
const initiale = computed(() => pseudo.value.charAt(0).toUpperCase() || '?')

// Crédit fidélité à côté du nom (clients particuliers et pros ; un compte fournisseur n'en gagne pas).
// Relu à chaque page : un achat validé au comptoir le fait évoluer.
const { credit, charger: chargerCredit } = useCreditFidelite()
const afficherCredit = computed(() => connecte.value && !fournisseurLie.value)
const creditOuvert = ref(false)
// Gain pour 100 € d'achat : la part de la commission BTM (réglée dans l'admin) rendue au client
const creditPour100 = computed(() => (100 * contenu.frais.taux / 100) * (contenu.frais.fidelite / 100))
onMounted(() => { if (afficherCredit.value) chargerCredit() })
watch(() => route.path, () => { creditOuvert.value = false; if (afficherCredit.value) chargerCredit() })

const surScroll = () => { defile.value = window.scrollY > 24 }
onMounted(() => { surScroll(); window.addEventListener('scroll', surScroll, { passive: true }) })
onBeforeUnmount(() => window.removeEventListener('scroll', surScroll))
watch(() => route.path, () => { profilOuvert.value = false })
const { etat: fenetreAuth } = useFenetreAuth()
watch([profilOuvert, () => fenetreAuth.ouverte], ([profil, auth]) => { document.body.style.overflow = profil || auth ? 'hidden' : '' })

// Téléphone et tablette : barre d'onglets en bas, comme une application. La classe réserve sa place
// (style.css : --barre-onglets) et remonte les éléments fixés en bas (aide, cookies, barre du calculateur).
onMounted(() => document.documentElement.classList.add('avec-onglets'))
onBeforeUnmount(() => document.documentElement.classList.remove('avec-onglets'))

// Connexion : la fenêtre unique du site (affichée par App.vue), il n'y a pas de page de connexion
function ouvrirAuth(mode = 'connexion') {
  ouvrirFenetreAuth(mode)
}

function ouvrirProfil() {
  const metadata = utilisateur.value?.user_metadata || {}
  profilFormulaire.value = {
    pseudo: metadata.pseudo || utilisateur.value?.email?.split('@')[0] || '',
    email: utilisateur.value?.email || '',
    telephone: metadata.telephone || ''
  }
  ancienMotDePasse.value = ''
  nouveauMotDePasse.value = ''
  confirmationMotDePasse.value = ''
  profilMessage.value = ''
  profilErreur.value = ''
  correctionIdentite.value = false
  profilVue.value = 'infos'
  detailOuvert.value = false
  suppressionConfirmee.value = false
  profilOuvert.value = true
}

function fermerProfil() {
  profilOuvert.value = false
}

// un onglet de page touché pendant que le compte est ouvert le referme (même si c'est la page en cours)
function surOnglet(event) {
  if (event.target.closest('a')) fermerProfil()
}

// retour du sous-écran (téléphone) : « Modifier » revient aux infos, le reste à la liste des rubriques
function retourProfil() {
  if (profilVue.value === 'modifier') { profilVue.value = 'infos'; return }
  detailOuvert.value = false
}

async function enregistrerProfil() {
  profilMessage.value = ''
  profilErreur.value = ''
  telephoneProfilErreur.value = ''
  if (!telephoneProfilValide.value) { telephoneProfilErreur.value = 'Numéro incomplet ou invalide'; return }
  profilChargement.value = true
  const ancienEmail = utilisateur.value?.email
  try {
    const utilisateurMisAJour = await mettreAJourProfil(profilFormulaire.value)
    utilisateur.value = utilisateurMisAJour
    profilMessage.value = profilFormulaire.value.email !== ancienEmail
      ? 'Un e-mail de confirmation a été envoyé à la nouvelle adresse.'
      : 'Vos informations ont été enregistrées.'
  } catch (error) {
    profilErreur.value = error.message || 'Impossible d’enregistrer vos informations.'
  } finally {
    profilChargement.value = false
  }
}

function choisirPiece(event) {
  pieceIdentite.value = event.target.files?.[0] || null
}

function envoyerDemandeIdentite() {
  const sujet = encodeURIComponent('Demande de correction de mon identité - BTM')
  const corps = encodeURIComponent(`Bonjour,\n\nJe souhaite corriger mon nom ou mon prénom sur mon compte BTM.\n\nE-mail du compte : ${utilisateur.value?.email || ''}\nPièce justificative sélectionnée : ${pieceIdentite.value?.name || 'à joindre au message'}\n\nCordialement`)
  window.location.href = `mailto:${contenu.contact.email}?subject=${sujet}&body=${corps}`
}

function ouvrirAction(action) {
  profilVue.value = action
  detailOuvert.value = true
  ancienMotDePasse.value = ''
  nouveauMotDePasse.value = ''
  confirmationMotDePasse.value = ''
  profilMessage.value = ''
  profilErreur.value = ''
  suppressionConfirmee.value = false
}

// ancien mot de passe oublié : un lien reçu par e-mail permet d'en choisir un nouveau (fenêtre de connexion)
function motDePasseOublie() {
  fermerProfil()
  ouvrirFenetreAuth('connexion', { oubli: true })
}

async function changerMotDePasse() {
  profilMessage.value = ''
  profilErreur.value = ''
  if (!ancienMotDePasse.value) {
    profilErreur.value = 'Vous devez renseigner votre ancien mot de passe.'
    return
  }
  if (nouveauMotDePasse.value.length < 8) {
    profilErreur.value = 'Le nouveau mot de passe doit contenir au moins 8 caractères.'
    return
  }
  if (nouveauMotDePasse.value !== confirmationMotDePasse.value) {
    profilErreur.value = 'Les mots de passe ne correspondent pas.'
    return
  }
  try {
    await mettreAJourProfil({
      ancienMotDePasse: ancienMotDePasse.value,
      motDePasse: nouveauMotDePasse.value
    })
    ancienMotDePasse.value = ''
    nouveauMotDePasse.value = ''
    confirmationMotDePasse.value = ''
    profilMessage.value = 'Votre mot de passe a été modifié.'
  } catch (error) {
    profilErreur.value = error.message || 'Impossible de modifier le mot de passe.'
  }
}

async function supprimerCompte() {
  if (!suppressionConfirmee.value) return
  profilErreur.value = ''
  try {
    await supprimerCompteAuth()
    await deconnexion()
    fermerProfil()
  } catch (error) {
    profilErreur.value = error.message || 'La suppression du compte n’est pas disponible pour le moment.'
  }
}
</script>

<template>
  <header id="entete-app" class="entete" :class="{ 'entete-defile': defile || route.path !== '/' }">
    <div class="conteneur entete-inner">
      <router-link to="/" class="entete-logo" aria-label="BTM — Accueil">
        <LogoBtm :taille="42" />
        <span class="entete-marque">
          <strong>BTM</strong>
          <small>Bâtiment & Travaux Mayotte</small>
        </span>
      </router-link>

      <div class="entete-droit">
        <nav class="nav-principale" aria-label="Navigation principale">
          <ul>
            <li v-for="l in liensVisibles" :key="l.to">
              <router-link :to="l.to" class="nav-lien" active-class="actif" :data-label="l.label">
                <i :class="l.icone" aria-hidden="true"></i><span>{{ l.label }}</span>
                <b v-if="l.to === '/dashboard' && propositions" class="nav-pastille" :title="`${propositions} proposition de BTM à voir`">{{ propositions }}</b>
              </router-link>
            </li>
          </ul>
        </nav>

        <div class="entete-actions">
          <template v-if="connecte">
            <div class="entete-compte">
              <button class="entete-utilisateur" type="button" :title="utilisateur?.email" @click="ouvrirProfil">
                <span class="entete-avatar" aria-hidden="true">{{ initiale }}</span>
                <span class="entete-pseudo">{{ pseudo }}</span>
              </button>
              <!-- Crédit fidélité : survol (ou appui sur téléphone/tablette) = à quoi il sert, comment en gagner et l'utiliser -->
              <div v-if="afficherCredit" class="credit" :class="{ ouvert: creditOuvert }" @mouseleave="creditOuvert = false" @keydown.esc="creditOuvert = false">
                <button type="button" class="entete-credit" :aria-expanded="creditOuvert" aria-controls="credit-detail" @click="creditOuvert = !creditOuvert">
                  <i class="fa-solid fa-coins" aria-hidden="true"></i><span class="visually-hidden">Crédit fidélité :</span> {{ formaterEuros(credit.solde) }}
                </button>
                <div id="credit-detail" class="credit-detail" role="dialog" aria-label="Crédit fidélité BTM">
                  <p class="credit-tete"><span><i class="fa-solid fa-coins" aria-hidden="true"></i> Crédit fidélité BTM</span><strong>{{ formaterEuros(credit.solde) }}</strong></p>
                  <dl class="credit-infos">
                    <dt>À quoi ça sert ?</dt>
                    <dd>C’est un bon d’achat offert par BTM : le fournisseur le <strong>déduit de votre prochain retrait</strong> au comptoir.</dd>
                    <dt>Comment en gagner ?</dt>
                    <dd>Chaque achat payé avec le code de retrait d’une estimation enregistrée vous rapporte environ <strong>{{ formaterEuros(creditPour100) }} pour 100 €</strong> d’achat.</dd>
                    <dt>Comment l’utiliser ?</dt>
                    <dd>Au comptoir, donnez votre code de retrait et demandez à utiliser votre crédit.</dd>
                  </dl>
                  <template v-if="credit.mouvements.length">
                    <p class="credit-sous-titre">Derniers mouvements</p>
                    <ul class="credit-mouvements">
                      <li v-for="(m, i) in credit.mouvements" :key="i"><span>{{ m.libelle }}</span><strong :class="{ plus: m.montant > 0 }">{{ m.montant > 0 ? '+' : '' }}{{ formaterEuros(m.montant) }}</strong></li>
                    </ul>
                  </template>
                  <p v-else class="credit-vide">Aucun mouvement pour l’instant : votre premier achat avec un code de retrait lancera votre cagnotte.</p>
                  <router-link to="/calculateur" class="credit-action">Faire une estimation <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></router-link>
                  <p class="credit-note">Ni échangeable ni remboursable en espèces.</p>
                </div>
              </div>
              <button class="entete-deconnexion" type="button" title="Déconnexion" aria-label="Déconnexion" @click="deconnexion">
                <i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i>
              </button>
            </div>
          </template>
          <template v-else>
            <button v-if="backendDisponible" class="entete-connexion" type="button" @click="ouvrirAuth()">Connexion</button>
            <router-link to="/calculateur" class="btn btn-primaire btn-sm entete-cta">Estimer <i class="fa-solid fa-arrow-right"></i></router-link>
          </template>
        </div>
      </div>

    </div>
  </header>

  <!-- Téléphone et tablette : barre d'onglets, hors de l'en-tête (son flou ancrerait la barre en haut) -->
  <nav class="onglets" :class="{ 'onglets-compte': profilOuvert }" aria-label="Navigation principale" @click="surOnglet">
    <!-- fond blanc en trois morceaux : l'encoche du milieu garde sa forme quelle que soit la largeur -->
    <span class="onglets-fond" aria-hidden="true">
      <span></span>
      <svg viewBox="0 0 104 60" preserveAspectRatio="none"><path d="M0 0h6c12 0 16 4 21 13 7 15 14 27 25 27s18-12 25-27c5-9 9-13 21-13h6v60H0z" /></svg>
      <span></span>
    </span>
    <router-link to="/" class="onglet" active-class="actif" exact-active-class="actif">
      <span class="onglet-icone"><i class="fa-solid fa-house" aria-hidden="true"></i></span><span class="onglet-libelle">Accueil</span>
    </router-link>
    <router-link to="/fournisseurs" class="onglet" active-class="actif">
      <span class="onglet-icone"><i class="fa-solid fa-truck" aria-hidden="true"></i></span><span class="onglet-libelle">Fournisseurs</span>
    </router-link>
    <router-link to="/calculateur" class="onglet-central" active-class="actif" aria-label="Estimer">
      <i class="fa-solid fa-calculator" aria-hidden="true"></i>
    </router-link>
    <!-- Projets (ou l'espace d'un fournisseur) : seulement pour un compte connecté -->
    <router-link v-if="connecte && fournisseurLie" to="/espace-fournisseur" class="onglet" active-class="actif">
      <span class="onglet-icone"><i class="fa-solid fa-store" aria-hidden="true"></i></span><span class="onglet-libelle">Mon espace</span>
    </router-link>
    <router-link v-else-if="connecte" to="/dashboard" class="onglet" active-class="actif">
      <span class="onglet-icone"><i class="fa-solid fa-folder-open" aria-hidden="true"></i><b v-if="propositions" class="onglet-pastille" :aria-label="`${propositions} proposition de BTM à voir`">{{ propositions }}</b></span><span class="onglet-libelle">Projets</span>
    </router-link>
    <!-- visiteur : « Laisser un avis » prend la place de « Projets », la barre garde ses 5 onglets -->
    <router-link v-else :to="{ path: '/', hash: '#avis', query: { avis: '1' } }" class="onglet">
      <span class="onglet-icone"><i class="fa-solid fa-star" aria-hidden="true"></i></span><span class="onglet-libelle">Laisser un avis</span>
    </router-link>
    <button type="button" class="onglet onglet-profil" :class="{ actif: profilOuvert }" @click="connecte ? ouvrirProfil() : ouvrirAuth()">
      <span class="onglet-icone"><i :class="connecte ? 'fa-solid fa-circle-user' : 'fa-solid fa-right-to-bracket'" aria-hidden="true"></i></span><span class="onglet-libelle">{{ connecte ? 'Compte' : 'Connexion' }}</span>
    </button>
  </nav>

  <div v-if="profilOuvert" class="profil-overlay" :class="{ 'profil-detail': detailOuvert }" @click.self="fermerProfil">
    <button class="profil-fermer" type="button" aria-label="Fermer le profil" @click="fermerProfil"><i class="fa-solid fa-xmark"></i></button>
    <section class="profil-dialogue" role="dialog" aria-modal="true" aria-labelledby="profil-titre">
      <!-- Téléphone : barre de titre d'application (grand titre sur la liste, retour + titre dans une rubrique) -->
      <header class="profil-barre">
        <button v-if="detailOuvert" type="button" class="profil-barre-retour" aria-label="Retour" @click="retourProfil"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
        <h2 id="profil-titre" :class="{ 'profil-barre-grand': !detailOuvert }">{{ detailOuvert ? TITRES_PROFIL[profilVue] : 'Compte' }}</h2>
      </header>
      <div class="profil-blocs">
        <nav class="profil-actions" aria-label="Actions du compte">
          <div class="profil-carte">
            <span class="profil-carte-avatar" aria-hidden="true">{{ initiale }}</span>
            <span class="profil-carte-texte"><strong>{{ pseudo }}</strong><small>{{ utilisateur?.email }}</small></span>
            <span v-if="afficherCredit" class="profil-carte-credit"><i class="fa-solid fa-coins" aria-hidden="true"></i> {{ formaterEuros(credit.solde) }}</span>
          </div>
          <div class="profil-groupe">
            <button class="profil-action" :class="{ actif: profilVue === 'infos' || profilVue === 'modifier' }" type="button" @click="ouvrirAction('infos')"><i class="fa-solid fa-user"></i><span>Infos du compte<small>Voir mes informations</small></span><i class="fa-solid fa-chevron-right"></i></button>
            <button class="profil-action" :class="{ actif: profilVue === 'type' }" type="button" @click="ouvrirAction('type')"><i class="fa-solid fa-briefcase"></i><span>Type de compte<small>{{ libelleTypeCompte }}</small></span><i class="fa-solid fa-chevron-right"></i></button>
            <button class="profil-action" :class="{ actif: profilVue === 'mot-de-passe' }" type="button" @click="ouvrirAction('mot-de-passe')"><i class="fa-solid fa-lock"></i><span>Modifier le mot de passe<small>Sécuriser mon accès</small></span><i class="fa-solid fa-chevron-right"></i></button>
          </div>
          <div class="profil-groupe">
            <button class="profil-action" type="button" @click="fermerProfil(); router.push('/dashboard')"><i class="fa-solid fa-folder-open"></i><span>Mes archives de projet<small>Retrouver mes estimations</small></span><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
          </div>
          <div class="profil-groupe">
            <button class="profil-action" type="button" @click="fermerProfil(); deconnexion()"><i class="fa-solid fa-arrow-right-from-bracket"></i><span>Se déconnecter<small>{{ utilisateur?.email }}</small></span><i class="fa-solid fa-chevron-right"></i></button>
            <button class="profil-action profil-action-danger" :class="{ actif: profilVue === 'supprimer' }" type="button" @click="ouvrirAction('supprimer')"><i class="fa-solid fa-trash"></i><span>Supprimer mon compte<small>Action définitive</small></span><i class="fa-solid fa-chevron-right"></i></button>
          </div>
        </nav>

        <section :key="profilVue" class="profil-contenu">
          <template v-if="profilVue === 'infos'">
            <h3>Infos du compte</h3>
            <p class="profil-contenu-intro profil-intro-infos">Vos informations sont affichées ici. Utilisez le bouton de modification uniquement si nécessaire.</p>
            <div class="profil-infos-liste">
              <div><span>Pseudo</span><strong>{{ utilisateur?.user_metadata?.pseudo || utilisateur?.email?.split('@')[0] }}</strong></div>
              <div><span>E-mail</span><strong>{{ utilisateur?.email }}</strong></div>
              <div><span>Téléphone</span><strong>{{ formaterTelephone(utilisateur?.user_metadata?.telephone) || 'Non renseigné' }}</strong></div>
              <div><span>Nom</span><strong>{{ utilisateur?.user_metadata?.nom || utilisateur?.user_metadata?.last_name || 'Non renseigné' }}</strong></div>
              <div><span>Prénom</span><strong>{{ utilisateur?.user_metadata?.prenom || utilisateur?.user_metadata?.first_name || 'Non renseigné' }}</strong></div>
            </div>
            <button class="btn btn-primaire" type="button" @click="profilVue = 'modifier'"><i class="fa-solid fa-pen"></i> Modifier mes informations</button>
          </template>

          <form v-else-if="profilVue === 'modifier'" class="profil-formulaire" @submit.prevent="enregistrerProfil">
            <button class="profil-retour-lien" type="button" @click="profilVue = 'infos'"><i class="fa-solid fa-arrow-left"></i> Retour aux informations</button>
            <h3>Modifier mes informations</h3>
            <div class="champ"><label for="profil-pseudo">Pseudo</label><input id="profil-pseudo" v-model="profilFormulaire.pseudo" type="text" required /></div>
            <div class="champ"><label for="profil-email">Adresse e-mail</label><input id="profil-email" v-model="profilFormulaire.email" type="email" required /><small class="profil-aide">Une confirmation sera demandée si vous changez d’adresse.</small></div>
            <ChampTelephone id="profil-telephone" v-model="profilFormulaire.telephone" v-model:valide="telephoneProfilValide" :erreur="telephoneProfilErreur" />
            <p class="profil-identite-note"><i class="fa-solid fa-lock"></i> Nom et prénom non modifiables ici. Pour une correction, envoyez une pièce d’identité par e-mail.</p>
            <p v-if="profilMessage" class="profil-retour profil-succes" role="status">{{ profilMessage }}</p><p v-if="profilErreur" class="profil-retour profil-erreur" role="alert">{{ profilErreur }}</p>
            <button class="btn btn-primaire" type="submit" :disabled="profilChargement"><i class="fa-solid fa-check"></i> {{ profilChargement ? 'Enregistrement...' : 'Enregistrer' }}</button>
          </form>

          <ProfilTypeCompte v-else-if="profilVue === 'type'" />
          <form v-else-if="profilVue === 'mot-de-passe'" class="profil-formulaire" @submit.prevent="changerMotDePasse">
            <h3>Modifier le mot de passe</h3>
            <p class="profil-contenu-intro">Renseignez d’abord votre ancien mot de passe, puis choisissez le nouveau. <button type="button" class="profil-oubli" @click="motDePasseOublie">Mot de passe oublié ?</button></p>
            <div class="champ"><label for="ancien-mot-de-passe">Ancien mot de passe</label><SaisieMotDePasse id="ancien-mot-de-passe" v-model="ancienMotDePasse"  required /></div>
            <div class="champ"><label for="nouveau-mot-de-passe">Nouveau mot de passe</label><SaisieMotDePasse id="nouveau-mot-de-passe" v-model="nouveauMotDePasse"  minlength="8" required /></div>
            <div class="champ"><label for="confirmation-mot-de-passe">Confirmer le mot de passe</label><SaisieMotDePasse id="confirmation-mot-de-passe" v-model="confirmationMotDePasse"  minlength="8" required /></div>
            <p v-if="profilMessage" class="profil-retour profil-succes">{{ profilMessage }}</p><p v-if="profilErreur" class="profil-retour profil-erreur">{{ profilErreur }}</p>
            <button class="btn btn-primaire" type="submit">Modifier le mot de passe</button>
          </form>

          <div v-else class="profil-suppression"><h3>Supprimer mon compte</h3><p>Cette action est définitive. Vos informations de compte ne pourront pas être récupérées.</p><label class="profil-checkbox"><input v-model="suppressionConfirmee" type="checkbox" /> Je comprends et je veux supprimer mon compte</label><p v-if="profilErreur" class="profil-retour profil-erreur" role="alert">{{ profilErreur }}</p><button class="btn btn-danger" type="button" :disabled="!suppressionConfirmee" @click="supprimerCompte"><i class="fa-solid fa-trash"></i> Supprimer définitivement</button></div>
        </section>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ---------- Barre d'entête : thème lagon sombre, identique sur toutes les pages ---------- */
.entete {
  position: fixed; inset: 0 0 auto 0; z-index: 100; height: var(--hauteur-entete); color: #fff;
  transition: background var(--transition), box-shadow var(--transition), border-color var(--transition);
  border-bottom: 1px solid transparent;
}
.entete::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 1px; opacity: 0;
  background: linear-gradient(90deg, transparent, var(--lagon-500) 30%, var(--lagon-300) 50%, var(--lagon-500) 70%, transparent);
  transition: opacity var(--transition);
}
.entete-defile, .entete-menu-ouvert {
  background: rgba(6, 32, 44, .86); backdrop-filter: blur(16px) saturate(140%); -webkit-backdrop-filter: blur(16px) saturate(140%);
  box-shadow: 0 10px 30px rgba(6, 32, 44, .28);
}
.entete-defile::after, .entete-menu-ouvert::after { opacity: .7; }
.entete-menu-ouvert { background: var(--abysse); }

.entete-inner { height: 100%; display: flex; align-items: center; gap: 16px; position: relative; }
.entete-logo { display: flex; align-items: center; gap: 10px; min-width: 0; flex-shrink: 0; }
.entete-logo :deep(.logo-btm) { width: 38px; height: 38px; filter: drop-shadow(0 0 0 rgba(34, 211, 238, 0)); transition: filter var(--transition); }
.entete-logo:hover :deep(.logo-btm) { filter: drop-shadow(0 0 10px rgba(34, 211, 238, .45)); }
.entete-marque { display: flex; flex-direction: column; gap: 3px; line-height: 1; }
.entete-marque strong { font-family: var(--font-display); font-size: 1.4rem; font-weight: 700; letter-spacing: .08em; }
.entete-marque small { font-size: .62rem; color: var(--lagon-200); opacity: .8; font-weight: 500; letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; }

/* Navigation (cachée en mobile, voir media queries) */
.nav-principale { display: none; }
.nav-principale ul { display: flex; gap: 2px; }
/* proposition de BTM en attente (mettre un projet en avant sur l'accueil) */
.nav-pastille {
  position: absolute; top: 2px; right: 2px; min-width: 18px; height: 18px; padding: 0 5px; display: grid; place-items: center;
  border-radius: 999px; background: #f59e0b; color: #fff; font-size: .68rem; font-weight: 800; line-height: 1;
  box-shadow: 0 0 0 2px var(--abysse, #0b2a36);
}
.nav-pastille-menu { position: static; margin-left: auto; box-shadow: none; }
.nav-lien {
  position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  height: 40px; padding: 0 14px; border-radius: 999px; color: rgba(255, 255, 255, .72);
  font-weight: 500; font-size: .9rem; white-space: nowrap;
  transition: color var(--transition), background var(--transition), box-shadow var(--transition);
}
.nav-lien i { font-size: .88rem; }
.nav-lien:hover, .nav-lien:focus-visible { color: #fff; background: rgba(255, 255, 255, .08); outline: none; }
.nav-lien.actif {
  color: var(--lagon-200); font-weight: 600;
  background: rgba(34, 211, 238, .14); box-shadow: inset 0 0 0 1px rgba(34, 211, 238, .35);
}
.nav-lien.actif i { color: var(--lagon-300); }

/* Actions (compte / connexion / CTA) */
.entete-actions { display: none; align-items: center; gap: 10px; }
.entete-droit { display: contents; }
.entete-connexion {
  height: 40px; padding: 0 14px; border: 0; border-radius: 999px; background: transparent;
  color: rgba(255, 255, 255, .85); font-weight: 600; font-size: .9rem; transition: color var(--transition), background var(--transition);
}
.entete-connexion:hover { color: #fff; background: rgba(255, 255, 255, .08); }
.entete-cta { height: 40px; border-radius: 999px; padding-inline: 18px; background: var(--lagon-600); box-shadow: 0 6px 18px rgba(8, 145, 178, .35); }
.entete-cta:hover { background: var(--lagon-500) !important; }
.entete-cta i { transition: transform var(--transition); }
.entete-cta:hover i { transform: translateX(3px); }

.entete-compte {
  display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, .14); background: rgba(255, 255, 255, .05);
}
.entete-utilisateur {
  display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px 0 3px; border: 0; border-radius: 999px;
  background: transparent; color: #fff; font-size: .88rem; font-weight: 600; cursor: pointer; transition: background var(--transition);
}
.entete-utilisateur:hover { background: rgba(255, 255, 255, .08); }
.entete-pseudo { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.entete-credit {
  display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: 999px;
  background: rgba(253, 230, 138, .14); color: #fde68a; font-size: .8rem; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap;
  transition: background var(--transition);
}
.entete-credit { border: 0; cursor: pointer; }
.entete-credit:hover, .credit.ouvert .entete-credit { background: rgba(253, 230, 138, .24); }

/* Détail du crédit : au survol ou au focus clavier (ordinateur), à l'appui (écran tactile) */
.credit { position: relative; }
.credit-detail {
  position: absolute; top: calc(100% + 10px); right: -40px; z-index: 120; width: 330px; padding: 16px 18px;
  border: 1px solid var(--gris-200); border-radius: var(--rayon-lg); background: #fff; box-shadow: var(--ombre-lg); color: var(--texte);
  opacity: 0; visibility: hidden; transform: translateY(-4px); transition: opacity .18s ease, transform .18s ease, visibility .18s;
}
.credit-detail::before { content: ''; position: absolute; top: -12px; left: 0; right: 0; height: 12px; } /* pont : le survol ne se perd pas entre le bouton et le panneau */
.credit.ouvert .credit-detail, .credit:focus-within .credit-detail { opacity: 1; visibility: visible; transform: none; }
@media (hover: hover) { .credit:hover .credit-detail { opacity: 1; visibility: visible; transform: none; } }
.credit-tete { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0 0 12px; padding-bottom: 12px; border-bottom: 1px solid var(--gris-200); color: var(--ardoise); font-weight: 700; }
.credit-tete i { color: #d97706; margin-right: 4px; }
.credit-tete strong { color: #b45309; font-size: 1.35rem; font-variant-numeric: tabular-nums; }
.credit-infos { margin: 0; font-size: .84rem; line-height: 1.5; }
.credit-infos dt { margin-top: 8px; color: var(--ardoise); font-weight: 700; }
.credit-infos dt:first-child { margin-top: 0; }
.credit-infos dd { margin: 2px 0 0; color: var(--texte-secondaire); }
.credit-infos strong { color: var(--ardoise); }
.credit-sous-titre { margin: 14px 0 6px; color: var(--texte-secondaire); font-size: .72rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.credit-mouvements { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; font-size: .82rem; }
.credit-mouvements li { display: flex; justify-content: space-between; gap: 10px; color: var(--gris-700); }
.credit-mouvements strong { color: var(--ardoise); white-space: nowrap; }
.credit-mouvements strong.plus { color: #047857; }
.credit-vide { margin: 14px 0 0; padding: 10px 12px; border-radius: var(--rayon); background: #fffbeb; color: #92400e; font-size: .82rem; line-height: 1.45; }
.credit-action { display: inline-flex; align-items: center; gap: 6px; margin-top: 14px; color: var(--lagon-700); font-size: .86rem; font-weight: 700; }
.credit-action:hover { text-decoration: underline; text-underline-offset: 3px; }
.credit-note { margin: 10px 0 0; color: var(--gris-500); font-size: .74rem; }
.entete-avatar {
  display: grid; place-items: center; width: 30px; height: 30px; flex-shrink: 0; border-radius: 50%;
  background: linear-gradient(135deg, var(--lagon-400), var(--lagon-700)); color: #fff;
  font-family: var(--font-display); font-weight: 700; font-size: .95rem;
}
.entete-deconnexion {
  display: grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: 50%;
  background: transparent; color: rgba(255, 255, 255, .7); transition: color var(--transition), background var(--transition);
}
.entete-deconnexion:hover { color: var(--corail); background: rgba(251, 113, 133, .12); }

/* ---------- Téléphone et tablette : barre d'onglets en bas, comme une application ---------- */
.onglets { display: none; }
@media (max-width: 899px) {
  /* en haut : le logo, et le crédit fidélité d'un compte connecté ; tout le reste passe dans les onglets */
  .entete-actions { display: flex; margin-left: auto; }
  .entete-utilisateur, .entete-deconnexion, .entete-connexion, .entete-cta { display: none; }
  .credit-detail { right: 0; width: min(330px, calc(100vw - 32px)); }

  /* barre blanche flottante, encoche douce au centre pour le bouton Estimer (fixe) ; icônes seules,
     l'onglet actif passe en foncé */
  .onglets {
    position: fixed; left: max(14px, calc(50% - 260px)); right: max(14px, calc(50% - 260px)); bottom: calc(10px + env(safe-area-inset-bottom)); z-index: 110;
    display: grid; grid-template-columns: 1fr 1fr 104px 1fr 1fr; height: 60px;
    filter: drop-shadow(0 12px 28px rgba(15, 23, 42, .1)) drop-shadow(0 1px 3px rgba(15, 23, 42, .06));
  }
  .onglets-fond { position: absolute; inset: 0; z-index: -1; display: flex; }
  .onglets-fond > span { flex: 1; background: #fff; }
  .onglets-fond > span:first-child { border-radius: 24px 0 0 24px; }
  .onglets-fond > span:last-child { border-radius: 0 24px 24px 0; }
  .onglets-fond svg { width: 104px; height: 100%; flex: none; fill: #fff; margin: 0 -.5px; }
  .onglet {
    display: grid; place-items: center; min-width: 0; padding: 0; border: 0; background: none;
    color: var(--gris-400); text-decoration: none; -webkit-tap-highlight-color: transparent; cursor: pointer; transition: color .15s ease;
  }
  .onglet-icone { position: relative; display: grid; place-items: center; font-size: 1.2rem; }
  /* libellé gardé pour les lecteurs d'écran, masqué à l'écran */
  .onglet-libelle { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .onglet.actif { color: var(--ardoise); }
  .onglet:focus-visible { outline: none; }
  .onglet:focus-visible .onglet-icone, .onglet-central:focus-visible { outline: 2px solid var(--lagon-500); outline-offset: 4px; border-radius: 50%; }
  .onglet-central {
    justify-self: center; align-self: start; width: 54px; height: 54px; margin-top: -18px; display: grid; place-items: center;
    border-radius: 50%; background: var(--ardoise); color: #fff; font-size: 1.15rem;
    box-shadow: 0 6px 14px rgba(15, 23, 42, .22); -webkit-tap-highlight-color: transparent; transition: background .15s ease;
  }
  .onglet-central.actif { background: var(--lagon-700); }
  .onglet-pastille {
    position: absolute; top: -6px; right: -10px; min-width: 16px; height: 16px; padding: 0 4px; display: grid; place-items: center;
    border-radius: 999px; background: #f59e0b; color: #fff; font: 700 .62rem/1 var(--font-corps); box-shadow: 0 0 0 2px #fff;
  }
}

@media (max-width: 380px) {
  .entete-marque small { display: none; }
  .entete-logo :deep(.logo-btm) { width: 34px; height: 34px; }
}
.profil-overlay {
  position: fixed; inset: 0; z-index: 260; display: grid; place-items: center; padding: 24px;
  background: rgba(6, 32, 44, .62); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); overflow-y: auto;
}
.profil-dialogue {
  position: relative;
  width: min(100%, 920px);
  max-height: calc(100dvh - 48px);
  overflow: visible;
  padding: 20px 0;
  margin-top: 18px;
  animation: apparaitre .28s ease both;
}
/* Même croix que la fenêtre de connexion : coin supérieur droit de l'écran */
.profil-fermer {
  position: fixed; top: 22px; right: 24px; z-index: 30;
  width: 44px; height: 44px; display: grid; place-items: center;
  border: 1px solid rgba(255,255,255,.45); border-radius: 50%;
  background: rgba(255,255,255,.14); color: #fff; font-size: 1.2rem;
  cursor: pointer; transition: background .2s, transform .2s;
}
.profil-fermer:hover { background: rgba(255,255,255,.25); transform: rotate(90deg); }
@media (max-width: 560px) { .profil-fermer { top: 10px; right: 12px; } }
.profil-dialogue h2 { margin-top: 4px; color: #fff; font-size: 2rem; }
.profil-intro { margin: 8px 0 24px; color: var(--texte-secondaire); }
.profil-formulaire { display: flex; flex-direction: column; gap: 18px; }
.profil-grille { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.profil-largeur { grid-column: span 2; }
.profil-formulaire input { width: 100%; }
.profil-formulaire input:disabled { background: var(--gris-100); color: var(--gris-500); cursor: not-allowed; }
.profil-aide { color: var(--gris-500); font-size: .76rem; }
.profil-enregistrer { align-self: flex-end; }
.profil-retour { padding: 10px 12px; border-radius: var(--rayon-sm); font-size: .86rem; }
.profil-succes { background: #dcfce7; color: #166534; }
.profil-erreur { background: var(--erreur-clair); color: var(--erreur); }
.profil-identite { margin-top: 26px; border-top: 1px solid var(--gris-200); padding-top: 18px; }
.profil-identite-toggle { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 0; border: 0; background: transparent; color: var(--ardoise-2); font-weight: 700; cursor: pointer; text-align: left; }
.profil-identite-toggle span { display: inline-flex; align-items: center; gap: 9px; }
.profil-identite-toggle span i { color: var(--lagon-700); }
.profil-identite-form { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; padding: 16px; border-radius: var(--rayon); background: var(--gris-50); color: var(--texte-secondaire); font-size: .86rem; }
.profil-identite-form p { line-height: 1.5; }
.profil-identite-form input[type="file"] { font-size: .82rem; }
.profil-identite-form small { color: var(--gris-600); }
.profil-identite-form .btn { align-self: flex-start; }
.profil-blocs { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 18px; align-items: center; margin-top: 16px; }
.profil-actions { display: flex; flex-direction: column; gap: 8px; padding: 14px; border: 1px solid var(--gris-200); border-radius: var(--rayon); background: var(--gris-50); }
.profil-action { display: flex; align-items: center; gap: 12px; width: 100%; padding: 14px 12px; border: 1px solid transparent; border-radius: var(--rayon-sm); background: transparent; color: var(--ardoise-2); text-align: left; cursor: pointer; transition: background .2s, border-color .2s; }
.profil-action > i:first-child { width: 20px; color: var(--lagon-700); text-align: center; }
.profil-action > i:last-child { margin-left: auto; color: var(--gris-400); font-size: .75rem; }
.profil-action span { display: flex; flex: 1; flex-direction: column; gap: 3px; font-weight: 700; font-size: .86rem; }
.profil-action small { color: var(--gris-500); font-size: .72rem; font-weight: 400; }
.profil-action:hover, .profil-action.actif { border-color: var(--lagon-200); background: #fff; }
.profil-action-danger > i:first-child, .profil-action-danger span { color: var(--erreur); }
.profil-contenu { min-height: 360px; padding: 26px; border: 1px solid var(--gris-200); border-radius: var(--rayon); background: #fff; }
.profil-contenu h3, .profil-suppression h3 { margin-bottom: 8px; color: var(--ardoise); font-size: 1.45rem; }
.profil-oubli { padding: 0; border: 0; background: transparent; color: var(--lagon-700); font: inherit; font-weight: 600; cursor: pointer; }
.profil-oubli:hover { text-decoration: underline; text-underline-offset: 3px; }
.profil-contenu-intro, .profil-suppression > p { margin-bottom: 22px; color: var(--texte-secondaire); line-height: 1.5; }
.profil-infos-liste { display: flex; flex-direction: column; gap: 0; margin-bottom: 24px; border-top: 1px solid var(--gris-200); }
.profil-infos-liste div { display: flex; justify-content: space-between; gap: 20px; padding: 13px 0; border-bottom: 1px solid var(--gris-200); }
.profil-infos-liste span { color: var(--gris-500); font-size: .86rem; }
.profil-infos-liste strong { color: var(--ardoise-2); font-size: .88rem; text-align: right; overflow-wrap: anywhere; }
.profil-formulaire { display: flex; flex-direction: column; gap: 16px; }
.profil-formulaire h3 { margin-top: 4px; }
.profil-formulaire .btn { align-self: flex-start; }
.profil-retour-lien { align-self: flex-start; padding: 0; border: 0; background: transparent; color: var(--lagon-700); font-weight: 700; cursor: pointer; }
.profil-identite-note { padding: 12px; border-radius: var(--rayon-sm); background: var(--gris-100); color: var(--gris-600); font-size: .84rem; line-height: 1.45; }
.profil-identite-note i { margin-right: 5px; color: var(--lagon-700); }
.profil-suppression { display: flex; flex-direction: column; gap: 18px; }
.profil-suppression p { color: var(--texte-secondaire); line-height: 1.55; }
.profil-checkbox { display: flex; align-items: flex-start; gap: 10px; color: var(--gris-700); font-size: .88rem; cursor: pointer; }
.profil-checkbox input { width: 18px; height: 18px; accent-color: var(--erreur); }

/* Desktop compact (900–1149px) : icônes seules + info-bulle */
@media (min-width: 900px) {
  .entete-inner { max-width: none; padding-inline: 32px; gap: 24px; }
  .entete-droit { display: flex; align-items: center; gap: 16px; margin-left: auto; }
  .nav-principale {
    display: flex; padding: 4px; border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, .12); background: rgba(6, 32, 44, .55);
    box-shadow: 0 8px 24px rgba(0, 0, 0, .18); transition: background var(--transition), border-color var(--transition);
  }
  .entete-defile .nav-principale { background: rgba(255, 255, 255, .04); box-shadow: none; }
  .entete-actions { display: flex; }
  .nav-lien { width: 40px; padding: 0; }
  .nav-lien span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .nav-lien::before {
    content: attr(data-label); position: absolute; left: 50%; top: calc(100% + 12px); z-index: 10; width: max-content;
    padding: 6px 10px; border: 1px solid rgba(34, 211, 238, .25); border-radius: 8px; background: var(--abysse); color: var(--lagon-100);
    font-size: .76rem; font-weight: 600; opacity: 0; pointer-events: none; transform: translate(-50%, -4px);
    transition: opacity .18s ease, transform .18s ease;
  }
  .nav-lien:hover::before, .nav-lien:focus-visible::before { opacity: 1; transform: translate(-50%, 0); }
}

/* Desktop large (≥ 1150px) : icônes + libellés */
@media (min-width: 1150px) {
  .entete-inner { padding-inline: 40px; }
  .entete-droit { gap: 20px; }
  .nav-lien { width: auto; padding: 0 16px; }
  .nav-lien span { position: static; width: auto; height: auto; overflow: visible; clip: auto; }
  .nav-lien::before { display: none; }
}
@media (max-width: 900px) {
  .profil-blocs { grid-template-columns: 1fr; }
  .profil-actions { order: 2; }
  .profil-contenu { order: 1; }
}
@media (max-width: 640px) {
  .profil-overlay { padding: 14px; }
  .profil-dialogue { width: 100%; max-height: calc(100dvh - 28px); padding: 20px 0; }
  .profil-grille { grid-template-columns: 1fr; }
  .profil-largeur { grid-column: auto; }
  .profil-enregistrer, .profil-identite-form .btn { width: 100%; }
  .profil-blocs { grid-template-columns: 1fr; }
  .profil-contenu { min-height: 0; padding: 20px; }
}

/* Barre de titre, carte du compte et groupes : propres à l'écran téléphone ci-dessous */
.profil-barre, .profil-carte { display: none; }
.profil-groupe { display: contents; }
@media (max-width: 899px) {
  /* compte ouvert : la barre d'onglets reste au-dessus, seul « Compte » est actif */
  .onglets-compte { z-index: 270; }
  .onglets-compte .onglet.actif:not(.onglet-profil) { color: var(--gris-400); }
  .onglets-compte .onglet-central.actif { background: var(--ardoise); }
}

/* ---------- Téléphone : écran d'application (liste des rubriques, puis rubrique en sous-écran) ---------- */
@media (max-width: 639px) {
  .profil-overlay { display: block; padding: 0; overflow: hidden; background: var(--gris-50); backdrop-filter: none; -webkit-backdrop-filter: none; }
  .profil-fermer { display: none; }
  .profil-dialogue { display: flex; flex-direction: column; width: 100%; height: 100dvh; max-height: none; margin: 0; padding: 0; animation: none; }

  .profil-barre {
    position: relative; display: flex; align-items: center; flex: none; min-height: calc(56px + env(safe-area-inset-top));
    padding: calc(8px + env(safe-area-inset-top)) 20px 6px; background: var(--gris-50);
  }
  .profil-barre h2 { margin: 0; overflow: hidden; color: var(--ardoise); font: 700 1.05rem var(--font-corps); white-space: nowrap; text-overflow: ellipsis; }
  .profil-barre .profil-barre-grand { margin-top: 10px; font-family: var(--font-display); font-size: 2.1rem; }
  .profil-detail .profil-barre { justify-content: center; border-bottom: 1px solid var(--gris-200); background: rgba(255, 255, 255, .94); }
  .profil-detail .profil-barre h2 { padding: 0 44px; }
  .profil-barre-retour {
    position: absolute; left: 8px; bottom: 8px; width: 40px; height: 40px; display: grid; place-items: center;
    border: 0; border-radius: 50%; background: transparent; color: var(--lagon-700); font-size: 1.15rem; cursor: pointer; -webkit-tap-highlight-color: transparent;
  }
  .profil-barre-retour:active { background: var(--gris-100); }

  .profil-blocs { display: block; flex: 1; min-height: 0; margin: 0; padding: 10px 16px calc(var(--barre-onglets, 0px) + 24px); overflow-y: auto; overscroll-behavior: contain; }
  .profil-detail .profil-actions, .profil-overlay:not(.profil-detail) .profil-contenu { display: none; }

  /* liste des rubriques */
  .profil-actions { gap: 22px; padding: 0; border: 0; background: none; }
  .profil-carte { display: flex; align-items: center; gap: 14px; padding: 16px; border: 1px solid var(--gris-200); border-radius: 18px; background: #fff; }
  .profil-carte-avatar {
    width: 54px; height: 54px; flex: none; display: grid; place-items: center; border-radius: 50%;
    background: linear-gradient(135deg, var(--lagon-400), var(--lagon-700)); color: #fff; font: 700 1.45rem var(--font-display);
  }
  .profil-carte-texte { display: flex; flex: 1; flex-direction: column; gap: 3px; min-width: 0; }
  .profil-carte-texte strong, .profil-carte-texte small { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .profil-carte-texte strong { color: var(--ardoise); font-size: 1.08rem; }
  .profil-carte-texte small { color: var(--gris-500); font-size: .82rem; }
  .profil-carte-credit { flex: none; padding: 5px 10px; border-radius: 999px; background: #fef3c7; color: #b45309; font-size: .8rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .profil-groupe { display: block; overflow: hidden; border: 1px solid var(--gris-200); border-radius: 16px; background: #fff; }
  .profil-groupe .profil-action { min-height: 62px; padding: 10px 16px; border: 0; border-radius: 0; background: #fff; -webkit-tap-highlight-color: transparent; }
  .profil-groupe .profil-action + .profil-action { border-top: 1px solid var(--gris-100); }
  .profil-groupe .profil-action:active { background: var(--gris-100); }
  .profil-action > i:first-child { width: 34px; height: 34px; flex: none; display: grid; place-items: center; border-radius: 10px; background: var(--lagon-50); font-size: .95rem; }
  .profil-action-danger > i:first-child { background: var(--erreur-clair); }
  .profil-action span { font-size: .95rem; font-weight: 600; }
  .profil-action small { font-size: .78rem; }

  /* rubrique ouverte */
  .profil-contenu { padding: 6px 0 0; border: 0; background: none; animation: profil-glisse .24s cubic-bezier(.22, .61, .36, 1); }
  .profil-contenu h3, .profil-contenu :deep(h3), .profil-retour-lien, .profil-intro-infos { display: none; }
  .profil-contenu-intro, .profil-suppression > p { margin: 0 4px 16px; font-size: .9rem; }
  .profil-infos-liste { margin-bottom: 22px; padding: 0 16px; border: 1px solid var(--gris-200); border-radius: 16px; background: #fff; }
  .profil-infos-liste div { padding: 15px 0; border-color: var(--gris-100); }
  .profil-infos-liste div:last-child { border-bottom: 0; }
  .profil-contenu .btn { width: 100%; min-height: 50px; justify-content: center; border-radius: 999px; }
  .profil-formulaire .btn { align-self: stretch; }
}
@keyframes profil-glisse { from { transform: translateX(28px); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .profil-contenu { animation: none; } }
</style>

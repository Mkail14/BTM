<script setup>
/**
 * Connexion / Inscription — connectées à Supabase Auth si configuré,
 * sinon affichées comme structure d'interface (stub, section 10.6 du CDC).
 * Inscription : on choisit d'abord son profil (particulier ou professionnel), puis des étapes courtes :
 *  - particulier : Identité → Sécurité → Validation ;
 *  - professionnel : Entreprise (SIRET) → Contact → Sécurité → Validation.
 * Le pseudo (nom affiché) est déduit du prénom et du nom.
 */
import { ref, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth.js'
import ChampTelephone from '@/composants/commun/ChampTelephone.vue'
import SaisieMotDePasse from '@/composants/commun/SaisieMotDePasse.vue'
import { formaterTelephone } from '@/services/telephone.js'
import { nettoyerPseudo, nettoyerNom, capitaliserNom, erreurNom, erreurEmail, suggestionEmail } from '@/services/validation.js'
import { nettoyerSiret, formaterSiret, siretValide, rechercherSiret } from '@/services/entreprises.js'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import BandeauAvertissement from '@/composants/commun/BandeauAvertissement.vue'
import LogoBtm from '@/composants/commun/LogoBtm.vue'
import { lireRoleCompte } from '@/services/supabase/serviceAdmin.js'

const props = defineProps({
  mode: { type: String, default: 'connexion' },
  modal: { type: Boolean, default: false }
})
const emit = defineEmits(['fermer', 'changer-mode'])
const router = useRouter()
const route = useRoute()
// Retour à la page d'origine (ex. Résultats après « Enregistrer ») ; sinon tableau de bord pour un admin, accueil pour les autres
const redirectionDemandee = () => (typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : null)
// Connecté : on ferme la fenêtre (mode modal) puis on rejoint la destination (une seule fois : clic et écouteur d'auth)
let connexionTerminee = false
async function terminerConnexion(compte) {
  if (connexionTerminee) return
  connexionTerminee = true
  emit('fermer')
  const demandee = redirectionDemandee()
  if (demandee) return router.push(demandee)
  // tableau de bord pour l'admin, espace dédié pour un fournisseur, accueil pour les autres
  const { role, fournisseur_id: fid } = compte ? await lireRoleCompte(compte.id) : {}
  router.push(role === 'admin' ? '/admin' : role === 'fournisseur' && fid ? '/espace-fournisseur' : '/')
}
const versAutreMode = (chemin) => ({ path: chemin, query: route.query.redirect ? { redirect: route.query.redirect } : {} })
const { connexion, inscription, backendDisponible, connecte, utilisateur } = useAuth()

const email = ref('')
const civilite = ref('')
// Compte professionnel : SIRET vérifié par la clé de Luhn, puis recherché dans le registre public (aide à la saisie)
const typeCompte = ref('particulier')
const siret = ref('')
const raisonSociale = ref('')
const entreprise = ref({ etat: '', donnees: null }) // '' | 'recherche' | 'trouvee' | 'inconnue' | 'indisponible'
watch(siret, async (valeur) => {
  const s = nettoyerSiret(valeur)
  if (!siretValide(s)) { entreprise.value = { etat: '', donnees: null }; return }
  entreprise.value = { etat: 'recherche', donnees: null }
  try {
    const donnees = await rechercherSiret(s)
    if (nettoyerSiret(siret.value) !== s) return // saisie modifiée entre-temps
    entreprise.value = donnees ? { etat: 'trouvee', donnees } : { etat: 'inconnue', donnees: null }
    if (donnees && !raisonSociale.value.trim()) raisonSociale.value = donnees.nom
  } catch {
    entreprise.value = { etat: 'indisponible', donnees: null } // registre saturé : l'admin vérifiera
  }
})
const nom = ref('')
const prenom = ref('')
const telephone = ref('')
const motDePasse = ref('')
const confirmation = ref('')
const resterConnecte = ref(true)
// Pseudo déduit du prénom et du nom (« Marie Hoarau » → « marie.h »)
const pseudoAuto = computed(() => {
  const base = nettoyerPseudo(`${prenom.value}.${nom.value.slice(0, 1)}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())
  return base.length >= 3 ? base : nettoyerPseudo(`${base}btm`)
})
const cgu = ref(false)
const erreurs = ref({})
const erreurGlobale = ref('')
const succes = ref('')
const chargement = ref(false)
const estInscription = computed(() => props.mode === 'inscription')
// Étape 0 : choix du profil ; ensuite les étapes propres au profil
const etape = ref(0)
const ETAPES = computed(() => (typeCompte.value === 'professionnel' ? ['Entreprise', 'Contact', 'Sécurité', 'Validation'] : ['Identité', 'Sécurité', 'Validation']))
const nomEtape = computed(() => ETAPES.value[etape.value - 1] || '')
const derniereEtape = computed(() => !estInscription.value || etape.value === ETAPES.value.length)
function choisirProfil(type) {
  typeCompte.value = type
  erreurs.value = {}
  etape.value = 1
}

watch(() => props.mode, () => { erreurs.value = {}; erreurGlobale.value = ''; succes.value = ''; etape.value = 0 })
watch(connecte, (v) => { if (v) terminerConnexion(utilisateur.value) })

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
  } else if (nomEtape.value === 'Entreprise') {
    if (!siretValide(siret.value)) e.siret = nettoyerSiret(siret.value).length === 14 ? 'Ce numéro SIRET n’est pas valide (erreur de saisie ?)' : 'Le SIRET comporte 14 chiffres'
    if (!raisonSociale.value.trim()) e.raisonSociale = 'Indiquez le nom de l’entreprise'
  } else if (nomEtape.value === 'Identité' || nomEtape.value === 'Contact') {
    if (!civilite.value) e.civilite = 'Choisissez une civilité'
    { const m = erreurNom(nom.value, 'nom'); if (m) e.nom = m }
    { const m = erreurNom(prenom.value, 'prénom'); if (m) e.prenom = m }
    validerEmail(e)
  } else if (nomEtape.value === 'Sécurité') {
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
  etape.value-- // l'étape 0 ramène au choix du profil
}

async function soumettre() {
  erreurGlobale.value = ''; succes.value = ''
  if (!valider()) return
  if (!derniereEtape.value) { etape.value++; return }
  if (!backendDisponible) { erreurGlobale.value = 'Le backend Supabase n’est pas encore configuré : ce formulaire est une maquette fonctionnelle.'; return }
  chargement.value = true
  try {
    if (estInscription.value) {
      const pro = typeCompte.value === 'professionnel'
      await inscription(email.value.trim(), motDePasse.value, {
        civilite: civilite.value, nom: nom.value.trim(), prenom: prenom.value.trim(), pseudo: pseudoAuto.value, telephone: telephone.value,
        type_profil: typeCompte.value, ...(pro ? { pro_siret: nettoyerSiret(siret.value), pro_raison_sociale: raisonSociale.value.trim() } : {})
      })
      succes.value = pro
        ? 'Compte créé ! Confirmez votre e-mail si demandé, puis connectez-vous. Votre profil professionnel sera actif dès que notre équipe aura vérifié votre SIRET.'
        : 'Compte créé ! Vérifiez votre boîte mail si une confirmation est requise, puis connectez-vous.'
    } else {
      terminerConnexion(await connexion(email.value.trim(), motDePasse.value))
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
      <aside class="auth-visuel" :class="{ pro: estInscription && typeCompte === 'professionnel' && etape > 0 }" aria-hidden="true">
        <LogoBtm :taille="72" />
        <template v-if="estInscription && typeCompte === 'professionnel' && etape > 0">
          <h2>BTM Pro</h2>
          <p>Chiffrez des chantiers entiers, pas seulement un mur.</p>
          <ul>
            <li><i class="fa-solid fa-city"></i> Projets multi-ouvrages : maisons, dalles, murs, fondations</li>
            <li><i class="fa-solid fa-cube"></i> Maquette 3D, visite intérieure et mesures exactes</li>
            <li><i class="fa-solid fa-layer-group"></i> Plusieurs maisons dans un même projet</li>
            <li><i class="fa-solid fa-file-pdf"></i> Un seul devis PDF avec code de retrait</li>
          </ul>
        </template>
        <template v-else>
          <h2>{{ estInscription ? 'Rejoignez BTM' : 'Bon retour !' }}</h2>
          <p>Synchronisez vos devis entre vos appareils et retrouvez vos projets où que vous soyez sur l’île.</p>
          <ul>
            <li><i class="fa-solid fa-cloud"></i> Sauvegarde cloud sécurisée</li>
            <li><i class="fa-solid fa-mobile-screen"></i> Accès depuis mobile, tablette et PC</li>
            <li><i class="fa-solid fa-ticket"></i> Code de retrait chez votre fournisseur</li>
          </ul>
        </template>
      </aside>

      <section class="carte auth-carte">
        <h1>{{ !estInscription ? 'Connexion' : etape === 0 ? 'Créer un compte' : typeCompte === 'professionnel' ? 'Compte professionnel' : 'Compte particulier' }}</h1>
        <p class="texte-secondaire auth-intro">{{ !estInscription ? 'Accédez à vos projets sauvegardés.' : etape === 0 ? 'Gratuit. Choisissez votre profil pour commencer.' : typeCompte === 'professionnel' ? 'Votre SIRET est vérifié par notre équipe : votre compte fonctionne tout de suite.' : 'Gratuit, en moins d’une minute.' }}</p>

        <BandeauAvertissement v-if="!backendDisponible" type="info" compact class="auth-note">
          Authentification prévue avec Supabase — renseignez <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> pour l’activer.
        </BandeauAvertissement>

        <ol v-if="estInscription && etape > 0" class="auth-etapes" :aria-label="`Étape ${etape} sur ${ETAPES.length}`">
          <li v-for="(libelle, index) in ETAPES" :key="libelle" :class="{ 'auth-etape-active': index + 1 === etape, 'auth-etape-faite': index + 1 < etape }">
            <span class="auth-etape-numero">
              <i v-if="index + 1 < etape" class="fa-solid fa-check" aria-hidden="true"></i>
              <template v-else>{{ index + 1 }}</template>
            </span>
            <span class="auth-etape-libelle">{{ libelle }}</span>
          </li>
        </ol>

        <form novalidate @submit.prevent="soumettre" class="auth-form">
          <!-- Étape 0 : choix du profil -->
          <div v-if="estInscription && etape === 0" class="auth-profils" role="group" aria-label="Vous êtes">
            <button type="button" class="auth-profil" @click="choisirProfil('particulier')">
              <span class="auth-profil-icone"><i class="fa-solid fa-house-user" aria-hidden="true"></i></span>
              <strong>Particulier</strong>
              <small>Je prépare mon propre chantier : un mur, une dalle, une terrasse…</small>
              <span class="auth-profil-suite">Continuer <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span>
            </button>
            <button type="button" class="auth-profil pro" @click="choisirProfil('professionnel')">
              <span class="auth-profil-badge">Pro</span>
              <span class="auth-profil-icone"><i class="fa-solid fa-helmet-safety" aria-hidden="true"></i></span>
              <strong>Professionnel</strong>
              <small>Entreprise du BTP, artisan : projets multi-ouvrages et maquette 3D.</small>
              <span class="auth-profil-suite">Continuer <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span>
            </button>
          </div>

          <!-- Pro : entreprise -->
          <template v-if="estInscription && nomEtape === 'Entreprise'">
            <div class="champ">
              <label for="auth-siret">Numéro SIRET</label>
              <input id="auth-siret" v-model="siret" type="text" inputmode="numeric" maxlength="17" autocomplete="off" placeholder="123 456 789 00012" class="mono auth-siret" :aria-invalid="!!erreurs.siret" @blur="siret = formaterSiret(siret)" />
              <p v-if="erreurs.siret" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.siret }}</p>
              <p v-else-if="entreprise.etat === 'recherche'" class="champ-aide"><span class="spinner" aria-hidden="true"></span> Recherche de l’entreprise…</p>
              <p v-else-if="entreprise.etat === 'inconnue'" class="champ-aide">SIRET introuvable dans le registre public : vérifiez-le (notre équipe le contrôlera).</p>
              <p v-else-if="entreprise.etat !== 'trouvee'" class="champ-aide">14 chiffres, sur votre extrait Kbis ou vos factures.</p>
            </div>
            <div v-if="entreprise.etat === 'trouvee'" class="auth-entreprise-carte" :class="{ inactive: !entreprise.donnees.active }">
              <i :class="entreprise.donnees.active ? 'fa-solid fa-building-circle-check' : 'fa-solid fa-triangle-exclamation'" aria-hidden="true"></i>
              <span><strong>{{ entreprise.donnees.nom }}</strong><small>{{ entreprise.donnees.commune || 'Registre des entreprises' }}{{ entreprise.donnees.active ? ' · établissement actif' : ' · établissement fermé' }}</small></span>
            </div>
            <div class="champ">
              <label for="auth-raison">Raison sociale</label>
              <input id="auth-raison" v-model="raisonSociale" type="text" maxlength="120" autocomplete="organization" placeholder="Nom de l’entreprise" :aria-invalid="!!erreurs.raisonSociale" />
              <p v-if="erreurs.raisonSociale" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.raisonSociale }}</p>
              <p v-else class="champ-aide">Remplie automatiquement quand le SIRET est reconnu.</p>
            </div>
          </template>

          <!-- Identité (particulier) ou contact (pro) -->
          <template v-if="estInscription && (nomEtape === 'Identité' || nomEtape === 'Contact')">
            <fieldset class="auth-civilite">
              <legend>Civilité</legend>
              <button type="button" :aria-pressed="civilite === 'M.'" @click="civilite = 'M.'; retirerErreur('civilite')">Monsieur</button>
              <button type="button" :aria-pressed="civilite === 'Mme'" @click="civilite = 'Mme'; retirerErreur('civilite')">Madame</button>
              <p v-if="erreurs.civilite" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.civilite }}</p>
            </fieldset>
            <div class="auth-identite-grille">
              <div class="champ"><label for="auth-prenom">Prénom</label><input id="auth-prenom" :value="prenom" @input="saisieNom('prenom', $event.target)" @blur="sortieNom('prenom', 'prénom')" type="text" maxlength="60" autocomplete="given-name" placeholder="Votre prénom" :aria-invalid="!!erreurs.prenom" required /><p v-if="erreurs.prenom" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.prenom }}</p></div>
              <div class="champ"><label for="auth-nom">Nom</label><input id="auth-nom" :value="nom" @input="saisieNom('nom', $event.target)" @blur="sortieNom('nom', 'nom')" type="text" maxlength="60" autocomplete="family-name" placeholder="Votre nom" :aria-invalid="!!erreurs.nom" required /><p v-if="erreurs.nom" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.nom }}</p></div>
            </div>
          </template>

          <div v-if="!estInscription || nomEtape === 'Identité' || nomEtape === 'Contact'" class="champ">
            <label for="auth-email">{{ nomEtape === 'Contact' ? 'E-mail professionnel' : 'Adresse e-mail' }}</label>
            <input id="auth-email" v-model="email" @blur="sortieEmail" type="email" maxlength="254" autocomplete="email" :placeholder="nomEtape === 'Contact' ? 'contact@entreprise.yt' : 'vous@exemple.yt'" :aria-invalid="!!erreurs.email" style="font-family: var(--font-corps)" />
            <p v-if="erreurs.email" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.email }}</p>
            <p v-else-if="suggestion" class="champ-aide auth-suggestion">Vouliez-vous écrire <button type="button" @click="appliquerSuggestion">{{ suggestion }}</button> ?</p>
          </div>

          <ChampTelephone v-if="estInscription && nomEtape === 'Sécurité'" id="auth-telephone" v-model="telephone" requis :erreur="erreurs.telephone" />
          <div v-if="!estInscription || nomEtape === 'Sécurité'" class="champ">
            <label for="auth-mdp">Mot de passe</label>
            <SaisieMotDePasse id="auth-mdp" v-model="motDePasse"  :autocomplete="estInscription ? 'new-password' : 'current-password'" placeholder="8 caractères minimum" :aria-invalid="!!erreurs.motDePasse" style="font-family: var(--font-corps)" />
            <p v-if="erreurs.motDePasse" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.motDePasse }}</p>
          </div>
          <div v-if="estInscription && nomEtape === 'Sécurité'" class="champ">
            <label for="auth-conf">Confirmer le mot de passe</label>
            <SaisieMotDePasse id="auth-conf" v-model="confirmation"  autocomplete="new-password" :aria-invalid="!!erreurs.confirmation" style="font-family: var(--font-corps)" />
            <p v-if="erreurs.confirmation" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.confirmation }}</p>
          </div>

          <template v-if="estInscription && nomEtape === 'Validation'">
            <dl class="auth-recap">
              <div><dt>Profil</dt><dd>{{ typeCompte === 'professionnel' ? 'Professionnel' : 'Particulier' }}</dd></div>
              <div v-if="typeCompte === 'professionnel'"><dt>Entreprise</dt><dd>{{ raisonSociale }} · SIRET {{ formaterSiret(siret) }}</dd></div>
              <div><dt>Nom complet</dt><dd>{{ civilite === 'Mme' ? 'Madame' : 'Monsieur' }} {{ prenom }} {{ nom }}</dd></div>
              <div><dt>Nom affiché</dt><dd>{{ pseudoAuto }}</dd></div>
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

          <div v-if="!estInscription || etape > 0" class="auth-actions">
            <BoutonBase v-if="estInscription && etape > 0" type="button" variante="secondaire" icone="fa-solid fa-arrow-left" @click="etapePrecedente">
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

/* Choix du profil (étape 0) */
.auth-profils { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.auth-profil {
  position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding: 20px 18px; text-align: left;
  border: 1.5px solid var(--gris-200); border-radius: var(--rayon-lg); background: #fff; font: inherit; color: inherit; cursor: pointer;
  transition: border-color var(--transition), box-shadow var(--transition), transform var(--transition);
}
.auth-profil:hover { border-color: var(--lagon-500); box-shadow: 0 10px 30px rgba(8, 145, 178, .12); transform: translateY(-2px); }
.auth-profil:focus-visible { outline: 3px solid var(--lagon-400); outline-offset: 2px; }
.auth-profil strong { font-size: 1.1rem; color: var(--ardoise); }
.auth-profil small { color: var(--texte-secondaire); font-size: .86rem; line-height: 1.45; }
.auth-profil-icone { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 14px; background: var(--gris-100); color: var(--ardoise); font-size: 1.2rem; }
.auth-profil.pro .auth-profil-icone { background: var(--ardoise); color: #fcd34d; }
.auth-profil-suite { margin-top: auto; padding-top: 8px; color: var(--lagon-700); font-size: .88rem; font-weight: 700; }
.auth-profil-badge { position: absolute; top: 14px; right: 14px; padding: 2px 10px; border-radius: 999px; background: #fef3c7; color: #92400e; font-size: .72rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
.auth-visuel.pro { background: linear-gradient(150deg, var(--ardoise) 0%, #0b3a4d 100%); }
.auth-visuel.pro li i { color: #fcd34d; }

/* Civilité */
.auth-civilite { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; border: 0; }
.auth-civilite legend { width: 100%; margin-bottom: 8px; padding: 0; font-weight: 600; font-size: .95rem; color: var(--gris-700); }
.auth-civilite button { flex: 1; min-height: 46px; border: 1.5px solid var(--gris-300); border-radius: var(--rayon); background: #fff; font: inherit; font-weight: 600; color: var(--ardoise); cursor: pointer; transition: border-color var(--transition), background var(--transition); }
.auth-civilite button:hover { border-color: var(--lagon-500); }
.auth-civilite button[aria-pressed="true"] { border-color: var(--lagon-600); background: var(--lagon-50); color: var(--lagon-800); }
.auth-civilite .champ-erreur { width: 100%; }

/* Entreprise reconnue */
.auth-siret { font-size: 1.1rem; letter-spacing: .08em; }
.auth-entreprise-carte { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: var(--rayon); background: #ecfdf5; color: #065f46; }
.auth-entreprise-carte i { font-size: 1.3rem; }
.auth-entreprise-carte span { display: flex; flex-direction: column; }
.auth-entreprise-carte small { color: #047857; font-size: .82rem; }
.auth-entreprise-carte.inactive { background: #fffbeb; color: #92400e; }
.auth-entreprise-carte.inactive small { color: #b45309; }
@media (max-width: 520px) { .auth-profils { grid-template-columns: 1fr; } }

/* Type de compte (inscription) */
.auth-type { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 0; padding: 0; border: 0; }
.auth-type legend { grid-column: 1 / -1; margin-bottom: 8px; padding: 0; font-weight: 600; font-size: .95rem; color: var(--gris-700); }
.auth-type-choix {
  position: relative; display: flex; align-items: center; gap: 12px; padding: 14px; border: 1.5px solid var(--gris-300); border-radius: var(--rayon);
  background: #fff; cursor: pointer; transition: border-color var(--transition), background var(--transition), box-shadow var(--transition);
}
.auth-type-choix:hover { border-color: var(--lagon-500); }
.auth-type-choix.actif { border-color: var(--lagon-600); background: var(--lagon-50); box-shadow: 0 0 0 3px rgba(6, 182, 212, .15); }
.auth-type-choix input { position: absolute; opacity: 0; pointer-events: none; }
.auth-type-choix:focus-within { outline: 3px solid var(--lagon-400); outline-offset: 2px; }
.auth-type-choix > i { width: 38px; height: 38px; flex: none; display: grid; place-items: center; border-radius: 10px; background: var(--gris-100); color: var(--ardoise); }
.auth-type-choix.actif > i { background: var(--lagon-600); color: #fff; }
.auth-type-choix span { display: flex; flex-direction: column; min-width: 0; }
.auth-type-choix strong { color: var(--ardoise); font-size: .95rem; }
.auth-type-choix small { color: var(--texte-secondaire); font-size: .78rem; line-height: 1.35; }
.auth-pro { display: flex; flex-direction: column; gap: 16px; padding: 16px; border-radius: var(--rayon); background: var(--gris-50); border: 1px dashed var(--gris-300); }
.auth-pro .mono { font-family: var(--font-mono); letter-spacing: .04em; }
.auth-entreprise { color: #047857; font-weight: 600; }
.auth-entreprise.inactive { color: #b45309; }
.auth-pro .champ-aide .spinner { width: 12px; height: 12px; border-width: 2px; vertical-align: -2px; }
@media (max-width: 420px) { .auth-type { grid-template-columns: 1fr; } }
</style>

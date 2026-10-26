<script setup>
/**
 * « Devenir partenaire » : l'entreprise crée elle-même son compte fournisseur. Même fenêtre que la connexion du site
 * (carte au format téléphone, fond flouté, feuille qui monte du bas sur téléphone) ; un thème par écran, sans défiler :
 *  1. Entreprise — SIRET contrôlé (clé de Luhn) puis cherché au registre public, qui remplit le nom et la commune ;
 *  2. Activité — ce qu'elle vend (plusieurs catégories, la première sert de catégorie principale), la taille de l'équipe,
 *     la livraison sur chantier, le logiciel de caisse ou de stock (import du catalogue) ;
 *  3. Coordonnées ; 4. Horaires — le même tableau que la fiche du fournisseur (ChampHoraires) ; 5. Compte.
 * La demande part en validation chez BTM (Admin → Fournisseurs → Demandes) ; le compte voit sa page d'attente.
 * Mode « correction » (rectification demandée par BTM) : mêmes écrans, sans celui du compte, puis renvoi.
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import BandeauAvertissement from '@/composants/commun/BandeauAvertissement.vue'
import ChampTelephone from '@/composants/commun/ChampTelephone.vue'
import SaisieMotDePasse from '@/composants/commun/SaisieMotDePasse.vue'
import ChampHoraires from '@/composants/fournisseur/ChampHoraires.vue'
import { useInscriptionFournisseur } from '@/composables/useInscriptionFournisseur.js'
import { useAuth } from '@/composables/useAuth.js'
import { useFenetreAuth } from '@/composables/useFenetreAuth.js'
import { chargerCategories } from '@/services/supabase/serviceFournisseurs.js'
import { inscrireFournisseur, corrigerMaDemande } from '@/services/supabase/serviceInscriptionFournisseur.js'
import { siretValide, rechercherSiret, formaterSiret, nettoyerSiret } from '@/services/entreprises.js'
import { erreurEmail } from '@/services/validation.js'
import { QUESTIONNAIRE } from '@/donnees/questionnaireFournisseur.js'
import { COMMUNES, communeMayotte } from '@/donnees/communesMayotte.js'

const { etat, fermerInscriptionFournisseur } = useInscriptionFournisseur()
const { rechargerRole } = useAuth()
const { ouvrirAuth } = useFenetreAuth()

const correction = computed(() => etat.correction)
const ECRANS = [
  { cle: 'entreprise', titre: 'Votre entreprise', aide: 'Elle est vérifiée au registre public des entreprises.' },
  { cle: 'activite', titre: 'Votre activité', aide: 'Pour présenter vos produits aux bons clients.' },
  { cle: 'contact', titre: 'Vos coordonnées', aide: 'Pour que les clients et BTM joignent l’entreprise.' },
  { cle: 'horaires', titre: 'Vos horaires', aide: 'Affichés sur votre fiche. Facultatif : vous pourrez les changer plus tard.' },
  { cle: 'compte', titre: 'Votre compte', aide: 'Pour vous connecter à votre espace fournisseur.' }
]
const ETAPES = computed(() => (correction.value ? ECRANS.filter((e) => e.cle !== 'compte') : ECRANS))
const etape = ref(0)
const ecran = computed(() => ETAPES.value[etape.value])
const derniere = computed(() => etape.value === ETAPES.value.length - 1)

const d = correction.value || {}
const q = d.questionnaire || {}
const f = ref({
  siret: d.siret ? formaterSiret(d.siret) : '', entreprise: d.entreprise || '', commune: d.commune || '', adresse: d.adresse || '',
  livraison: d.livraison ?? null,
  contact_nom: d.contact_nom || '', telephone: d.telephone || '', email: d.email || '', horaires: d.horaires || '', description: d.description || '',
  questionnaire: {
    categories: q.categories || (d.categorie_id ? [d.categorie_id] : []),
    equipe: q.equipe || '', logiciel: q.logiciel || ''
  }
})
const telephoneValide = ref(!!d.telephone)
const motDePasse = ref('')
const confirmation = ref('')
const cgu = ref(false)
const erreurs = ref({})
const erreurGlobale = ref('')
const envoi = ref(false)
const termine = ref(null) // { email, confirmation } une fois le compte créé

const categories = ref([])
onMounted(async () => { categories.value = await chargerCategories() })
const repondre = (question, valeur) => { f.value.questionnaire[question] = valeur; retirer(question) }
const vend = (id) => f.value.questionnaire.categories.includes(id)
function basculerCategorie(id) {
  const liste = f.value.questionnaire.categories
  f.value.questionnaire.categories = vend(id) ? liste.filter((c) => c !== id) : [...liste, id]
  retirer('categories')
}
const retirer = (cle) => { if (erreurs.value[cle]) { const { [cle]: _, ...reste } = erreurs.value; erreurs.value = reste } }

// ---------- SIRET : espacé pendant la frappe (356 000 000 00048), contrôlé puis cherché au registre public ----------
// les espaces se placent tout seuls après le 3e, 6e et 9e chiffre ; le curseur reste derrière le chiffre tapé
function saisirSiret(e) {
  const champ = e.target
  const chiffresAvant = champ.value.slice(0, champ.selectionStart).replace(/\D/g, '').length
  const chiffres = champ.value.replace(/\D/g, '').slice(0, 14)
  const espace = chiffres.replace(/^(\d{3})(\d{0,3})(\d{0,3})(\d{0,5}).*$/, (_, a, b, c, d) => [a, b, c, d].filter(Boolean).join(' '))
  f.value.siret = chiffres.length > 3 ? espace : chiffres
  champ.value = f.value.siret
  let pos = 0
  for (let n = 0; pos < champ.value.length && n < chiffresAvant; pos++) if (/\d/.test(champ.value[pos])) n++
  champ.setSelectionRange(pos, pos)
  retirer('siret')
}
const registre = ref({ etat: '', donnees: null }) // '' | 'recherche' | 'trouvee' | 'inconnue' | 'indisponible'
let derniereRecherche = ''
watch(() => f.value.siret, async (v) => {
  const s = nettoyerSiret(v)
  if (s.length !== 14 || !siretValide(s)) { registre.value = { etat: '', donnees: null }; return }
  if (s === derniereRecherche) return
  derniereRecherche = s
  registre.value = { etat: 'recherche', donnees: null }
  try {
    const r = await rechercherSiret(s)
    if (nettoyerSiret(f.value.siret) !== s) return
    registre.value = r ? { etat: 'trouvee', donnees: r } : { etat: 'inconnue', donnees: null }
    if (r && !f.value.entreprise.trim()) f.value.entreprise = r.nom
    // commune du registre (« MAMOUDZOU ») reprise seulement si c'est une commune de Mayotte, bien écrite
    if (r?.commune && !f.value.commune.trim() && communeMayotte(r.commune)) f.value.commune = communeMayotte(r.commune)
  } catch {
    registre.value = { etat: 'indisponible', donnees: null }
  }
}, { immediate: true })

// ---------- Écrans ----------
function verifier() {
  const e = {}
  const v = f.value
  const cle = ecran.value.cle
  if (cle === 'entreprise') {
    if (!siretValide(v.siret)) e.siret = 'Numéro SIRET invalide : 14 chiffres, sur votre extrait Kbis.'
    else if (v.entreprise.trim().length < 2) e.entreprise = 'Indiquez le nom de l’entreprise.'
    else if (!communeMayotte(v.commune)) e.commune = v.commune.trim() ? 'Choisissez une commune de Mayotte dans la liste.' : 'Indiquez la commune.'
  } else if (cle === 'activite') {
    if (!v.questionnaire.categories.length) e.categories = 'Choisissez au moins une catégorie.'
    else if (v.livraison === null) e.livraison = 'Indiquez si vous livrez sur les chantiers.'
  } else if (cle === 'contact') {
    if (!telephoneValide.value) e.telephone = 'Indiquez un numéro de téléphone valide.'
    else if (erreurEmail(v.email.trim())) e.email = erreurEmail(v.email.trim())
  } else if (cle === 'horaires') {
    if (v.horaires.length > 120) e.horaires = 'Horaires trop variés : regroupez les jours qui ont les mêmes heures.'
  } else {
    if (motDePasse.value.length < 8) e.motDePasse = '8 caractères minimum.'
    else if (confirmation.value !== motDePasse.value) e.confirmation = 'Les deux mots de passe sont différents.'
    else if (!cgu.value) e.cgu = 'Acceptez les conditions pour créer votre compte.'
  }
  erreurs.value = e
  return !Object.keys(e).length
}
// une seule ligne d'erreur par écran, sous ses champs
const erreurEcran = computed(() => Object.values(erreurs.value)[0] || '')
function suivant() {
  erreurGlobale.value = ''
  if (!verifier()) return focaliserErreur()
  if (!derniere.value) { etape.value++; nextTick(focaliser); return }
  envoyer()
}
function precedent() { erreurs.value = {}; erreurGlobale.value = ''; if (etape.value) etape.value-- }

const fenetre = ref(null)
// focus sur le premier champ à taper ; les écrans de choix n'en ont pas (un choix entouré semblerait déjà coché)
const focaliser = () => fenetre.value?.querySelector('.ifo-corps input:not([type="checkbox"])')?.focus()
const focaliserErreur = () => nextTick(() => fenetre.value?.querySelector('[aria-invalid="true"]')?.focus())

async function envoyer() {
  envoi.value = true
  const infos = { ...f.value, categorie_id: f.value.questionnaire.categories[0], livraison: !!f.value.livraison }
  try {
    if (correction.value) {
      await corrigerMaDemande(infos)
      await rechargerRole()
      fermerInscriptionFournisseur()
      return
    }
    const { confirmationRequise } = await inscrireFournisseur(infos, motDePasse.value)
    if (!confirmationRequise) await rechargerRole()
    termine.value = { email: f.value.email.trim(), confirmation: confirmationRequise }
  } catch (e) {
    const m = e?.message || ''
    erreurGlobale.value = /already registered/i.test(m) ? 'Un compte existe déjà avec cet e-mail : connectez-vous, ou utilisez l’adresse de l’entreprise.' : m || 'L’envoi n’a pas abouti. Réessayez.'
  } finally {
    envoi.value = false
  }
}

function fermer() { if (!envoi.value) fermerInscriptionFournisseur() }
function seConnecter() { fermerInscriptionFournisseur(); ouvrirAuth('connexion') }
onMounted(() => nextTick(focaliser))
</script>

<template>
  <div class="ifo-voile" @click.self="fermer" @keydown.esc="fermer">
    <section ref="fenetre" class="ifo" :class="{ 'ifo-large': !termine && ecran.cle === 'horaires' }" role="dialog" aria-modal="true" aria-labelledby="ifo-titre">
      <button type="button" class="ifo-fermer" aria-label="Fermer" @click="fermer"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>

      <!-- Compte créé -->
      <div v-if="termine" class="ifo-fini" role="status">
        <span class="ifo-fini-icone" aria-hidden="true"><i class="fa-solid fa-envelope-circle-check"></i></span>
        <h2 id="ifo-titre" class="ifo-titre">Votre compte est créé</h2>
        <p v-if="termine.confirmation">Confirmez votre adresse en ouvrant le lien envoyé à <strong>{{ termine.email }}</strong>, puis connectez-vous.</p>
        <ol class="ifo-suite">
          <li class="fait"><i class="fa-solid fa-check" aria-hidden="true"></i> Compte et informations envoyés</li>
          <li><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> Vérification par l’équipe BTM</li>
          <li><i class="fa-solid fa-store" aria-hidden="true"></i> Ouverture de votre espace fournisseur</li>
        </ol>
        <p class="ifo-note">En attendant, votre espace affiche l’avancement de votre demande.</p>
        <div class="ifo-actions">
          <BoutonBase variante="secondaire" @click="fermer">Fermer</BoutonBase>
          <BoutonBase v-if="termine.confirmation" variante="primaire" bloc icone="fa-solid fa-right-to-bracket" @click="seConnecter">J’ai confirmé, me connecter</BoutonBase>
        </div>
      </div>

      <form v-else novalidate class="ifo-form" @submit.prevent="suivant">
        <!-- avancement : un segment par écran, comme les étapes de l'inscription du site -->
        <div class="ifo-avancement" role="progressbar" :aria-valuenow="etape + 1" aria-valuemin="1" :aria-valuemax="ETAPES.length" :aria-label="`Étape ${etape + 1} sur ${ETAPES.length}`">
          <span v-for="(e, i) in ETAPES" :key="e.cle" :class="{ faite: i < etape, active: i === etape }"></span>
        </div>
        <header class="ifo-tete">
          <p class="ifo-surtitre">{{ correction ? 'Corriger ma demande' : 'Devenir partenaire' }} · {{ etape + 1 }}/{{ ETAPES.length }}</p>
          <h2 id="ifo-titre" class="ifo-titre">{{ ecran.titre }}</h2>
          <p class="ifo-intro">{{ ecran.aide }}</p>
        </header>
        <p v-if="correction?.message_admin && etape === 0" class="ifo-message"><i class="fa-solid fa-comment-dots" aria-hidden="true"></i> <span><strong>Demande de BTM :</strong> {{ correction.message_admin }}</span></p>

        <div class="ifo-corps">
          <!-- 1. Entreprise -->
          <template v-if="ecran.cle === 'entreprise'">
            <div class="champ">
              <label for="ifo-siret">Numéro SIRET</label>
              <input id="ifo-siret" :value="f.siret" class="mono" inputmode="numeric" maxlength="17" autocomplete="off" placeholder="123 456 789 00012" :aria-invalid="!!erreurs.siret" @input="saisirSiret" />
              <p v-if="registre.etat === 'trouvee'" class="ifo-registre" :class="{ ferme: !registre.donnees.active }">
                <i :class="registre.donnees.active ? 'fa-solid fa-circle-check' : 'fa-solid fa-triangle-exclamation'" aria-hidden="true"></i>
                <span>{{ registre.donnees.nom }} · {{ registre.donnees.active ? 'établissement actif' : 'établissement fermé' }}</span>
              </p>
              <p v-else-if="registre.etat === 'recherche'" class="champ-aide"><span class="spinner" aria-hidden="true"></span> Recherche au registre…</p>
              <p v-else-if="registre.etat === 'inconnue'" class="champ-aide">Introuvable au registre : vérifiez-le (BTM le contrôlera).</p>
              <p v-else class="champ-aide">14 chiffres, sur votre extrait Kbis.</p>
            </div>
            <div class="champ"><label for="ifo-nom">Nom de l’entreprise</label><input id="ifo-nom" v-model="f.entreprise" maxlength="120" autocomplete="organization" placeholder="Nom affiché aux clients" :aria-invalid="!!erreurs.entreprise" @input="retirer('entreprise')" /></div>
            <div class="ifo-duo">
              <!-- seules les 17 communes de Mayotte : proposées pendant la frappe, bien écrites en quittant le champ -->
              <div class="champ">
                <label for="ifo-com">Commune</label>
                <input
                  id="ifo-com" v-model="f.commune" list="ifo-communes" maxlength="60" autocomplete="off" placeholder="Mamoudzou" :aria-invalid="!!erreurs.commune"
                  @input="retirer('commune')" @blur="f.commune = communeMayotte(f.commune) || f.commune"
                />
                <datalist id="ifo-communes"><option v-for="c in COMMUNES" :key="c" :value="c" /></datalist>
              </div>
              <div class="champ"><label for="ifo-adr">Adresse <small class="texte-secondaire">(facultative)</small></label><input id="ifo-adr" v-model="f.adresse" maxlength="160" autocomplete="street-address" placeholder="Rue, quartier" /></div>
            </div>
          </template>

          <!-- 2. Activité : des choix à toucher, pas de texte à taper -->
          <template v-else-if="ecran.cle === 'activite'">
            <fieldset class="ifo-question">
              <legend>Ce que vous vendez <small class="texte-secondaire">(plusieurs choix possibles)</small></legend>
              <div class="ifo-choix ifo-pastilles">
                <button
                  v-for="c in categories" :key="c.id" type="button" role="checkbox" class="ifo-pastille ifo-coche" :aria-checked="vend(c.id)"
                  :aria-invalid="!!erreurs.categories" @click="basculerCategorie(c.id)"
                ><i :class="vend(c.id) ? 'fa-solid fa-check' : 'fa-solid fa-plus'" aria-hidden="true"></i>{{ c.libelle }}</button>
              </div>
            </fieldset>
            <fieldset class="ifo-question">
              <legend>{{ QUESTIONNAIRE.equipe.libelle }} <small class="texte-secondaire">(facultatif)</small></legend>
              <div class="ifo-choix ifo-pastilles" role="radiogroup">
                <button
                  v-for="o in QUESTIONNAIRE.equipe.options" :key="o.valeur" type="button" role="radio" class="ifo-pastille"
                  :aria-checked="f.questionnaire.equipe === o.valeur" @click="repondre('equipe', o.valeur)"
                >{{ o.libelle }}</button>
              </div>
            </fieldset>
            <fieldset class="ifo-question">
              <legend>Livrez-vous sur les chantiers ?</legend>
              <div class="ifo-choix ifo-pastilles" role="radiogroup">
                <button v-for="v in [true, false]" :key="String(v)" type="button" role="radio" class="ifo-pastille" :aria-checked="f.livraison === v" :aria-invalid="!!erreurs.livraison" @click="f.livraison = v; retirer('livraison')">{{ v ? 'Oui' : 'Non' }}</button>
              </div>
            </fieldset>
            <fieldset class="ifo-question">
              <legend>{{ QUESTIONNAIRE.logiciel.libelle }} <small class="texte-secondaire">(facultatif)</small></legend>
              <div class="ifo-choix ifo-pastilles" role="radiogroup">
                <button v-for="o in QUESTIONNAIRE.logiciel.options" :key="o.valeur" type="button" role="radio" class="ifo-pastille" :aria-checked="f.questionnaire.logiciel === o.valeur" @click="repondre('logiciel', o.valeur)">{{ o.libelle }}</button>
              </div>
            </fieldset>
          </template>

          <!-- 3. Coordonnées -->
          <template v-else-if="ecran.cle === 'contact'">
            <ChampTelephone id="ifo-tel" v-model="f.telephone" v-model:valide="telephoneValide" label="Téléphone de l’entreprise" pays-fixe="YT" />
            <div class="champ"><label for="ifo-mail">E-mail de l’entreprise</label><input id="ifo-mail" v-model="f.email" type="email" maxlength="254" autocomplete="email" placeholder="contact@entreprise.yt" :aria-invalid="!!erreurs.email" :disabled="!!correction" @input="retirer('email')" /></div>
          </template>

          <!-- 4. Horaires : un interrupteur par jour, heures dans des listes -->
          <div v-else-if="ecran.cle === 'horaires'" class="ifo-horaires">
            <ChampHoraires v-model="f.horaires" @update:model-value="retirer('horaires')" />
          </div>

          <!-- 5. Compte -->
          <template v-else>
            <dl class="ifo-recap">
              <div><dt>Entreprise</dt><dd>{{ f.entreprise }}</dd></div>
              <div><dt>Connexion</dt><dd>{{ f.email }}</dd></div>
            </dl>
            <div class="champ"><label for="ifo-mdp">Mot de passe</label><SaisieMotDePasse id="ifo-mdp" v-model="motDePasse" autocomplete="new-password" placeholder="8 caractères minimum" :aria-invalid="!!erreurs.motDePasse" /></div>
            <div class="champ"><label for="ifo-conf">Confirmer le mot de passe</label><SaisieMotDePasse id="ifo-conf" v-model="confirmation" autocomplete="new-password" :aria-invalid="!!erreurs.confirmation" /></div>
            <label class="ifo-case"><input v-model="cgu" type="checkbox" :aria-invalid="!!erreurs.cgu" /> J’accepte les <router-link to="/conditions" target="_blank" rel="noopener">conditions d’utilisation</router-link></label>
          </template>

          <p v-if="erreurEcran" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurEcran }}</p>
        </div>

        <BandeauAvertissement v-if="erreurGlobale" type="erreur" compact>{{ erreurGlobale }}</BandeauAvertissement>
        <div class="ifo-actions">
          <BoutonBase v-if="etape > 0" type="button" variante="secondaire" icone="fa-solid fa-arrow-left" @click="precedent">Retour</BoutonBase>
          <BoutonBase type="submit" bloc :chargement="envoi" :icone-droite="derniere ? '' : 'fa-solid fa-arrow-right'" :icone="derniere ? (correction ? 'fa-solid fa-paper-plane' : 'fa-solid fa-user-plus') : ''">
            {{ !derniere ? 'Continuer' : correction ? 'Renvoyer ma demande' : 'Créer mon compte' }}
          </BoutonBase>
        </div>
        <p v-if="!correction && etape === 0" class="ifo-bascule">Déjà un compte ? <button type="button" @click="seConnecter">Se connecter</button></p>
      </form>
    </section>
  </div>
</template>

<style scoped>
/* Même fenêtre que la connexion du site (FenetreConnexion) : voile flouté, carte au format téléphone sur fond gris clair,
   titre en Barlow, champs et boutons du site. Chaque écran tient sans défiler. */
.ifo-voile {
  position: fixed; inset: 0; z-index: 260; display: grid; place-items: center; padding: 24px;
  background: rgba(17, 17, 17, .58); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); animation: ifo-fondu .2s ease;
}
@keyframes ifo-fondu { from { opacity: 0; } }
.ifo {
  position: relative; width: min(100%, 460px); max-height: calc(100dvh - 48px); overflow: hidden auto; overscroll-behavior: contain;
  padding: 26px 32px 24px; border-radius: 28px; background: var(--gris-50); color: var(--ardoise);
  box-shadow: 0 30px 80px rgba(17, 17, 17, .45); animation: ifo-monter .34s cubic-bezier(.22, .61, .36, 1);
}
@keyframes ifo-monter { from { transform: translateY(18px); opacity: 0; } }
/* écran des horaires : plus large, pour qu'un jour avec pause tienne sur une ligne */
.ifo-large { width: min(100%, 620px); }
.ifo-fermer {
  position: absolute; top: 16px; right: 16px; z-index: 2; display: grid; place-items: center; width: 40px; height: 40px; border: 0; border-radius: 50%;
  background: var(--gris-100); color: var(--ardoise); font-size: 1.05rem; cursor: pointer; transition: background .15s;
}
.ifo-fermer:hover { background: var(--gris-200); }
.ifo-form { display: flex; flex-direction: column; gap: 18px; }

/* avancement : segments comme les étapes de l'inscription */
.ifo-avancement { display: flex; gap: 6px; margin-right: 52px; padding-top: 12px; }
.ifo-avancement span { flex: 1; height: 4px; border-radius: 999px; background: var(--gris-200); transition: background .25s; }
.ifo-avancement span.faite { background: color-mix(in srgb, var(--lagon-600) 45%, transparent); }
.ifo-avancement span.active { background: var(--lagon-600); }
.ifo-surtitre { margin: 0 0 4px; color: var(--lagon-700); font-size: .74rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.ifo-titre { margin: 0; font-family: var(--font-display); font-size: 2.1rem; line-height: 1.1; color: var(--ardoise); }
.ifo-intro { margin: 4px 0 0; color: var(--texte-secondaire); font-size: .92rem; }
.ifo-message { display: flex; gap: 10px; margin: 0; padding: 12px 14px; border-radius: var(--rayon); background: rgba(245, 158, 11, .12); color: var(--ardoise); font-size: .88rem; line-height: 1.5; }
.ifo-message i { margin-top: 3px; color: #d97706; }

.ifo-corps { display: flex; flex-direction: column; gap: 16px; }
.ifo-corps .champ input { width: 100%; font-family: var(--font-corps); }
.ifo-corps .champ input.mono { font-family: var(--font-mono); }
.ifo-corps small { font-weight: 400; }
.ifo-duo { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.ifo-duo > * { min-width: 0; }
.ifo-registre { display: flex; align-items: center; gap: 6px; margin: 0; color: #047857; font-size: .82rem; font-weight: 600; }
.ifo-registre span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ifo-registre.ferme { color: var(--erreur); }

/* questions à choix : pastilles à toucher */
.ifo-question { display: flex; flex-direction: column; gap: 8px; min-width: 0; margin: 0; padding: 0; border: 0; }
.ifo-question legend { margin-bottom: 8px; padding: 0; color: var(--gris-700); font-weight: 600; font-size: .95rem; }
.ifo-choix { display: grid; gap: 8px; }
.ifo-pastille:hover { border-color: var(--lagon-500); }
.ifo-pastilles { display: flex; flex-wrap: wrap; gap: 8px; }
.ifo-pastille {
  min-height: 40px; padding: 0 16px; border: 1.5px solid var(--gris-200); border-radius: 999px; background: var(--carte); color: var(--ardoise);
  font: inherit; font-size: .9rem; font-weight: 600; cursor: pointer; transition: border-color var(--transition), background var(--transition);
}
.ifo-pastille[aria-checked="true"] { border-color: var(--lagon-600); background: var(--lagon-600); color: var(--sur-primaire); }
/* choix multiple : un « + » devient une coche */
.ifo-coche { display: inline-flex; align-items: center; gap: 8px; padding-left: 14px; }
.ifo-coche i { color: var(--gris-400); font-size: .78rem; }
.ifo-coche[aria-checked="true"] i { color: #fff; }

/* horaires : ChampHoraires vient de l'espace fournisseur (jetons --adm-*) ; ici ses jetons suivent ceux du site, clair ou sombre,
   et ses lignes sont resserrées pour que la semaine tienne dans la fenêtre */
.ifo-horaires {
  --adm-ligne: var(--gris-200); --adm-ligne-2: var(--gris-100); --adm-ligne-forte: var(--gris-300); --adm-champ: var(--carte);
  --adm-encre: var(--ardoise); --adm-encre-2: var(--texte-secondaire); --adm-muet: var(--gris-400); --adm-accent: var(--lagon-600);
  --adm-attention-texte: #b45309; --adm-baisse: var(--erreur);
}
.ifo-horaires :deep(.adm-interrupteur) {
  position: relative; width: 42px; height: 24px; flex: none; border: 0; border-radius: 999px; background: var(--gris-300); cursor: pointer; transition: background var(--transition);
}
.ifo-horaires :deep(.adm-interrupteur)::after {
  content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, .25); transition: transform var(--transition);
}
.ifo-horaires :deep(.adm-interrupteur[aria-checked="true"]) { background: var(--lagon-600); }
.ifo-horaires :deep(.adm-interrupteur[aria-checked="true"])::after { transform: translateX(18px); }
.ifo-horaires :deep(.hor-ligne) { grid-template-columns: auto 78px 1fr; gap: 10px; min-height: 46px; padding: 4px 12px; }
.ifo-horaires :deep(.hor-plages), .ifo-horaires :deep(.hor-ferme) { grid-column: auto; }
.ifo-horaires :deep(.hor-plage select) { min-height: 32px; padding: 2px 4px; }

.ifo-recap { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 14px 16px; border: 1px solid var(--gris-200); border-radius: var(--rayon-sm); background: var(--carte); }
.ifo-recap div { display: flex; justify-content: space-between; gap: 16px; }
.ifo-recap dt { color: var(--texte-secondaire); font-size: .88rem; }
.ifo-recap dd { margin: 0; color: var(--ardoise); font-weight: 600; text-align: right; overflow-wrap: anywhere; }
.ifo-case { display: flex; align-items: center; gap: 10px; color: var(--gris-700); font-size: .92rem; cursor: pointer; }
.ifo-case input { width: 18px; height: 18px; accent-color: var(--lagon-600); }
.ifo-case a { color: var(--lagon-700); font-weight: 600; text-decoration: underline; }

.ifo-actions { display: flex; gap: 12px; margin-top: 2px; }
.ifo-actions .btn-bloc { flex: 1; }
.ifo :deep(.btn) { min-height: 50px; border-radius: 999px; }
.ifo-bascule { margin: -6px 0 0; color: var(--texte-secondaire); font-size: .95rem; text-align: center; }
.ifo-bascule button { padding: 0; border: 0; background: none; color: var(--lagon-700); font: inherit; font-weight: 700; cursor: pointer; }

.ifo-fini { display: flex; flex-direction: column; gap: 14px; padding-top: 30px; }
.ifo-fini p { margin: 0; color: var(--texte-secondaire); line-height: 1.6; }
.ifo-fini-icone { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 16px; background: rgba(16, 185, 129, .12); color: #059669; font-size: 1.6rem; }
.ifo-suite { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 14px 16px; border-radius: var(--rayon); background: var(--carte); list-style: none; }
.ifo-suite li { display: flex; align-items: center; gap: 10px; color: var(--texte-secondaire); font-size: .92rem; }
.ifo-suite li i { width: 18px; color: var(--gris-400); text-align: center; }
.ifo-suite li.fait { color: var(--ardoise); font-weight: 600; }
.ifo-suite li.fait i { color: #059669; }
.ifo-note { font-size: .86rem; }

/* écran peu haut (portable, affichage agrandi) : mêmes écrans, espacements resserrés, comme la connexion */
@media (min-width: 640px) and (max-height: 760px) {
  .ifo { padding: 20px 30px 18px; }
  .ifo-form { gap: 14px; }
  .ifo-corps { gap: 12px; }
  .ifo-titre { font-size: 1.75rem; }
  .ifo-corps .champ { gap: 4px; }
  .ifo-corps .champ input, .ifo-corps :deep(.tel input) { padding-top: 10px; padding-bottom: 10px; }
  .ifo-question legend { margin-bottom: 4px; }
  .ifo :deep(.btn) { min-height: 46px; }
}
@media (min-width: 640px) and (max-height: 640px) {
  .ifo-surtitre, .ifo-intro { display: none; }
  .ifo-form { gap: 12px; }
  .ifo-pastille { min-height: 36px; }
}

/* téléphone : feuille qui monte du bas, comme la connexion */
@media (max-width: 639px) {
  .ifo-voile { place-items: end center; padding: 0; }
  .ifo { width: 100%; max-height: calc(100dvh - 12px); padding: 16px 20px calc(16px + env(safe-area-inset-bottom)); border-radius: 26px 26px 0 0; }
  .ifo-form { gap: 14px; }
  .ifo-corps { gap: 12px; }
  .ifo-titre { font-size: 1.7rem; }
  .ifo-intro { font-size: .85rem; }
  .ifo-corps .champ { gap: 4px; }
  .ifo-corps .champ input, .ifo-corps :deep(.tel input) { font-size: 1rem; padding-top: 11px; padding-bottom: 11px; } /* 16 px : pas de zoom sur iPhone */
  .ifo-question legend { margin-bottom: 4px; font-size: .9rem; }
  .ifo-pastille { padding: 0 13px; }
  .ifo :deep(.btn) { min-height: 48px; }
  .ifo-horaires :deep(.hor-ligne) { grid-template-columns: auto 66px 1fr; gap: 8px; padding: 4px 10px; }
  .ifo-horaires :deep(.hor-jour) { font-size: .82rem; }
}
/* petit téléphone : l'avancement suffit, la phrase d'aide s'efface */
@media (max-width: 639px) and (max-height: 720px) {
  .ifo-surtitre, .ifo-intro { display: none; }
  .ifo-form { gap: 12px; }
  .ifo-question legend { margin-bottom: 2px; }
}
</style>

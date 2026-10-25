<script setup>
/**
 * « Devenir partenaire » : l'entreprise crée elle-même son compte fournisseur, en trois étapes
 * (entreprise, contact, compte). Le SIRET est contrôlé (clé de Luhn) puis cherché dans le registre public,
 * qui remplit le nom et la commune. La demande part en validation chez BTM (Admin → Fournisseurs → Demandes) ;
 * le compte voit sa page d'attente jusqu'à la décision.
 * Mode « correction » (rectification demandée par BTM) : mêmes champs, sans l'étape du compte, puis renvoi.
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import BandeauAvertissement from '@/composants/commun/BandeauAvertissement.vue'
import ChampTelephone from '@/composants/commun/ChampTelephone.vue'
import SaisieMotDePasse from '@/composants/commun/SaisieMotDePasse.vue'
import { useInscriptionFournisseur } from '@/composables/useInscriptionFournisseur.js'
import { useAuth } from '@/composables/useAuth.js'
import { useFenetreAuth } from '@/composables/useFenetreAuth.js'
import { chargerCategories } from '@/services/supabase/serviceFournisseurs.js'
import { inscrireFournisseur, corrigerMaDemande } from '@/services/supabase/serviceInscriptionFournisseur.js'
import { siretValide, rechercherSiret, formaterSiret, nettoyerSiret } from '@/services/entreprises.js'
import { erreurEmail } from '@/services/validation.js'

const { etat, fermerInscriptionFournisseur } = useInscriptionFournisseur()
const { rechargerRole } = useAuth()
const { ouvrirAuth } = useFenetreAuth()

const correction = computed(() => etat.correction)
const ETAPES = computed(() => (correction.value ? ['Entreprise', 'Contact'] : ['Entreprise', 'Contact', 'Compte']))
const etape = ref(0)
const derniere = computed(() => etape.value === ETAPES.value.length - 1)

const d = correction.value || {}
const f = ref({
  siret: d.siret ? formaterSiret(d.siret) : '', entreprise: d.entreprise || '', categorie_id: d.categorie_id || '', commune: d.commune || '', adresse: d.adresse || '',
  contact_nom: d.contact_nom || '', telephone: d.telephone || '', email: d.email || '', horaires: d.horaires || '', livraison: !!d.livraison, description: d.description || ''
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

// ---------- SIRET : contrôle puis registre public (remplit le nom et la commune) ----------
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
    // registre en majuscules (« MAMOUDZOU ») : écrit comme un nom de commune
    if (r?.commune && !f.value.commune.trim()) f.value.commune = r.commune.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a, l) => a + l.toUpperCase())
  } catch {
    registre.value = { etat: 'indisponible', donnees: null }
  }
}, { immediate: true })

// ---------- Étapes ----------
function verifier() {
  const e = {}
  const v = f.value
  if (etape.value === 0) {
    if (!siretValide(v.siret)) e.siret = 'Numéro SIRET invalide : 14 chiffres, sur votre extrait Kbis ou vos factures.'
    if (v.entreprise.trim().length < 2) e.entreprise = 'Indiquez le nom de l’entreprise.'
    if (!v.categorie_id) e.categorie_id = 'Choisissez ce que vous vendez.'
    if (v.commune.trim().length < 2) e.commune = 'Indiquez la commune.'
  } else if (etape.value === 1) {
    if (v.contact_nom.trim().length < 2) e.contact_nom = 'Indiquez votre nom.'
    if (!telephoneValide.value) e.telephone = 'Indiquez un numéro de téléphone valide.'
    const em = erreurEmail(v.email.trim())
    if (em) e.email = em
  } else {
    if (motDePasse.value.length < 8) e.motDePasse = '8 caractères minimum.'
    else if (confirmation.value !== motDePasse.value) e.confirmation = 'Les deux mots de passe sont différents.'
    if (!cgu.value) e.cgu = 'Acceptez les conditions pour créer votre compte.'
  }
  erreurs.value = e
  return !Object.keys(e).length
}
function suivant() {
  erreurGlobale.value = ''
  if (!verifier()) return focaliserErreur()
  if (!derniere.value) { etape.value++; nextTick(focaliser); return }
  envoyer()
}
function precedent() { erreurs.value = {}; if (etape.value) etape.value-- }

const fenetre = ref(null)
const focaliser = () => fenetre.value?.querySelector('.ifo-corps input, .ifo-corps select')?.focus()
const focaliserErreur = () => nextTick(() => fenetre.value?.querySelector('[aria-invalid="true"]')?.focus())

async function envoyer() {
  envoi.value = true
  try {
    if (correction.value) {
      await corrigerMaDemande(f.value)
      await rechargerRole()
      fermerInscriptionFournisseur()
      return
    }
    const { confirmationRequise } = await inscrireFournisseur(f.value, motDePasse.value)
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
    <section ref="fenetre" class="ifo" role="dialog" aria-modal="true" aria-labelledby="ifo-titre">
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
        <p class="ifo-note">En attendant la validation, votre espace affiche l’avancement de votre demande. BTM peut vous demander de corriger une information.</p>
        <div class="ifo-actions">
          <BoutonBase variante="secondaire" @click="fermer">Fermer</BoutonBase>
          <BoutonBase v-if="termine.confirmation" variante="primaire" bloc icone="fa-solid fa-right-to-bracket" @click="seConnecter">J’ai confirmé, me connecter</BoutonBase>
        </div>
      </div>

      <form v-else novalidate class="ifo-form" @submit.prevent="suivant">
        <header class="ifo-tete">
          <span class="ifo-icone" aria-hidden="true"><i :class="correction ? 'fa-solid fa-pen-to-square' : 'fa-solid fa-handshake'"></i></span>
          <div>
            <h2 id="ifo-titre" class="ifo-titre">{{ correction ? 'Corriger mes informations' : 'Devenir partenaire' }}</h2>
            <p class="ifo-intro">{{ correction ? 'Modifiez ce que BTM vous a demandé, puis renvoyez votre demande.' : 'Créez votre compte fournisseur : BTM vérifie vos informations avant d’ouvrir votre espace.' }}</p>
          </div>
        </header>
        <p v-if="correction?.message_admin" class="ifo-message"><i class="fa-solid fa-comment-dots" aria-hidden="true"></i> <span><strong>Demande de BTM :</strong> {{ correction.message_admin }}</span></p>

        <ol class="ifo-etapes" :aria-label="`Étape ${etape + 1} sur ${ETAPES.length}`">
          <li v-for="(e, i) in ETAPES" :key="e" :class="{ active: i === etape, faite: i < etape }">
            <span><i v-if="i < etape" class="fa-solid fa-check" aria-hidden="true"></i><template v-else>{{ i + 1 }}</template></span>{{ e }}
          </li>
        </ol>

        <div class="ifo-corps">
          <!-- 1. Entreprise -->
          <template v-if="etape === 0">
            <div class="champ">
              <label for="ifo-siret">Numéro SIRET</label>
              <input id="ifo-siret" v-model="f.siret" class="mono" inputmode="numeric" maxlength="17" autocomplete="off" placeholder="123 456 789 00012" :aria-invalid="!!erreurs.siret" @blur="f.siret = formaterSiret(f.siret)" />
              <p v-if="erreurs.siret" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.siret }}</p>
              <p v-else-if="registre.etat === 'recherche'" class="champ-aide"><span class="spinner" aria-hidden="true"></span> Recherche de l’entreprise…</p>
              <p v-else-if="registre.etat === 'inconnue'" class="champ-aide">Introuvable dans le registre public : vérifiez-le (BTM le contrôlera).</p>
              <p v-else-if="registre.etat !== 'trouvee'" class="champ-aide">14 chiffres, sur votre extrait Kbis ou vos factures.</p>
            </div>
            <div v-if="registre.etat === 'trouvee'" class="ifo-registre" :class="{ ferme: !registre.donnees.active }">
              <i :class="registre.donnees.active ? 'fa-solid fa-building-circle-check' : 'fa-solid fa-triangle-exclamation'" aria-hidden="true"></i>
              <span><strong>{{ registre.donnees.nom }}</strong><small>{{ registre.donnees.commune || 'Registre des entreprises' }} · {{ registre.donnees.active ? 'établissement actif' : 'établissement fermé' }}</small></span>
            </div>
            <div class="ifo-grille">
              <div class="champ plein"><label for="ifo-nom">Nom de l’entreprise</label><input id="ifo-nom" v-model="f.entreprise" maxlength="120" autocomplete="organization" placeholder="Nom affiché aux clients" :aria-invalid="!!erreurs.entreprise" /><p v-if="erreurs.entreprise" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.entreprise }}</p></div>
              <div class="champ">
                <label for="ifo-cat">Vous vendez</label>
                <select id="ifo-cat" v-model="f.categorie_id" :aria-invalid="!!erreurs.categorie_id">
                  <option value="" disabled>Choisir…</option>
                  <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.libelle }}</option>
                </select>
                <p v-if="erreurs.categorie_id" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.categorie_id }}</p>
              </div>
              <div class="champ"><label for="ifo-com">Commune</label><input id="ifo-com" v-model="f.commune" maxlength="60" autocomplete="address-level2" placeholder="Mamoudzou" :aria-invalid="!!erreurs.commune" /><p v-if="erreurs.commune" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.commune }}</p></div>
              <div class="champ plein"><label for="ifo-adr">Adresse <small class="texte-secondaire">(facultative)</small></label><input id="ifo-adr" v-model="f.adresse" maxlength="160" autocomplete="street-address" placeholder="Rue, quartier" /></div>
            </div>
          </template>

          <!-- 2. Contact -->
          <template v-else-if="etape === 1">
            <div class="ifo-grille">
              <div class="champ"><label for="ifo-contact">Votre nom</label><input id="ifo-contact" v-model="f.contact_nom" maxlength="120" autocomplete="name" placeholder="Prénom Nom" :aria-invalid="!!erreurs.contact_nom" /><p v-if="erreurs.contact_nom" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.contact_nom }}</p></div>
              <ChampTelephone id="ifo-tel" v-model="f.telephone" v-model:valide="telephoneValide" label="Téléphone de l’entreprise" pays-fixe="YT" requis :erreur="erreurs.telephone" />
              <div class="champ plein"><label for="ifo-mail">E-mail de l’entreprise</label><input id="ifo-mail" v-model="f.email" type="email" maxlength="254" autocomplete="email" placeholder="contact@entreprise.yt" :aria-invalid="!!erreurs.email" :disabled="!!correction" /><p v-if="erreurs.email" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.email }}</p><p v-else class="champ-aide">{{ correction ? 'Adresse de connexion du compte.' : 'Elle sert aussi à vous connecter à votre espace.' }}</p></div>
              <div class="champ plein"><label for="ifo-hor">Horaires <small class="texte-secondaire">(facultatifs)</small></label><input id="ifo-hor" v-model="f.horaires" maxlength="120" placeholder="Lun–Ven 7h–17h · Sam 7h–12h" /></div>
              <div class="champ plein"><label for="ifo-desc">Votre activité <small class="texte-secondaire">(facultatif)</small></label><textarea id="ifo-desc" v-model="f.description" rows="2" maxlength="400" placeholder="Ciment, parpaings, fer… ce que vous proposez aux clients"></textarea></div>
              <label class="ifo-case plein"><input v-model="f.livraison" type="checkbox" /> Vous livrez sur les chantiers</label>
            </div>
          </template>

          <!-- 3. Compte -->
          <template v-else>
            <p class="ifo-rappel"><i class="fa-solid fa-store" aria-hidden="true"></i> <span><strong>{{ f.entreprise }}</strong> · {{ f.email }}</span></p>
            <div class="champ"><label for="ifo-mdp">Mot de passe</label><SaisieMotDePasse id="ifo-mdp" v-model="motDePasse" autocomplete="new-password" placeholder="8 caractères minimum" :aria-invalid="!!erreurs.motDePasse" /><p v-if="erreurs.motDePasse" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.motDePasse }}</p></div>
            <div class="champ"><label for="ifo-conf">Confirmer le mot de passe</label><SaisieMotDePasse id="ifo-conf" v-model="confirmation" autocomplete="new-password" :aria-invalid="!!erreurs.confirmation" /><p v-if="erreurs.confirmation" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.confirmation }}</p></div>
            <div>
              <label class="ifo-case"><input v-model="cgu" type="checkbox" :aria-invalid="!!erreurs.cgu" /> J’accepte les <router-link to="/conditions" target="_blank" rel="noopener">conditions générales d’utilisation</router-link></label>
              <p v-if="erreurs.cgu" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.cgu }}</p>
            </div>
          </template>
        </div>

        <BandeauAvertissement v-if="erreurGlobale" type="erreur" compact>{{ erreurGlobale }}</BandeauAvertissement>
        <div class="ifo-actions">
          <BoutonBase v-if="etape > 0" type="button" variante="secondaire" icone="fa-solid fa-arrow-left" @click="precedent">Retour</BoutonBase>
          <BoutonBase type="submit" variante="primaire" bloc :chargement="envoi" :icone-droite="derniere ? '' : 'fa-solid fa-arrow-right'" :icone="derniere ? (correction ? 'fa-solid fa-paper-plane' : 'fa-solid fa-user-plus') : ''">
            {{ !derniere ? 'Continuer' : correction ? 'Renvoyer ma demande' : 'Créer mon compte fournisseur' }}
          </BoutonBase>
        </div>
        <p v-if="!correction" class="ifo-bascule">Déjà un compte ? <button type="button" @click="seConnecter">Se connecter</button></p>
      </form>
    </section>
  </div>
</template>

<style scoped>
/* même voile que la fenêtre de connexion ; carte claire qui suit le thème du site */
.ifo-voile {
  position: fixed; inset: 0; z-index: 260; display: grid; place-items: center; padding: 24px;
  background: rgba(6, 32, 44, .58); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); animation: ifo-fondu .2s ease;
}
@keyframes ifo-fondu { from { opacity: 0; } }
.ifo {
  position: relative; width: min(100%, 600px); max-height: calc(100dvh - 48px); overflow: hidden auto; overscroll-behavior: contain;
  padding: 30px 32px 24px; border-radius: 26px; background: var(--carte); color: var(--ardoise); box-shadow: var(--ombre-lg);
  animation: ifo-monter .3s cubic-bezier(.22, .61, .36, 1);
}
@keyframes ifo-monter { from { transform: translateY(18px); opacity: 0; } }
.ifo-fermer { position: absolute; top: 14px; right: 14px; display: grid; place-items: center; width: 38px; height: 38px; border: 0; border-radius: 50%; background: var(--gris-100); color: var(--ardoise); cursor: pointer; }
.ifo-tete { display: flex; align-items: flex-start; gap: 14px; padding-right: 36px; }
.ifo-icone { display: grid; place-items: center; flex: none; width: 48px; height: 48px; border-radius: 14px; background: linear-gradient(135deg, var(--lagon-400), #0e7490); color: #fff; font-size: 1.2rem; box-shadow: 0 10px 22px -10px rgba(6, 182, 212, .7); }
.ifo-titre { margin: 0; font-family: var(--font-display); font-size: 1.9rem; line-height: 1.1; color: var(--ardoise); }
.ifo-intro { margin: 4px 0 0; color: var(--texte-secondaire); font-size: .92rem; line-height: 1.45; }
.ifo-message { display: flex; gap: 10px; margin: 16px 0 0; padding: 12px 14px; border-radius: 14px; background: rgba(245, 158, 11, .12); color: var(--ardoise); font-size: .9rem; line-height: 1.5; }
.ifo-message i { margin-top: 3px; color: #d97706; }
.ifo-form { display: flex; flex-direction: column; gap: 18px; }
.ifo-etapes { display: flex; gap: 8px; margin: 2px 0 0; padding: 0; list-style: none; }
.ifo-etapes li { display: flex; flex: 1; align-items: center; gap: 8px; padding-top: 10px; border-top: 3px solid var(--gris-200); color: var(--gris-500); font-size: .82rem; font-weight: 600; }
.ifo-etapes li span { display: grid; place-items: center; flex: none; width: 24px; height: 24px; border-radius: 50%; background: var(--gris-100); font-size: .75rem; }
.ifo-etapes li.active { border-color: var(--lagon-600); color: var(--ardoise); }
.ifo-etapes li.active span { background: var(--lagon-600); color: #fff; }
.ifo-etapes li.faite { border-color: var(--lagon-400); color: var(--lagon-700); }
.ifo-corps { display: flex; flex-direction: column; gap: 14px; }
.ifo-grille { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; }
.ifo-grille > * { min-width: 0; }
.ifo-grille .plein { grid-column: 1 / -1; }
.ifo-corps input, .ifo-corps select, .ifo-corps textarea { width: 100%; font-family: var(--font-corps); }
.ifo-corps textarea { padding: 12px 16px; border: 1.5px solid var(--gris-300); border-radius: var(--rayon-sm); background: var(--carte); color: var(--texte); resize: vertical; }
.ifo-corps select { padding: 13px 16px; border: 1.5px solid var(--gris-300); border-radius: var(--rayon-sm); background: var(--carte); color: var(--texte); }
.ifo-corps small { font-weight: 400; }
.ifo-registre { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid rgba(16, 185, 129, .35); border-radius: 14px; background: rgba(16, 185, 129, .08); }
.ifo-registre i { color: #059669; font-size: 1.2rem; }
.ifo-registre.ferme { border-color: rgba(225, 29, 72, .35); background: rgba(225, 29, 72, .07); }
.ifo-registre.ferme i { color: #e11d48; }
.ifo-registre span { display: flex; flex-direction: column; }
.ifo-registre small { color: var(--texte-secondaire); font-size: .8rem; }
.ifo-case { display: flex; align-items: center; gap: 10px; color: var(--gris-700); font-size: .92rem; cursor: pointer; }
.ifo-case input { width: 18px; height: 18px; accent-color: var(--lagon-600); }
.ifo-case a { color: var(--lagon-700); font-weight: 600; text-decoration: underline; }
.ifo-rappel { display: flex; align-items: center; gap: 10px; margin: 0; padding: 12px 14px; border-radius: 14px; background: var(--gris-50); font-size: .9rem; }
.ifo-rappel i { color: var(--lagon-600); }
.ifo-actions { display: flex; gap: 12px; }
.ifo-actions :deep(.btn) { min-height: 50px; border-radius: 999px; }
.ifo-actions .btn-bloc { flex: 1; }
.ifo-bascule { margin: -4px 0 0; color: var(--texte-secondaire); font-size: .92rem; text-align: center; }
.ifo-bascule button { padding: 0; border: 0; background: none; color: var(--lagon-700); font: inherit; font-weight: 700; cursor: pointer; }
.ifo-fini { display: flex; flex-direction: column; gap: 14px; }
.ifo-fini p { margin: 0; color: var(--texte-secondaire); line-height: 1.6; }
.ifo-fini-icone { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 16px; background: rgba(16, 185, 129, .12); color: #059669; font-size: 1.6rem; }
.ifo-suite { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 14px 16px; border-radius: 16px; background: var(--gris-50); list-style: none; }
.ifo-suite li { display: flex; align-items: center; gap: 10px; color: var(--texte-secondaire); font-size: .92rem; }
.ifo-suite li i { width: 18px; color: var(--gris-400); text-align: center; }
.ifo-suite li.fait { color: var(--ardoise); font-weight: 600; }
.ifo-suite li.fait i { color: #059669; }
.ifo-note { font-size: .86rem; }

/* téléphone : feuille qui monte du bas, un champ par ligne */
@media (max-width: 639px) {
  .ifo-voile { place-items: end center; padding: 0; }
  .ifo { width: 100%; max-height: calc(100dvh - 12px); padding: 22px 18px calc(18px + env(safe-area-inset-bottom)); border-radius: 24px 24px 0 0; }
  .ifo-titre { font-size: 1.6rem; }
  .ifo-grille { grid-template-columns: 1fr; }
  .ifo-etapes li { flex-direction: column; align-items: flex-start; gap: 6px; }
}
</style>

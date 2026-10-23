<script setup>
/**
 * Fiche entreprise : coordonnées et présentation affichées dans l'annuaire et sur les devis PDF des clients.
 * « Modifier » transforme les lignes en champs, sur place (Annuler / Enregistrer en haut). Les horaires et la présentation
 * se changent chacun dans une fenêtre par-dessus la page (fond flouté) et s'enregistrent tout de suite.
 * Nom, catégorie et visibilité restent gérés par BTM (fonction modifier_ma_fiche, migration 0012).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAdmin } from '@/composables/useAdmin.js'
import { libelleCategorie, normaliserFournisseur } from '@/donnees/fournisseurs.js'
import * as api from '@/services/supabase/serviceEspaceFournisseur.js'
import { regrouperAvis } from '@/services/supabase/serviceAvisFournisseurs.js'
import { useEspaceFournisseur } from '@/composables/useEspaceFournisseur.js'
import CarteFournisseur from '@/composants/fournisseurs/CarteFournisseur.vue'
import ChampHoraires from '@/composants/fournisseur/ChampHoraires.vue'

const props = defineProps({ fiche: { type: Object, default: null } })
const emit = defineEmits(['maj'])
const { executer } = useAdmin()

const COMMUNES = ['Acoua', 'Bandraboua', 'Bandrélé', 'Bouéni', 'Chiconi', 'Chirongui', 'Dembéni', 'Dzaoudzi', 'Kani-Kéli', 'Koungou', 'Mamoudzou', 'Mtsamboro', 'M’Tsangamouji', 'Ouangani', 'Pamandzi', 'Sada', 'Tsingoni']
// horaires et description ont leur propre fenêtre : le brouillon ne les porte pas
const CHAMPS = ['telephone', 'email', 'adresse', 'commune', 'site_web', 'logo_url', 'livraison', 'livraison_payante', 'livraison_tarif']
const BOOLEENS = ['livraison', 'livraison_payante']
const LIMITES = { description: 600, horaires: 120, adresse: 200, livraison_tarif: 120 }

const depuisFiche = (f) => Object.fromEntries(CHAMPS.map((c) => [c, BOOLEENS.includes(c) ? !!f?.[c] : f?.[c] || '']))
const edition = ref(false)
const brouillon = ref(depuisFiche(props.fiche))
watch(() => props.fiche, (f) => { if (!edition.value) brouillon.value = depuisFiche(f) })

const erreur = computed(() => {
  const b = brouillon.value
  if (!b.telephone.trim()) return 'Le téléphone est obligatoire : c’est lui que les clients appellent.'
  if (!b.commune.trim()) return 'Indiquez la commune.'
  if (b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(b.email.trim())) return 'Adresse e-mail invalide.'
  if (b.site_web && !/^https?:\/\//.test(b.site_web.trim())) return 'Le site web doit commencer par https://'
  if (b.logo_url && !/^https:\/\//.test(b.logo_url.trim())) return 'Le logo doit être une adresse https://'
  const trop = Object.entries(LIMITES).find(([c, max]) => b[c]?.length > max)
  return trop ? `Texte trop long (${trop[1]} caractères maximum).` : ''
})
// Livraison : un seul choix (non proposée, gratuite, payante) pour les deux colonnes livraison et livraison_payante
const choixLivraison = computed({
  get: () => (!brouillon.value.livraison ? 'non' : brouillon.value.livraison_payante ? 'payante' : 'gratuite'),
  set: (v) => Object.assign(brouillon.value, { livraison: v !== 'non', livraison_payante: v === 'payante' })
})
// Aperçu : la carte telle que les clients la voient dans l'annuaire
const { mesAvis } = useEspaceFournisseur()
const apercu = computed(() => props.fiche && {
  ...normaliserFournisseur(props.fiche),
  // avis publiés, comme dans l'annuaire (les plus récents d'abord)
  avis: regrouperAvis(mesAvis.value.filter((a) => a.statut === 'publie' && a.visible)
    .map((a) => ({ ...a, publie_le: a.repondu_le })).sort((x, y) => new Date(y.publie_le) - new Date(x.publie_le)))[props.fiche.id] || null
})
const tentative = ref(false)
const enregistrement = ref(false)
const champTelephone = ref(null)

async function modifier() {
  brouillon.value = depuisFiche(props.fiche); tentative.value = false; edition.value = true
  await nextTick()
  champTelephone.value?.focus()
}
function annuler() { if (!enregistrement.value) edition.value = false }
async function enregistrer() {
  tentative.value = true
  if (erreur.value) return
  enregistrement.value = true
  // horaires et présentation : ceux déjà enregistrés depuis leur fenêtre
  const ok = await executer(async () => { emit('maj', await api.modifierMaFiche({ ...props.fiche, ...brouillon.value })) }, 'Fiche mise à jour.')
  enregistrement.value = false
  if (ok !== false) annuler()
}

// ---------- Fenêtres par-dessus la page : présentation, horaires ----------
// Une seule à la fois : { champ, texte, envoi }
const fenetre = ref(null)
const champPresentation = ref(null)
async function ouvrir(champ) {
  fenetre.value = { champ, texte: props.fiche?.[champ] || '', envoi: false }
  await nextTick()
  if (champ === 'description') champPresentation.value?.focus()
}
function fermer() { if (!fenetre.value?.envoi) fenetre.value = null }
async function enregistrerFenetre() {
  const f = fenetre.value
  if (f.texte.length > LIMITES[f.champ]) return
  f.envoi = true
  const succes = f.champ === 'horaires' ? 'Horaires mis à jour.' : 'Présentation mise à jour.'
  const ok = await executer(async () => { emit('maj', await api.modifierMaFiche({ ...props.fiche, [f.champ]: f.texte.trim() })) }, succes)
  f.envoi = false
  if (ok) fermer()
}

// Échap ferme la fenêtre ouverte, sinon annule la modification en cours
const surEchap = (e) => { if (e.key !== 'Escape') return; if (fenetre.value) fermer(); else if (edition.value) annuler() }
onMounted(() => document.addEventListener('keydown', surEchap))
onBeforeUnmount(() => document.removeEventListener('keydown', surEchap))

// Une ligne par information, « Non renseigné » si vide ; `champ` : ligne qui devient un champ en modification
const groupes = computed(() => {
  const f = props.fiche || {}
  return [
    { titre: 'Entreprise', lignes: [
      { label: 'Nom', valeur: f.nom, verrou: true },
      { label: 'Catégorie', valeur: libelleCategorie(f.categorie_id), verrou: true },
      // même nombre de lignes dans les deux modes (la page ne défile pas) : l'état dans l'annuaire en lecture, le logo en modification
      edition.value
        ? { label: 'Logo', champ: 'logo_url' }
        : { label: 'Annuaire', valeur: f.actif ? 'Visible' : 'Masquée par BTM', etat: f.actif ? 'ok' : 'attention' }
    ] },
    { titre: 'Contact', lignes: [
      { label: 'Téléphone', valeur: f.telephone, champ: 'telephone' },
      { label: 'E-mail', valeur: f.email, champ: 'email' },
      { label: 'Site web', valeur: f.site_web, champ: 'site_web' }
    ] },
    { titre: 'Adresse', lignes: [
      { label: 'Commune', valeur: f.commune, champ: 'commune' },
      { label: 'Adresse', valeur: f.adresse, champ: 'adresse' },
      { label: 'Horaires', valeur: f.horaires, fenetre: 'horaires' },
      { label: 'Livraison', valeur: !f.livraison ? 'Non' : !f.livraison_payante ? 'Gratuite' : `Payante${f.livraison_tarif ? ` · ${f.livraison_tarif}` : ''}`, champ: 'livraison' }
    ] }
  ]
})
// Champs texte en modification : type, autocomplétion, exemple
const SAISIES = {
  telephone: { type: 'tel', autocomplete: 'tel', placeholder: '0269 00 00 00' },
  email: { type: 'email', autocomplete: 'email', placeholder: 'contact@entreprise.yt' },
  site_web: { type: 'url', placeholder: 'https://' },
  commune: { list: 'mf-communes', autocomplete: 'off' },
  adresse: { autocomplete: 'street-address', placeholder: 'Zone industrielle, rue…' },
  logo_url: { type: 'url', placeholder: 'https://…/logo.png' }
}
</script>

<template>
  <div class="cp-vue">
    <form novalidate @submit.prevent="enregistrer">
      <header class="cp-tete">
        <!-- l'erreur remplace le sous-titre : pas de ligne en plus, la page ne défile pas -->
        <div>
          <h2>Fiche entreprise</h2>
          <p v-if="edition && tentative && erreur" class="adm-erreur-texte" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ erreur }}</p>
          <p v-else>{{ edition ? 'Le nom et la catégorie sont gérés par BTM.' : 'Ce que les clients voient dans l’annuaire et sur leur devis.' }}</p>
        </div>
        <div v-if="edition" class="cp-tete-boutons">
          <button type="button" class="adm-btn adm-btn-clair adm-btn-sm" :disabled="enregistrement" @click="annuler">Annuler</button>
          <button type="submit" class="adm-btn adm-btn-noir adm-btn-sm" :disabled="enregistrement"><span v-if="enregistrement" class="spinner" aria-hidden="true"></span> Enregistrer</button>
        </div>
        <button v-else type="button" class="adm-btn adm-btn-clair adm-btn-sm" @click="modifier"><i class="fa-solid fa-pen" aria-hidden="true"></i> Modifier</button>
      </header>
  
  
      <div class="cp-colonnes cp-fiche" :class="{ 'cp-fiche-edition': edition }">
        <div class="cp-colonne">
          <section v-for="g in groupes" :key="g.titre" class="cp-groupe">
            <h3>{{ g.titre }}</h3>
            <dl class="cp-lignes">
              <div v-for="l in g.lignes" :key="l.label">
                <dt><label v-if="edition && l.champ && l.champ !== 'livraison'" :for="`mf-${l.champ}`">{{ l.label }}{{ ['telephone', 'commune'].includes(l.champ) ? ' *' : '' }}</label><template v-else>{{ l.label }}</template></dt>
  
                <!-- Livraison : choix + tarif si payante -->
                <dd v-if="edition && l.champ === 'livraison'" class="cp-dd-champs">
                  <select v-model="choixLivraison" class="adm-saisie" aria-label="Livraison sur chantier">
                    <option value="non">Non proposée</option>
                    <option value="gratuite">Gratuite</option>
                    <option value="payante">Payante</option>
                  </select>
                  <input v-if="choixLivraison === 'payante'" v-model="brouillon.livraison_tarif" class="adm-saisie" maxlength="120" aria-label="Tarif de livraison" placeholder="30 € sur Mamoudzou…" />
                </dd>
                <dd v-else-if="edition && l.champ">
                  <input
                    :id="`mf-${l.champ}`" :ref="l.champ === 'telephone' ? (el) => (champTelephone = el) : undefined"
                    v-model="brouillon[l.champ]" class="adm-saisie" v-bind="SAISIES[l.champ]"
                  />
                </dd>
                <dd v-else :class="[l.etat, { vide: !l.valeur }]">
                  <span>{{ l.valeur || 'Non renseigné' }}</span>
                  <i v-if="l.verrou" class="fa-solid fa-lock cp-verrou" title="Géré par BTM : contactez-nous pour le changer" aria-label="Géré par BTM"></i>
                  <button v-if="l.fenetre" type="button" class="cp-lien-action" @click="ouvrir(l.fenetre)">{{ l.valeur ? 'Modifier' : 'Ajouter' }}</button>
                </dd>
              </div>
            </dl>
          </section>
          <datalist id="mf-communes"><option v-for="c in COMMUNES" :key="c" :value="c" /></datalist>
        </div>
  
        <div class="cp-colonne">
          <!-- Aperçu : la carte telle qu'elle apparaît sur le site public. La présentation s'y lit (début du texte)
               et s'écrit depuis le lien du titre, dans une fenêtre par-dessus la page. -->
          <section v-if="apercu" class="cp-groupe">
            <div class="cp-groupe-tete">
              <h3>Aperçu dans l’annuaire</h3>
              <button type="button" class="cp-lien-action" @click="ouvrir('description')">
                <i class="fa-solid fa-pen" aria-hidden="true"></i> {{ fiche?.description ? 'Modifier la présentation' : 'Écrire la présentation' }}
              </button>
            </div>
            <div class="cp-apercu-page">
              <div class="cp-apercu-barre" aria-hidden="true">
                <span class="cp-apercu-points"><i></i><i></i><i></i></span>
                <span class="cp-apercu-adresse"><i class="fa-solid fa-lock"></i> btm.yt/fournisseurs</span>
              </div>
              <div class="cp-apercu-corps">
                <ul class="cp-apercu"><CarteFournisseur :fournisseur="apercu" deplie /></ul>
              </div>
            </div>
          </section>
        </div>
      </div>
    </form>
  
    <!-- Fenêtre par-dessus la page (fond flouté) : présentation ou horaires -->
    <div v-if="fenetre" class="cp-fenetre-fond" @click.self="fermer">
      <form
        class="cp-fenetre" :class="{ 'cp-fenetre-horaires': fenetre.champ === 'horaires' }" role="dialog" aria-modal="true"
        aria-labelledby="mf-fenetre-titre" novalidate @submit.prevent="enregistrerFenetre"
      >
        <header class="cp-fenetre-tete">
          <div v-if="fenetre.champ === 'horaires'">
            <h2 id="mf-fenetre-titre">Horaires d’ouverture</h2>
            <p>Affichés sur votre fiche dans l’annuaire.</p>
          </div>
          <div v-else>
            <h2 id="mf-fenetre-titre">Présentation de l’entreprise</h2>
            <p>Lue par les clients quand ils ouvrent votre fiche dans l’annuaire.</p>
          </div>
          <button type="button" class="adm-icone-btn adm-icone-btn-bord" aria-label="Fermer" :disabled="fenetre.envoi" @click="fermer"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </header>
  
        <div v-if="fenetre.champ === 'horaires'" class="cp-fenetre-corps">
          <ChampHoraires v-model="fenetre.texte" :max="LIMITES.horaires" />
        </div>
        <template v-else>
          <textarea
            ref="champPresentation" v-model="fenetre.texte" class="cp-fenetre-texte" rows="9" aria-label="Présentation de l’entreprise"
            placeholder="Carrelage, faïence et sanitaires des grandes marques. Showroom à Kawéni, conseils de pose, découpe sur place…"
          ></textarea>
          <div class="cp-fenetre-aide">
            <span>Parlez de vos produits, de vos marques et de vos services (pose, découpe, livraison…).</span>
            <span :class="{ trop: fenetre.texte.length > LIMITES.description }">{{ fenetre.texte.length }} / {{ LIMITES.description }}</span>
          </div>
        </template>
  
        <footer class="cp-fenetre-pied">
          <button type="button" class="adm-btn adm-btn-clair" :disabled="fenetre.envoi" @click="fermer">Annuler</button>
          <button type="submit" class="adm-btn adm-btn-noir" :disabled="fenetre.envoi || fenetre.texte.length > LIMITES[fenetre.champ]">
            <span v-if="fenetre.envoi" class="spinner" aria-hidden="true"></span> Enregistrer
          </button>
        </footer>
      </form>
    </div>
  </div>
</template>

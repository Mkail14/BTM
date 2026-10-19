<script setup>
/** Fournisseurs (annuaire public) et catégories de l'annuaire */
import { computed, onMounted, ref } from 'vue'
import { useAdmin, initiales, correspond } from '@/composables/useAdmin.js'
import AdminPanneau from './AdminPanneau.vue'
import PanneauAccesFournisseur from './PanneauAccesFournisseur.vue'
import AdminCarreaux from './AdminCarreaux.vue'
import { listerTousCarreaux } from '@/services/supabase/serviceCarreaux.js'

const { api, donnees, erreurs, charger, recherche, confirmer, executer, notifier } = useAdmin()
onMounted(() => charger(['fournisseurs', 'categories', 'profils'], { force: true }))

// ---------- Accès fournisseur : statut du compte (invité / actif), lu dans Auth par la fonction admin ----------
const accesListe = ref(null)     // null = en cours de chargement
const accesErreur = ref('')
async function chargerAcces() {
  try { accesListe.value = await api.listerAccesFournisseurs(); accesErreur.value = '' } catch (e) { accesListe.value = []; accesErreur.value = e?.message || 'Statut des accès indisponible.' }
}
onMounted(chargerAcces)
const accesDe = computed(() => Object.fromEntries((accesListe.value || []).map((a) => [a.fournisseur_id, a])))
const panneauAcces = ref(null) // fournisseur dont on gère l'accès
function apresAcces() { chargerAcces(); charger(['profils'], { force: true }) }

const onglet = ref('fournisseurs')
const filtreCategorie = ref('')
const filtreStatut = ref('tous')

const categorie = computed(() => Object.fromEntries((donnees.categories || []).map((c) => [c.id, c])))
const parCategorie = computed(() => {
  const n = {}
  for (const f of donnees.fournisseurs || []) n[f.categorie_id] = (n[f.categorie_id] || 0) + 1
  return n
})
const liste = computed(() => (donnees.fournisseurs || []).filter((f) =>
  (!filtreCategorie.value || f.categorie_id === filtreCategorie.value)
  && (filtreStatut.value === 'tous' || (filtreStatut.value === 'actifs') === f.actif)
  && correspond(recherche.value, f.nom, f.commune, f.description, categorie.value[f.categorie_id]?.libelle)))
const nbActifs = computed(() => (donnees.fournisseurs || []).filter((f) => f.actif).length)

const nbAccesActifs = computed(() => (accesListe.value || []).filter((a) => a.statut === 'actif').length)
// Carreaux mis en ligne par chaque fournisseur (migration 0029) : comptés sur sa fiche, gérés dans son panneau.
// Avant la migration, la liste est simplement vide.
const carreaux = ref([])
async function chargerCarreaux() { try { carreaux.value = await listerTousCarreaux() } catch { carreaux.value = [] } }
onMounted(chargerCarreaux)
const carreauxDe = computed(() => {
  const g = {}
  for (const c of carreaux.value) (g[c.fournisseur_id] ||= []).push(c)
  return g
})

const telLien = (t) => `tel:${(t || '').replace(/[^\d+]/g, '')}`

// Couleur d'avatar stable par fournisseur (lisible en thème clair comme sombre)
function teinte(nom) {
  let h = 0
  for (const c of (nom || '?').toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360
  return `hsl(${h} 42% 45%)`
}

async function basculerActif(f) {
  await executer(async () => { await api.definirFournisseurActif(f.id, !f.actif); f.actif = !f.actif }, f.actif ? `${f.nom} masqué de l’annuaire.` : `${f.nom} visible dans l’annuaire.`)
}

// ---------- Formulaire fournisseur ----------
const vide = () => ({ id: null, nom: '', categorie_id: filtreCategorie.value || donnees.categories?.[0]?.id || '', commune: '', adresse: '', telephone: '', email: '', site_web: '', description: '', horaires: '', logo_url: '', livraison: false, actif: true, demonstration: false })
const formulaire = ref(null)
const formErreur = ref('')
const enregistrement = ref(false)
const ouvrir = (f) => { formErreur.value = ''; formulaire.value = f ? { ...vide(), ...f } : vide() }

async function enregistrer() {
  const f = formulaire.value
  if (!f.nom.trim() || !f.commune.trim() || !f.telephone.trim() || !f.categorie_id) { formErreur.value = 'Nom, catégorie, commune et téléphone sont obligatoires.'; return }
  if (f.site_web && !/^https?:\/\//.test(f.site_web.trim())) { formErreur.value = 'Le site web doit commencer par https://'; return }
  enregistrement.value = true
  formErreur.value = ''
  try {
    const maj = await api.enregistrerFournisseur(f)
    donnees.fournisseurs = f.id
      ? donnees.fournisseurs.map((x) => (x.id === maj.id ? maj : x))
      : [...donnees.fournisseurs, maj].sort((a, b) => a.nom.localeCompare(b.nom))
    formulaire.value = null
    notifier(f.id ? 'Fournisseur mis à jour.' : 'Fournisseur ajouté à l’annuaire.')
  } catch (e) {
    formErreur.value = e?.message || 'Enregistrement impossible.'
  } finally {
    enregistrement.value = false
  }
}

async function supprimer(f) {
  if (!(await confirmer({ titre: `Supprimer ${f.nom} ?`, texte: 'Le fournisseur disparaît de l’annuaire. Les projets qui l’avaient choisi le perdent. Pour le cacher temporairement, désactivez-le plutôt.', libelle: 'Supprimer', danger: true }))) return
  await executer(async () => { await api.supprimerFournisseur(f.id); donnees.fournisseurs = donnees.fournisseurs.filter((x) => x.id !== f.id) }, 'Fournisseur supprimé.')
}

// ---------- Catégories ----------
const ICONES = ['fa-solid fa-cubes', 'fa-solid fa-warehouse', 'fa-solid fa-bars', 'fa-solid fa-border-all', 'fa-solid fa-trowel-bricks', 'fa-solid fa-paint-roller', 'fa-solid fa-faucet-drip', 'fa-solid fa-bolt', 'fa-solid fa-hammer', 'fa-solid fa-truck-ramp-box', 'fa-solid fa-tree', 'fa-solid fa-screwdriver-wrench']
const categorieForm = ref(null)
const categorieErreur = ref('')
const ouvrirCategorie = (c) => {
  categorieErreur.value = ''
  categorieForm.value = c ? { ...c, creation: false } : { id: '', libelle: '', icone: ICONES[0], ordre: (donnees.categories?.length || 0) + 1, creation: true }
}
async function enregistrerCategorie() {
  const c = categorieForm.value
  if (!c.libelle.trim()) { categorieErreur.value = 'Le libellé est obligatoire.'; return }
  enregistrement.value = true
  try {
    const maj = await api.enregistrerCategorie(c, c.creation)
    donnees.categories = (c.creation ? [...donnees.categories, maj] : donnees.categories.map((x) => (x.id === maj.id ? maj : x))).sort((a, b) => a.ordre - b.ordre)
    categorieForm.value = null
    notifier(c.creation ? 'Catégorie créée.' : 'Catégorie mise à jour.')
  } catch (e) {
    categorieErreur.value = e?.message || 'Enregistrement impossible.'
  } finally {
    enregistrement.value = false
  }
}
async function supprimerCategorie(c) {
  if (parCategorie.value[c.id]) { notifier(`« ${c.libelle} » contient encore ${parCategorie.value[c.id]} fournisseur(s) : déplacez-les d’abord.`, 'erreur'); return }
  if (!(await confirmer({ titre: `Supprimer « ${c.libelle} » ?`, texte: 'La catégorie disparaît des filtres de l’annuaire.', libelle: 'Supprimer', danger: true }))) return
  await executer(async () => { await api.supprimerCategorie(c.id); donnees.categories = donnees.categories.filter((x) => x.id !== c.id) }, 'Catégorie supprimée.')
}
</script>

<template>
  <div class="four">
    <p v-if="erreurs.fournisseurs || erreurs.categories" class="adm-alerte" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.fournisseurs || erreurs.categories }}</p>

    <div class="adm-section-tete">
      <div class="adm-segments" role="tablist" aria-label="Annuaire">
        <button type="button" role="tab" :aria-selected="onglet === 'fournisseurs'" @click="onglet = 'fournisseurs'">Fournisseurs <small>{{ donnees.fournisseurs?.length ?? '' }}</small></button>
        <button type="button" role="tab" :aria-selected="onglet === 'categories'" @click="onglet = 'categories'">Catégories <small>{{ donnees.categories?.length ?? '' }}</small></button>
      </div>
      <button v-if="onglet === 'fournisseurs'" type="button" class="adm-btn adm-btn-noir" @click="ouvrir()"><i class="fa-solid fa-plus" aria-hidden="true"></i> Ajouter un fournisseur</button>
      <button v-else type="button" class="adm-btn adm-btn-noir" @click="ouvrirCategorie()"><i class="fa-solid fa-plus" aria-hidden="true"></i> Nouvelle catégorie</button>
    </div>

    <!-- ===================== Fournisseurs ===================== -->
    <template v-if="onglet === 'fournisseurs'">
      <!-- Chiffres clés -->
      <div class="four-stats">
        <div class="adm-carte four-stat"><span class="four-stat-icone"><i class="fa-solid fa-truck" aria-hidden="true"></i></span><span><strong>{{ donnees.fournisseurs?.length ?? '—' }}</strong><small>Fournisseurs</small></span></div>
        <div class="adm-carte four-stat"><span class="four-stat-icone ok"><i class="fa-solid fa-eye" aria-hidden="true"></i></span><span><strong>{{ donnees.fournisseurs ? nbActifs : '—' }}</strong><small>Visibles dans l’annuaire</small></span></div>
        <div class="adm-carte four-stat"><span class="four-stat-icone attention"><i class="fa-solid fa-eye-slash" aria-hidden="true"></i></span><span><strong>{{ donnees.fournisseurs ? donnees.fournisseurs.length - nbActifs : '—' }}</strong><small>Masqués</small></span></div>
        <div class="adm-carte four-stat"><span class="four-stat-icone info"><i class="fa-solid fa-user-check" aria-hidden="true"></i></span><span><strong>{{ accesListe === null ? '—' : nbAccesActifs }}</strong><small>Espaces fournisseur actifs</small></span></div>
      </div>

      <!-- Filtres -->
      <div class="four-filtres">
        <div class="adm-pilules four-cats" role="group" aria-label="Catégorie">
          <button type="button" class="adm-pilule" :class="{ actif: !filtreCategorie }" :aria-pressed="!filtreCategorie" @click="filtreCategorie = ''">Toutes <small>{{ donnees.fournisseurs?.length || 0 }}</small></button>
          <button v-for="c in donnees.categories || []" :key="c.id" type="button" class="adm-pilule" :class="{ actif: filtreCategorie === c.id }" :aria-pressed="filtreCategorie === c.id" @click="filtreCategorie = c.id">
            <i :class="c.icone || 'fa-solid fa-tag'" aria-hidden="true"></i> {{ c.libelle }} <small>{{ parCategorie[c.id] || 0 }}</small>
          </button>
        </div>
        <div class="adm-segments four-statut" role="group" aria-label="Visibilité">
          <button type="button" :aria-pressed="filtreStatut === 'tous'" @click="filtreStatut = 'tous'">Tous</button>
          <button type="button" :aria-pressed="filtreStatut === 'actifs'" @click="filtreStatut = 'actifs'">Visibles</button>
          <button type="button" :aria-pressed="filtreStatut === 'inactifs'" @click="filtreStatut = 'inactifs'">Masqués</button>
        </div>
      </div>

      <!-- Fiches -->
      <div v-if="!donnees.fournisseurs" class="adm-carte adm-chargement"><span class="spinner spinner-grand"></span></div>
      <div v-else-if="!liste.length" class="adm-carte adm-vide"><i class="fa-solid fa-truck"></i><p>{{ recherche || filtreCategorie || filtreStatut !== 'tous' ? 'Aucun fournisseur ne correspond à ces filtres.' : 'L’annuaire est vide.' }}</p></div>
      <ul v-else class="fiches">
        <li v-for="f in liste" :key="f.id" class="fiche adm-carte" :class="{ masque: !f.actif }">
          <div class="fiche-tete">
            <span class="fiche-logo" :class="{ image: f.logo_url }" :style="f.logo_url ? null : { background: teinte(f.nom) }">
              <img v-if="f.logo_url" :src="f.logo_url" alt="" />
              <template v-else>{{ initiales(f.nom) }}</template>
            </span>
            <button type="button" class="fiche-nom" :title="`Modifier ${f.nom}`" @click="ouvrir(f)">
              <strong>{{ f.nom }}</strong>
              <small><i class="fa-solid fa-location-dot" aria-hidden="true"></i> {{ f.commune }}</small>
            </button>
            <button type="button" role="switch" class="adm-interrupteur" :aria-checked="f.actif" :aria-label="`Afficher ${f.nom} dans l’annuaire`" :title="f.actif ? 'Visible dans l’annuaire' : 'Masqué de l’annuaire'" @click="basculerActif(f)"></button>
          </div>

          <div class="fiche-etiquettes">
            <span class="fiche-etiquette"><i :class="categorie[f.categorie_id]?.icone || 'fa-solid fa-tag'" aria-hidden="true"></i> {{ categorie[f.categorie_id]?.libelle || f.categorie_id }}</span>
            <span v-if="f.livraison" class="fiche-etiquette"><i class="fa-solid fa-truck-fast" aria-hidden="true"></i> Livraison</span>
            <button v-if="carreauxDe[f.id]?.length" type="button" class="fiche-etiquette fiche-etiquette-lien" :title="`Voir les carreaux de ${f.nom}`" @click="ouvrir(f)"><i class="fa-solid fa-table-cells" aria-hidden="true"></i> {{ carreauxDe[f.id].length }} modèle{{ carreauxDe[f.id].length > 1 ? 's' : '' }} de carreaux</button>
            <span v-if="f.demonstration" class="adm-badge adm-badge-attention sans-point" title="Pas encore partenaire : prix fictifs, signalés sur le site">Démonstration</span>
            <span v-if="!f.actif" class="adm-badge adm-badge-attention sans-point">Masqué</span>
          </div>

          <ul class="fiche-contact">
            <li><i class="fa-solid fa-phone" aria-hidden="true"></i><a :href="telLien(f.telephone)" class="adm-mono">{{ f.telephone }}</a></li>
            <li v-if="f.email"><i class="fa-regular fa-envelope" aria-hidden="true"></i><a :href="`mailto:${f.email}`">{{ f.email }}</a></li>
            <li v-if="f.horaires"><i class="fa-regular fa-clock" aria-hidden="true"></i><span>{{ f.horaires }}</span></li>
          </ul>

          <div class="fiche-pied">
            <span v-if="accesListe === null" class="adm-squelette acces-squelette" aria-label="Chargement"></span>
            <button v-else-if="accesDe[f.id]" type="button" class="acces-statut" :title="`Gérer l’accès de ${f.nom}`" @click="panneauAcces = f">
              <span class="adm-badge" :class="accesDe[f.id].statut === 'actif' ? 'adm-badge-ok' : 'adm-badge-attention'">{{ accesDe[f.id].statut === 'actif' ? 'Espace actif' : 'Invitation envoyée' }}</span>
              <small>{{ accesDe[f.id].email }}</small>
            </button>
            <button v-else type="button" class="adm-btn adm-btn-clair adm-btn-sm" @click="panneauAcces = f"><i class="fa-regular fa-envelope" aria-hidden="true"></i> Inviter</button>
            <span class="fiche-actions">
              <button type="button" class="adm-icone-btn" :aria-label="`Modifier ${f.nom}`" title="Modifier" @click="ouvrir(f)"><i class="fa-solid fa-pen"></i></button>
              <button type="button" class="adm-icone-btn danger" :aria-label="`Supprimer ${f.nom}`" title="Supprimer" @click="supprimer(f)"><i class="fa-solid fa-trash-can"></i></button>
            </span>
          </div>
        </li>
      </ul>
    </template>

    <!-- ===================== Catégories ===================== -->
    <ul v-else class="cats">
      <li v-for="c in donnees.categories || []" :key="c.id" class="adm-carte cat">
        <span class="cat-icone"><i :class="c.icone || 'fa-solid fa-tag'" aria-hidden="true"></i></span>
        <span class="cat-texte"><strong>{{ c.libelle }}</strong><small>{{ parCategorie[c.id] || 0 }} fournisseur{{ (parCategorie[c.id] || 0) > 1 ? 's' : '' }} · position {{ c.ordre }}</small></span>
        <span class="cat-actions">
          <button type="button" class="adm-icone-btn" :aria-label="`Modifier ${c.libelle}`" @click="ouvrirCategorie(c)"><i class="fa-solid fa-pen"></i></button>
          <button type="button" class="adm-icone-btn danger" :aria-label="`Supprimer ${c.libelle}`" @click="supprimerCategorie(c)"><i class="fa-solid fa-trash-can"></i></button>
        </span>
      </li>
    </ul>

    <!-- Panneau fournisseur -->
    <AdminPanneau v-if="formulaire" :titre="formulaire.id ? 'Modifier le fournisseur' : 'Nouveau fournisseur'" :sous-titre="formulaire.id ? formulaire.nom : 'Il apparaîtra dans l’annuaire public.'" @fermer="formulaire = null">
      <form id="form-fournisseur" class="adm-grille-form" novalidate @submit.prevent="enregistrer">
        <div class="adm-champ plein"><label for="f-nom">Nom *</label><input id="f-nom" v-model="formulaire.nom" maxlength="80" required /></div>
        <div class="adm-champ"><label for="f-cat">Catégorie *</label>
          <select id="f-cat" v-model="formulaire.categorie_id"><option v-for="c in donnees.categories" :key="c.id" :value="c.id">{{ c.libelle }}</option></select></div>
        <div class="adm-champ"><label for="f-commune">Commune *</label><input id="f-commune" v-model="formulaire.commune" maxlength="60" required /></div>
        <div class="adm-champ"><label for="f-tel">Téléphone *</label><input id="f-tel" v-model="formulaire.telephone" type="tel" placeholder="0269 00 00 00" required /></div>
        <div class="adm-champ"><label for="f-mail">E-mail</label><input id="f-mail" v-model="formulaire.email" type="email" /></div>
        <div class="adm-champ plein"><label for="f-adr">Adresse</label><input id="f-adr" v-model="formulaire.adresse" maxlength="160" /></div>
        <div class="adm-champ"><label for="f-web">Site web</label><input id="f-web" v-model="formulaire.site_web" type="url" placeholder="https://" /></div>
        <div class="adm-champ"><label for="f-hor">Horaires</label><input id="f-hor" v-model="formulaire.horaires" placeholder="Lun–Ven 7h–16h" /></div>
        <div class="adm-champ plein"><label for="f-logo">Logo (URL d’image)</label><input id="f-logo" v-model="formulaire.logo_url" type="url" placeholder="https://…/logo.png" /></div>
        <div class="adm-champ plein">
          <label for="f-desc">Description</label>
          <textarea id="f-desc" v-model="formulaire.description" rows="4" maxlength="400"></textarea>
          <span class="adm-champ-aide"><span>Utilisée aussi pour la recherche de l’annuaire.</span><span>{{ formulaire.description?.length || 0 }} / 400</span></span>
        </div>
        <div class="plein four-options">
          <label class="four-option"><button type="button" role="switch" class="adm-interrupteur" :aria-checked="formulaire.livraison" @click="formulaire.livraison = !formulaire.livraison"></button> Livraison possible</label>
          <label class="four-option"><button type="button" role="switch" class="adm-interrupteur" :aria-checked="formulaire.actif" @click="formulaire.actif = !formulaire.actif"></button> Visible dans l’annuaire</label>
          <label class="four-option" title="À décocher dès que l’entreprise a donné son accord et ses vrais prix"><button type="button" role="switch" class="adm-interrupteur" :aria-checked="formulaire.demonstration" @click="formulaire.demonstration = !formulaire.demonstration"></button> Démonstration (pas encore partenaire, prix fictifs)</label>
        </div>
      </form>
      <p v-if="formErreur" class="adm-erreur-texte" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ formErreur }}</p>
      <!-- ce que le fournisseur vend en ligne : ses modèles de carreaux (il les gère depuis son espace) -->
      <AdminCarreaux v-if="formulaire.id && carreauxDe[formulaire.id]?.length" :carreaux="carreauxDe[formulaire.id]" @maj="chargerCarreaux" />
      <template #pied>
        <button type="button" class="adm-btn adm-btn-clair" @click="formulaire = null">Annuler</button>
        <button type="submit" form="form-fournisseur" class="adm-btn adm-btn-noir" :disabled="enregistrement">
          <span v-if="enregistrement" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-check" aria-hidden="true"></i> Enregistrer
        </button>
      </template>
    </AdminPanneau>

    <!-- Accès fournisseur : invitation, suivi, relance, retrait -->
    <PanneauAccesFournisseur v-if="panneauAcces" :fournisseur="panneauAcces" :acces="accesDe[panneauAcces.id] || null" @maj="apresAcces" @fermer="panneauAcces = null" />

    <!-- Panneau catégorie -->
    <AdminPanneau v-if="categorieForm" :titre="categorieForm.creation ? 'Nouvelle catégorie' : 'Modifier la catégorie'" @fermer="categorieForm = null">
      <form id="form-categorie" class="adm-grille-form" novalidate @submit.prevent="enregistrerCategorie">
        <div class="adm-champ plein"><label for="c-lib">Libellé *</label><input id="c-lib" v-model="categorieForm.libelle" maxlength="40" required /></div>
        <div class="adm-champ"><label for="c-ordre">Position dans les filtres</label><input id="c-ordre" v-model.number="categorieForm.ordre" type="number" min="0" step="1" /></div>
        <div class="adm-champ"><span class="adm-champ-label">Identifiant</span><span class="adm-mono cat-id">{{ categorieForm.creation ? 'créé depuis le libellé' : categorieForm.id }}</span></div>
        <fieldset class="adm-champ plein cat-icones">
          <legend class="adm-champ-label">Icône</legend>
          <div>
            <button v-for="i in ICONES" :key="i" type="button" class="cat-icone-choix" :class="{ actif: categorieForm.icone === i }" :aria-pressed="categorieForm.icone === i" :aria-label="i.replace('fa-solid fa-', '')" @click="categorieForm.icone = i"><i :class="i" aria-hidden="true"></i></button>
          </div>
        </fieldset>
      </form>
      <p v-if="categorieErreur" class="adm-erreur-texte" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ categorieErreur }}</p>
      <template #pied>
        <button type="button" class="adm-btn adm-btn-clair" @click="categorieForm = null">Annuler</button>
        <button type="submit" form="form-categorie" class="adm-btn adm-btn-noir" :disabled="enregistrement">
          <span v-if="enregistrement" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-check" aria-hidden="true"></i> Enregistrer
        </button>
      </template>
    </AdminPanneau>
  </div>
</template>

<style scoped>
.four { display: flex; flex-direction: column; gap: 16px; }
.four .adm-section-tete { margin: 0; }
.adm-segments small { margin-left: 4px; opacity: .6; font-weight: 500; }
/* Chiffres clés */
.four-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.four-stat { display: flex; align-items: center; gap: 14px; padding: 16px 18px; }
.four-stat > span:last-child { display: flex; flex-direction: column; min-width: 0; }
.four-stat strong { font-size: 1.5rem; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; }
.four-stat small { overflow: hidden; color: var(--adm-muet); font-size: .8rem; text-overflow: ellipsis; white-space: nowrap; }
.four-stat-icone { width: 42px; height: 42px; flex: none; display: grid; place-items: center; border-radius: 13px; background: var(--adm-ligne-2); color: var(--adm-encre-2); }
.four-stat-icone.ok { background: var(--adm-ok-fond); color: var(--adm-ok-texte); }
.four-stat-icone.attention { background: var(--adm-attention-fond); color: var(--adm-attention-texte); }
.four-stat-icone.info { background: var(--adm-accent-doux); color: var(--adm-info-texte); }

/* Filtres : catégories sur une ligne qui glisse, visibilité à droite */
.four-filtres { display: flex; align-items: center; gap: 12px; }
.four-cats { flex: 1; min-width: 0; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; padding: 2px; }
.four-cats::-webkit-scrollbar { display: none; }
.four-cats .adm-pilule { flex: none; white-space: nowrap; }
.four-cats .adm-pilule i { font-size: .8rem; opacity: .75; }
.four-statut { flex: none; }
.four-statut button[aria-pressed="true"] { background: var(--adm-noir); color: #fff; }

/* Fiches fournisseur */
.fiches { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; margin: 0; padding: 0; list-style: none; }
.fiche { display: flex; flex-direction: column; gap: 14px; padding: 18px; transition: box-shadow var(--transition), transform var(--transition); }
.fiche:hover { box-shadow: 0 0 0 1px var(--adm-ligne-forte), var(--adm-ombre); }
.fiche.masque { background: var(--adm-survol); }
.fiche.masque .fiche-logo, .fiche.masque .fiche-nom { opacity: .55; }
.fiche-tete { display: flex; align-items: center; gap: 12px; }
.fiche-logo {
  width: 48px; height: 48px; flex: none; display: grid; place-items: center; overflow: hidden; border-radius: 14px;
  color: #fff; font-size: .9rem; font-weight: 700; letter-spacing: .02em;
}
.fiche-logo.image { background: #fff; box-shadow: inset 0 0 0 1px var(--adm-ligne); }
.fiche-logo img { width: 100%; height: 100%; padding: 4px; object-fit: contain; }
.fiche-nom { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.fiche-nom strong { overflow: hidden; font-size: 1rem; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.fiche-nom:hover strong { color: var(--adm-accent); }
.fiche-nom small { color: var(--adm-muet); font-size: .8rem; }
.fiche-nom small i { margin-right: 3px; font-size: .72rem; }
.fiche-etiquettes { display: flex; flex-wrap: wrap; gap: 6px; }
.fiche-etiquette { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; background: var(--adm-ligne-2); color: var(--adm-encre-2); font-size: .76rem; font-weight: 600; }
.fiche-etiquette i { font-size: .72rem; color: var(--adm-muet); }
.fiche-etiquette-lien { border: 0; font-family: inherit; cursor: pointer; }
.fiche-etiquette-lien:hover { color: var(--adm-encre); }
.fiche-contact { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; font-size: .86rem; }
.fiche-contact li { display: flex; align-items: center; gap: 10px; min-width: 0; color: var(--adm-encre-2); }
.fiche-contact i { width: 16px; flex: none; color: var(--adm-muet); font-size: .8rem; text-align: center; }
.fiche-contact a, .fiche-contact span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fiche-contact a { color: inherit; text-decoration: none; }
.fiche-contact a:hover { color: var(--adm-accent); text-decoration: underline; }
.fiche-pied { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: auto; padding-top: 12px; border-top: 1px solid var(--adm-ligne-2); }
.fiche-actions { display: flex; flex: none; }

/* Ordinateur et tablette : page fixe (« ecran-fixe » dans AdminVue) — chiffres et filtres en place, seules les fiches défilent */
@media (min-width: 768px) and (min-height: 640px) {
  .four > :not(.fiches):not(.cats) { flex: none; }
  .fiches, .cats { flex: 1; min-height: 0; grid-auto-rows: max-content; align-content: start; margin: -4px -8px 0; padding: 4px 8px 8px; overflow-y: auto; scrollbar-width: thin; }
}
/* Jusqu'à 1279 px : chiffres compacts sur une ligne, fiches plus étroites (3 colonnes à 1024 px) */
@media (min-width: 768px) and (max-width: 1279px) {
  .four { gap: 12px; }
  .four-stats { gap: 10px; }
  .four-stat { gap: 10px; padding: 12px 14px; }
  .four-stat-icone { width: 36px; height: 36px; border-radius: 11px; font-size: .88rem; }
  .four-stat strong { font-size: 1.25rem; }
  .four-stat small { font-size: .74rem; }
  .fiches { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
  .fiche { gap: 12px; padding: 16px; }
}
@media (max-width: 767px) { .four-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 760px) {
  .four-filtres { flex-direction: column; align-items: stretch; }
  .four-statut { align-self: flex-start; }
  .fiches { grid-template-columns: 1fr; }
}
@media (max-width: 480px) {
  .four-stats { gap: 8px; }
  .four-stat { gap: 10px; padding: 12px; }
  .four-stat-icone { width: 36px; height: 36px; border-radius: 11px; font-size: .85rem; }
  .four-stat strong { font-size: 1.25rem; }
  .fiche { padding: 16px; }
}

.acces-statut { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 0; max-width: 230px; padding: 4px 6px; margin: -4px -6px; border: 0; border-radius: 10px; background: none; font: inherit; text-align: left; cursor: pointer; transition: background var(--transition); }
.acces-statut:hover { background: var(--adm-ligne-2); }
.acces-statut small { max-width: 100%; color: var(--adm-muet); font-size: .78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acces-squelette { display: block; width: 120px; height: 22px; }
.four-options { display: flex; flex-wrap: wrap; gap: 12px 28px; padding: 14px 16px; border-radius: 14px; background: var(--adm-ligne-2); }
.four-option { display: flex; align-items: center; gap: 10px; font-size: .9rem; font-weight: 600; cursor: pointer; }

.cats { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; margin: 0; padding: 0; list-style: none; }
.cat { display: flex; align-items: center; gap: 14px; padding: 16px 12px 16px 16px; }
.cat-icone { width: 46px; height: 46px; flex: none; display: grid; place-items: center; border-radius: 14px; background: var(--adm-accent-doux); color: var(--adm-info-texte); }
.cat-texte { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.cat-texte strong { font-weight: 600; }
.cat-texte small { color: var(--adm-muet); font-size: .8rem; }
.cat-actions { display: flex; }
.cat-id { padding: 12px 0; color: var(--adm-encre-2); }
.cat-icones { border: 0; margin: 0; padding: 0; }
.cat-icones legend { margin-bottom: 8px; }
.cat-icones > div { display: flex; flex-wrap: wrap; gap: 8px; }
.cat-icone-choix { width: 46px; height: 46px; display: grid; place-items: center; border: 1px solid var(--adm-ligne); border-radius: 12px; background: var(--adm-carte); color: var(--adm-encre-2); cursor: pointer; transition: all var(--transition); }
.cat-icone-choix:hover { border-color: var(--adm-encre); color: var(--adm-encre); }
.cat-icone-choix.actif { background: var(--adm-noir); border-color: var(--adm-noir); color: #fff; }
</style>

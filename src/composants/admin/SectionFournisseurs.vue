<script setup>
/** Fournisseurs (annuaire public) et catégories de l'annuaire */
import { computed, onMounted, ref } from 'vue'
import { useAdmin, initiales, correspond } from '@/composables/useAdmin.js'
import AdminPanneau from './AdminPanneau.vue'
import PanneauAccesFournisseur from './PanneauAccesFournisseur.vue'

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

// Couleur d'avatar stable par catégorie (neutre : l'identité est portée par le libellé)
const teintes = ['#eef2ff', '#ecfeff', '#fef3c7', '#fce7f3', '#ecfdf5', '#f1f5f9']
const teinte = (id) => teintes[Math.max(0, (donnees.categories || []).findIndex((c) => c.id === id)) % teintes.length]

async function basculerActif(f) {
  await executer(async () => { await api.definirFournisseurActif(f.id, !f.actif); f.actif = !f.actif }, f.actif ? `${f.nom} masqué de l’annuaire.` : `${f.nom} visible dans l’annuaire.`)
}

// ---------- Formulaire fournisseur ----------
const vide = () => ({ id: null, nom: '', categorie_id: filtreCategorie.value || donnees.categories?.[0]?.id || '', commune: '', adresse: '', telephone: '', email: '', site_web: '', description: '', horaires: '', logo_url: '', livraison: false, actif: true })
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
      <div class="four-filtres">
        <div class="adm-pilules" role="group" aria-label="Catégorie">
          <button type="button" class="adm-pilule" :class="{ actif: !filtreCategorie }" :aria-pressed="!filtreCategorie" @click="filtreCategorie = ''">Toutes</button>
          <button v-for="c in donnees.categories || []" :key="c.id" type="button" class="adm-pilule" :class="{ actif: filtreCategorie === c.id }" :aria-pressed="filtreCategorie === c.id" @click="filtreCategorie = c.id">
            {{ c.libelle }} <small>{{ parCategorie[c.id] || 0 }}</small>
          </button>
        </div>
        <div class="adm-pilules" role="group" aria-label="Statut">
          <button type="button" class="adm-pilule" :class="{ actif: filtreStatut === 'tous' }" @click="filtreStatut = 'tous'">Tous</button>
          <button type="button" class="adm-pilule" :class="{ actif: filtreStatut === 'actifs' }" @click="filtreStatut = 'actifs'">Visibles <small>{{ nbActifs }}</small></button>
          <button type="button" class="adm-pilule" :class="{ actif: filtreStatut === 'inactifs' }" @click="filtreStatut = 'inactifs'">Masqués <small>{{ (donnees.fournisseurs?.length || 0) - nbActifs }}</small></button>
        </div>
      </div>

      <section class="adm-carte">
        <div v-if="!donnees.fournisseurs" class="adm-chargement"><span class="spinner spinner-grand"></span></div>
        <div v-else class="adm-table-cadre">
          <table class="adm-table adm-table-empile">
            <thead><tr><th>Fournisseur</th><th>Catégorie</th><th>Téléphone</th><th>Accès fournisseur</th><th>Visible</th><th><span class="visually-hidden">Actions</span></th></tr></thead>
            <tbody>
              <tr v-for="f in liste" :key="f.id" :class="{ estompe: !f.actif }">
                <td class="principal">
                  <span class="adm-identite">
                    <span class="adm-avatar" :style="{ background: teinte(f.categorie_id), color: '#0f172a' }">
                      <img v-if="f.logo_url" :src="f.logo_url" alt="" class="four-logo" />
                      <template v-else>{{ initiales(f.nom) }}</template>
                    </span>
                    <span><strong>{{ f.nom }}</strong><small><i class="fa-solid fa-location-dot" aria-hidden="true"></i> {{ f.commune }}</small></span>
                  </span>
                </td>
                <td data-label="Catégorie"><span class="adm-badge sans-point"><i :class="categorie[f.categorie_id]?.icone" aria-hidden="true"></i> {{ categorie[f.categorie_id]?.libelle || f.categorie_id }}</span></td>
                <td data-label="Téléphone" class="adm-mono">{{ f.telephone }}</td>
                <td data-label="Accès">
                  <span v-if="accesListe === null" class="adm-squelette acces-squelette" aria-label="Chargement"></span>
                  <button v-else-if="accesDe[f.id]" type="button" class="acces-statut" :title="`Gérer l’accès de ${f.nom}`" @click="panneauAcces = f">
                    <span class="adm-badge" :class="accesDe[f.id].statut === 'actif' ? 'adm-badge-ok' : 'adm-badge-attention'">{{ accesDe[f.id].statut === 'actif' ? 'Actif' : 'Invitation envoyée' }}</span>
                    <small>{{ accesDe[f.id].email }}</small>
                  </button>
                  <button v-else type="button" class="adm-btn adm-btn-clair adm-btn-sm" @click="panneauAcces = f"><i class="fa-regular fa-envelope" aria-hidden="true"></i> Inviter</button>
                </td>
                <td data-label="Visible">
                  <button type="button" role="switch" class="adm-interrupteur" :aria-checked="f.actif" :aria-label="`Afficher ${f.nom} dans l’annuaire`" @click="basculerActif(f)"></button>
                </td>
                <td class="actions">
                  <button type="button" class="adm-icone-btn" :aria-label="`Modifier ${f.nom}`" title="Modifier" @click="ouvrir(f)"><i class="fa-solid fa-pen"></i></button>
                  <button type="button" class="adm-icone-btn danger" :aria-label="`Supprimer ${f.nom}`" title="Supprimer" @click="supprimer(f)"><i class="fa-solid fa-trash-can"></i></button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="!liste.length" class="adm-vide"><i class="fa-solid fa-truck"></i><p>{{ recherche || filtreCategorie || filtreStatut !== 'tous' ? 'Aucun fournisseur ne correspond à ces filtres.' : 'L’annuaire est vide.' }}</p></div>
        </div>
      </section>
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
        </div>
      </form>
      <p v-if="formErreur" class="adm-erreur-texte" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ formErreur }}</p>
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
.four-filtres { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; }
.four-logo { width: 100%; height: 100%; object-fit: contain; border-radius: inherit; background: #fff; }
.four-non { color: var(--adm-muet); font-size: .86rem; }
.acces-statut { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 4px; max-width: 230px; padding: 4px 6px; margin: -4px -6px; border: 0; border-radius: 10px; background: none; font: inherit; text-align: left; cursor: pointer; transition: background var(--transition); }
.acces-statut:hover { background: var(--adm-ligne-2); }
.acces-statut small { max-width: 100%; color: var(--adm-muet); font-size: .78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acces-squelette { display: block; width: 120px; height: 22px; }
.four-options { display: flex; flex-wrap: wrap; gap: 12px 28px; padding: 14px 16px; border-radius: 14px; background: var(--adm-ligne-2); }
.four-option { display: flex; align-items: center; gap: 10px; font-size: .9rem; font-weight: 600; cursor: pointer; }

.cats { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; margin: 0; padding: 0; list-style: none; }
.cat { display: flex; align-items: center; gap: 14px; padding: 16px 12px 16px 16px; }
.cat-icone { width: 46px; height: 46px; flex: none; display: grid; place-items: center; border-radius: 14px; background: var(--adm-noir); color: #fff; }
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

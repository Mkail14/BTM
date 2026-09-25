<script setup>
/**
 * Espace administrateur : chiffres clés, utilisateurs, projets, modération des avis, gestion des fournisseurs.
 * L'accès est contrôlé par la base (RLS + est_admin()) : un non-admin ne reçoit aucune donnée.
 */
import { ref, computed, onMounted } from 'vue'
import * as api from '@/services/supabase/serviceAdmin.js'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import ChampTelephone from '@/composants/commun/ChampTelephone.vue'
import { useAuth } from '@/composables/useAuth.js'

const { utilisateur: moi } = useAuth()

const onglets = [
  { id: 'apercu', label: 'Aperçu', icone: 'fa-solid fa-gauge-high' },
  { id: 'utilisateurs', label: 'Utilisateurs', icone: 'fa-solid fa-users' },
  { id: 'projets', label: 'Projets', icone: 'fa-solid fa-folder-open' },
  { id: 'avis', label: 'Avis', icone: 'fa-solid fa-star' },
  { id: 'fournisseurs', label: 'Fournisseurs', icone: 'fa-solid fa-truck' }
]
const onglet = ref('apercu')
const chargement = ref(false)
const erreur = ref('')
const message = ref('')

const stats = ref(null)
const profils = ref([])
const projets = ref([])
const avis = ref([])
const fournisseurs = ref([])
const categories = ref([])
const recherche = ref('')

const formatDate = (d) => new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d))
const nomProfil = computed(() => Object.fromEntries(profils.value.map((p) => [p.id, p.nom_affiche || p.email])))
const libelleCategorie = computed(() => Object.fromEntries(categories.value.map((c) => [c.id, c.libelle])))
const contient = (...valeurs) => !recherche.value.trim() || valeurs.join(' ').toLowerCase().includes(recherche.value.trim().toLowerCase())

const profilsFiltres = computed(() => profils.value.filter((p) => contient(p.email, p.nom_affiche, p.role)))
const projetsFiltres = computed(() => projets.value.filter((p) => contient(p.nom, p.type_projet_id, nomProfil.value[p.utilisateur_id])))
const avisFiltres = computed(() => avis.value.filter((a) => contient(a.nom, a.ville, a.commentaire)))
const fournisseursFiltres = computed(() => fournisseurs.value.filter((f) => contient(f.nom, f.commune, libelleCategorie.value[f.categorie_id])))

async function charger() {
  chargement.value = true
  erreur.value = ''
  try {
    const [s, p, pr, a, f, c] = await Promise.all([
      api.statistiques(), api.listerProfils(), api.listerProjets(), api.listerAvis(), api.listerFournisseurs(), api.listerCategories()
    ])
    stats.value = s; profils.value = p; projets.value = pr; avis.value = a; fournisseurs.value = f; categories.value = c
  } catch (e) {
    console.warn(e)
    erreur.value = e?.message || 'Impossible de charger les données.'
  } finally {
    chargement.value = false
  }
}
onMounted(charger)

function info(texte) { message.value = texte; setTimeout(() => { if (message.value === texte) message.value = '' }, 3500) }

// ---------- Suppressions (avec confirmation) ----------
const aSupprimer = ref(null) // { type, id, libelle }
const suppressionEnCours = ref(false)
const actions = { avis: api.supprimerAvis, projet: api.supprimerProjet, fournisseur: api.supprimerFournisseur }

async function confirmerSuppression() {
  const cible = aSupprimer.value
  suppressionEnCours.value = true
  try {
    await actions[cible.type](cible.id)
    aSupprimer.value = null
    info('Supprimé.')
    await charger()
  } catch (e) {
    erreur.value = e?.message || 'Suppression impossible.'
    aSupprimer.value = null
  } finally {
    suppressionEnCours.value = false
  }
}

async function basculerActif(f) {
  try { await api.definirFournisseurActif(f.id, !f.actif); f.actif = !f.actif; info(f.actif ? 'Fournisseur activé.' : 'Fournisseur désactivé.'); stats.value = await api.statistiques() }
  catch (e) { erreur.value = e?.message || 'Modification impossible.' }
}

// ---------- Utilisateurs : modification et réinitialisation du mot de passe ----------
const edition = ref(null) // données de l'utilisateur en cours de modification
const editionChargement = ref(false)
const editionErreur = ref('')
const editionEnCours = ref(false)
const telephoneValide = ref(true)
const reinit = ref(null) // { id, email }
const reinitEnCours = ref(false)

async function ouvrirEdition(p) {
  editionErreur.value = ''
  edition.value = { id: p.id, email: p.email, chargement: true }
  editionChargement.value = true
  try {
    edition.value = { ...(await api.lireUtilisateur(p.id)), chargement: false }
  } catch (e) {
    editionErreur.value = e?.message || 'Impossible de charger l’utilisateur.'
    edition.value = { id: p.id, email: p.email, pseudo: '', prenom: '', nom: '', telephone: '', civilite: '', role: p.role, type_profil: p.type_profil, chargement: false }
  } finally {
    editionChargement.value = false
  }
}

async function enregistrerEdition() {
  const u = edition.value
  editionErreur.value = ''
  if (!telephoneValide.value) { editionErreur.value = 'Numéro de téléphone incomplet ou invalide.'; return }
  if (!u.email?.trim()) { editionErreur.value = 'L’adresse e-mail est obligatoire.'; return }
  editionEnCours.value = true
  try {
    const { id, chargement: _c, derniereConnexion: _d, ...champs } = u
    await api.modifierUtilisateur(id, champs)
    edition.value = null
    info('Utilisateur mis à jour.')
    await charger()
  } catch (e) {
    editionErreur.value = e?.message || 'Enregistrement impossible.'
  } finally {
    editionEnCours.value = false
  }
}

async function confirmerReinit() {
  reinitEnCours.value = true
  try {
    const r = await api.reinitialiserMotDePasse(reinit.value.id)
    info(r.message || 'E-mail envoyé.')
  } catch (e) {
    erreur.value = e?.message || 'Envoi impossible.'
  } finally {
    reinitEnCours.value = false
    reinit.value = null
  }
}

// ---------- Formulaire fournisseur ----------
const vide = () => ({ id: null, nom: '', categorie_id: categories.value[0]?.id || '', commune: '', adresse: '', telephone: '', email: '', site_web: '', description: '', horaires: '', livraison: false })
const formulaire = ref(null)
const formErreur = ref('')
const enregistrement = ref(false)

const ouvrirFormulaire = (f) => { formErreur.value = ''; formulaire.value = f ? { ...vide(), ...f } : vide() }
async function enregistrerFournisseur() {
  const f = formulaire.value
  if (!f.nom.trim() || !f.commune.trim() || !f.telephone.trim() || !f.categorie_id) { formErreur.value = 'Nom, catégorie, commune et téléphone sont obligatoires.'; return }
  enregistrement.value = true
  formErreur.value = ''
  try {
    await api.enregistrerFournisseur(f)
    formulaire.value = null
    info('Fournisseur enregistré.')
    await charger()
  } catch (e) {
    formErreur.value = e?.message || 'Enregistrement impossible.'
  } finally {
    enregistrement.value = false
  }
}
</script>

<template>
  <div id="page-admin" class="page">
    <div class="conteneur adm">
      <header class="adm-entete">
        <div>
          <span class="section-surtitre">Espace administrateur</span>
          <h1 class="page-titre">Administration</h1>
        </div>
        <BoutonBase variante="secondaire" icone="fa-solid fa-rotate" :chargement="chargement" @click="charger">Actualiser</BoutonBase>
      </header>

      <nav class="adm-onglets" role="tablist" aria-label="Sections d’administration">
        <button v-for="o in onglets" :key="o.id" type="button" role="tab" :aria-selected="onglet === o.id" :class="{ actif: onglet === o.id }" @click="onglet = o.id; recherche = ''">
          <i :class="o.icone" aria-hidden="true"></i> {{ o.label }}
        </button>
      </nav>

      <p v-if="erreur" class="adm-alerte adm-erreur" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ erreur }}</p>
      <transition name="glisser"><p v-if="message" class="adm-alerte adm-ok" role="status"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> {{ message }}</p></transition>

      <div v-if="chargement && !stats" class="adm-chargement"><span class="spinner spinner-grand"></span></div>

      <!-- Aperçu -->
      <section v-else-if="onglet === 'apercu' && stats" class="adm-apercu">
        <ul class="adm-kpis">
          <li class="carte"><i class="fa-solid fa-users"></i><strong>{{ stats.utilisateurs }}</strong><span>Comptes</span></li>
          <li class="carte"><i class="fa-solid fa-folder-open"></i><strong>{{ stats.projets }}</strong><span>Projets enregistrés</span></li>
          <li class="carte"><i class="fa-solid fa-coins"></i><strong>{{ formaterEuros(stats.budgetCumule) }}</strong><span>Budget cumulé</span></li>
          <li class="carte"><i class="fa-solid fa-star"></i><strong>{{ stats.noteMoyenne.toFixed(1).replace('.', ',') }}<small>/5</small></strong><span>{{ stats.avis }} avis</span></li>
          <li class="carte"><i class="fa-solid fa-truck"></i><strong>{{ stats.fournisseurs }}</strong><span>Fournisseurs actifs</span></li>
        </ul>
        <div class="adm-deux">
          <article class="carte adm-bloc">
            <h2>Derniers inscrits</h2>
            <ul class="adm-liste">
              <li v-for="p in profils.slice(0, 5)" :key="p.id"><span><strong>{{ p.nom_affiche || '—' }}</strong><small>{{ p.email }}</small></span><time>{{ formatDate(p.cree_le) }}</time></li>
              <li v-if="!profils.length" class="adm-vide">Aucun compte.</li>
            </ul>
          </article>
          <article class="carte adm-bloc">
            <h2>Derniers projets</h2>
            <ul class="adm-liste">
              <li v-for="p in projets.slice(0, 5)" :key="p.id"><span><strong>{{ p.nom }}</strong><small>{{ p.type_projet_id }} · {{ nomProfil[p.utilisateur_id] || 'compte supprimé' }}</small></span><b class="prix">{{ formaterEuros(p.cout_total) }}</b></li>
              <li v-if="!projets.length" class="adm-vide">Aucun projet.</li>
            </ul>
          </article>
        </div>
      </section>

      <!-- Sections avec liste -->
      <section v-else-if="stats" class="adm-section">
        <div class="adm-outils">
          <label class="adm-recherche"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input v-model="recherche" type="search" placeholder="Rechercher…" aria-label="Rechercher" /></label>
          <BoutonBase v-if="onglet === 'fournisseurs'" icone="fa-solid fa-plus" @click="ouvrirFormulaire()">Ajouter un fournisseur</BoutonBase>
        </div>

        <!-- Utilisateurs -->
        <div v-if="onglet === 'utilisateurs'" class="adm-tableau carte">
          <table>
            <thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Inscrit le</th><th></th></tr></thead>
            <tbody>
              <tr v-for="p in profilsFiltres" :key="p.id">
                <td data-label="Nom">{{ p.nom_affiche || '—' }}</td>
                <td data-label="E-mail">{{ p.email }}</td>
                <td data-label="Rôle"><span class="adm-badge" :class="`adm-badge-${p.role}`">{{ p.role }}</span></td>
                <td data-label="Inscrit le">{{ formatDate(p.cree_le) }}</td>
                <td class="adm-actions">
                  <button type="button" class="adm-icone" :aria-label="`Modifier ${p.email}`" title="Modifier les informations" @click="ouvrirEdition(p)"><i class="fa-solid fa-user-pen"></i></button>
                  <button type="button" class="adm-icone" :aria-label="`Envoyer un e-mail de réinitialisation à ${p.email}`" title="Envoyer un e-mail de réinitialisation du mot de passe" @click="reinit = { id: p.id, email: p.email }"><i class="fa-solid fa-key"></i></button>
                </td>
              </tr>
              <tr v-if="!profilsFiltres.length"><td colspan="5" class="adm-vide">Aucun résultat.</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Projets -->
        <div v-else-if="onglet === 'projets'" class="adm-tableau carte">
          <table>
            <thead><tr><th>Projet</th><th>Type</th><th>Propriétaire</th><th>Budget</th><th>Créé le</th><th></th></tr></thead>
            <tbody>
              <tr v-for="p in projetsFiltres" :key="p.id">
                <td data-label="Projet"><strong>{{ p.nom }}</strong></td>
                <td data-label="Type">{{ p.type_projet_id }}</td>
                <td data-label="Propriétaire">{{ nomProfil[p.utilisateur_id] || '—' }}</td>
                <td data-label="Budget" class="prix">{{ formaterEuros(p.cout_total) }}</td>
                <td data-label="Créé le">{{ formatDate(p.cree_le) }}</td>
                <td class="adm-actions"><button type="button" class="adm-icone adm-danger" :aria-label="`Supprimer ${p.nom}`" @click="aSupprimer = { type: 'projet', id: p.id, libelle: p.nom }"><i class="fa-solid fa-trash-can"></i></button></td>
              </tr>
              <tr v-if="!projetsFiltres.length"><td colspan="6" class="adm-vide">Aucun projet.</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Avis -->
        <ul v-else-if="onglet === 'avis'" class="adm-avis">
          <li v-for="a in avisFiltres" :key="a.id" class="carte">
            <div class="adm-avis-tete">
              <span class="adm-note" :aria-label="`${a.note} sur 5`"><i v-for="n in 5" :key="n" class="fa-solid fa-star" :class="{ eteinte: n > a.note }"></i></span>
              <span class="adm-badge" :class="a.demo ? 'adm-badge-demo' : 'adm-badge-user'">{{ a.demo ? 'démo' : 'client' }}</span>
              <time>{{ formatDate(a.cree_le) }}</time>
            </div>
            <p v-if="a.commentaire" class="adm-avis-texte">{{ a.commentaire }}</p>
            <div class="adm-avis-pied">
              <span><strong>{{ a.nom }}</strong> · {{ a.ville }}</span>
              <button type="button" class="adm-icone adm-danger" :aria-label="`Supprimer l’avis de ${a.nom}`" @click="aSupprimer = { type: 'avis', id: a.id, libelle: `l’avis de ${a.nom}` }"><i class="fa-solid fa-trash-can"></i></button>
            </div>
          </li>
          <li v-if="!avisFiltres.length" class="adm-vide">Aucun avis.</li>
        </ul>

        <!-- Fournisseurs -->
        <div v-else-if="onglet === 'fournisseurs'" class="adm-tableau carte">
          <table>
            <thead><tr><th>Fournisseur</th><th>Catégorie</th><th>Commune</th><th>Téléphone</th><th>Statut</th><th></th></tr></thead>
            <tbody>
              <tr v-for="f in fournisseursFiltres" :key="f.id" :class="{ 'adm-inactif': !f.actif }">
                <td data-label="Fournisseur"><strong>{{ f.nom }}</strong></td>
                <td data-label="Catégorie">{{ libelleCategorie[f.categorie_id] || f.categorie_id }}</td>
                <td data-label="Commune">{{ f.commune }}</td>
                <td data-label="Téléphone">{{ f.telephone }}</td>
                <td data-label="Statut"><button type="button" class="adm-interrupteur" :class="{ actif: f.actif }" role="switch" :aria-checked="f.actif" :aria-label="`${f.actif ? 'Désactiver' : 'Activer'} ${f.nom}`" @click="basculerActif(f)"><span></span></button></td>
                <td class="adm-actions">
                  <button type="button" class="adm-icone" :aria-label="`Modifier ${f.nom}`" @click="ouvrirFormulaire(f)"><i class="fa-solid fa-pen"></i></button>
                  <button type="button" class="adm-icone adm-danger" :aria-label="`Supprimer ${f.nom}`" @click="aSupprimer = { type: 'fournisseur', id: f.id, libelle: f.nom }"><i class="fa-solid fa-trash-can"></i></button>
                </td>
              </tr>
              <tr v-if="!fournisseursFiltres.length"><td colspan="6" class="adm-vide">Aucun fournisseur.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Confirmation de suppression -->
      <transition name="fondu">
        <div v-if="aSupprimer" class="modale-fond" @click.self="aSupprimer = null">
          <div class="modale" role="alertdialog" aria-modal="true" aria-labelledby="adm-suppr">
            <h2 id="adm-suppr">Supprimer {{ aSupprimer.libelle }} ?</h2>
            <p class="texte-secondaire">Cette action est définitive.</p>
            <div class="modale-actions">
              <BoutonBase variante="ghost" @click="aSupprimer = null">Annuler</BoutonBase>
              <BoutonBase variante="danger" :chargement="suppressionEnCours" @click="confirmerSuppression">Supprimer</BoutonBase>
            </div>
          </div>
        </div>
      </transition>

      <!-- Réinitialisation du mot de passe -->
      <transition name="fondu">
        <div v-if="reinit" class="modale-fond" @click.self="reinit = null">
          <div class="modale" role="alertdialog" aria-modal="true" aria-labelledby="adm-reinit">
            <h2 id="adm-reinit">Réinitialiser le mot de passe ?</h2>
            <p class="texte-secondaire">Un e-mail contenant un lien pour choisir un nouveau mot de passe sera envoyé à <strong>{{ reinit.email }}</strong>.</p>
            <div class="modale-actions">
              <BoutonBase variante="ghost" @click="reinit = null">Annuler</BoutonBase>
              <BoutonBase :chargement="reinitEnCours" icone="fa-solid fa-paper-plane" @click="confirmerReinit">Envoyer l’e-mail</BoutonBase>
            </div>
          </div>
        </div>
      </transition>

      <!-- Modification d'un utilisateur -->
      <transition name="fondu">
        <div v-if="edition" class="modale-fond" @click.self="edition = null">
          <form class="modale adm-form" role="dialog" aria-modal="true" aria-labelledby="adm-user-titre" novalidate @submit.prevent="enregistrerEdition">
            <h2 id="adm-user-titre">Modifier l’utilisateur</h2>
            <div v-if="edition.chargement" class="adm-chargement"><span class="spinner spinner-grand"></span></div>
            <template v-else>
              <div class="adm-form-grille">
                <div class="champ"><label for="u-prenom">Prénom</label><input id="u-prenom" v-model="edition.prenom" type="text" maxlength="60" autocomplete="off" /></div>
                <div class="champ"><label for="u-nom">Nom</label><input id="u-nom" v-model="edition.nom" type="text" maxlength="60" autocomplete="off" /></div>
                <div class="champ"><label for="u-pseudo">Pseudo</label><input id="u-pseudo" v-model="edition.pseudo" type="text" maxlength="30" autocomplete="off" /></div>
                <div class="champ"><label for="u-mail">Adresse e-mail</label><input id="u-mail" v-model="edition.email" type="email" autocomplete="off" required /></div>
                <ChampTelephone id="u-tel" v-model="edition.telephone" v-model:valide="telephoneValide" class="adm-plein" />
                <div class="champ"><label for="u-type">Type de profil</label>
                  <select id="u-type" v-model="edition.type_profil"><option value="particulier">Particulier</option><option value="professionnel">Professionnel</option><option value="fournisseur">Fournisseur</option></select></div>
                <div class="champ"><label for="u-role">Rôle</label>
                  <select id="u-role" v-model="edition.role" :disabled="edition.id === moi?.id"><option value="user">Utilisateur</option><option value="fournisseur">Fournisseur</option><option value="admin">Administrateur</option></select>
                  <small v-if="edition.id === moi?.id" class="champ-aide">Vous ne pouvez pas modifier votre propre rôle.</small></div>
              </div>
              <p v-if="edition.derniereConnexion" class="champ-aide">Dernière connexion : {{ formatDate(edition.derniereConnexion) }}</p>
              <p v-if="editionErreur" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ editionErreur }}</p>
              <div class="modale-actions">
                <BoutonBase variante="ghost" type="button" @click="edition = null">Annuler</BoutonBase>
                <BoutonBase type="submit" :chargement="editionEnCours" icone="fa-solid fa-check">Enregistrer</BoutonBase>
              </div>
            </template>
          </form>
        </div>
      </transition>

      <!-- Formulaire fournisseur -->
      <transition name="fondu">
        <div v-if="formulaire" class="modale-fond" @click.self="formulaire = null">
          <form class="modale adm-form" role="dialog" aria-modal="true" aria-labelledby="adm-form-titre" novalidate @submit.prevent="enregistrerFournisseur">
            <h2 id="adm-form-titre">{{ formulaire.id ? 'Modifier le fournisseur' : 'Nouveau fournisseur' }}</h2>
            <div class="adm-form-grille">
              <div class="champ adm-plein"><label for="f-nom">Nom *</label><input id="f-nom" v-model="formulaire.nom" type="text" maxlength="80" required /></div>
              <div class="champ"><label for="f-cat">Catégorie *</label>
                <select id="f-cat" v-model="formulaire.categorie_id"><option v-for="c in categories" :key="c.id" :value="c.id">{{ c.libelle }}</option></select></div>
              <div class="champ"><label for="f-commune">Commune *</label><input id="f-commune" v-model="formulaire.commune" type="text" maxlength="60" required /></div>
              <div class="champ"><label for="f-tel">Téléphone *</label><input id="f-tel" v-model="formulaire.telephone" type="tel" placeholder="0269 00 00 00" required /></div>
              <div class="champ"><label for="f-mail">E-mail</label><input id="f-mail" v-model="formulaire.email" type="email" /></div>
              <div class="champ adm-plein"><label for="f-adr">Adresse</label><input id="f-adr" v-model="formulaire.adresse" type="text" maxlength="160" /></div>
              <div class="champ"><label for="f-web">Site web</label><input id="f-web" v-model="formulaire.site_web" type="url" placeholder="https://" /></div>
              <div class="champ"><label for="f-hor">Horaires</label><input id="f-hor" v-model="formulaire.horaires" type="text" placeholder="Lun–Ven 7h–16h" /></div>
              <div class="champ adm-plein"><label for="f-desc">Description</label><textarea id="f-desc" v-model="formulaire.description" rows="3" maxlength="400"></textarea></div>
              <label class="adm-case adm-plein"><input v-model="formulaire.livraison" type="checkbox" /> Livraison possible</label>
            </div>
            <p v-if="formErreur" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ formErreur }}</p>
            <div class="modale-actions">
              <BoutonBase variante="ghost" type="button" @click="formulaire = null">Annuler</BoutonBase>
              <BoutonBase type="submit" :chargement="enregistrement" icone="fa-solid fa-check">Enregistrer</BoutonBase>
            </div>
          </form>
        </div>
      </transition>
    </div>
  </div>
</template>

<style scoped>
.adm { max-width: 1100px; }
.adm-entete { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 24px; }

.adm-onglets { display: flex; gap: 6px; margin-bottom: 24px; padding-bottom: 2px; overflow-x: auto; border-bottom: 1px solid var(--gris-200); scrollbar-width: none; }
.adm-onglets::-webkit-scrollbar { display: none; }
.adm-onglets button { flex: none; display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 16px; border: 0; border-bottom: 3px solid transparent; background: none; color: var(--texte-secondaire); font: inherit; font-weight: 600; cursor: pointer; transition: color var(--transition), border-color var(--transition); }
.adm-onglets button:hover { color: var(--ardoise); }
.adm-onglets button.actif { color: var(--lagon-700, var(--lagon-600)); border-bottom-color: var(--lagon-600); }

.adm-alerte { display: flex; align-items: center; gap: 10px; margin: 0 0 16px; padding: 12px 16px; border-radius: var(--rayon-sm); font-weight: 500; }
.adm-erreur { background: var(--erreur-clair); color: var(--erreur); }
.adm-ok { background: #d1fae5; color: #047857; }
.adm-chargement { display: grid; place-items: center; min-height: 220px; }
.adm-vide { padding: 22px; color: var(--texte-secondaire); text-align: center; list-style: none; }

/* Aperçu */
.adm-kpis { list-style: none; margin: 0 0 24px; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; }
.adm-kpis .carte { display: grid; gap: 4px; padding: 20px; }
.adm-kpis i { color: var(--lagon-600); font-size: 1.1rem; margin-bottom: 6px; }
.adm-kpis strong { font-family: var(--font-display); font-size: 1.9rem; line-height: 1; color: var(--ardoise); }
.adm-kpis small { font-size: 1rem; color: var(--texte-secondaire); }
.adm-kpis span { color: var(--texte-secondaire); font-size: .88rem; }
.adm-deux { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
.adm-bloc { padding: 22px; }
.adm-bloc h2 { margin: 0 0 12px; font-size: 1.1rem; color: var(--ardoise); }
.adm-liste { list-style: none; margin: 0; padding: 0; }
.adm-liste li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-top: 1px solid var(--gris-100, #f1f5f9); }
.adm-liste li:first-child { border-top: 0; }
.adm-liste span { display: flex; flex-direction: column; min-width: 0; }
.adm-liste small { color: var(--texte-secondaire); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.adm-liste time { color: var(--texte-secondaire); font-size: .85rem; white-space: nowrap; }

/* Outils + tableaux */
.adm-outils { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.adm-recherche { position: relative; flex: 1 1 260px; max-width: 420px; }
.adm-recherche i { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--gris-400); }
.adm-recherche input { width: 100%; padding: 11px 14px 11px 40px; border: 1.5px solid var(--gris-300); border-radius: var(--rayon-sm); background: #fff; font: inherit; }
.adm-recherche input:focus { outline: none; border-color: var(--lagon-500); box-shadow: 0 0 0 4px rgba(6, 182, 212, .18); }

.adm-tableau { padding: 0; overflow-x: auto; }
.adm-tableau table { width: 100%; border-collapse: collapse; font-size: .93rem; }
.adm-tableau th { padding: 14px 16px; text-align: left; font-size: .74rem; letter-spacing: .1em; text-transform: uppercase; color: var(--texte-secondaire); background: var(--gris-50); border-bottom: 1px solid var(--gris-200); white-space: nowrap; }
.adm-tableau td { padding: 13px 16px; border-bottom: 1px solid var(--gris-100, #f1f5f9); vertical-align: middle; }
.adm-tableau tr:last-child td { border-bottom: 0; }
.adm-inactif td { opacity: .55; }
.adm-actions { white-space: nowrap; text-align: right; }

.adm-badge { display: inline-block; padding: 3px 10px; border-radius: 999px; background: var(--gris-100, #f1f5f9); color: var(--gris-700); font-size: .76rem; font-weight: 600; }
.adm-badge-admin { background: #fef3c7; color: #92400e; }
.adm-badge-fournisseur { background: var(--lagon-50); color: var(--lagon-800, #155e75); }
.adm-badge-demo { background: #ede9fe; color: #5b21b6; }
.adm-badge-user { background: #d1fae5; color: #047857; }

.adm-icone { width: 38px; height: 38px; display: inline-grid; place-items: center; border: 0; border-radius: var(--rayon-sm); background: transparent; color: var(--gris-500); cursor: pointer; transition: background var(--transition), color var(--transition); }
.adm-icone:hover { background: var(--gris-100, #f1f5f9); color: var(--ardoise); }
.adm-danger:hover { background: var(--erreur-clair); color: var(--erreur); }

.adm-interrupteur { position: relative; width: 44px; height: 26px; border: 0; border-radius: 999px; background: var(--gris-300); cursor: pointer; transition: background var(--transition); }
.adm-interrupteur span { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: transform var(--transition); }
.adm-interrupteur.actif { background: var(--lagon-600); }
.adm-interrupteur.actif span { transform: translateX(18px); }

/* Avis */
.adm-avis { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
.adm-avis .carte { display: flex; flex-direction: column; gap: 12px; padding: 20px; }
.adm-avis-tete { display: flex; align-items: center; gap: 10px; }
.adm-avis-tete time { margin-left: auto; color: var(--texte-secondaire); font-size: .82rem; }
.adm-note { display: flex; gap: 2px; color: #f59e0b; font-size: .8rem; }
.adm-note .eteinte { color: var(--gris-200); }
.adm-avis-texte { margin: 0; line-height: 1.55; color: var(--ardoise); flex: 1; }
.adm-avis-pied { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--texte-secondaire); font-size: .88rem; }

/* Fenêtres (confirmation, formulaires) */
.modale-fond { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center; padding: 16px; background: rgba(6, 32, 44, .5); backdrop-filter: blur(4px); }
.modale { width: 100%; max-width: 420px; padding: 28px; background: #fff; border-radius: var(--rayon-lg); box-shadow: var(--ombre-lg); animation: apparaitre .25s ease; }
.modale h2 { margin: 0 0 6px; font-size: 1.4rem; color: var(--ardoise); word-break: break-word; }
.modale-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 24px; }
@media (max-width: 480px) { .modale { padding: 22px 18px; } }

/* Formulaire */
.adm-form { max-width: 640px; width: min(640px, 100%); max-height: calc(100dvh - 32px); overflow-y: auto; }
.adm-form-grille { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 16px 0; }
.adm-plein { grid-column: 1 / -1; }
.adm-form textarea { width: 100%; padding: 12px 14px; border: 1.5px solid var(--gris-300); border-radius: var(--rayon-sm); font: inherit; resize: vertical; }
.adm-case { display: flex; align-items: center; gap: 10px; font-weight: 500; cursor: pointer; }
.adm-case input { width: 18px; height: 18px; accent-color: var(--lagon-600); }

/* Téléphone : les tableaux deviennent des cartes empilées */
@media (max-width: 720px) {
  .adm-tableau { overflow: visible; background: none; border: 0; box-shadow: none; }
  .adm-tableau table, .adm-tableau tbody { display: block; }
  .adm-tableau thead { display: none; }
  .adm-tableau tr { display: block; margin-bottom: 12px; padding: 12px 16px; background: #fff; border: 1px solid var(--gris-200); border-radius: var(--rayon); }
  .adm-tableau td { display: flex; justify-content: space-between; gap: 16px; padding: 7px 0; border: 0; text-align: right; }
  .adm-tableau td[data-label]::before { content: attr(data-label); color: var(--texte-secondaire); font-size: .8rem; text-align: left; }
  .adm-tableau td.adm-actions { justify-content: flex-end; }
  .adm-form-grille { grid-template-columns: 1fr; }
}
</style>

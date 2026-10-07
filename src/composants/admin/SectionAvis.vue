<script setup>
/**
 * Avis clients : masquer (réversible) ou supprimer (définitif) ; synthèse des notes publiées.
 * Avis Google : recopiés ici depuis la fiche Google de BTM (nom, note, texte, date, lien) ; ils s'affichent
 * dans la colonne centrale de la page d'accueil. Les avis du site restent ceux des utilisateurs (qui peuvent les modifier).
 */
import { computed, onMounted, ref } from 'vue'
import { useAdmin, formatDate, initiales, correspond } from '@/composables/useAdmin.js'
import AdminPanneau from './AdminPanneau.vue'

const { api, donnees, erreurs, charger, recherche, confirmer, executer } = useAdmin()
onMounted(() => charger(['avis'], { force: true }))

const filtre = ref('tous')
const note = ref(0)
const tous = computed(() => donnees.avis || [])
const publies = computed(() => tous.value.filter((a) => a.visible))
const moyenne = computed(() => (publies.value.length ? publies.value.reduce((s, a) => s + a.note, 0) / publies.value.length : 0))
const repartition = computed(() => [5, 4, 3, 2, 1].map((n) => {
  const nombre = publies.value.filter((a) => a.note === n).length
  return { note: n, nombre, part: publies.value.length ? (nombre / publies.value.length) * 100 : 0 }
}))
const compte = computed(() => ({
  tous: tous.value.length,
  visibles: publies.value.length,
  masques: tous.value.length - publies.value.length,
  google: tous.value.filter((a) => a.source === 'google').length,
  demo: tous.value.filter((a) => a.demo).length
}))
const liste = computed(() => tous.value.filter((a) =>
  (filtre.value === 'tous' || (filtre.value === 'visibles' && a.visible) || (filtre.value === 'masques' && !a.visible)
    || (filtre.value === 'google' && a.source === 'google') || (filtre.value === 'demo' && a.demo))
  && (!note.value || a.note === note.value)
  && correspond(recherche.value, a.nom, a.ville, a.commentaire)))

async function basculer(a) {
  await executer(async () => { await api.definirAvisVisible(a.id, !a.visible); a.visible = !a.visible }, a.visible ? 'Avis masqué de la page d’accueil.' : 'Avis de nouveau publié.')
}
async function supprimer(a) {
  if (!(await confirmer({ titre: `Supprimer l’avis de ${a.nom} ?`, texte: 'Suppression définitive. Pour le retirer temporairement, masquez-le plutôt. L’auteur pourra publier un nouvel avis.', libelle: 'Supprimer', danger: true }))) return
  await executer(async () => { await api.supprimerAvis(a.id); donnees.avis = donnees.avis.filter((x) => x.id !== a.id) }, 'Avis supprimé.')
}

// ---------- Avis Google (saisie / correction) ----------
const formulaire = ref(null)
const formErreur = ref('')
const enregistrement = ref(false)
const jour = (d) => (d ? new Date(d).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10))
function ouvrirGoogle(a) {
  formErreur.value = ''
  formulaire.value = a
    ? { id: a.id, nom: a.nom, note: a.note, commentaire: a.commentaire || '', date: jour(a.cree_le), lien: a.lien || '' }
    : { id: null, nom: '', note: 5, commentaire: '', date: jour(), lien: '' }
}
async function enregistrerGoogle() {
  const f = formulaire.value
  if (f.nom.trim().length < 2) { formErreur.value = 'Indiquez le nom affiché sur Google.'; return }
  if (f.lien.trim() && !/^https:\/\//i.test(f.lien.trim())) { formErreur.value = 'Le lien doit commencer par https://'; return }
  formErreur.value = ''
  enregistrement.value = true
  try {
    await executer(async () => {
      const ligne = await api.enregistrerAvisGoogle(f)
      donnees.avis = f.id ? donnees.avis.map((x) => (x.id === ligne.id ? ligne : x)) : [ligne, ...donnees.avis]
      formulaire.value = null
    }, f.id ? 'Avis Google mis à jour.' : 'Avis Google ajouté : il apparaît au centre du mur d’avis.')
  } catch (e) {
    formErreur.value = /source|0024|column/i.test(e?.message || '') ? 'Appliquez d’abord la migration 0024 (avis Google) sur Supabase.' : (e?.message || 'Enregistrement impossible.')
  } finally {
    enregistrement.value = false
  }
}
</script>

<template>
  <div class="avis">
    <p v-if="erreurs.avis" class="adm-alerte" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.avis }}</p>

    <div class="avis-haut">
      <!-- Synthèse -->
      <section class="adm-carte adm-carte-pad avis-synthese">
        <div class="avis-moyenne">
          <strong>{{ publies.length ? moyenne.toFixed(1).replace('.', ',') : '—' }}</strong>
          <span>
            <span class="adm-etoiles" :aria-label="`${moyenne.toFixed(1)} sur 5`"><i v-for="n in 5" :key="n" class="fa-solid fa-star" :class="{ eteinte: n > Math.round(moyenne) }"></i></span>
            <small>{{ publies.length }} avis publiés</small>
          </span>
        </div>
        <ul class="avis-repartition" aria-label="Répartition des notes publiées">
          <li v-for="r in repartition" :key="r.note">
            <button type="button" :class="{ actif: note === r.note }" :aria-pressed="note === r.note" :aria-label="`Filtrer : ${r.note} étoiles (${r.nombre})`" @click="note = note === r.note ? 0 : r.note">
              <span>{{ r.note }} <i class="fa-solid fa-star" aria-hidden="true"></i></span>
              <span class="avis-barre"><span :style="{ width: `${r.part}%` }"></span></span>
              <span class="avis-nombre">{{ r.nombre }}</span>
            </button>
          </li>
        </ul>
      </section>

      <div class="adm-pilules avis-filtres" role="group" aria-label="Filtrer les avis">
        <button v-for="f in [['tous', 'Tous'], ['visibles', 'Publiés'], ['masques', 'Masqués'], ['google', 'Google'], ['demo', 'Démonstration']]" :key="f[0]" type="button" class="adm-pilule" :class="{ actif: filtre === f[0] }" :aria-pressed="filtre === f[0]" @click="filtre = f[0]">
          {{ f[1] }} <small>{{ compte[f[0]] }}</small>
        </button>
        <button v-if="note" type="button" class="adm-pilule" @click="note = 0">{{ note }} étoile{{ note > 1 ? 's' : '' }} <i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        <button type="button" class="adm-btn adm-btn-noir" @click="ouvrirGoogle()"><i class="fa-brands fa-google" aria-hidden="true"></i> Ajouter un avis Google</button>
      </div>
    </div>

    <div v-if="!donnees.avis" class="adm-chargement"><span class="spinner spinner-grand"></span></div>
    <ul v-else class="avis-grille">
      <li v-for="a in liste" :key="a.id" class="adm-carte avis-carte" :class="{ masque: !a.visible }">
        <div class="avis-carte-tete">
          <span class="adm-etoiles" :aria-label="`${a.note} sur 5`"><i v-for="n in 5" :key="n" class="fa-solid fa-star" :class="{ eteinte: n > a.note }"></i></span>
          <span v-if="!a.visible" class="adm-badge adm-badge-attention">Masqué</span>
          <span v-if="a.demo" class="adm-badge adm-badge-violet">Démo</span>
          <span v-if="a.source === 'google'" class="adm-badge avis-badge-google"><i class="fa-brands fa-google" aria-hidden="true"></i> Google</span>
          <span v-if="a.modifie_le" class="adm-badge">Modifié le {{ formatDate(a.modifie_le) }}</span>
          <time>{{ formatDate(a.cree_le) }}</time>
        </div>
        <p class="avis-texte">{{ a.commentaire || 'Note sans commentaire.' }}</p>
        <div class="avis-carte-pied">
          <span class="adm-identite">
            <span class="adm-avatar rond">{{ initiales(a.nom) }}</span>
            <span><strong>{{ a.nom }}</strong><small>{{ a.ville }}</small></span>
          </span>
          <span class="avis-actions">
            <a v-if="a.lien" :href="a.lien" target="_blank" rel="noopener noreferrer" class="adm-icone-btn" title="Voir sur Google" :aria-label="`Voir l’avis de ${a.nom} sur Google`"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
            <button v-if="a.source === 'google'" type="button" class="adm-icone-btn" title="Corriger" :aria-label="`Corriger l’avis Google de ${a.nom}`" @click="ouvrirGoogle(a)"><i class="fa-solid fa-pen"></i></button>
            <button type="button" class="adm-icone-btn" :title="a.visible ? 'Masquer' : 'Publier'" :aria-label="`${a.visible ? 'Masquer' : 'Publier'} l’avis de ${a.nom}`" @click="basculer(a)">
              <i :class="a.visible ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'"></i>
            </button>
            <button type="button" class="adm-icone-btn danger" title="Supprimer" :aria-label="`Supprimer l’avis de ${a.nom}`" @click="supprimer(a)"><i class="fa-solid fa-trash-can"></i></button>
          </span>
        </div>
      </li>
      <li v-if="!liste.length" class="adm-carte adm-vide avis-vide"><i class="fa-regular fa-star"></i><p>Aucun avis ne correspond.</p></li>
    </ul>

    <!-- Saisie d'un avis Google : recopié tel quel depuis la fiche Google de BTM -->
    <AdminPanneau v-if="formulaire" :titre="formulaire.id ? 'Corriger l’avis Google' : 'Ajouter un avis Google'" sous-titre="Recopiez l’avis tel qu’il apparaît sur la fiche Google de BTM." @fermer="formulaire = null">
      <form id="form-avis-google" class="google-form" novalidate @submit.prevent="enregistrerGoogle">
        <div class="adm-champ">
          <label for="g-nom">Nom affiché sur Google</label>
          <input id="g-nom" v-model="formulaire.nom" maxlength="60" placeholder="Ex. : Anli M." />
        </div>
        <fieldset class="adm-champ">
          <legend class="adm-champ-label">Note</legend>
          <div class="google-etoiles">
            <button v-for="n in 5" :key="n" type="button" :class="{ actif: n <= formulaire.note }" :aria-label="`${n} étoile${n > 1 ? 's' : ''}`" :aria-pressed="n === formulaire.note" @click="formulaire.note = n"><i class="fa-solid fa-star" aria-hidden="true"></i></button>
          </div>
        </fieldset>
        <div class="adm-champ">
          <label for="g-texte">Texte de l’avis</label>
          <textarea id="g-texte" v-model="formulaire.commentaire" rows="5" maxlength="1500"></textarea>
        </div>
        <div class="adm-champ">
          <label for="g-date">Date de l’avis</label>
          <input id="g-date" v-model="formulaire.date" type="date" :max="jour()" />
        </div>
        <div class="adm-champ">
          <label for="g-lien">Lien vers l’avis (facultatif)</label>
          <input id="g-lien" v-model="formulaire.lien" type="url" maxlength="500" placeholder="https://maps.app.goo.gl/…" />
          <span class="adm-champ-aide"><span>Sur Google Maps : avis → Partager → Copier le lien.</span></span>
        </div>
      </form>
      <p v-if="formErreur" class="adm-erreur-texte" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ formErreur }}</p>
      <template #pied>
        <button type="button" class="adm-btn adm-btn-clair" @click="formulaire = null">Annuler</button>
        <button type="submit" form="form-avis-google" class="adm-btn adm-btn-noir" :disabled="enregistrement">
          <span v-if="enregistrement" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-check" aria-hidden="true"></i> Enregistrer
        </button>
      </template>
    </AdminPanneau>
  </div>
</template>

<style scoped>
.avis { display: flex; flex-direction: column; gap: 16px; }
.avis-haut { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 16px; }
.avis-synthese { display: flex; flex-wrap: wrap; align-items: center; gap: 20px 36px; }
.avis-moyenne { display: flex; align-items: center; gap: 14px; }
.avis-moyenne > strong { font-size: 3rem; font-weight: 600; line-height: 1; letter-spacing: -.03em; }
.avis-moyenne > span { display: flex; flex-direction: column; gap: 4px; }
.avis-moyenne small { color: var(--adm-muet); font-size: .82rem; }
.avis-repartition { display: flex; flex-direction: column; gap: 2px; min-width: 240px; margin: 0; padding: 0; list-style: none; }
.avis-repartition button {
  display: grid; grid-template-columns: 38px 1fr 26px; align-items: center; gap: 10px; width: 100%; padding: 3px 8px; margin: 0 -8px;
  border: 0; border-radius: 8px; background: transparent; font: inherit; font-size: .82rem; color: var(--adm-encre-2); cursor: pointer;
}
.avis-repartition button:hover, .avis-repartition button.actif { background: var(--adm-ligne-2); color: var(--adm-encre); }
.avis-repartition i { color: #f59e0b; font-size: .7rem; }
.avis-barre { height: 8px; border-radius: 999px; background: var(--adm-ligne-2); overflow: hidden; }
.avis-barre span { display: block; height: 100%; border-radius: 999px; background: var(--adm-noir); }
.avis-nombre { text-align: right; font-variant-numeric: tabular-nums; }

.avis-grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; margin: 0; padding: 0; list-style: none; }
.avis-carte { display: flex; flex-direction: column; gap: 14px; padding: 20px; transition: opacity var(--transition); }
.avis-carte.masque { background: #fbfbfc; box-shadow: inset 0 0 0 1px var(--adm-ligne); }
.avis-carte.masque .avis-texte { color: var(--adm-muet); }
.avis-carte-tete { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.avis-carte-tete time { margin-left: auto; font-size: .78rem; color: var(--adm-muet); }
.avis-texte { flex: 1; margin: 0; font-size: .93rem; line-height: 1.6; }
.avis-carte-pied { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 14px; border-top: 1px solid var(--adm-ligne-2); }
.avis-carte-pied .adm-avatar { width: 34px; height: 34px; font-size: .75rem; }
.avis-actions { display: flex; }
.avis-vide { grid-column: 1 / -1; }
.avis-badge-google { background: #e8f0fe; color: #1967d2; }
.google-form { display: flex; flex-direction: column; gap: 16px; }
.google-etoiles { display: flex; gap: 4px; }
.google-etoiles button { padding: 2px; border: 0; background: none; color: var(--adm-ligne); font-size: 1.6rem; cursor: pointer; }
.google-etoiles button.actif { color: #fbbc04; }
</style>

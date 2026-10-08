<script setup>
/**
 * Mes projets : résumé (nombre, total estimé, dernier devis), recherche, filtre par type d'ouvrage, tri,
 * puis les devis en cartes (fournisseur choisi, code de retrait copiable, dupliquer, supprimer).
 */
import { ref, computed, onMounted, watch } from 'vue'
import { trouverTypeProjet, typesProjets } from '@/donnees/typesProjets.js'
import { useRouter } from 'vue-router'
import { useProjets } from '@/composables/useProjets.js'
import { useCalculateur } from '@/composables/useCalculateur.js'
import { useAuth } from '@/composables/useAuth.js'
import { ouvrirAuth } from '@/composables/useFenetreAuth.js'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'
import { infoType } from '@/services/calculs/fusion.js'
import { chargerFournisseurs } from '@/services/supabase/serviceFournisseurs.js'
import CarteProjet from '@/composants/tableau-de-bord/CarteProjet.vue'
import PropositionsRealisation from '@/composants/tableau-de-bord/PropositionsRealisation.vue'
import BoutonBase from '@/composants/commun/BoutonBase.vue'

const router = useRouter()
const { projets, vide, chargement, erreur, rafraichir, supprimer } = useProjets()
const calc = useCalculateur()
const { connecte, backendDisponible, utilisateur } = useAuth()

const aSupprimer = ref(null)
const suppressionEnCours = ref(false)

onMounted(rafraichir)
// recharge à chaque changement de compte (y compris d'un compte à un autre, sans passer par « déconnecté »)
watch(() => utilisateur.value?.id, () => rafraichir())

// nom du fournisseur choisi dans chaque devis (annuaire en cache : pas de requête en plus le plus souvent)
const nomsFournisseurs = ref({})
onMounted(async () => {
  try {
    const { donnees } = await chargerFournisseurs()
    nomsFournisseurs.value = Object.fromEntries(donnees.flatMap((f) => [[f.id, f.nom], [f.slug, f.nom]]))
  } catch { /* sans annuaire : « Fournisseur au choix » */ }
})

const cout = (p) => p.cout_total ?? p.resultat?.total ?? 0
const cleType = (p) => p.type || p.resultat?.type || 'devis'

// ---------- Résumé ----------
const totalCumule = computed(() => projets.value.reduce((s, p) => s + cout(p), 0))
const dernier = computed(() => projets.value.reduce((d, p) => (!d || new Date(p.cree_le) > new Date(d.cree_le) ? p : d), null))
const depuisDernier = computed(() => {
  if (!dernier.value) return ''
  const jours = Math.round((Date.now() - new Date(dernier.value.cree_le)) / 86400000)
  return jours < 1 ? 'aujourd’hui' : jours < 2 ? 'hier' : `il y a ${jours} jours`
})

// ---------- Recherche, filtre, tri ----------
const recherche = ref('')
const filtreType = ref('')
const tri = ref('recents')
const TRIS = { recents: 'Plus récents', anciens: 'Plus anciens', cher: 'Prix décroissant', moinsCher: 'Prix croissant' }
const normaliser = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// types réellement présents, avec leur nombre (les 4 ouvrages du calculateur d'abord)
const types = computed(() => {
  const n = {}
  for (const p of projets.value) n[cleType(p)] = (n[cleType(p)] || 0) + 1
  const ordre = typesProjets.map((t) => t.id)
  return Object.keys(n)
    .sort((a, b) => (ordre.indexOf(a) + 1 || 99) - (ordre.indexOf(b) + 1 || 99))
    .map((id) => {
      const exemple = projets.value.find((p) => cleType(p) === id)
      const info = infoType(exemple.resultat || { type: id })
      return { id, libelle: info.libelle, icone: info.icone, nombre: n[id] }
    })
})

const liste = computed(() => {
  const mots = normaliser(recherche.value).split(/\s+/).filter(Boolean)
  const filtres = projets.value.filter((p) => (!filtreType.value || cleType(p) === filtreType.value)
    && mots.every((m) => normaliser(`${p.nom} ${p.code_retrait || ''} ${nomsFournisseurs.value[p.fournisseur_id] || ''}`).includes(m)))
  const date = (p) => new Date(p.cree_le).getTime()
  const comparer = { recents: (a, b) => date(b) - date(a), anciens: (a, b) => date(a) - date(b), cher: (a, b) => cout(b) - cout(a), moinsCher: (a, b) => cout(a) - cout(b) }
  return filtres.sort(comparer[tri.value])
})
const filtreActif = computed(() => !!(recherche.value.trim() || filtreType.value))
function reinitialiser() { recherche.value = ''; filtreType.value = '' }

// ---------- Actions ----------
function voir(p) { calc.afficherResultat(p); router.push('/resultats') }
// Achat direct et devis pro n'ont pas de formulaire : la copie s'ouvre dans les résultats, sans code de retrait
function dupliquer(p) {
  if (!trouverTypeProjet(p.type)) { calc.afficherResultat({ ...p, code_retrait: '' }); return router.push('/resultats') }
  calc.chargerDepuisProjet(p); router.push({ path: '/calculateur', query: { type: p.type } })
}
async function confirmerSuppression() {
  suppressionEnCours.value = true
  try { await supprimer(aSupprimer.value.id); aSupprimer.value = null } finally { suppressionEnCours.value = false }
}
</script>

<template>
  <div id="page-dashboard" class="page">
    <div class="conteneur tdb">
      <header class="tdb-entete">
        <div>
          <span class="section-surtitre">Espace personnel</span>
          <h1 class="page-titre">Mes projets</h1>
          <p class="page-sous-titre">
            <template v-if="!vide">{{ projets.length }} devis · <span class="prix">{{ formaterEuros(totalCumule) }}</span> au total · dernier {{ depuisDernier }}</template>
            <template v-else>Vos devis enregistrés apparaîtront ici.</template>
          </p>
        </div>
        <BoutonBase to="/calculateur" icone="fa-solid fa-plus">Nouveau devis</BoutonBase>
      </header>

      <!-- invitation de BTM à mettre un projet en avant sur la page d'accueil -->
      <PropositionsRealisation v-if="connecte" />

      <p v-if="erreur" class="tdb-note" :title="erreur"><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i> Synchronisation indisponible : seuls les projets de cet appareil sont affichés.</p>
      <p v-else-if="!connecte && backendDisponible" class="tdb-note">
        <i class="fa-solid fa-mobile-screen" aria-hidden="true"></i> Enregistrés sur cet appareil.
        <button type="button" @click="ouvrirAuth('connexion', { redirect: '/dashboard' })">Se connecter</button> pour les retrouver partout et obtenir un code de retrait.
      </p>

      <template v-if="!vide">
        <!-- Recherche, filtre, tri -->
        <div class="tdb-outils">
          <div class="tdb-recherche">
            <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            <label for="tdb-recherche" class="visually-hidden">Rechercher un projet</label>
            <input id="tdb-recherche" v-model="recherche" type="search" placeholder="Nom, code de retrait, fournisseur…" autocomplete="off" />
          </div>
          <label class="tdb-tri">
            <span class="visually-hidden">Trier</span>
            <i class="fa-solid fa-arrow-down-wide-short" aria-hidden="true"></i>
            <select v-model="tri"><option v-for="(libelle, cle) in TRIS" :key="cle" :value="cle">{{ libelle }}</option></select>
          </label>
        </div>
        <div v-if="types.length > 1" class="tdb-puces" role="group" aria-label="Type d’ouvrage">
          <button type="button" :class="{ actif: !filtreType }" :aria-pressed="!filtreType" @click="filtreType = ''">Tous <small>{{ projets.length }}</small></button>
          <button v-for="t in types" :key="t.id" type="button" :class="{ actif: filtreType === t.id }" :aria-pressed="filtreType === t.id" @click="filtreType = filtreType === t.id ? '' : t.id">
            <i :class="t.icone" aria-hidden="true"></i>{{ t.libelle }} <small>{{ t.nombre }}</small>
          </button>
        </div>

        <transition-group v-if="liste.length" name="liste" tag="ul" class="tdb-grille">
          <CarteProjet
            v-for="(p, i) in liste" :key="p.id" :projet="p" :numero="i + 1" :fournisseur="nomsFournisseurs[p.fournisseur_id] || ''"
            @voir="voir" @dupliquer="dupliquer" @supprimer="aSupprimer = $event"
          />
        </transition-group>
        <div v-else class="tdb-aucun">
          <p>Aucun projet ne correspond{{ recherche.trim() ? ` à « ${recherche.trim()} »` : '' }}.</p>
          <button v-if="filtreActif" type="button" @click="reinitialiser">Effacer la recherche et les filtres</button>
        </div>
      </template>

      <div v-else-if="chargement" class="tdb-vide"><span class="spinner spinner-grand"></span></div>

      <!-- Aucun projet : raccourcis vers les 4 devis -->
      <section v-else class="tdb-vide" aria-labelledby="tdb-vide-titre">
        <span class="tdb-vide-icone" aria-hidden="true"><i class="fa-regular fa-folder-open"></i></span>
        <h2 id="tdb-vide-titre">Aucun projet pour l’instant</h2>
        <p>Chiffrez votre premier ouvrage en quelques questions : il sera enregistré ici.</p>
        <ul class="tdb-raccourcis">
          <li v-for="t in typesProjets" :key="t.id">
            <router-link :to="{ path: '/calculateur', query: { type: t.id } }" :style="{ '--teinte': t.couleur }">
              <i :class="t.icone" aria-hidden="true"></i><span>{{ t.libelle }}</span>
            </router-link>
          </li>
        </ul>
      </section>

      <transition name="fondu">
        <div v-if="aSupprimer" class="modale-fond" @click.self="aSupprimer = null">
          <div class="modale" role="alertdialog" aria-modal="true" aria-labelledby="suppr-titre" aria-describedby="suppr-texte">
            <h2 id="suppr-titre">Supprimer « {{ aSupprimer.nom }} » ?</h2>
            <p id="suppr-texte">Le devis et son code de retrait ne seront plus utilisables. Cette action est définitive.</p>
            <div class="modale-actions">
              <BoutonBase variante="ghost" @click="aSupprimer = null">Annuler</BoutonBase>
              <BoutonBase variante="danger" :chargement="suppressionEnCours" @click="confirmerSuppression">Supprimer</BoutonBase>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<style scoped>
.tdb-entete { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 20px; margin-bottom: 28px; }

.tdb-note { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 20px; padding: 12px 16px; border-radius: var(--rayon); background: var(--gris-50); font-size: .9rem; color: var(--texte-secondaire); }
.tdb-note i { margin-right: 4px; color: var(--lagon-600); }
.tdb-note button { padding: 0; border: 0; background: none; color: var(--lagon-700); font: inherit; font-weight: 600; cursor: pointer; }
.tdb-note button:hover { text-decoration: underline; text-underline-offset: 3px; }


/* Outils */
.tdb-outils { display: flex; gap: 12px; margin-bottom: 14px; }
.tdb-recherche { position: relative; flex: 1; display: flex; align-items: center; }
.tdb-recherche > i { position: absolute; left: 16px; color: var(--gris-400); pointer-events: none; }
.tdb-recherche input {
  width: 100%; min-height: 48px; padding: 0 16px 0 44px; border: 1px solid var(--gris-200); border-radius: 14px; background: var(--gris-50);
  font: inherit; color: var(--ardoise); transition: border-color var(--transition), background var(--transition), box-shadow var(--transition);
}
.tdb-recherche input:focus { outline: none; background: #fff; border-color: var(--lagon-500); box-shadow: 0 0 0 4px rgba(6, 182, 212, .14); }
.tdb-tri { position: relative; display: flex; align-items: center; }
.tdb-tri i { position: absolute; left: 14px; color: var(--gris-400); font-size: .85rem; pointer-events: none; }
.tdb-tri select { min-height: 48px; padding: 0 16px 0 38px; border: 1px solid var(--gris-200); border-radius: 14px; background: #fff; font: inherit; font-size: .92rem; color: var(--ardoise); cursor: pointer; }
.tdb-puces { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
.tdb-puces button {
  display: inline-flex; align-items: center; gap: 8px; min-height: 38px; padding: 0 14px; border: 1px solid var(--gris-200); border-radius: 999px;
  background: #fff; font: inherit; font-size: .88rem; font-weight: 600; color: var(--gris-600); cursor: pointer;
  transition: color var(--transition), background var(--transition), border-color var(--transition);
}
.tdb-puces button i { font-size: .8rem; color: var(--gris-400); }
.tdb-puces button small { min-width: 20px; padding: 0 6px; border-radius: 999px; background: var(--gris-100); color: var(--gris-500); font-size: .74rem; text-align: center; }
.tdb-puces button:hover { border-color: var(--gris-300); color: var(--ardoise); }
.tdb-puces button.actif { border-color: var(--ardoise); background: var(--ardoise); color: #fff; }
.tdb-puces button.actif i { color: inherit; }
.tdb-puces button.actif small { background: rgba(255, 255, 255, .2); color: #fff; }

/* Cartes */
/* cartes hautes alignées droit, de la même largeur */
.tdb-grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 22px; margin: 8px 0 0; padding: 0; list-style: none; }
.tdb-aucun { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 48px 20px; border: 1px dashed var(--gris-300); border-radius: var(--rayon-lg); color: var(--gris-500); text-align: center; }
.tdb-aucun p { margin: 0; }
.tdb-aucun button { padding: 0; border: 0; background: none; color: var(--lagon-700); font: inherit; font-weight: 600; cursor: pointer; }

/* Aucun projet */
.tdb-vide { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 56px 20px; border: 1px dashed var(--gris-300); border-radius: var(--rayon-lg); color: var(--gris-500); text-align: center; }
.tdb-vide h2 { color: var(--ardoise); font-size: 1.7rem; }
.tdb-vide p { margin: 0; max-width: 460px; }
.tdb-vide-icone { width: 60px; height: 60px; display: grid; place-items: center; border-radius: 50%; background: var(--lagon-50); color: var(--lagon-600); font-size: 1.4rem; }
.tdb-raccourcis { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin: 14px 0 0; padding: 0; list-style: none; }
.tdb-raccourcis a {
  display: inline-flex; align-items: center; gap: 10px; min-height: 48px; padding: 0 18px; border: 1px solid var(--gris-200); border-radius: 14px;
  background: #fff; color: var(--ardoise); font-weight: 600; transition: border-color var(--transition), transform var(--transition);
}
.tdb-raccourcis a:hover { border-color: var(--teinte); transform: translateY(-2px); }
.tdb-raccourcis i { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 9px; background: color-mix(in srgb, var(--teinte) 14%, #fff); color: var(--teinte); font-size: .85rem; }

.modale-fond { position: fixed; inset: 0; z-index: 200; background: rgba(6,32,44,.45); backdrop-filter: blur(4px); display: grid; place-items: center; padding: 20px; }
.modale { background: #fff; border-radius: var(--rayon-lg); padding: 28px; width: 100%; max-width: 420px; box-shadow: var(--ombre-lg); animation: apparaitre .25s ease; }
.modale h2 { font-size: 1.4rem; color: var(--ardoise); word-break: break-word; }
.modale p { margin: 10px 0 0; color: var(--texte-secondaire); font-size: .92rem; line-height: 1.5; }
.modale-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px; }

.liste-enter-active, .liste-leave-active { transition: all .3s ease; }
.liste-enter-from, .liste-leave-to { opacity: 0; transform: translateY(8px); }
.liste-move { transition: transform .3s ease; }

@media (max-width: 760px) {
  .tdb-outils { flex-direction: column; }
  .tdb-entete :deep(.btn) { width: 100%; justify-content: center; }
}
</style>

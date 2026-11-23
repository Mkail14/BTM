<script setup>
/**
 * SelecteurCarreau — choix du modèle de carreaux (calculateur, carrelage).
 *  - carrousel : le « modèle standard » (prix moyen du catalogue BTM), puis les 4 modèles les plus choisis
 *    dans les devis enregistrés (fonction popularite_carreaux) pour le format choisi ;
 *  - « Voir tous les modèles » : fenêtre avec recherche, filtres (finition, fournisseur) et tri,
 *    pour les fournisseurs qui proposent des centaines de modèles.
 * La valeur émise est 'standard' ou un instantané du modèle (prix compris) : le devis ne dépend pas
 * d'un rechargement de la liste ; le prix exact est relu par le fournisseur à l'encaissement.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { listerCarreauxPublics, libelleFormat, prixAuM2 } from '@/services/supabase/serviceCarreaux.js'
import CarteCarreau from '@/composants/calculateur/CarteCarreau.vue'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'

const props = defineProps({
  format: { type: String, required: true },
  modelValue: { type: [String, Object], default: 'standard' },
  // carreaux entiers à commander pour la pièce (coupes et casse comprises) : coût du modèle pour ce chantier
  nbCarreaux: { type: Number, default: 0 }
})
const emit = defineEmits(['choisir'])

const EN_VEDETTE = 4

const tous = ref([])
const chargement = ref(true)
onMounted(async () => {
  tous.value = await listerCarreauxPublics()
  chargement.value = false
})
// les plus choisis d'abord, puis les moins chers ; les ruptures en dernier
const parPopularite = (a, b) => (a.rupture - b.rupture) || (b.devis - a.devis) || (prixAuM2(a) - prixAuM2(b))
const modeles = computed(() => tous.value.filter((c) => c.format === props.format).sort(parPopularite))
const choisiId = computed(() => (props.modelValue && typeof props.modelValue === 'object' ? props.modelValue.id : 'standard'))

// Carrousel : les 4 favoris, et le modèle déjà choisi s'il n'en fait pas partie (retour sur la question)
const vedettes = computed(() => {
  const liste = modeles.value.slice(0, EN_VEDETTE)
  const choisi = modeles.value.find((c) => c.id === choisiId.value)
  return choisi && !liste.includes(choisi) ? [choisi, ...liste] : liste
})
const dejaChoisis = computed(() => modeles.value.some((c) => c.devis > 0))
// modèle retenu (instantané émis précédemment) : récapitulatif sous la liste
const choisi = computed(() => (choisiId.value === 'standard' ? null : props.modelValue))

function choisir(c) {
  if (!c) return emit('choisir', 'standard')
  if (c.rupture) return
  fermerCatalogue()
  emit('choisir', {
    id: c.id, nom: c.nom, format: c.format, finition: c.finition || '', couleur: c.couleur, photo_url: c.photo_url || '',
    prix: c.prix_unitaire, parCarton: c.carreaux_par_carton || null, fournisseur: c.fournisseur, fournisseurId: c.fournisseur_id
  })
}

// Flèches (ordinateur) : une carte à la fois
const piste = ref(null)
function defiler(sens) {
  const el = piste.value
  const pas = el?.querySelector('li')?.offsetWidth || 200
  el?.scrollBy({ left: sens * (pas + 14), behavior: 'smooth' })
}

// ---------- Fenêtre « Tous les modèles » ----------
const catalogueOuvert = ref(false)
const recherche = ref('')
const finition = ref('')
const fournisseur = ref('')
const tri = ref('populaires')
const champRecherche = ref(null)
let declencheur = null

const finitions = computed(() => [...new Set(modeles.value.map((c) => c.finition).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')))
const fournisseurs = computed(() => [...new Set(modeles.value.map((c) => c.fournisseur).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')))

const sansAccents = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const TRIS = {
  populaires: parPopularite,
  'prix-croissant': (a, b) => (a.rupture - b.rupture) || (prixAuM2(a) - prixAuM2(b)),
  'prix-decroissant': (a, b) => (a.rupture - b.rupture) || (prixAuM2(b) - prixAuM2(a)),
  nom: (a, b) => a.nom.localeCompare(b.nom, 'fr')
}
const resultats = computed(() => {
  const mots = sansAccents(recherche.value).split(/\s+/).filter(Boolean)
  return modeles.value
    .filter((c) => !finition.value || c.finition === finition.value)
    .filter((c) => !fournisseur.value || c.fournisseur === fournisseur.value)
    .filter((c) => {
      if (!mots.length) return true
      const texte = sansAccents([c.nom, c.finition, c.fournisseur, c.commune].join(' '))
      return mots.every((m) => texte.includes(m))
    })
    .sort(TRIS[tri.value])
})
const filtresActifs = computed(() => !!(recherche.value || finition.value || fournisseur.value))
function effacerFiltres() { recherche.value = ''; finition.value = ''; fournisseur.value = '' }

async function ouvrirCatalogue(e) {
  declencheur = e?.currentTarget || null
  catalogueOuvert.value = true
  await nextTick()
  // au doigt, le clavier ouvert d'office cacherait les modèles : la recherche attend qu'on la touche
  if (window.matchMedia('(hover: hover)').matches) champRecherche.value?.focus()
  else document.querySelector('.scc-fermer')?.focus({ preventScroll: true })
}
function fermerCatalogue() {
  if (!catalogueOuvert.value) return
  catalogueOuvert.value = false
  declencheur?.focus?.()
}
watch(catalogueOuvert, (v) => { document.body.style.overflow = v ? 'hidden' : '' })
onBeforeUnmount(() => { document.body.style.overflow = '' })
</script>

<template>
  <div class="sc">
    <div class="sc-cadre">
      <button type="button" class="sc-fleche gauche" aria-label="Modèles précédents" @click="defiler(-1)"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
      <ul ref="piste" class="sc-piste" role="listbox" :aria-label="`Modèles de carreaux ${libelleFormat(format)}`">
        <li><CarteCarreau ligne :actif="choisiId === 'standard'" @click="choisir(null)" /></li>
        <li v-for="c in vedettes" :key="c.id"><CarteCarreau ligne :carreau="c" :actif="choisiId === c.id" :nb-carreaux="nbCarreaux" @click="choisir(c)" /></li>
      </ul>
      <button type="button" class="sc-fleche droite" aria-label="Modèles suivants" @click="defiler(1)"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
    </div>

    <p v-if="chargement" class="sc-note"><span class="spinner" aria-hidden="true"></span> Chargement des modèles…</p>
    <p v-else-if="!modeles.length" class="sc-note">Aucun modèle {{ libelleFormat(format) }} n’est encore proposé par un fournisseur : l’estimation utilisera le prix moyen du catalogue.</p>
    <template v-else>
      <button v-if="modeles.length > EN_VEDETTE" type="button" class="sc-tous" @click="ouvrirCatalogue">
        <i class="fa-solid fa-grip" aria-hidden="true"></i>
        Voir les {{ modeles.length }} modèles
        <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
      </button>
      <p class="sc-note">{{ dejaChoisis ? 'Ci-dessus : les modèles les plus choisis dans les estimations BTM.' : 'Ci-dessus : les modèles les moins chers.' }}</p>
    </template>

    <!-- Ce qui est retenu, et ce que cela coûte pour la pièce -->
    <div class="sc-choix" role="status">
      <template v-if="choisi">
        <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
        <p>
          <strong>Votre choix : « {{ choisi.nom }} »</strong><small>{{ choisi.fournisseur }} · {{ formaterEuros(choisi.prix) }} {{ choisi.parCarton > 1 ? `le carton de ${choisi.parCarton}` : 'le carreau' }}</small>
          <span v-if="nbCarreaux && choisi.parCarton > 1">{{ Math.ceil(nbCarreaux / choisi.parCarton) }} cartons ({{ nbCarreaux }} carreaux) pour votre pièce ≈ <b>{{ formaterEuros(Math.ceil(nbCarreaux / choisi.parCarton) * choisi.prix) }}</b></span>
          <span v-else-if="nbCarreaux">{{ nbCarreaux }} carreaux pour votre pièce ≈ <b>{{ formaterEuros(nbCarreaux * choisi.prix) }}</b></span>
        </p>
      </template>
      <template v-else>
        <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
        <p>
          <strong>Votre choix : modèle standard</strong><small>L’estimation utilise le prix moyen du catalogue : vous choisirez vos carreaux en magasin.</small>
          <span v-if="nbCarreaux">{{ nbCarreaux }} carreaux pour votre pièce (coupes et casse comprises)</span>
        </p>
      </template>
    </div>

    <!-- Tous les modèles : recherche, filtres, tri -->
    <Teleport to="body">
      <transition name="fondu">
        <div v-if="catalogueOuvert" class="scc-fond" @click.self="fermerCatalogue" @keydown.esc="fermerCatalogue">
          <div class="scc" role="dialog" aria-modal="true" aria-labelledby="scc-titre">
            <header class="scc-tete">
              <div>
                <h2 id="scc-titre" class="scc-titre">Tous les modèles {{ libelleFormat(format) }}</h2>
                <p class="scc-sous-titre">Prix à l’unité, chez les fournisseurs partenaires.</p>
              </div>
              <button type="button" class="scc-fermer" aria-label="Fermer" @click="fermerCatalogue"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
            </header>

            <div class="scc-outils">
              <label class="scc-recherche">
                <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                <span class="visuellement-cache">Rechercher un modèle</span>
                <input ref="champRecherche" v-model="recherche" type="search" placeholder="Marbre, bois, gris, nom du magasin…" autocomplete="off" />
              </label>
              <div class="scc-selects">
                <label>
                  <span class="visuellement-cache">Fournisseur</span>
                  <select v-model="fournisseur"><option value="">Tous les fournisseurs</option><option v-for="f in fournisseurs" :key="f" :value="f">{{ f }}</option></select>
                </label>
                <label>
                  <span class="visuellement-cache">Trier par</span>
                  <select v-model="tri">
                    <option value="populaires">Les plus choisis</option>
                    <option value="prix-croissant">Prix croissant</option>
                    <option value="prix-decroissant">Prix décroissant</option>
                    <option value="nom">Nom (A → Z)</option>
                  </select>
                </label>
              </div>
              <div v-if="finitions.length > 1" class="scc-puces" role="group" aria-label="Finition">
                <button type="button" class="scc-puce" :class="{ actif: !finition }" :aria-pressed="!finition" @click="finition = ''">Toutes</button>
                <button v-for="f in finitions" :key="f" type="button" class="scc-puce" :class="{ actif: finition === f }" :aria-pressed="finition === f" @click="finition = finition === f ? '' : f">{{ f }}</button>
              </div>
            </div>

            <p class="scc-compte" role="status">
              {{ resultats.length }} modèle{{ resultats.length > 1 ? 's' : '' }}
              <button v-if="filtresActifs" type="button" class="scc-effacer" @click="effacerFiltres">Effacer les filtres</button>
            </p>

            <ul v-if="resultats.length" class="scc-grille" role="listbox" :aria-label="`Modèles ${libelleFormat(format)}`">
              <li v-for="c in resultats" :key="c.id"><CarteCarreau :carreau="c" :actif="choisiId === c.id" :nb-carreaux="nbCarreaux" @click="choisir(c)" /></li>
            </ul>
            <div v-else class="scc-vide">
              <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
              <p>Aucun modèle ne correspond à votre recherche.</p>
              <button type="button" class="scc-effacer" @click="effacerFiltres">Effacer les filtres</button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<style scoped>
.sc { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.sc-cadre { position: relative; min-width: 0; }
.sc-piste {
  display: flex; gap: 14px; margin: 0; padding: 4px 2px 10px; list-style: none;
  overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: thin; overscroll-behavior-x: contain;
}
.sc-piste > li { flex: 0 0 200px; scroll-snap-align: start; }
.sc-fleche {
  position: absolute; top: 50%; z-index: 1; width: 36px; height: 36px; display: grid; place-items: center; transform: translateY(-50%);
  border: 1px solid var(--gris-200); border-radius: 50%; background: var(--carte); color: var(--ardoise); box-shadow: var(--ombre-sm, 0 2px 6px rgba(0,0,0,.12)); cursor: pointer;
}
.sc-fleche.gauche { left: -14px; }
.sc-fleche.droite { right: -14px; }
.sc-note { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; margin: 0; color: var(--texte-secondaire); font-size: .84rem; line-height: 1.45; }
.sc-note .spinner { width: 14px; height: 14px; border-width: 2px; }
.sc-tous {
  display: inline-flex; align-items: center; justify-content: center; gap: 10px; align-self: flex-start; padding: 11px 18px;
  border: 1.5px solid var(--lagon-600); border-radius: 999px; background: var(--carte); color: var(--lagon-700);
  font: inherit; font-weight: 700; cursor: pointer; transition: background var(--transition);
}
.sc-tous:hover { background: var(--lagon-50, #f7f3ee); }

/* Fenêtre « Tous les modèles » */
.scc-fond { position: fixed; inset: 0; z-index: 400; display: grid; place-items: center; padding: 20px; background: rgba(17, 17, 17, .6); backdrop-filter: blur(4px); }
.scc { display: flex; flex-direction: column; width: min(1040px, 100%); height: min(90vh, 900px); overflow: hidden; border-radius: var(--rayon-lg); background: var(--fond, #f8fafc); box-shadow: var(--ombre-lg); }
.scc-tete { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 20px 12px; background: var(--carte); }
.scc-titre { margin: 0; color: var(--ardoise); font-size: 1.6rem; }
.scc-sous-titre { margin: 2px 0 0; color: var(--texte-secondaire); font-size: .88rem; }
.scc-fermer { flex: none; width: 40px; height: 40px; display: grid; place-items: center; border: 0; border-radius: 50%; background: var(--gris-100); color: var(--ardoise); font-size: 1.1rem; cursor: pointer; }
.scc-fermer:hover { background: var(--gris-200); }
.scc-outils { display: flex; flex-wrap: wrap; gap: 10px; padding: 0 20px 14px; background: var(--carte); border-bottom: 1px solid var(--gris-200); }
.scc-recherche { position: relative; flex: 1 1 280px; }
.scc-recherche i { position: absolute; top: 50%; left: 14px; transform: translateY(-50%); color: var(--gris-500); }
.scc-recherche input { width: 100%; padding: 11px 14px 11px 40px; border: 1.5px solid var(--gris-200); border-radius: var(--rayon); font: inherit; }
.scc-recherche input:focus { outline: none; border-color: var(--lagon-500); box-shadow: 0 0 0 3px rgba(17, 17, 17, .15); }
.scc-selects { display: flex; flex-wrap: wrap; gap: 10px; }
.scc-selects select { padding: 11px 12px; border: 1.5px solid var(--gris-200); border-radius: var(--rayon); background: var(--carte); font: inherit; color: var(--ardoise); cursor: pointer; }
.scc-puces { display: flex; gap: 8px; width: 100%; overflow-x: auto; padding-bottom: 2px; scrollbar-width: thin; }
.scc-puce { flex: none; padding: 6px 14px; border: 1px solid var(--gris-200); border-radius: 999px; background: var(--carte); color: var(--ardoise); font: inherit; font-size: .85rem; font-weight: 600; cursor: pointer; }
.scc-puce:hover { border-color: var(--lagon-500); }
.scc-puce.actif { border-color: var(--lagon-600); background: var(--lagon-600); color: var(--sur-primaire); }
.scc-compte { display: flex; align-items: center; gap: 14px; margin: 0; padding: 12px 20px 0; color: var(--texte-secondaire); font-size: .88rem; font-weight: 600; }
.scc-effacer { padding: 0; border: 0; background: none; color: var(--lagon-700); font: inherit; font-weight: 700; cursor: pointer; }
.scc-effacer:hover { text-decoration: underline; text-underline-offset: 3px; }
.scc-grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 14px; margin: 0; padding: 12px 20px 24px; list-style: none; overflow-y: auto; overscroll-behavior: contain; }
.scc-vide { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--texte-secondaire); text-align: center; }
.scc-vide i { font-size: 1.6rem; color: var(--gris-400, #94a3b8); }
.scc-vide p { margin: 0; }
.visuellement-cache { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.sc-choix { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; border-radius: var(--rayon); background: var(--lagon-50, #f7f3ee); color: var(--ardoise); }
.sc-choix > i { margin-top: 3px; color: var(--lagon-600); font-size: 1.15rem; }
.sc-choix p { display: flex; flex-direction: column; gap: 2px; min-width: 0; margin: 0; font-size: .9rem; line-height: 1.4; }
.sc-choix small { color: var(--texte-secondaire); font-size: .82rem; }
.sc-choix b { color: var(--lagon-700); }

@media (max-width: 899px) {
  .sc-fleche { display: none; } /* au doigt, la piste défile toute seule */
  .sc-piste > li { flex-basis: 170px; }
  .sc-tous { align-self: stretch; min-height: 48px; }
}
/* Téléphone : les modèles les uns sous les autres, en lignes compactes (pas de défilement horizontal caché) */
@media (max-width: 599px) {
  .sc-piste { flex-direction: column; gap: 8px; padding: 0; overflow: visible; scroll-snap-type: none; }
  .sc-piste > li { flex: none; }
}
@media (max-width: 640px) {
  .scc-fond { padding: 0; }
  .scc { width: 100%; height: 100%; height: 100dvh; border-radius: 0; }
  .scc-tete { padding: 12px 16px 8px; }
  .scc-titre { font-size: 1.3rem; }
  .scc-sous-titre { display: none; }
  .scc-puce { min-height: 38px; }
  .scc-outils { padding: 0 16px 12px; }
  .scc-selects { width: 100%; }
  .scc-selects label { flex: 1; }
  .scc-selects select { width: 100%; }
  .scc-compte { padding: 10px 16px 0; }
  .scc-grille { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 10px 16px 20px; }
}
</style>

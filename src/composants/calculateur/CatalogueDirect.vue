<script setup>
/**
 * « Je sais ce qu'il me faut » : le client choisit ses matériaux et ses quantités, sans aucune mesure.
 * Pour chaque matériau : le meilleur prix BTM chez les fournisseurs et combien le proposent en stock.
 *  - Recherche : le nom d'un matériau, d'un modèle de carreau… ou d'un fournisseur (« caz déco ») : tous ses produits.
 *  - « Voir les offres » : une photo par fournisseur qui défile (son produit, son prix, sa description) ;
 *    « Choisir ce fournisseur » le retient pour ce matériau : il est présélectionné dans la comparaison.
 * Valider mène aux résultats, où l'on compare le prix exact chez chaque fournisseur.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { chargerCatalogue } from '@/services/supabase/serviceMateriaux.js'
import { chargerOffres, meilleuresOffres } from '@/services/supabase/serviceOffres.js'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'

const props = defineProps({ initial: { type: Array, default: () => [] } }) // lignes d'un achat déjà composé
const emit = defineEmits(['valider'])

const ICONES = { parpaing: 'fa-solid fa-cube', ciment: 'fa-solid fa-sack-xmark', sable: 'fa-solid fa-mound', beton: 'fa-solid fa-truck-droplet', beton_arme: 'fa-solid fa-truck-droplet', ferraillage: 'fa-solid fa-border-all', acier: 'fa-solid fa-bars', gravier: 'fa-solid fa-hill-rockslide', carrelage: 'fa-solid fa-table-cells', beton_lisse: 'fa-solid fa-brush' }
const PAS = { u: 10, sac: 1, t: 0.5, 'm³': 0.5, 'm²': 1, kg: 10, carton: 1, carreau: 10 }
const uniteLisible = (u) => ({ u: 'unité', sac: 'sac', t: 'tonne' }[u] || u)
const icone = (m) => ICONES[m.id] || (m.carreau ? 'fa-solid fa-table-cells' : 'fa-solid fa-box')

const materiaux = ref([])
const toutesOffres = ref([])
const offres = ref({})
const chargement = ref(true)
const quantites = ref(Object.fromEntries(props.initial.map((l) => [l.id, String(l.quantite).replace('.', ',')])))
const choixFournisseur = ref(Object.fromEntries(props.initial.filter((l) => l.fournisseurId).map((l) => [l.id, l.fournisseurId])))
const recherche = ref('')

onMounted(async () => {
  const [{ catalogue }, liste] = await Promise.all([chargerCatalogue(), chargerOffres()])
  materiaux.value = Object.entries(catalogue).map(([id, m]) => ({ id, libelle: m.libelle, unite: m.unite, prixUnitaire: m.prixUnitaire }))
    .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'))
  toutesOffres.value = liste
  offres.value = meilleuresOffres(liste)
  chargement.value = false
})

// Offres de chaque produit, une par fournisseur : disponibles d'abord, puis du moins cher au plus cher
const offresDe = computed(() => {
  const g = {}
  for (const o of toutesOffres.value) if (o.materiau_id) (g[o.materiau_id] ||= []).push(o)
  for (const l of Object.values(g)) l.sort((a, b) => (b.disponible - a.disponible) || (a.prix - b.prix))
  return g
})
// Modèles de carreaux en ligne : ajoutés à la liste quand la recherche les vise (modèle ou fournisseur)
const carreaux = computed(() => toutesOffres.value.filter((o) => String(o.materiau_id).startsWith('carreau:')).map((o) => ({
  id: o.materiau_id, libelle: o.libelle || 'Modèle de carreau', unite: o.unite || 'carreau', prixUnitaire: o.prix, carreau: true
})))

const lire = (t) => { const n = Number(String(t ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0 }
const offreChoisie = (m) => offresDe.value[m.id]?.find((o) => o.fournisseur_id === choixFournisseur.value[m.id]) || null
const prixDe = (m) => offreChoisie(m)?.prix ?? offres.value[m.id]?.min ?? m.prixUnitaire
function ajuster(m, sens) {
  const pas = PAS[m.unite] || 1
  const q = Math.max(0, Math.round((lire(quantites.value[m.id]) + sens * pas) * 1000) / 1000)
  quantites.value = { ...quantites.value, [m.id]: q ? String(q).replace('.', ',') : '' }
}

// ---------- Recherche : produit ou fournisseur ----------
const normaliser = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const requete = computed(() => normaliser(recherche.value.trim()))
// fournisseurs dont le nom correspond (2 lettres au moins) : on montre tous leurs produits
const fournisseursTrouves = computed(() => {
  const q = requete.value
  if (q.length < 2) return []
  const vus = new Map()
  for (const o of toutesOffres.value) if (normaliser(o.fournisseur_nom).includes(q)) vus.set(o.fournisseur_id, o.fournisseur_nom)
  return [...vus].map(([id, nom]) => ({ id, nom }))
})
const chezTrouve = (m) => fournisseursTrouves.value.some((f) => offresDe.value[m.id]?.some((o) => o.fournisseur_id === f.id))
const tous = computed(() => [...materiaux.value, ...carreaux.value])
const liste = computed(() => {
  const q = requete.value
  if (!q) return materiaux.value
  return tous.value.filter((m) => normaliser(m.libelle).includes(q) || chezTrouve(m))
})
// un seul fournisseur cherché : ses prix sont affichés, et il est retenu pour ce que le client ajoute
const fournisseurCherche = computed(() => (fournisseursTrouves.value.length === 1 ? fournisseursTrouves.value[0] : null))
const offreChez = (m, fid) => offresDe.value[m.id]?.find((o) => o.fournisseur_id === fid) || null

const choisis = computed(() => tous.value.filter((m) => lire(quantites.value[m.id]) > 0)
  .map((m) => ({ ...m, quantite: lire(quantites.value[m.id]), prixUnitaire: prixDe(m), fournisseurId: choixFournisseur.value[m.id] || null })))
const estimation = computed(() => choisis.value.reduce((s, m) => s + m.quantite * m.prixUnitaire, 0))

// Quantité tapée ou + : avec un fournisseur recherché qui vend ce produit, il est retenu pour ce produit
function surQuantite(m) {
  const f = fournisseurCherche.value
  if (f && lire(quantites.value[m.id]) > 0 && !choixFournisseur.value[m.id] && offreChez(m, f.id)) choixFournisseur.value = { ...choixFournisseur.value, [m.id]: f.id }
}
function plus(m) { ajuster(m, 1); surQuantite(m) }

// ---------- Offres en photos (une par fournisseur, qui défilent) ----------
const ouvert = ref('')
// Fenêtre superposée (fond flouté) : un produit, une offre à la fois ; les fournisseurs se parcourent par les onglets,
// les flèches (écran et clavier) ou en glissant la photo. Ouverte sur le fournisseur déjà choisi, sinon le moins cher.
const produitOuvert = computed(() => tous.value.find((m) => m.id === ouvert.value) || null)
const offresOuvertes = computed(() => (produitOuvert.value ? offresDe.value[produitOuvert.value.id] || [] : []))
const index = ref(0)
const offreVue = computed(() => offresOuvertes.value[index.value] || null)
const prixMin = computed(() => Math.min(...offresOuvertes.value.filter((o) => o.disponible).map((o) => o.prix), Infinity))
const sens = ref(1) // sens du défilement, pour l'animation de la photo
const boutonFermer = ref(null)
let declencheur = null
function ouvrirOffres(m, e) {
  declencheur = e?.currentTarget || null
  ouvert.value = m.id
  const i = (offresDe.value[m.id] || []).findIndex((o) => o.fournisseur_id === choixFournisseur.value[m.id])
  index.value = Math.max(0, i)
  document.body.style.overflow = 'hidden'
  nextTick(() => boutonFermer.value?.focus())
}
function fermerOffres() {
  if (!ouvert.value) return
  ouvert.value = ''
  document.body.style.overflow = ''
  declencheur?.focus?.()
}
function allerA(i) {
  const n = offresOuvertes.value.length
  if (!n) return
  const cible = (i + n) % n
  sens.value = cible > index.value || (index.value === n - 1 && cible === 0) ? 1 : -1
  index.value = cible
}
function surTouche(e) {
  if (e.key === 'Escape') fermerOffres()
  else if (e.key === 'ArrowRight') allerA(index.value + 1)
  else if (e.key === 'ArrowLeft') allerA(index.value - 1)
}
// glisser la photo du doigt : offre suivante / précédente
let departGlisse = null
const debutGlisse = (e) => { departGlisse = e.touches?.[0]?.clientX ?? null }
function finGlisse(e) {
  const x = e.changedTouches?.[0]?.clientX
  if (departGlisse == null || x == null) return
  if (Math.abs(x - departGlisse) > 40) allerA(index.value + (x < departGlisse ? 1 : -1))
  departGlisse = null
}
onBeforeUnmount(() => { document.body.style.overflow = '' })

function choisirFournisseur(m, o) {
  if (choixFournisseur.value[m.id] === o.fournisseur_id) {
    const { [m.id]: _, ...reste } = choixFournisseur.value
    choixFournisseur.value = reste
    return
  }
  choixFournisseur.value = { ...choixFournisseur.value, [m.id]: o.fournisseur_id }
  if (!lire(quantites.value[m.id])) ajuster(m, 1)
}

const valider = () => { if (choisis.value.length) emit('valider', choisis.value) }
</script>

<template>
  <div class="cd">
    <div class="cd-tete">
      <div>
        <h2 class="assistant-question assistant-focus" tabindex="-1">De quoi avez-vous besoin ?</h2>
        <p class="assistant-aide">Indiquez vos quantités : vous verrez le prix exact et la disponibilité chez chaque fournisseur.</p>
      </div>
      <label class="cd-recherche">
        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
        <input v-model="recherche" type="search" placeholder="Un matériau ou un fournisseur" aria-label="Rechercher un matériau ou un fournisseur" />
      </label>
    </div>

    <p v-if="fournisseursTrouves.length" class="cd-fournisseur" role="status">
      <i class="fa-solid fa-store" aria-hidden="true"></i>
      <span v-if="fournisseurCherche">Les produits de <strong>{{ fournisseurCherche.nom }}</strong> · {{ liste.length }} produit{{ liste.length > 1 ? 's' : '' }}</span>
      <span v-else>Produits de {{ fournisseursTrouves.map((f) => f.nom).join(', ') }}</span>
    </p>

    <div v-if="chargement" class="cd-chargement"><span class="spinner spinner-grand"></span></div>
    <p v-else-if="!liste.length" class="cd-vide">Aucun matériau ni fournisseur ne correspond à « {{ recherche }} ».</p>
    <ul v-else class="cd-liste">
      <li v-for="m in liste" :key="m.id" class="cd-materiau" :class="{ choisi: lire(quantites[m.id]) > 0 }">
        <div class="cd-ligne">
          <span class="cd-icone"><i :class="icone(m)" aria-hidden="true"></i></span>
          <span class="cd-texte">
            <strong>{{ m.libelle }}</strong>
            <small v-if="offreChoisie(m)">Chez <b class="cd-chez">{{ offreChoisie(m).fournisseur_nom }}</b> · {{ formaterEuros(offreChoisie(m).prix) }} / {{ uniteLisible(m.unite) }}</small>
            <small v-else-if="fournisseurCherche && offreChez(m, fournisseurCherche.id)">{{ formaterEuros(offreChez(m, fournisseurCherche.id).prix) }} / {{ uniteLisible(m.unite) }} chez {{ fournisseurCherche.nom }}</small>
            <small v-else-if="offres[m.id]">Dès <b>{{ formaterEuros(offres[m.id].min) }}</b> / {{ uniteLisible(m.unite) }} · {{ offres[m.id].fournisseurs }} fournisseur{{ offres[m.id].fournisseurs > 1 ? 's' : '' }} en stock</small>
            <small v-else>Prix de référence {{ formaterEuros(m.prixUnitaire) }} / {{ uniteLisible(m.unite) }}</small>
            <button v-if="offresDe[m.id]?.length" type="button" class="cd-offres-lien" aria-haspopup="dialog" @click="ouvrirOffres(m, $event)">
              <i class="fa-regular fa-images" aria-hidden="true"></i> Voir {{ offresDe[m.id].length > 1 ? `les ${offresDe[m.id].length} offres` : 'l’offre' }}
            </button>
          </span>
          <span class="cd-quantite" :class="{ 'unite-longue': String(m.unite).length > 3 }">
            <button type="button" :aria-label="`Moins de ${m.libelle}`" :disabled="!lire(quantites[m.id])" @click="ajuster(m, -1)"><i class="fa-solid fa-minus"></i></button>
            <input v-model="quantites[m.id]" inputmode="decimal" placeholder="0" :aria-label="`Quantité de ${m.libelle} (${m.unite})`" @change="surQuantite(m)" />
            <span class="cd-unite">{{ m.unite }}</span>
            <button type="button" :aria-label="`Plus de ${m.libelle}`" @click="plus(m)"><i class="fa-solid fa-plus"></i></button>
          </span>
        </div>
      </li>
    </ul>

    <div class="cd-pied" :class="{ actif: choisis.length }">
      <span>
        <strong>{{ choisis.length }} matériau{{ choisis.length > 1 ? 'x' : '' }}</strong>
        <small v-if="choisis.length">à partir de {{ formaterEuros(estimation) }} · 0 € de frais</small>
        <small v-else>Choisissez au moins un matériau</small>
      </span>
      <button type="button" class="btn btn-primaire" :disabled="!choisis.length" @click="valider">Comparer<span class="cd-long"> les fournisseurs</span> <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
    </div>

    <!-- Offres d'un produit : fenêtre superposée, fond flouté. En haut le produit ; des onglets, un par fournisseur (prix,
         « moins cher ») ; au centre SA photo et son offre ; en bas la quantité et « Choisir ce fournisseur ». -->
    <Teleport to="body">
      <transition name="cdo">
        <div v-if="produitOuvert" class="cdo-fond" @click.self="fermerOffres" @keydown="surTouche">
          <section class="cdo" role="dialog" aria-modal="true" aria-labelledby="cdo-titre">
            <header class="cdo-tete">
              <span class="cdo-icone"><i :class="icone(produitOuvert)" aria-hidden="true"></i></span>
              <span class="cdo-titres">
                <h2 id="cdo-titre">{{ produitOuvert.libelle }}</h2>
                <small>{{ offresOuvertes.length }} fournisseur{{ offresOuvertes.length > 1 ? 's' : '' }}<template v-if="prixMin < Infinity"> · dès {{ formaterEuros(prixMin) }} / {{ uniteLisible(produitOuvert.unite) }}</template></small>
              </span>
              <button ref="boutonFermer" type="button" class="cdo-fermer" aria-label="Fermer" @click="fermerOffres"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
            </header>

            <!-- un onglet par fournisseur : on voit d'un coup d'œil qui le vend et à quel prix -->
            <div v-if="offresOuvertes.length > 1" class="cdo-onglets" role="tablist" aria-label="Fournisseurs">
              <button
                v-for="(o, i) in offresOuvertes" :key="o.fournisseur_id" type="button" role="tab" class="cdo-onglet"
                :class="{ actif: i === index, rupture: !o.disponible }" :aria-selected="i === index" @click="allerA(i)"
              >
                <span class="cdo-onglet-nom">
                  <i v-if="choixFournisseur[produitOuvert.id] === o.fournisseur_id" class="fa-solid fa-circle-check" aria-label="Choisi"></i>
                  {{ o.fournisseur_nom }}
                </span>
                <span class="cdo-onglet-prix">{{ o.disponible ? formaterEuros(o.prix) : 'Rupture' }}</span>
                <em v-if="o.disponible && o.prix === prixMin && offresOuvertes.length > 1" class="cdo-moins-cher">Moins cher</em>
              </button>
            </div>

            <transition :name="sens > 0 ? 'cdo-suivant' : 'cdo-precedent'" mode="out-in">
              <article v-if="offreVue" :key="offreVue.fournisseur_id" class="cdo-offre" role="tabpanel">
                <div class="cdo-photo" @touchstart.passive="debutGlisse" @touchend="finGlisse">
                  <img v-if="offreVue.photo_url" :src="offreVue.photo_url" :alt="`${produitOuvert.libelle} chez ${offreVue.fournisseur_nom}`" decoding="async" />
                  <span v-else class="cdo-photo-vide"><i :class="icone(produitOuvert)" aria-hidden="true"></i><small>Pas encore de photo</small></span>
                  <template v-if="offresOuvertes.length > 1">
                    <button type="button" class="cdo-fleche gauche" aria-label="Fournisseur précédent" @click="allerA(index - 1)"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
                    <button type="button" class="cdo-fleche droite" aria-label="Fournisseur suivant" @click="allerA(index + 1)"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
                    <span class="cdo-compteur">{{ index + 1 }} / {{ offresOuvertes.length }}</span>
                  </template>
                </div>
                <div class="cdo-infos">
                  <p class="cdo-fournisseur"><i class="fa-solid fa-store" aria-hidden="true"></i> {{ offreVue.fournisseur_nom }}</p>
                  <p class="cdo-lieu">
                    <span><i class="fa-solid fa-location-dot" aria-hidden="true"></i> {{ offreVue.commune || 'Mayotte' }}</span>
                    <span v-if="offreVue.livraison"><i class="fa-solid fa-truck" aria-hidden="true"></i> Livraison possible</span>
                  </p>
                  <p class="cdo-prix"><strong>{{ formaterEuros(offreVue.prix) }}</strong><span>/ {{ uniteLisible(produitOuvert.unite) }}</span></p>
                  <p class="cdo-dispo" :class="{ rupture: !offreVue.disponible }">
                    <i :class="offreVue.disponible ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-xmark'" aria-hidden="true"></i>
                    {{ offreVue.disponible ? 'En stock' : 'En rupture chez ce fournisseur' }}
                  </p>
                  <p v-if="offreVue.description" class="cdo-description">{{ offreVue.description }}</p>
                  <p v-else class="cdo-description vide">Le fournisseur n’a pas encore ajouté de description.</p>
                </div>
              </article>
            </transition>

            <footer class="cdo-pied">
              <span class="cd-quantite" :class="{ 'unite-longue': String(produitOuvert.unite).length > 3 }">
                <button type="button" :aria-label="`Moins de ${produitOuvert.libelle}`" :disabled="!lire(quantites[produitOuvert.id])" @click="ajuster(produitOuvert, -1)"><i class="fa-solid fa-minus"></i></button>
                <input v-model="quantites[produitOuvert.id]" inputmode="decimal" placeholder="0" :aria-label="`Quantité de ${produitOuvert.libelle} (${produitOuvert.unite})`" />
                <span class="cd-unite">{{ produitOuvert.unite }}</span>
                <button type="button" :aria-label="`Plus de ${produitOuvert.libelle}`" @click="ajuster(produitOuvert, 1)"><i class="fa-solid fa-plus"></i></button>
              </span>
              <span v-if="offreVue && lire(quantites[produitOuvert.id])" class="cdo-total">= {{ formaterEuros(lire(quantites[produitOuvert.id]) * offreVue.prix) }}</span>
              <button
                v-if="offreVue" type="button" class="btn cdo-choisir" :class="choixFournisseur[produitOuvert.id] === offreVue.fournisseur_id ? 'btn-secondaire' : 'btn-primaire'"
                :disabled="!offreVue.disponible" @click="choisirFournisseur(produitOuvert, offreVue)"
              >
                <template v-if="choixFournisseur[produitOuvert.id] === offreVue.fournisseur_id"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Choisi · retirer</template>
                <template v-else>Choisir {{ offreVue.fournisseur_nom }}</template>
              </button>
            </footer>
          </section>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<style scoped>
.cd { display: flex; flex-direction: column; gap: 16px; }
.cd-tete { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; }
.cd-recherche { position: relative; flex: 0 1 320px; }
.cd-recherche i { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--gris-500); }
.cd-recherche input { width: 100%; min-height: 44px; padding: 0 14px 0 38px; border: 1px solid var(--gris-300); border-radius: 999px; background: var(--carte); color: var(--ardoise); font: inherit; }
.cd-fournisseur { display: flex; align-items: center; gap: 10px; margin: 0; padding: 10px 14px; border-radius: var(--rayon); background: var(--lagon-50); color: var(--ardoise); font-size: .92rem; }
.cd-fournisseur i { color: var(--lagon-700); }
.cd-vide { margin: 0; padding: 24px; border: 1px dashed var(--gris-300); border-radius: var(--rayon); color: var(--texte-secondaire); text-align: center; }
.cd-chargement { display: grid; place-items: center; min-height: 200px; }
.cd-liste { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 10px; margin: 0; padding: 0; list-style: none; }
.cd-materiau { display: flex; flex-direction: column; gap: 12px; padding: 14px; border: 1.5px solid var(--gris-200); border-radius: var(--rayon); background: var(--carte); transition: border-color var(--transition), background var(--transition); }
.cd-materiau.choisi { border-color: var(--lagon-600); background: var(--lagon-50); }
.cd-ligne { display: flex; align-items: center; gap: 12px; }
.cd-icone { width: 42px; height: 42px; flex: none; display: grid; place-items: center; border-radius: 12px; background: var(--gris-100); color: var(--ardoise); }
.cd-materiau.choisi .cd-icone { background: var(--lagon-600); color: #fff; }
.cd-texte { flex: 1; display: flex; flex-direction: column; align-items: flex-start; min-width: 0; }
.cd-texte strong { color: var(--ardoise); font-size: .95rem; }
.cd-texte small { color: var(--texte-secondaire); font-size: .8rem; }
.cd-texte b { color: #047857; }
.cd-texte b.cd-chez { color: var(--lagon-700); }
.cd-offres-lien { margin-top: 4px; padding: 0; border: 0; background: none; color: var(--lagon-700); font: inherit; font-size: .8rem; font-weight: 700; cursor: pointer; }
.cd-offres-lien:hover { text-decoration: underline; text-underline-offset: 3px; }
.cd-quantite { position: relative; display: inline-flex; align-items: center; gap: 4px; }
.cd-quantite button { width: 34px; height: 34px; border: 1px solid var(--gris-300); border-radius: 10px; background: var(--carte); color: var(--ardoise); cursor: pointer; }
.cd-quantite button:disabled { opacity: .4; cursor: default; }
.cd-quantite input { width: 78px; min-height: 36px; padding: 0 30px 0 8px; border: 1px solid var(--gris-300); border-radius: 10px; background: var(--carte); color: var(--ardoise); font: inherit; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }
.cd-quantite input:focus { outline: none; border-color: var(--lagon-500); box-shadow: 0 0 0 3px rgba(6, 182, 212, .15); }
.cd-unite { position: absolute; right: 44px; font-size: .72rem; color: var(--gris-500); pointer-events: none; }
/* unité longue (carreau, carton, palette…) : le champ s'élargit pour qu'elle ne recouvre pas le chiffre */
.unite-longue input { width: 118px; padding-right: 60px; }

/* ---------- Fenêtre des offres d'un produit ----------
   Fond flouté ; carte large sur ordinateur (photo à gauche, offre à droite), feuille qui monte du bas sur téléphone. */
.cdo-fond {
  position: fixed; inset: 0; z-index: 300; display: grid; place-items: center; padding: 24px;
  background: rgba(6, 32, 44, .55); backdrop-filter: blur(10px) saturate(120%); -webkit-backdrop-filter: blur(10px) saturate(120%);
}
.cdo {
  display: flex; flex-direction: column; width: min(880px, 100%); max-height: calc(100dvh - 48px); overflow: hidden;
  border-radius: 24px; background: var(--carte); color: var(--ardoise); box-shadow: 0 30px 80px rgba(6, 32, 44, .4);
}
.cdo-tete { display: flex; align-items: center; gap: 14px; padding: 20px 20px 16px 24px; border-bottom: 1px solid var(--bordure); }
.cdo-icone { display: grid; place-items: center; flex: none; width: 44px; height: 44px; border-radius: 12px; background: var(--lagon-50); color: var(--lagon-700); }
.cdo-titres { flex: 1; min-width: 0; }
.cdo-titres h2 { margin: 0; font-size: 1.45rem; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cdo-titres small { color: var(--texte-secondaire); font-size: .85rem; }
.cdo-fermer { display: grid; place-items: center; flex: none; width: 40px; height: 40px; border: 0; border-radius: 50%; background: var(--gris-100); color: var(--ardoise); cursor: pointer; }
.cdo-fermer:hover { background: var(--gris-200); }

/* onglets : un par fournisseur, avec son prix */
.cdo-onglets { display: flex; gap: 8px; padding: 22px 24px 2px; overflow-x: auto; scrollbar-width: none; } /* haut : place pour « Moins cher » */
.cdo-onglets::-webkit-scrollbar { display: none; }
.cdo-onglet {
  position: relative; display: flex; flex: none; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 132px; padding: 10px 14px;
  border: 1.5px solid var(--bordure); border-radius: 14px; background: var(--carte); color: var(--ardoise); font: inherit; text-align: left; cursor: pointer;
  transition: border-color .15s, background .15s;
}
.cdo-onglet:hover { border-color: var(--gris-300); }
.cdo-onglet.actif { border-color: var(--lagon-600); background: var(--lagon-50); }
.cdo-onglet.rupture { opacity: .6; }
.cdo-onglet-nom { display: flex; align-items: center; gap: 6px; font-size: .85rem; font-weight: 700; white-space: nowrap; }
.cdo-onglet-nom i { color: var(--lagon-600); }
.cdo-onglet-prix { color: var(--texte-secondaire); font-size: .82rem; font-variant-numeric: tabular-nums; }
.cdo-moins-cher { position: absolute; top: -9px; right: 10px; padding: 1px 8px; border-radius: 999px; background: #d1fae5; color: #065f46; font-style: normal; font-size: .66rem; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; }

/* l'offre : la photo du fournisseur, puis ce qu'il propose */
.cdo-offre { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 24px; padding: 18px 24px; overflow-y: auto; }
.cdo-photo { position: relative; aspect-ratio: 4 / 3; overflow: hidden; border-radius: 18px; background: var(--gris-100); }
.cdo-photo img { width: 100%; height: 100%; object-fit: cover; }
.cdo-photo-vide { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--gris-400); font-size: 2.6rem; }
.cdo-photo-vide small { font-size: .8rem; }
.cdo-fleche {
  position: absolute; top: 50%; z-index: 2; display: grid; place-items: center; width: 40px; height: 40px; transform: translateY(-50%);
  border: 0; border-radius: 50%; background: rgba(255, 255, 255, .92); color: #0f172a; box-shadow: 0 6px 18px rgba(15, 23, 42, .2); cursor: pointer;
}
.cdo-fleche.gauche { left: 12px; }
.cdo-fleche.droite { right: 12px; }
.cdo-compteur { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); padding: 3px 10px; border-radius: 999px; background: rgba(15, 23, 42, .6); color: #fff; font-size: .75rem; font-weight: 700; }
.cdo-infos { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.cdo-infos p { margin: 0; }
.cdo-fournisseur { display: flex; align-items: center; gap: 8px; font-family: var(--font-display); font-size: 1.6rem; font-weight: 700; line-height: 1.1; }
.cdo-fournisseur i { color: var(--lagon-600); font-size: 1.1rem; }
.cdo-lieu { display: flex; flex-wrap: wrap; gap: 6px 14px; color: var(--texte-secondaire); font-size: .88rem; }
.cdo-lieu i { margin-right: 4px; color: var(--gris-400); }
.cdo-prix { display: flex; align-items: baseline; gap: 6px; }
.cdo-prix strong { font-size: 2rem; line-height: 1; font-variant-numeric: tabular-nums; }
.cdo-prix span { color: var(--texte-secondaire); }
.cdo-dispo { display: inline-flex; align-self: flex-start; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; background: rgba(16, 185, 129, .12); color: #047857; font-size: .8rem; font-weight: 700; }
.cdo-dispo.rupture { background: rgba(225, 29, 72, .1); color: #be123c; }
.cdo-description { color: var(--ardoise-2); font-size: .92rem; line-height: 1.6; }
.cdo-description.vide { color: var(--gris-400); font-style: italic; }

/* bas : quantité, total, choix */
.cdo-pied { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 16px 24px 20px; border-top: 1px solid var(--bordure); }
.cdo-total { color: var(--texte-secondaire); font-weight: 700; font-variant-numeric: tabular-nums; }
.cdo-choisir { margin-left: auto; min-height: 48px; border-radius: 999px; }

/* apparition : fond en fondu, carte qui monte ; défilement des offres : glissé dans le sens du parcours */
.cdo-enter-active, .cdo-leave-active { transition: opacity .22s ease; }
.cdo-enter-active .cdo, .cdo-leave-active .cdo { transition: transform .28s cubic-bezier(.22, .61, .36, 1); }
.cdo-enter-from, .cdo-leave-to { opacity: 0; }
.cdo-enter-from .cdo, .cdo-leave-to .cdo { transform: translateY(24px) scale(.98); }
.cdo-suivant-enter-active, .cdo-suivant-leave-active, .cdo-precedent-enter-active, .cdo-precedent-leave-active { transition: opacity .18s ease, transform .18s ease; }
.cdo-suivant-enter-from, .cdo-precedent-leave-to { opacity: 0; transform: translateX(24px); }
.cdo-suivant-leave-to, .cdo-precedent-enter-from { opacity: 0; transform: translateX(-24px); }
@media (prefers-reduced-motion: reduce) { .cdo-enter-active, .cdo-leave-active, .cdo-suivant-enter-active, .cdo-suivant-leave-active, .cdo-precedent-enter-active, .cdo-precedent-leave-active { transition: none; } }

/* téléphone : feuille qui monte du bas, photo en haut, offre dessous, choix collé en bas */
@media (max-width: 699px) {
  .cdo-fond { align-items: end; padding: 0; }
  .cdo { width: 100%; max-height: 92dvh; border-radius: 24px 24px 0 0; }
  .cdo-tete { padding: 16px 16px 12px; }
  .cdo-titres h2 { font-size: 1.2rem; white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .cdo-onglets { padding: 20px 16px 2px; }
  .cdo-offre { grid-template-columns: 1fr; gap: 14px; padding: 14px 16px; }
  .cdo-fleche { display: none; } /* au doigt, on glisse la photo */
  .cdo-fournisseur { font-size: 1.35rem; }
  .cdo-prix strong { font-size: 1.7rem; }
  .cdo-pied { padding: 12px 16px calc(14px + env(safe-area-inset-bottom)); }
  .cdo-choisir { flex: 1 1 100%; margin-left: 0; }
}

.cd-pied {
  position: sticky; bottom: calc(16px + var(--barre-onglets, 0px)); z-index: 5; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px;
  padding: 14px 18px; border-radius: var(--rayon-lg); background: var(--carte); box-shadow: 0 12px 40px rgba(15, 23, 42, .15);
}
.cd-pied.actif { background: var(--encre); color: #fff; }
.cd-pied > span { display: flex; flex-direction: column; }
.cd-pied small { opacity: .75; font-size: .82rem; }
/* Téléphone : nom et prix sur toute la largeur, quantité dessous avec de grandes touches ; barre du bas fine */
@media (max-width: 599px) {
  .cd-tete { display: block; }
  .cd-tete .assistant-aide { margin-bottom: 12px; }
  .cd-recherche input { font-size: 1rem; } /* 16 px : pas de zoom automatique sur iPhone */
  .cd-liste { grid-template-columns: 1fr; gap: 8px; }
  .cd-materiau { padding: 12px; }
  .cd-ligne { display: grid; grid-template-columns: 42px minmax(0, 1fr); gap: 10px 12px; }
  .cd-quantite { grid-column: 1 / -1; justify-content: flex-end; gap: 6px; }
  .cd-quantite button { width: 44px; height: 44px; font-size: 1rem; }
  .cd-quantite input { flex: 1; max-width: 140px; min-height: 44px; font-size: 1rem; }
  .cd-unite { right: 58px; }
  .cd-fleche { display: none; } /* au doigt, on fait glisser */
  .cd-pied { bottom: var(--barre-onglets, 0px); margin: 0 calc(-1 * var(--gouttiere, 16px)); padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); border-radius: 0; box-shadow: 0 -6px 24px rgba(15, 23, 42, .14); flex-wrap: nowrap; }
  .cd-pied > span { flex: 1; min-width: 0; }
  .cd-pied small { font-size: .78rem; }
  .cd-pied .btn { flex: none; padding-left: 16px; padding-right: 16px; }
  .cd-pied .cd-long { display: none; }
}
</style>

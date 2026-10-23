<script setup>
/**
 * Carreaux du fournisseur (migration 0029) : les modèles qu'il met en ligne, choisis par les clients dans le
 * calculateur (carrelage). Chaque modèle : nom, format, finition, couleur ou photo, vendu au carreau ou au carton
 * (carreaux par carton), et son prix : celui du fournisseur, appliqué en caisse. Un modèle masqué ou en rupture
 * n'est plus proposé.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useAdmin } from '@/composables/useAdmin.js'
import { useAuth } from '@/composables/useAuth.js'
import { formaterEuros, formaterNombre } from '@/services/calculs/moteurCalculs.js'
import * as api from '@/services/supabase/serviceCarreaux.js'
import AdminPanneau from '@/composants/admin/AdminPanneau.vue'

const props = defineProps({ recherche: { type: String, default: '' } })
const { notifier, confirmer } = useAdmin()
const { fournisseurLie, utilisateur } = useAuth()

const carreaux = ref([])
const chargement = ref(true)
const erreurChargement = ref('')
async function recharger() {
  try {
    carreaux.value = await api.listerMesCarreaux(fournisseurLie.value)
    erreurChargement.value = ''
  } catch (e) {
    erreurChargement.value = e?.message || 'Vos carreaux n’ont pas pu être chargés.'
  } finally {
    chargement.value = false
  }
}
onMounted(recharger)

const FORMATS = Object.keys(api.FORMATS_CARREAUX)
const normaliser = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const filtreFormat = ref('tous')
const liste = computed(() => {
  const q = normaliser(props.recherche.trim())
  return carreaux.value.filter((c) => (filtreFormat.value === 'tous' || c.format === filtreFormat.value)
    && (!q || [c.nom, c.finition].some((t) => normaliser(t).includes(q))))
})
const compte = (f) => carreaux.value.filter((c) => c.format === f).length

// ---------- Création / modification ----------
const formulaire = ref(null)
const erreurForm = ref('')
const enregistrement = ref(false)
const envoiPhoto = ref(false)
const texteNombre = (n) => (n == null ? '' : String(n).replace('.', ','))
const lireNombre = (t) => (String(t ?? '').trim() === '' ? null : Number(String(t).replace(',', '.')))

function ouvrir(c = null) {
  erreurForm.value = ''
  prixCarreauBase = null
  formulaire.value = c
    ? { ...c, finition: c.finition || '', prix: texteNombre(c.prix_unitaire), vente: c.carreaux_par_carton ? 'carton' : 'carreau', parCarton: c.carreaux_par_carton ? String(c.carreaux_par_carton) : '', stockSaisi: texteNombre(c.stock) }
    : { id: null, nom: '', format: '60x60', finition: '', couleur: '#e9e5de', photo_url: '', prix: '', vente: 'carreau', parCarton: '', stockSaisi: '', rupture: false, actif: true }
}
// Vente au carton : nombre de carreaux par carton (2 à 200), null sinon
const parCartonSaisi = computed(() => {
  const f = formulaire.value
  const n = Number(String(f?.parCarton ?? '').trim())
  return f?.vente === 'carton' && Number.isInteger(n) && n >= 2 && n <= 200 ? n : null
})
// Passage carreau ⇄ carton : le prix est converti tout seul (prix du carreau × carreaux par carton, et l'inverse).
// Le prix du carreau est gardé tant que le fournisseur ne retouche pas le prix : changer le nombre de carreaux
// par carton recalcule alors le prix du carton.
const arrondi = (n) => Math.round(n * 100) / 100
let prixCarreauBase = null
function choisirVente(v) {
  const f = formulaire.value
  if (f.vente === v) return
  const prix = lireNombre(f.prix)
  if (v === 'carton') {
    prixCarreauBase = prix > 0 ? prix : null
    f.vente = v
    if (prixCarreauBase && parCartonSaisi.value) f.prix = texteNombre(arrondi(prixCarreauBase * parCartonSaisi.value))
  } else {
    if (prix > 0 && parCartonSaisi.value) f.prix = texteNombre(arrondi(prix / parCartonSaisi.value))
    prixCarreauBase = null
    f.vente = v
  }
}
const oublierPrixCarreau = () => { prixCarreauBase = null } // prix du carton saisi à la main : il fait foi
watch(parCartonSaisi, (n) => {
  if (n && prixCarreauBase) formulaire.value.prix = texteNombre(arrondi(prixCarreauBase * n))
})
// Prix d'un carreau quand le modèle est vendu au carton (aide sous le prix)
const prixDuCarreau = computed(() => {
  const p = lireNombre(formulaire.value?.prix)
  return p > 0 && parCartonSaisi.value ? arrondi(p / parCartonSaisi.value) : null
})

// Modèle tel qu'il sera enregistré, pour les aides sous le prix (m² au carton, prix au m²)
const apercuVente = computed(() => {
  const f = formulaire.value
  const p = lireNombre(f?.prix)
  return f && p > 0 && (f.vente === 'carreau' || parCartonSaisi.value) ? { prix_unitaire: p, format: f.format, carreaux_par_carton: parCartonSaisi.value } : null
})

async function choisirPhoto(e) {
  const fichier = e.target.files?.[0]
  e.target.value = ''
  if (!fichier) return
  envoiPhoto.value = true
  try {
    const { url } = await api.televerserPhotoCarreau(fichier, utilisateur.value.id)
    formulaire.value.photo_url = url
  } catch (err) {
    erreurForm.value = err?.message || 'La photo n’a pas pu être envoyée.'
  } finally {
    envoiPhoto.value = false
  }
}

async function enregistrer() {
  const f = formulaire.value
  const prix = lireNombre(f.prix)
  const stock = lireNombre(f.stockSaisi)
  erreurForm.value = f.nom.trim().length < 2 ? 'Donnez un nom au modèle.'
    : f.vente === 'carton' && !parCartonSaisi.value ? 'Indiquez le nombre de carreaux par carton (de 2 à 200).'
    : !(prix > 0) ? `Indiquez le prix d’un ${f.vente} (supérieur à 0).`
    : stock !== null && !(stock >= 0) ? 'Le stock doit être un nombre positif, ou vide s’il n’est pas suivi.' : ''
  if (erreurForm.value) return
  enregistrement.value = true
  try {
    await api.enregistrerCarreau(fournisseurLie.value, { ...f, prix_unitaire: prix, prix_comptoir: null, carreaux_par_carton: parCartonSaisi.value, stock })
    await recharger()
    notifier(f.id ? 'Modèle modifié.' : 'Modèle ajouté : il est proposé dans le calculateur.')
    formulaire.value = null
  } catch (e) {
    erreurForm.value = e?.message || 'Enregistrement impossible.'
  } finally {
    enregistrement.value = false
  }
}

async function basculer(c, champ) {
  try {
    await api.enregistrerCarreau(fournisseurLie.value, { ...c, [champ]: !c[champ] })
    c[champ] = !c[champ]
    notifier(champ === 'actif'
      ? (c.actif ? `« ${c.nom} » est de nouveau proposé.` : `« ${c.nom} » est masqué du calculateur.`)
      : (c.rupture ? `« ${c.nom} » marqué en rupture.` : `« ${c.nom} » de nouveau disponible.`), 'info')
  } catch (e) { notifier(e?.message || 'Modification impossible.', 'erreur') }
}

// « Nouveau modèle » est dans la barre du catalogue, au-dessus des onglets
defineExpose({ ouvrir })

async function supprimer(c) {
  if (!(await confirmer({ titre: 'Supprimer ce modèle ?', texte: `« ${c.nom} » ne sera plus proposé. Les devis déjà faits le gardent, mais vous ne pourrez plus l’encaisser.`, libelle: 'Supprimer', danger: true }))) return
  try {
    await api.supprimerCarreau(c.id)
    await recharger()
    notifier('Modèle supprimé.')
  } catch (e) { notifier(e?.message || 'Suppression impossible.', 'erreur') }
}
</script>

<template>
  <div class="car">
    <div class="car-barre">
      <div class="adm-pilules" role="group" aria-label="Filtrer par format">
        <button type="button" class="adm-pilule" :class="{ actif: filtreFormat === 'tous' }" @click="filtreFormat = 'tous'">Tous <small>{{ carreaux.length }}</small></button>
        <button v-for="f in FORMATS" :key="f" type="button" class="adm-pilule" :class="{ actif: filtreFormat === f }" @click="filtreFormat = f">{{ api.libelleFormat(f) }} <small>{{ compte(f) }}</small></button>
      </div>
    </div>

    <div v-if="chargement" class="adm-carte adm-vide"><span class="spinner" aria-hidden="true"></span></div>
    <div v-else-if="erreurChargement" class="adm-carte adm-vide"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><p>{{ erreurChargement }}</p></div>
    <div v-else-if="!carreaux.length" class="adm-carte car-vide">
      <span class="car-vide-icone"><i class="fa-solid fa-table-cells" aria-hidden="true"></i></span>
      <h2>Aucun modèle de carreaux</h2>
      <p>Mettez vos carreaux en ligne, au carreau ou au carton : les clients les choisissent dans le calculateur et viennent les retirer chez vous avec leur code.</p>
      <button type="button" class="adm-btn adm-btn-noir" @click="ouvrir()"><i class="fa-solid fa-plus" aria-hidden="true"></i> Ajouter mon premier modèle</button>
    </div>
    <div v-else-if="!liste.length" class="adm-carte adm-vide"><i class="fa-solid fa-table-cells" aria-hidden="true"></i><p>Aucun modèle ne correspond.</p></div>

    <ul v-else class="car-grille">
      <li v-for="c in liste" :key="c.id" class="adm-carte car-carte" :class="{ masque: !c.actif }">
        <span class="car-visuel" :style="{ '--teinte': c.couleur }" aria-hidden="true">
          <img v-if="c.photo_url" :src="c.photo_url" alt="" loading="lazy" />
          <span class="car-badges">
            <em v-if="!c.actif" class="adm-badge">Masqué</em>
            <em v-if="c.rupture || c.stock === 0" class="adm-badge car-rupture">Rupture</em>
          </span>
        </span>
        <div class="car-corps">
          <strong>{{ c.nom }}</strong>
          <small>{{ [api.libelleFormat(c.format), c.finition].filter(Boolean).join(' · ') }}</small>
          <p class="car-prix"><b>{{ formaterEuros(c.prix_unitaire) }}</b> {{ api.libelleVente(c) }} <span>≈ {{ formaterEuros(api.prixAuM2(c)) }} / m²</span></p>
          <small v-if="c.stock != null">Stock : {{ formaterNombre(c.stock) }} {{ api.uniteVente(c) }}{{ c.stock > 1 ? 's' : '' }}</small>
        </div>
        <div class="car-pied">
          <label class="car-interrupteur"><button type="button" role="switch" class="adm-interrupteur" :aria-checked="c.actif" :aria-label="`Proposer ${c.nom}`" @click="basculer(c, 'actif')"></button> Proposé</label>
          <label class="car-interrupteur"><button type="button" role="switch" class="adm-interrupteur" :aria-checked="c.rupture" :aria-label="`${c.nom} en rupture`" @click="basculer(c, 'rupture')"></button> Rupture</label>
          <span>
            <button type="button" class="adm-icone-btn" :aria-label="`Modifier ${c.nom}`" title="Modifier" @click="ouvrir(c)"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
            <button type="button" class="adm-icone-btn danger" :aria-label="`Supprimer ${c.nom}`" title="Supprimer" @click="supprimer(c)"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
          </span>
        </div>
      </li>
    </ul>

    <AdminPanneau v-if="formulaire" :titre="formulaire.id ? 'Modifier le modèle' : 'Nouveau modèle de carreaux'" sous-titre="Proposé aux clients dans le calculateur, au carreau ou au carton." @fermer="formulaire = null">
      <form id="form-carreau" class="adm-grille-form" novalidate @submit.prevent="enregistrer">
        <div class="adm-champ plein"><label for="ca-nom">Nom du modèle *</label><input id="ca-nom" v-model="formulaire.nom" maxlength="60" placeholder="Ex. : Grès cérame Sable de Moya" /></div>
        <div class="adm-champ plein">
          <span class="adm-champ-label">Format *</span>
          <div class="adm-segments car-formats" role="radiogroup" aria-label="Format">
            <button v-for="f in FORMATS" :key="f" type="button" role="radio" :aria-checked="formulaire.format === f" :aria-selected="formulaire.format === f" @click="formulaire.format = f">{{ api.libelleFormat(f) }}</button>
          </div>
        </div>
        <div class="adm-champ"><label for="ca-fin">Finition</label><input id="ca-fin" v-model="formulaire.finition" maxlength="40" placeholder="Ex. : Mat, imitation bois" /></div>
        <div class="adm-champ"><label for="ca-coul">Couleur dominante</label><input id="ca-coul" v-model="formulaire.couleur" type="color" class="car-couleur" /></div>
        <div class="adm-champ plein">
          <span class="adm-champ-label">Photo (facultative)</span>
          <div class="car-photo">
            <span class="car-visuel petit" :style="{ '--teinte': formulaire.couleur }" aria-hidden="true"><img v-if="formulaire.photo_url" :src="formulaire.photo_url" alt="" /></span>
            <label class="adm-btn adm-btn-clair">
              <span v-if="envoiPhoto" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-camera" aria-hidden="true"></i>
              {{ formulaire.photo_url ? 'Changer la photo' : 'Ajouter une photo' }}
              <input type="file" accept="image/jpeg,image/png,image/webp" class="visually-hidden" :disabled="envoiPhoto" @change="choisirPhoto" />
            </label>
            <button v-if="formulaire.photo_url" type="button" class="adm-btn adm-btn-clair" @click="formulaire.photo_url = ''">Retirer</button>
          </div>
          <span class="adm-champ-aide"><span>Sans photo, le client voit la couleur choisie.</span></span>
        </div>
        <div class="adm-champ plein">
          <span class="adm-champ-label">Vendu *</span>
          <div class="adm-segments car-formats" role="radiogroup" aria-label="Vendu">
            <button v-for="v in ['carreau', 'carton']" :key="v" type="button" role="radio" :aria-checked="formulaire.vente === v" :aria-selected="formulaire.vente === v" @click="choisirVente(v)">
              {{ v === 'carreau' ? 'Au carreau' : 'Au carton' }}
            </button>
          </div>
        </div>
        <div v-if="formulaire.vente === 'carton'" class="adm-champ">
          <label for="ca-carton">Carreaux par carton *</label>
          <input id="ca-carton" v-model="formulaire.parCarton" inputmode="numeric" placeholder="4" />
          <span v-if="parCartonSaisi" class="adm-champ-aide"><span>1 carton = {{ formaterNombre(api.m2ParUnite({ format: formulaire.format, carreaux_par_carton: parCartonSaisi }), 2) }} m²</span></span>
        </div>
        <div class="adm-champ">
          <label for="ca-prix">Prix d’un {{ formulaire.vente }} *</label>
          <span class="adm-saisie-unite"><input id="ca-prix" v-model="formulaire.prix" inputmode="decimal" :placeholder="formulaire.vente === 'carton' ? '39,90' : '2,50'" @input="oublierPrixCarreau" /><span>€</span></span>
          <span v-if="apercuVente" class="adm-champ-aide"><span><template v-if="prixDuCarreau">soit {{ formaterEuros(prixDuCarreau) }} le carreau · </template>≈ {{ formaterEuros(api.prixAuM2(apercuVente)) }} le m²</span></span>
        </div>
        <div class="adm-champ">
          <label for="ca-stock">Stock (facultatif)</label>
          <span class="adm-saisie-unite"><input id="ca-stock" v-model="formulaire.stockSaisi" inputmode="decimal" placeholder="Non suivi" /><span>{{ formulaire.vente }}s</span></span>
          <span class="adm-champ-aide"><span>Baisse à chaque encaissement ; à 0, le modèle passe en rupture.</span></span>
        </div>
        <label class="plein car-option"><button type="button" role="switch" class="adm-interrupteur" :aria-checked="formulaire.actif" @click="formulaire.actif = !formulaire.actif"></button> Proposé dans le calculateur</label>
        <label class="plein car-option"><button type="button" role="switch" class="adm-interrupteur" :aria-checked="formulaire.rupture" @click="formulaire.rupture = !formulaire.rupture"></button> En rupture de stock</label>
      </form>
      <p v-if="erreurForm" class="adm-erreur-texte" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ erreurForm }}</p>
      <template #pied>
        <button type="button" class="adm-btn adm-btn-clair" @click="formulaire = null">Annuler</button>
        <button type="submit" form="form-carreau" class="adm-btn adm-btn-noir" :disabled="enregistrement || envoiPhoto">
          <span v-if="enregistrement" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-check" aria-hidden="true"></i> Enregistrer
        </button>
      </template>
    </AdminPanneau>
  </div>
</template>

<style scoped>
.car { display: flex; flex-direction: column; gap: 18px; }
.car-barre { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }

.car-vide { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 48px 24px; text-align: center; }
.car-vide h2 { margin: 6px 0 0; font-family: var(--font-corps); font-size: 1.2rem; font-weight: 600; }
.car-vide p { margin: 0 0 8px; max-width: 460px; color: var(--adm-encre-2); font-size: .92rem; }
.car-vide-icone { width: 60px; height: 60px; display: grid; place-items: center; border-radius: 18px; background: var(--adm-noir); color: #fff; font-size: 1.4rem; }

.car-grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 16px; margin: 0; padding: 0; list-style: none; }
.car-carte { display: flex; flex-direction: column; padding: 0; overflow: hidden; }
.car-carte.masque { opacity: .62; }
.car-visuel {
  position: relative; display: block; height: 120px;
  background-color: var(--teinte, #e9e5de);
  background-image: linear-gradient(rgba(255,255,255,.55) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,.55) 2px, transparent 2px);
  background-size: 36px 36px;
}
.car-visuel.petit { width: 72px; height: 72px; flex: none; border-radius: 12px; overflow: hidden; }
.car-visuel img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.car-badges { position: absolute; top: 10px; left: 10px; display: flex; gap: 6px; }
.car-rupture { background: var(--adm-danger-fond); color: var(--adm-danger-texte); }
.car-corps { display: flex; flex-direction: column; gap: 3px; padding: 14px 18px 0; }
.car-corps small { color: var(--adm-encre-2); font-size: .82rem; }
.car-prix { margin: 8px 0 0; color: var(--adm-encre-2); font-size: .86rem; }
.car-prix b { color: var(--adm-info-texte); font-size: 1.3rem; font-weight: 600; }
.car-prix span { display: block; color: var(--adm-muet); font-size: .8rem; }
.car-pied { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-top: auto; padding: 12px 18px; border-top: 1px solid var(--adm-ligne-2); color: var(--adm-muet); font-size: .8rem; }
.car-interrupteur, .car-option { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.car-option { gap: 12px; font-size: .92rem; font-weight: 500; }
.car-formats { box-shadow: inset 0 0 0 1px var(--adm-ligne); align-self: flex-start; }
.car-couleur { width: 64px; height: 40px; padding: 2px; cursor: pointer; }
.car-photo { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }

/* Téléphone : une carte par ligne, visuel à gauche, réglages dessous */
@media (max-width: 767px) {
  .car { gap: 12px; }
  .car-barre { gap: 10px; }
  .car-barre > .adm-pilules { flex: 1 1 100%; min-width: 0; }
  .car-grille { grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .car-carte { display: grid; grid-template-columns: 96px minmax(0, 1fr); }
  .car-visuel:not(.petit) { height: auto; min-height: 104px; grid-row: 1; }
  .car-badges { top: 6px; left: 6px; flex-direction: column; align-items: flex-start; }
  .car-corps { padding: 12px 14px; }
  .car-prix { margin-top: 4px; }
  .car-prix b { font-size: 1.15rem; }
  .car-pied { grid-column: 1 / -1; gap: 6px 14px; padding: 8px 10px 8px 14px; }
  .car-pied > span { margin-left: auto; }
  .car-vide { padding: 32px 18px; }
}
</style>

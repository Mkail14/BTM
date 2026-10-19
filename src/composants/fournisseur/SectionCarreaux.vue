<script setup>
/**
 * Carreaux du fournisseur (migration 0029) : les modèles qu'il met en ligne, choisis par les clients dans le
 * calculateur (carrelage). Chaque modèle : nom, format, finition, couleur ou photo, prix d'un carreau
 * (prix BTM, appliqué en caisse) et prix au comptoir facultatif. Un modèle masqué ou en rupture n'est plus proposé.
 */
import { computed, onMounted, ref } from 'vue'
import { useAdmin } from '@/composables/useAdmin.js'
import { useAuth } from '@/composables/useAuth.js'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'
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
  formulaire.value = c
    ? { ...c, finition: c.finition || '', prix: texteNombre(c.prix_unitaire), comptoir: texteNombre(c.prix_comptoir) }
    : { id: null, nom: '', format: '60x60', finition: '', couleur: '#e9e5de', photo_url: '', prix: '', comptoir: '', rupture: false, actif: true }
}
const prixM2 = computed(() => {
  const p = lireNombre(formulaire.value?.prix)
  return p > 0 ? api.prixAuM2({ prix_unitaire: p, format: formulaire.value.format }) : null
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
  const comptoir = lireNombre(f.comptoir)
  erreurForm.value = f.nom.trim().length < 2 ? 'Donnez un nom au modèle.'
    : !(prix > 0) ? 'Indiquez le prix d’un carreau (supérieur à 0).'
    : comptoir != null && !(comptoir >= prix) ? 'Le prix au comptoir doit être au moins égal au prix BTM.' : ''
  if (erreurForm.value) return
  enregistrement.value = true
  try {
    await api.enregistrerCarreau(fournisseurLie.value, { ...f, prix_unitaire: prix, prix_comptoir: comptoir })
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
      <button type="button" class="adm-btn adm-btn-noir" @click="ouvrir()"><i class="fa-solid fa-plus" aria-hidden="true"></i> Nouveau modèle</button>
    </div>

    <div v-if="chargement" class="adm-carte adm-vide"><span class="spinner" aria-hidden="true"></span></div>
    <div v-else-if="erreurChargement" class="adm-carte adm-vide"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><p>{{ erreurChargement }}</p></div>
    <div v-else-if="!carreaux.length" class="adm-carte car-vide">
      <span class="car-vide-icone"><i class="fa-solid fa-table-cells" aria-hidden="true"></i></span>
      <h2>Aucun modèle de carreaux</h2>
      <p>Mettez vos carreaux en ligne avec leur prix à l’unité : les clients les choisissent dans le calculateur et viennent les retirer chez vous avec leur code.</p>
      <button type="button" class="adm-btn adm-btn-noir" @click="ouvrir()"><i class="fa-solid fa-plus" aria-hidden="true"></i> Ajouter mon premier modèle</button>
    </div>
    <div v-else-if="!liste.length" class="adm-carte adm-vide"><i class="fa-solid fa-table-cells" aria-hidden="true"></i><p>Aucun modèle ne correspond.</p></div>

    <ul v-else class="car-grille">
      <li v-for="c in liste" :key="c.id" class="adm-carte car-carte" :class="{ masque: !c.actif }">
        <span class="car-visuel" :style="{ '--teinte': c.couleur }" aria-hidden="true">
          <img v-if="c.photo_url" :src="c.photo_url" alt="" loading="lazy" />
          <span class="car-badges">
            <em v-if="!c.actif" class="adm-badge">Masqué</em>
            <em v-if="c.rupture" class="adm-badge car-rupture">Rupture</em>
          </span>
        </span>
        <div class="car-corps">
          <strong>{{ c.nom }}</strong>
          <small>{{ [api.libelleFormat(c.format), c.finition].filter(Boolean).join(' · ') }}</small>
          <p class="car-prix"><b>{{ formaterEuros(c.prix_unitaire) }}</b> le carreau <span>≈ {{ formaterEuros(api.prixAuM2(c)) }} / m²</span></p>
          <p v-if="c.prix_comptoir" class="car-comptoir">{{ formaterEuros(c.prix_comptoir) }} au comptoir</p>
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

    <AdminPanneau v-if="formulaire" :titre="formulaire.id ? 'Modifier le modèle' : 'Nouveau modèle de carreaux'" sous-titre="Proposé aux clients dans le calculateur, au prix d’un carreau." @fermer="formulaire = null">
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
        <div class="adm-champ">
          <label for="ca-prix">Prix d’un carreau (prix BTM) *</label>
          <span class="adm-saisie-unite"><input id="ca-prix" v-model="formulaire.prix" inputmode="decimal" placeholder="2,50" /><span>€</span></span>
          <span v-if="prixM2" class="adm-champ-aide"><span>≈ {{ formaterEuros(prixM2) }} le m²</span></span>
        </div>
        <div class="adm-champ">
          <label for="ca-comptoir">Prix au comptoir (facultatif)</label>
          <span class="adm-saisie-unite"><input id="ca-comptoir" v-model="formulaire.comptoir" inputmode="decimal" placeholder="2,90" /><span>€</span></span>
          <span class="adm-champ-aide"><span>Sans code de retrait. Affiché pour montrer l’économie.</span></span>
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
.car-barre { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }

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
.car-comptoir { margin: 0; color: var(--adm-muet); font-size: .8rem; }
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
  .car-barre > .adm-btn { order: -1; flex: 1 1 100%; }
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

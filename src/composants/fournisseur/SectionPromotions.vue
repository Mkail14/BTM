<script setup>
/**
 * Promotions du fournisseur : remise en % ou en €, sur toute la commande ou sur un matériau,
 * avec un code facultatif (à donner aux clients) et une période de validité.
 * Appliquées en caisse (« Valider un projet »), sur les seuls matériaux du fournisseur.
 */
import { computed, ref } from 'vue'
import { useAdmin } from '@/composables/useAdmin.js'
import { useAuth } from '@/composables/useAuth.js'
import { useEspaceFournisseur, formatDate } from '@/composables/useEspaceFournisseur.js'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'
import * as api from '@/services/supabase/serviceEspaceFournisseur.js'
import AdminPanneau from '@/composants/admin/AdminPanneau.vue'

const props = defineProps({ recherche: { type: String, default: '' } })
const { notifier, confirmer } = useAdmin()
const { fournisseurLie } = useAuth()
const { promotions, materiauxBtm, rechargerPromotions } = useEspaceFournisseur()

const aujourdhui = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const nomMateriau = (id) => materiauxBtm.value.find((m) => m.id === id)?.libelle || id
const valeurTexte = (p) => (p.type === 'montant' ? `−${formaterEuros(p.valeur)}` : `−${String(p.valeur).replace('.', ',')} %`)

/** active | programmee | expiree | desactivee */
function statut(p) {
  if (!p.actif) return 'desactivee'
  if (p.debut > aujourdhui()) return 'programmee'
  if (p.fin && p.fin < aujourdhui()) return 'expiree'
  return 'active'
}
const STATUTS = {
  active: { libelle: 'Active', classe: 'adm-badge-ok' },
  programmee: { libelle: 'Programmée', classe: 'adm-badge-info' },
  expiree: { libelle: 'Terminée', classe: '' },
  desactivee: { libelle: 'Désactivée', classe: '' }
}

const filtre = ref('toutes')
const normaliser = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const liste = computed(() => {
  const q = normaliser(props.recherche.trim())
  return promotions.value.filter((p) => (filtre.value === 'toutes' || statut(p) === filtre.value)
    && (!q || [p.libelle, p.code, nomMateriau(p.materiau_id)].some((t) => normaliser(t).includes(q))))
})
const compte = (s) => promotions.value.filter((p) => statut(p) === s).length

// ---------- Création / modification ----------
const formulaire = ref(null)
const erreurForm = ref('')
const enregistrement = ref(false)
function ouvrir(p = null) {
  erreurForm.value = ''
  formulaire.value = p
    ? { ...p, valeur: String(p.valeur).replace('.', ','), materiau_id: p.materiau_id || '', code: p.code || '', fin: p.fin || '' }
    : { id: null, libelle: '', type: 'pourcentage', valeur: '', materiau_id: '', code: '', debut: aujourdhui(), fin: '', actif: true }
}
async function enregistrer() {
  const f = formulaire.value
  const valeur = Number(String(f.valeur).replace(',', '.'))
  erreurForm.value = f.libelle.trim().length < 2 ? 'Donnez un nom à la promotion.'
    : !(valeur > 0) ? 'La réduction doit être supérieure à 0.'
    : f.type === 'pourcentage' && valeur > 100 ? 'Une réduction en % ne peut pas dépasser 100 %.'
    : f.code && !/^[A-Z0-9-]{3,20}$/.test(f.code) ? 'Code : 3 à 20 lettres, chiffres ou tirets.'
    : f.fin && f.fin < f.debut ? 'La date de fin précède la date de début.' : ''
  if (erreurForm.value) return
  enregistrement.value = true
  try {
    await api.enregistrerPromotion(fournisseurLie.value, { ...f, valeur })
    await rechargerPromotions()
    notifier(f.id ? 'Promotion modifiée.' : 'Promotion créée : elle est proposée en caisse.')
    formulaire.value = null
  } catch (e) {
    erreurForm.value = e?.message || 'Enregistrement impossible.'
  } finally {
    enregistrement.value = false
  }
}

async function basculer(p) {
  try {
    await api.enregistrerPromotion(fournisseurLie.value, { ...p, actif: !p.actif })
    p.actif = !p.actif
    notifier(p.actif ? `« ${p.libelle} » activée.` : `« ${p.libelle} » désactivée.`, 'info')
  } catch (e) { notifier(e?.message || 'Modification impossible.', 'erreur') }
}
async function supprimer(p) {
  if (!(await confirmer({ titre: 'Supprimer cette promotion ?', texte: `« ${p.libelle} » ne sera plus proposée en caisse. Les reçus déjà émis la conservent.`, libelle: 'Supprimer', danger: true }))) return
  try {
    await api.supprimerPromotion(p.id)
    await rechargerPromotions()
    notifier('Promotion supprimée.')
  } catch (e) { notifier(e?.message || 'Suppression impossible.', 'erreur') }
}
</script>

<template>
  <div class="promo">
    <div class="promo-barre">
      <div class="adm-pilules" role="group" aria-label="Filtrer les promotions">
        <button type="button" class="adm-pilule" :class="{ actif: filtre === 'toutes' }" @click="filtre = 'toutes'">Toutes <small>{{ promotions.length }}</small></button>
        <button v-for="(s, id) in STATUTS" :key="id" type="button" class="adm-pilule" :class="{ actif: filtre === id }" @click="filtre = id">{{ s.libelle }} <small>{{ compte(id) }}</small></button>
      </div>
      <button type="button" class="adm-btn adm-btn-noir" @click="ouvrir()"><i class="fa-solid fa-plus" aria-hidden="true"></i> Nouvelle promotion</button>
    </div>

    <div v-if="!promotions.length" class="adm-carte promo-vide">
      <span class="promo-vide-icone"><i class="fa-solid fa-tags" aria-hidden="true"></i></span>
      <h2>Aucune promotion</h2>
      <p>Offrez une remise sur toute la commande ou sur un matériau, avec ou sans code. Elle vous sera proposée au moment d’encaisser.</p>
      <button type="button" class="adm-btn adm-btn-noir" @click="ouvrir()"><i class="fa-solid fa-plus" aria-hidden="true"></i> Créer ma première promotion</button>
    </div>
    <div v-else-if="!liste.length" class="adm-carte adm-vide"><i class="fa-solid fa-tags" aria-hidden="true"></i><p>Aucune promotion ne correspond.</p></div>

    <ul v-else class="promo-grille">
      <li v-for="p in liste" :key="p.id" class="adm-carte promo-carte" :class="`promo-${statut(p)}`">
        <div class="promo-tete">
          <span class="adm-badge" :class="STATUTS[statut(p)].classe">{{ STATUTS[statut(p)].libelle }}</span>
          <button type="button" role="switch" class="adm-interrupteur" :aria-checked="p.actif" :aria-label="`Activer ${p.libelle}`" @click="basculer(p)"></button>
        </div>
        <strong class="promo-valeur">{{ valeurTexte(p) }}</strong>
        <p class="promo-nom">{{ p.libelle }}</p>
        <p class="promo-portee"><i :class="p.materiau_id ? 'fa-solid fa-cube' : 'fa-solid fa-cart-shopping'" aria-hidden="true"></i> {{ p.materiau_id ? nomMateriau(p.materiau_id) : 'Toute la commande' }}</p>
        <div class="promo-infos">
          <span v-if="p.code" class="promo-code adm-mono">{{ p.code }}</span>
          <span>{{ p.fin ? `Du ${formatDate(p.debut, { day: 'numeric', month: 'short' })} au ${formatDate(p.fin, { day: 'numeric', month: 'short' })}` : `Dès le ${formatDate(p.debut, { day: 'numeric', month: 'short' })}` }}</span>
        </div>
        <div class="promo-pied">
          <span>{{ p.utilisations }} utilisation{{ p.utilisations > 1 ? 's' : '' }}</span>
          <span>
            <button type="button" class="adm-icone-btn" :aria-label="`Modifier ${p.libelle}`" title="Modifier" @click="ouvrir(p)"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
            <button type="button" class="adm-icone-btn danger" :aria-label="`Supprimer ${p.libelle}`" title="Supprimer" @click="supprimer(p)"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
          </span>
        </div>
      </li>
    </ul>

    <AdminPanneau v-if="formulaire" :titre="formulaire.id ? 'Modifier la promotion' : 'Nouvelle promotion'" sous-titre="Appliquée en caisse, sur vos matériaux uniquement." @fermer="formulaire = null">
      <form id="form-promo" class="adm-grille-form" novalidate @submit.prevent="enregistrer">
        <div class="adm-champ plein"><label for="pr-nom">Nom *</label><input id="pr-nom" v-model="formulaire.libelle" maxlength="60" placeholder="Ex. : Semaine du ciment" /></div>
        <div class="adm-champ">
          <span class="adm-champ-label">Type de réduction</span>
          <div class="adm-segments promo-types" role="radiogroup" aria-label="Type de réduction">
            <button type="button" role="radio" :aria-checked="formulaire.type === 'pourcentage'" :aria-selected="formulaire.type === 'pourcentage'" @click="formulaire.type = 'pourcentage'">En %</button>
            <button type="button" role="radio" :aria-checked="formulaire.type === 'montant'" :aria-selected="formulaire.type === 'montant'" @click="formulaire.type = 'montant'">En €</button>
          </div>
        </div>
        <div class="adm-champ">
          <label for="pr-val">Réduction *</label>
          <span class="adm-saisie-unite"><input id="pr-val" v-model="formulaire.valeur" inputmode="decimal" placeholder="10" /><span>{{ formulaire.type === 'montant' ? '€' : '%' }}</span></span>
        </div>
        <div class="adm-champ plein">
          <label for="pr-portee">S’applique à</label>
          <select id="pr-portee" v-model="formulaire.materiau_id">
            <option value="">Toute la commande</option>
            <option v-for="m in materiauxBtm" :key="m.id" :value="m.id">{{ m.libelle }}</option>
          </select>
        </div>
        <div class="adm-champ plein">
          <label for="pr-code">Code promo (facultatif)</label>
          <input id="pr-code" :value="formulaire.code" class="adm-mono" maxlength="20" placeholder="Ex. : CIMENT10" @input="formulaire.code = $event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '')" />
          <span class="adm-champ-aide"><span>À communiquer à vos clients : ils le donnent en caisse.</span></span>
        </div>
        <div class="adm-champ"><label for="pr-debut">Début</label><input id="pr-debut" v-model="formulaire.debut" type="date" /></div>
        <div class="adm-champ"><label for="pr-fin">Fin (facultative)</label><input id="pr-fin" v-model="formulaire.fin" type="date" :min="formulaire.debut" /></div>
        <label class="plein promo-option"><button type="button" role="switch" class="adm-interrupteur" :aria-checked="formulaire.actif" @click="formulaire.actif = !formulaire.actif"></button> Active</label>
      </form>
      <p v-if="erreurForm" class="adm-erreur-texte" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ erreurForm }}</p>
      <template #pied>
        <button type="button" class="adm-btn adm-btn-clair" @click="formulaire = null">Annuler</button>
        <button type="submit" form="form-promo" class="adm-btn adm-btn-noir" :disabled="enregistrement">
          <span v-if="enregistrement" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-check" aria-hidden="true"></i> Enregistrer
        </button>
      </template>
    </AdminPanneau>
  </div>
</template>

<style scoped>
.promo { display: flex; flex-direction: column; gap: 18px; }
.promo-barre { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }

.promo-vide { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 48px 24px; text-align: center; }
.promo-vide h2 { margin: 6px 0 0; font-family: var(--font-corps); font-size: 1.2rem; font-weight: 600; }
.promo-vide p { margin: 0 0 8px; max-width: 440px; color: var(--adm-encre-2); font-size: .92rem; }
.promo-vide-icone { width: 60px; height: 60px; display: grid; place-items: center; border-radius: 18px; background: var(--adm-noir); color: #fff; font-size: 1.4rem; }

.promo-grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 16px; margin: 0; padding: 0; list-style: none; }
.promo-carte { display: flex; flex-direction: column; gap: 6px; padding: 18px 20px; }
.promo-expiree, .promo-desactivee { opacity: .62; }
.promo-tete { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.promo-valeur { font-size: 2rem; font-weight: 600; letter-spacing: -.02em; line-height: 1.1; color: var(--adm-encre); }
.promo-active .promo-valeur { color: var(--lagon-700); }
.promo-nom { margin: 0; font-weight: 600; }
.promo-portee { margin: 0; color: var(--adm-encre-2); font-size: .86rem; }
.promo-portee i { margin-right: 6px; color: var(--adm-muet); }
.promo-infos { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 6px; color: var(--adm-muet); font-size: .8rem; }
.promo-code { padding: 3px 10px; border: 1px dashed var(--adm-muet); border-radius: 8px; color: var(--adm-encre); font-weight: 700; letter-spacing: .06em; }
.promo-pied { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--adm-ligne-2); color: var(--adm-muet); font-size: .8rem; }
.promo-types { box-shadow: inset 0 0 0 1px var(--adm-ligne); align-self: flex-start; }
.promo-option { display: flex; align-items: center; gap: 12px; font-size: .92rem; font-weight: 500; cursor: pointer; }
</style>

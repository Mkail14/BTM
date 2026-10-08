<script setup>
/**
 * Codes promo : réduction en % ou en € sur le devis (offerte par BTM : déduite de sa commission),
 * avec une date d'expiration (dernier jour inclus) ou sans limite. Le visiteur saisit le code
 * sur la page des résultats ; la base ne lui révèle jamais la liste des codes.
 */
import { computed, onMounted, ref } from 'vue'
import { useAdmin, formatDate, correspond } from '@/composables/useAdmin.js'
import { useContenuSite } from '@/composables/useContenuSite.js'
import { formaterEuros, libelleReduction } from '@/services/calculs/moteurCalculs.js'
import AdminPanneau from './AdminPanneau.vue'

const { api, donnees, erreurs, charger, recherche, confirmer, executer, notifier } = useAdmin()
const contenu = useContenuSite()
onMounted(() => charger(['codes', 'projets'], { force: true }))

// Date du jour (heure locale) au format AAAA-MM-JJ, comparable aux dates d'expiration
const aujourdhui = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const expire = (c) => !!c.expire_le && c.expire_le < aujourdhui()
const statut = (c) => (!c.actif ? 'desactive' : expire(c) ? 'expire' : 'actif')
const joursRestants = (c) => Math.round((new Date(`${c.expire_le}T00:00:00`) - new Date(`${aujourdhui()}T00:00:00`)) / 86400000)

// Nombre de devis enregistrés avec chaque code
const utilisations = computed(() => {
  const n = {}
  for (const p of donnees.projets || []) if (p.code) n[p.code] = (n[p.code] || 0) + 1
  return n
})

const filtre = ref('tous')
const filtres = [['tous', 'Tous'], ['actif', 'Actifs'], ['expire', 'Expirés'], ['desactive', 'Désactivés']]
const compte = (f) => (donnees.codes || []).filter((c) => f === 'tous' || statut(c) === f).length
const liste = computed(() => (donnees.codes || []).filter((c) => (filtre.value === 'tous' || statut(c) === filtre.value) && correspond(recherche.value, c.code, c.note)))

async function basculer(c) {
  await executer(async () => { await api.definirCodeActif(c.id, !c.actif); c.actif = !c.actif }, c.actif ? `Code ${c.code} désactivé.` : `Code ${c.code} activé.`)
}
async function supprimer(c) {
  const n = utilisations.value[c.code] || 0
  const texte = n
    ? `Il a servi dans ${n} devis enregistré${n > 1 ? 's' : ''} : ces devis gardent leur réduction. Pour simplement l’arrêter, désactivez-le.`
    : 'Le code ne pourra plus être utilisé.'
  if (!(await confirmer({ titre: `Supprimer le code ${c.code} ?`, texte, libelle: 'Supprimer', danger: true }))) return
  await executer(async () => { await api.supprimerCode(c.id); donnees.codes = donnees.codes.filter((x) => x.id !== c.id) }, 'Code supprimé.')
}
async function copier(c) {
  try { await navigator.clipboard.writeText(c.code); notifier(`${c.code} copié.`, 'info') } catch { notifier('Copie impossible.', 'erreur') }
}

// ---------- Formulaire ----------
const formulaire = ref(null)
const formErreur = ref('')
const enregistrement = ref(false)
const vide = () => ({ id: null, code: '', type: 'pourcentage', valeur: '10', portee: 'total', illimite: true, expire_le: '', actif: true, note: '' })
function ouvrir(c) {
  formErreur.value = ''
  formulaire.value = c
    ? { ...c, valeur: String(c.valeur).replace('.', ','), illimite: !c.expire_le, expire_le: c.expire_le || '', note: c.note || '' }
    : vide()
}
function generer() {
  const lettres = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sans 0/O ni 1/I, faciles à confondre
  formulaire.value.code = `BTM-${Array.from({ length: 6 }, () => lettres[Math.floor(Math.random() * lettres.length)]).join('')}`
}

const valeurNombre = computed(() => Number(String(formulaire.value?.valeur ?? '').replace(',', '.')))
// Exemple : devis de 1 000 € de matériaux, avec le taux de frais actuel
const exemple = computed(() => {
  const f = formulaire.value
  if (!f) return null
  const materiaux = 1000
  const v = Number.isFinite(valeurNombre.value) && valeurNombre.value > 0 ? valeurNombre.value : 0
  const reduction = Math.min(materiaux, f.type === 'montant' ? v : (materiaux * v) / 100)
  const commission = (materiaux * (Number(contenu.frais.taux) || 0)) / 100
  return { materiaux, reduction, commission, total: materiaux - reduction, depasse: f.type === 'montant' && v > materiaux }
})

async function enregistrer() {
  const f = formulaire.value
  const code = f.code.toUpperCase().replace(/\s+/g, '')
  formErreur.value = ''
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) { formErreur.value = 'Le code doit faire 3 à 30 caractères : lettres, chiffres, tiret ou tiret bas.'; return }
  if (!(valeurNombre.value > 0)) { formErreur.value = 'La réduction doit être supérieure à 0.'; return }
  if (f.type === 'pourcentage' && valeurNombre.value > 100) { formErreur.value = 'Une réduction en pourcentage ne peut pas dépasser 100 %.'; return }
  if (!f.illimite && !f.expire_le) { formErreur.value = 'Choisissez une date d’expiration, ou cochez « Sans date d’expiration ».'; return }
  if ((donnees.codes || []).some((c) => c.code === code && c.id !== f.id)) { formErreur.value = `Le code ${code} existe déjà.`; return }
  enregistrement.value = true
  try {
    const maj = await api.enregistrerCode({ ...f, code, valeur: valeurNombre.value, expire_le: f.illimite ? null : f.expire_le })
    donnees.codes = f.id ? donnees.codes.map((c) => (c.id === maj.id ? maj : c)) : [maj, ...(donnees.codes || [])]
    formulaire.value = null
    notifier(f.id ? `Code ${code} mis à jour.` : `Code ${code} créé.`)
  } catch (e) {
    formErreur.value = e?.message || 'Enregistrement impossible.'
  } finally {
    enregistrement.value = false
  }
}
</script>

<template>
  <div class="codes">
    <p v-if="erreurs.codes" class="adm-alerte" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.codes }}</p>

    <div class="adm-section-tete">
      <div class="adm-pilules" role="group" aria-label="Filtrer les codes">
        <button v-for="f in filtres" :key="f[0]" type="button" class="adm-pilule" :class="{ actif: filtre === f[0] }" :aria-pressed="filtre === f[0]" @click="filtre = f[0]">
          {{ f[1] }} <small>{{ compte(f[0]) }}</small>
        </button>
      </div>
      <button type="button" class="adm-btn adm-btn-noir" @click="ouvrir()"><i class="fa-solid fa-plus" aria-hidden="true"></i> Nouveau code</button>
    </div>

    <section class="adm-carte">
      <div v-if="!donnees.codes" class="adm-chargement"><span class="spinner spinner-grand"></span></div>
      <div v-else class="adm-table-cadre">
        <table class="adm-table adm-table-empile">
          <thead><tr><th>Code</th><th>Réduction</th><th>Validité</th><th class="num">Devis</th><th>Actif</th><th><span class="visually-hidden">Actions</span></th></tr></thead>
          <tbody>
            <tr v-for="c in liste" :key="c.id" :class="{ estompe: statut(c) !== 'actif' }">
              <td class="principal">
                <span class="code-cellule">
                  <button type="button" class="code-puce adm-mono" :title="`Copier ${c.code}`" @click="copier(c)">{{ c.code }} <i class="fa-regular fa-copy" aria-hidden="true"></i></button>
                  <small v-if="c.note">{{ c.note }}</small>
                </span>
              </td>
              <td data-label="Réduction">
                <strong>{{ libelleReduction(c) }}</strong>
                <small class="code-portee">{{ c.portee === 'frais' ? 'ancien code (sur les frais)' : 'sur tout le devis' }}</small>
              </td>
              <td data-label="Validité">
                <span v-if="!c.expire_le" class="adm-badge adm-badge-info sans-point"><i class="fa-solid fa-infinity" aria-hidden="true"></i> Sans limite</span>
                <span v-else-if="expire(c)" class="adm-badge adm-badge-attention">Expiré le {{ formatDate(c.expire_le) }}</span>
                <span v-else class="code-date">
                  Jusqu’au {{ formatDate(c.expire_le) }}
                  <small :class="{ bientot: joursRestants(c) <= 7 }">{{ joursRestants(c) === 0 ? 'dernier jour' : `encore ${joursRestants(c)} j` }}</small>
                </span>
              </td>
              <td data-label="Devis" class="num">{{ utilisations[c.code] || 0 }}</td>
              <td data-label="Actif"><button type="button" role="switch" class="adm-interrupteur" :aria-checked="c.actif" :aria-label="`Activer le code ${c.code}`" @click="basculer(c)"></button></td>
              <td class="actions">
                <button type="button" class="adm-icone-btn" title="Modifier" :aria-label="`Modifier ${c.code}`" @click="ouvrir(c)"><i class="fa-solid fa-pen"></i></button>
                <button type="button" class="adm-icone-btn danger" title="Supprimer" :aria-label="`Supprimer ${c.code}`" @click="supprimer(c)"><i class="fa-solid fa-trash-can"></i></button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!liste.length" class="adm-vide">
          <i class="fa-solid fa-ticket"></i>
          <p>{{ donnees.codes.length ? 'Aucun code ne correspond.' : 'Aucun code promo pour le moment.' }}</p>
          <button v-if="!donnees.codes.length" type="button" class="adm-btn adm-btn-noir adm-btn-sm" @click="ouvrir()">Créer le premier code</button>
        </div>
      </div>
    </section>

    <!-- Création / modification -->
    <AdminPanneau v-if="formulaire" :titre="formulaire.id ? `Modifier ${formulaire.code}` : 'Nouveau code promo'" sous-titre="Le client le saisit sur la page de son devis." @fermer="formulaire = null">
      <form id="form-code" class="code-form" novalidate @submit.prevent="enregistrer">
        <div class="adm-champ">
          <label for="c-code">Code</label>
          <div class="code-saisie">
            <input id="c-code" v-model="formulaire.code" class="adm-mono" maxlength="30" autocomplete="off" spellcheck="false" placeholder="BIENVENUE10" @input="formulaire.code = formulaire.code.toUpperCase().replace(/\s+/g, '')" />
            <button type="button" class="adm-btn adm-btn-clair" @click="generer"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Générer</button>
          </div>
          <span class="adm-champ-aide"><span>Lettres, chiffres, tiret. Le client peut le taper en minuscules.</span></span>
        </div>

        <fieldset class="adm-champ code-bloc">
          <legend class="adm-champ-label">Réduction</legend>
          <div class="adm-segments" role="radiogroup" aria-label="Type de réduction">
            <button type="button" role="radio" :aria-selected="formulaire.type === 'pourcentage'" :aria-checked="formulaire.type === 'pourcentage'" @click="formulaire.type = 'pourcentage'">Pourcentage</button>
            <button type="button" role="radio" :aria-selected="formulaire.type === 'montant'" :aria-checked="formulaire.type === 'montant'" @click="formulaire.type = 'montant'">Montant fixe</button>
          </div>
          <span class="adm-saisie-unite code-valeur">
            <input id="c-valeur" v-model="formulaire.valeur" inputmode="decimal" aria-label="Valeur de la réduction" />
            <span>{{ formulaire.type === 'pourcentage' ? '%' : '€' }}</span>
          </span>
        </fieldset>

        <fieldset class="adm-champ code-bloc">
          <legend class="adm-champ-label">S’applique sur</legend>
          <label class="code-option actif">
            <input v-model="formulaire.portee" type="radio" value="total" />
            <span><strong>Tout le devis</strong><small>Offert par BTM : la réduction est déduite de la commission versée par le fournisseur. Une seule utilisation par compte.</small></span>
          </label>
        </fieldset>

        <fieldset class="adm-champ code-bloc">
          <legend class="adm-champ-label">Validité</legend>
          <label class="code-interrupteur">
            <button type="button" role="switch" class="adm-interrupteur" :aria-checked="formulaire.illimite" @click="formulaire.illimite = !formulaire.illimite"></button>
            Sans date d’expiration
          </label>
          <div v-if="!formulaire.illimite" class="adm-champ">
            <label for="c-date">Valable jusqu’au (inclus)</label>
            <input id="c-date" v-model="formulaire.expire_le" type="date" :min="formulaire.id ? undefined : aujourdhui()" />
          </div>
        </fieldset>

        <div class="adm-champ">
          <label for="c-note">Note interne (facultative)</label>
          <input id="c-note" v-model="formulaire.note" maxlength="200" placeholder="Ex. : partenariat salon de l’habitat" />
        </div>

        <label class="code-interrupteur">
          <button type="button" role="switch" class="adm-interrupteur" :aria-checked="formulaire.actif" @click="formulaire.actif = !formulaire.actif"></button>
          Code actif
        </label>

        <!-- Exemple chiffré -->
        <div v-if="exemple" class="code-exemple">
          <span class="code-exemple-titre">Exemple sur 1 000 € de matériaux</span>
          <div><span>Matériaux</span><span>{{ formaterEuros(exemple.materiaux) }}</span></div>

          <div class="code-exemple-remise"><span>Code {{ formulaire.code || '…' }}</span><span>−{{ formaterEuros(exemple.reduction) }}</span></div>
          <div class="code-exemple-total"><span>Le client paie</span><span>{{ formaterEuros(exemple.total) }}</span></div>
          <p v-if="exemple.depasse" class="code-exemple-note">La réduction ne peut pas dépasser ce qu’elle réduit : elle est plafonnée.</p>
          <p v-if="exemple.reduction > exemple.commission" class="code-exemple-note">Cette réduction dépasse votre commission sur ce devis ({{ formaterEuros(exemple.commission) }}) : BTM la finance à perte.</p>
        </div>
      </form>
      <p v-if="formErreur" class="adm-erreur-texte" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ formErreur }}</p>
      <template #pied>
        <button type="button" class="adm-btn adm-btn-clair" @click="formulaire = null">Annuler</button>
        <button type="submit" form="form-code" class="adm-btn adm-btn-noir" :disabled="enregistrement">
          <span v-if="enregistrement" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-check" aria-hidden="true"></i> Enregistrer
        </button>
      </template>
    </AdminPanneau>
  </div>
</template>

<style scoped>
.codes { display: flex; flex-direction: column; gap: 16px; }
.codes .adm-section-tete { margin: 0; }

.code-cellule { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 0; }
.code-cellule small { color: var(--adm-muet); font-size: .8rem; }
.code-puce {
  display: inline-flex; align-items: center; gap: 8px; padding: 5px 10px; border: 1px dashed var(--adm-ligne-forte); border-radius: 8px;
  background: var(--adm-ligne-2); color: var(--adm-encre); font-weight: 600; letter-spacing: .04em; cursor: pointer;
}
.code-puce i { color: var(--adm-muet); font-size: .8rem; }
.code-puce:hover { border-color: var(--adm-encre); }
.code-portee { display: block; color: var(--adm-muet); font-size: .78rem; }
.code-date { display: flex; flex-direction: column; font-size: .88rem; }
.code-date small { color: var(--adm-muet); font-size: .76rem; }
.code-date small.bientot { color: var(--adm-attention-texte); font-weight: 600; }

/* Formulaire */
.code-form { display: flex; flex-direction: column; gap: 20px; }
.code-saisie { display: flex; gap: 8px; }
.code-saisie input { flex: 1; letter-spacing: .06em; }
.code-bloc { display: flex; flex-direction: column; gap: 10px; margin: 0; padding: 0; border: 0; }
.code-bloc legend { margin-bottom: 8px; padding: 0; }
.code-bloc .adm-segments { align-self: flex-start; box-shadow: inset 0 0 0 1px var(--adm-ligne); }
.code-valeur { max-width: 200px; }
.code-valeur input { font-size: 1.15rem; font-weight: 600; }
.code-option {
  display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; border: 1px solid var(--adm-ligne); border-radius: 14px; cursor: pointer;
  transition: border-color var(--transition), background var(--transition);
}
.code-option:hover { border-color: var(--adm-ligne-forte); }
.code-option.actif { border-color: var(--adm-noir); background: var(--adm-survol); }
/* le style des champs admin (.adm-champ input : pleine largeur, 44 px) ne doit pas toucher les boutons radio */
.code-bloc .code-option input[type="radio"] { flex: none; width: 18px; height: 18px; min-height: 0; margin: 2px 0 0; padding: 0; border: 0; box-shadow: none; accent-color: var(--adm-noir); }
.code-option span { display: flex; flex-direction: column; gap: 2px; }
.code-option strong { font-size: .92rem; font-weight: 600; }
.code-option small { color: var(--adm-muet); font-size: .8rem; line-height: 1.45; }
.code-interrupteur { display: flex; align-items: center; gap: 10px; font-size: .9rem; font-weight: 600; cursor: pointer; }

.code-exemple { padding: 16px 18px; border-radius: 16px; background: var(--adm-noir); color: rgba(255, 255, 255, .75); font-size: .88rem; }
.code-exemple-titre { display: block; margin-bottom: 8px; font-size: .75rem; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--lagon-300); }
.code-exemple > div { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; font-variant-numeric: tabular-nums; }
.code-exemple-remise { color: #6ee7b7; font-weight: 600; }
.code-exemple-total { margin-top: 6px; padding-top: 10px !important; border-top: 1px solid rgba(255, 255, 255, .15); color: #fff; font-weight: 700; }
.code-exemple-note { margin: 8px 0 0; color: #fcd34d; font-size: .8rem; }
</style>

<script setup>
/**
 * Valider un projet — le retrait au comptoir, en 4 étapes :
 *  1. Code : le fournisseur tape le code de retrait imprimé sur le devis PDF du client ;
 *  2. Préparation : il ajuste la quantité remise de chaque matériau (0 = non fourni), à SES prix (catalogue),
 *     stock contrôlé, ruptures exclues ; il peut ajouter ses propres articles et appliquer une promotion
 *     (une seule fois par client, comme les codes BTM) ;
 *  3. Caisse : terminal d'encaissement — carte (TPE), espèces (monnaie rendue), virement, chèque ;
 *  4. Reçu : numéro attribué par la base, reçu PDF, opération inscrite au journal.
 * Le montant affiché est recalculé côté base au moment de l'encaissement (encaisser_devis).
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAdmin } from '@/composables/useAdmin.js'
import { useEspaceFournisseur, formatDate, formatHeure } from '@/composables/useEspaceFournisseur.js'
import { trouverTypeProjet } from '@/donnees/typesProjets.js'
import { formaterEuros, formaterQuantite } from '@/services/calculs/moteurCalculs.js'
import * as api from '@/services/supabase/serviceEspaceFournisseur.js'

const { MOYENS } = api
const route = useRoute()
const router = useRouter()
const { notifier } = useAdmin()
const { fiche, enAttente, nomCompte, ajouterPaiement, catalogue, promotionsValables, articles } = useEspaceFournisseur()

const etapes = [
  { id: 'code', label: 'Code' },
  { id: 'preparation', label: 'Préparation' },
  { id: 'caisse', label: 'Encaissement' },
  { id: 'recu', label: 'Reçu' }
]
const etape = ref('code')
const indexEtape = computed(() => etapes.findIndex((e) => e.id === etape.value))

// ---------- 1. Code ----------
const saisie = ref('')
const champCode = ref(null)
const recherche = ref(false)
const erreurCode = ref('')
const devis = ref(null)

/** « k7qm4xpa » → « K7QM-4XPA » pendant la frappe */
function formaterCode(v) {
  const brut = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  return brut.length > 4 ? `${brut.slice(0, 4)}-${brut.slice(4)}` : brut
}
const codeComplet = computed(() => saisie.value.replace('-', '').length === 8)

async function rechercher(code = saisie.value) {
  saisie.value = formaterCode(code)
  if (!codeComplet.value || recherche.value) return
  recherche.value = true
  erreurCode.value = ''
  try {
    devis.value = await api.trouverDevisParCode(saisie.value)
    preparer()
    etape.value = devis.value.paiement ? 'recu' : 'preparation'
    paiement.value = devis.value.paiement
  } catch (e) {
    erreurCode.value = e?.message || 'Recherche impossible.'
  } finally {
    recherche.value = false
  }
}

function recommencer() {
  etape.value = 'code'
  devis.value = null
  paiement.value = null
  saisie.value = ''
  erreurCode.value = ''
  quantites.value = {}
  promotionId.value = ''
  extras.value = []
  utiliserCredit.value = false
  reinitialiserCaisse()
  if (route.query.code) router.replace({ query: {} })
  nextTick(() => champCode.value?.focus())
}

// Ouvert depuis le tableau de bord (« Valider » sur un devis) : code pré-rempli
onMounted(() => {
  if (route.query.code) rechercher(String(route.query.code))
  else champCode.value?.focus()
})
watch(() => route.query.code, (c) => { if (c && etape.value === 'code') rechercher(String(c)) })

// ---------- 2. Préparation ----------
// Quantité remise par matériau : celle du devis, bornée au stock quand il est suivi (0 si non vendu)
const quantites = ref({})
const saisies = ref({}) // texte tapé (virgule acceptée), converti à la sortie du champ
const promotionId = ref('')
function preparer() {
  const q = {}
  for (const l of devis.value?.resultat?.lignes || []) {
    const c = catalogue.value[l.id]
    q[l.id] = c && (!c.vendu || c.rupture) ? 0 : c?.stock != null ? Math.min(l.quantite, Number(c.stock)) : l.quantite
  }
  quantites.value = q
  saisies.value = Object.fromEntries(Object.entries(q).map(([k, v]) => [k, String(v).replace('.', ',')]))
  promotionId.value = ''
  extras.value = []
}
function definirQuantite(l, valeur) {
  const n = Number(String(valeur).replace(/s/g, '').replace(',', '.'))
  const q = Number.isFinite(n) ? Math.round(Math.min(Math.max(0, n), l.quantiteDevis ?? l.quantite) * 1000) / 1000 : quantites.value[l.id]
  quantites.value = { ...quantites.value, [l.id]: q }
  saisies.value = { ...saisies.value, [l.id]: String(q).replace('.', ',') }
}
const toutFournir = () => { for (const l of devis.value?.resultat?.lignes || []) definirQuantite(l, catalogue.value[l.id]?.stock != null ? Math.min(l.quantite, catalogue.value[l.id].stock) : l.quantite) }
// Articles du fournisseur vendus en plus du devis : [{ ...article, quantite, saisie }]
const extras = ref([])
const articlesDisponibles = computed(() => articles.value.filter((a) => a.vendu && !a.rupture && a.stock !== 0 && !extras.value.some((e) => e.id === a.id)))
const articleAjoute = ref('')
function ajouterArticle() {
  const a = articles.value.find((x) => x.id === articleAjoute.value)
  if (a) extras.value = [...extras.value, { ...a, quantite: 1, saisie: '1' }]
  articleAjoute.value = ''
}
function quantiteArticle(e, valeur) {
  const n = Number(String(valeur).replace(/\s/g, '').replace(',', '.'))
  const q = Number.isFinite(n) && n > 0 ? Math.round(n * 1000) / 1000 : e.quantite
  extras.value = extras.value.map((x) => (x.id === e.id ? { ...x, quantite: q, saisie: String(q).replace('.', ',') } : x))
}
const retirerArticle = (e) => { extras.value = extras.value.filter((x) => x.id !== e.id) }

// Usage unique : promotions déjà utilisées par ce client, code BTM déjà utilisé sur un autre devis
const promotionsUtilisees = computed(() => new Set(devis.value?.promotions_utilisees || []))
const promotion = computed(() => promotionsValables.value.find((p) => p.id === promotionId.value && !promotionsUtilisees.value.has(p.id)) || null)
// Crédit fidélité du client, utilisé si le fournisseur le propose (à la charge de BTM)
const utiliserCredit = ref(false)
const calcul = computed(() => (devis.value
  ? api.calculerEncaissement(devis.value.resultat, quantites.value, catalogue.value, promotion.value, {
    articles: extras.value, codeBtmIgnore: !!devis.value.code_btm_deja_utilise, tauxCommission: devis.value.commission,
    credit: utiliserCredit.value ? devis.value.credit_disponible : 0
  })
  : null))
const typeDevis = computed(() => trouverTypeProjet(devis.value?.type_projet_id))
const libellePromo = (p) => `${p.libelle} · ${p.type === 'montant' ? '−' + formaterEuros(p.valeur) : '−' + String(p.valeur).replace('.', ',') + ' %'}${p.code ? ' · code ' + p.code : ''}`
const prixDevis = (l) => Number(devis.value?.resultat?.lignes?.find((x) => x.id === l.id)?.prixUnitaire) || 0
const pretPreparation = computed(() => calcul.value?.fournies.length && !calcul.value.stockInsuffisant.length)

// ---------- 3. Caisse ----------
const moyen = ref('')
const reference = ref('')
const recuSaisi = ref('')
const encaissement = ref(false)
const erreurCaisse = ref('')
const paiement = ref(null)
function reinitialiserCaisse() { moyen.value = ''; reference.value = ''; recuSaisi.value = ''; erreurCaisse.value = '' }

const lireMontant = (v) => { const n = Number(String(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN }
const montantRecu = computed(() => lireMontant(recuSaisi.value))
const rendu = computed(() => (Number.isFinite(montantRecu.value) ? Math.round((montantRecu.value - calcul.value.montant) * 100) / 100 : NaN))
/** Billets « ronds » au-dessus du montant : ce que les clients tendent le plus souvent */
const suggestions = computed(() => {
  const m = calcul.value?.montant || 0
  const valeurs = [m, ...[5, 10, 20, 50, 100].map((pas) => Math.ceil(m / pas) * pas)]
  return [...new Set(valeurs.map((v) => Math.round(v * 100) / 100))].filter((v) => v >= m).slice(0, 5)
})

const pretAEncaisser = computed(() => {
  if (!moyen.value || !pretPreparation.value) return false
  if (moyen.value === 'especes') return rendu.value >= 0
  return reference.value.trim().length > 0
})

async function choisirMoyen(id) {
  moyen.value = id
  erreurCaisse.value = ''
  await nextTick()
  document.getElementById(id === 'especes' ? 'caisse-recu' : 'caisse-ref')?.focus()
}

async function encaisser() {
  if (!pretAEncaisser.value || encaissement.value) return
  encaissement.value = true
  erreurCaisse.value = ''
  try {
    paiement.value = await api.encaisserDevis({
      projetId: devis.value.id, lignes: calcul.value.lignes.map((l) => ({ id: l.id, quantite: l.quantite })),
      articles: extras.value.map((e) => ({ id: e.id, quantite: e.quantite })), promotionId: promotion.value?.id || null, credit: calcul.value.creditUtilise, moyen: moyen.value,
      reference: moyen.value === 'especes' ? null : reference.value.trim(),
      montantRecu: moyen.value === 'especes' ? montantRecu.value : null
    })
    ajouterPaiement(paiement.value)
    etape.value = 'recu'
    notifier(`Encaissement enregistré — reçu ${paiement.value.numero_recu}.`)
  } catch (e) {
    erreurCaisse.value = e?.message || 'Encaissement impossible.'
  } finally {
    encaissement.value = false
  }
}

// ---------- 4. Reçu ----------
const telechargement = ref('') // 'visualiser' | 'telecharger' pendant la génération
async function recuPdf(mode) {
  telechargement.value = mode
  try {
    const { exporterRecuPdf } = await import('@/services/export/exportRecu.js')
    await exporterRecuPdf({ paiement: paiement.value, fiche: fiche.value, encaissePar: nomCompte.value }, mode)
  } catch (e) {
    console.warn(e)
    notifier('Génération du reçu impossible.', 'erreur')
  } finally {
    telechargement.value = ''
  }
}
</script>

<template>
  <div class="val">
    <!-- Étapes -->
    <ol class="val-etapes" aria-label="Étapes du retrait">
      <li v-for="(e, i) in etapes" :key="e.id" :class="{ faite: i < indexEtape, active: i === indexEtape }" :aria-current="i === indexEtape ? 'step' : undefined">
        <span class="val-etape-num"><i v-if="i < indexEtape" class="fa-solid fa-check" aria-hidden="true"></i><template v-else>{{ i + 1 }}</template></span>
        <span>{{ e.label }}</span>
      </li>
    </ol>

    <!-- ========== 1. Code ========== -->
    <div v-if="etape === 'code'" class="val-code-grille">
      <form class="adm-carte adm-carte-pad val-code" novalidate @submit.prevent="rechercher()">
        <span class="val-code-icone"><i class="fa-solid fa-ticket" aria-hidden="true"></i></span>
        <h2>Code de retrait du client</h2>
        <p>Il figure en haut à droite du devis PDF du client, et dans son espace « Mes projets ».</p>
        <label for="val-code" class="visually-hidden">Code de retrait</label>
        <input
          id="val-code" ref="champCode" :value="saisie" class="val-code-champ" placeholder="XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text"
          :aria-invalid="!!erreurCode" aria-describedby="val-code-erreur" @input="saisie = formaterCode($event.target.value); erreurCode = ''"
        />
        <p v-if="erreurCode" id="val-code-erreur" class="adm-erreur-texte" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ erreurCode }}</p>
        <button type="submit" class="adm-btn adm-btn-noir val-code-btn" :disabled="!codeComplet || recherche">
          <span v-if="recherche" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> Rechercher le devis
        </button>
      </form>

      <section class="adm-carte adm-carte-pad">
        <div class="adm-carte-tete"><div><h2>Devis qui vous ont choisi</h2><p>Pas encore encaissés. Le client viendra avec son code.</p></div></div>
        <ul v-if="enAttente.length" class="val-attente">
          <li v-for="d in enAttente.slice(0, 8)" :key="d.id">
            <span class="adm-identite">
              <span class="adm-avatar"><i :class="trouverTypeProjet(d.type_projet_id)?.icone || 'fa-solid fa-file-invoice'" aria-hidden="true"></i></span>
              <span><strong>{{ d.nom }}</strong><small><span class="adm-mono">{{ d.code_retrait }}</span> · {{ formatDate(d.cree_le, { day: 'numeric', month: 'short' }) }} · {{ formaterEuros(d.cout_total) }}</small></span>
            </span>
            <button v-if="d.code_retrait" type="button" class="adm-btn adm-btn-clair adm-btn-sm" @click="rechercher(d.code_retrait)">Ouvrir</button>
          </li>
        </ul>
        <div v-else class="adm-vide"><i class="fa-solid fa-inbox" aria-hidden="true"></i><p>Aucun devis en attente.</p></div>
      </section>
    </div>

    <template v-else-if="devis">
      <!-- Devis retrouvé -->
      <section class="adm-carte adm-carte-pad val-devis">
        <span class="adm-avatar val-devis-icone"><i :class="typeDevis?.icone || 'fa-solid fa-file-invoice'" aria-hidden="true"></i></span>
        <div class="val-devis-texte">
          <strong>{{ devis.nom }}</strong>
          <small>{{ typeDevis?.libelle }} · devis du {{ formatDate(devis.cree_le) }} · code <span class="adm-mono">{{ devis.code_retrait }}</span></small>
        </div>
        <span v-if="!devis.fournisseur_choisi && !devis.paiement" class="adm-badge adm-badge-info" title="Le client n’avait choisi aucun fournisseur : ce devis vous sera rattaché à l’encaissement">Sans fournisseur choisi</span>
        <button type="button" class="adm-btn adm-btn-fantome adm-btn-sm" @click="recommencer"><i class="fa-solid fa-xmark" aria-hidden="true"></i> Autre code</button>
      </section>

      <!-- ========== 2. Préparation ========== -->
      <div v-if="etape === 'preparation'" class="val-grille">
        <section class="adm-carte">
          <div class="adm-carte-tete val-pad">
            <div><h2>Préparation de la commande</h2><p>Ajustez la quantité remise de chaque matériau. 0 = non fourni, non facturé. Vos prix du catalogue s’appliquent.</p></div>
            <button type="button" class="adm-btn adm-btn-clair adm-btn-sm" @click="toutFournir">Tout fournir</button>
          </div>
          <ul class="val-lignes">
            <li v-for="l in calcul.lignes" :key="l.id" :class="{ manquant: l.quantite === 0, partiel: l.quantite > 0 && l.quantite < l.quantiteDevis }">
              <span class="val-ligne-texte">
                <strong>{{ l.libelle }}</strong>
                <small>
                  Devis : {{ formaterQuantite(l.quantiteDevis, l.unite) }} ·
                  <template v-if="l.prixUnitaire !== prixDevis(l)"><s>{{ formaterEuros(prixDevis(l)) }}</s> </template>{{ formaterEuros(l.prixUnitaire) }} / {{ l.unite === 'u' ? 'unité' : l.unite }}
                </small>
                <small v-if="l.rupture && !l.nonVendu" class="val-stock hors">En rupture de stock (voir « Matériaux »)</small>
                <small v-else-if="l.nonVendu" class="val-stock hors">Vous ne vendez pas ce matériau (voir « Matériaux »)</small>
                <small v-else-if="l.stock != null" class="val-stock" :class="{ hors: l.quantite > l.stock }">Stock : {{ formaterQuantite(l.stock, l.unite) }}</small>
              </span>
              <span class="val-quantite">
                <button type="button" class="adm-icone-btn adm-icone-btn-bord" :disabled="l.nonVendu || l.rupture || l.quantite === 0" :aria-label="`Aucun ${l.libelle}`" title="Non fourni" @click="definirQuantite(l, 0)"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
                <span class="adm-saisie-unite">
                  <input :value="saisies[l.id]" inputmode="decimal" :disabled="l.nonVendu || l.rupture" :aria-label="`Quantité remise : ${l.libelle}`" @input="saisies = { ...saisies, [l.id]: $event.target.value }" @change="definirQuantite(l, $event.target.value)" @keydown.enter.prevent="definirQuantite(l, $event.target.value)" />
                  <span>{{ l.unite }}</span>
                </span>
                <button type="button" class="adm-icone-btn adm-icone-btn-bord" :disabled="l.nonVendu || l.rupture || l.quantite === l.quantiteDevis" :aria-label="`Quantité du devis : ${l.libelle}`" title="Quantité du devis" @click="definirQuantite(l, l.quantiteDevis)"><i class="fa-solid fa-check-double" aria-hidden="true"></i></button>
              </span>
              <span class="val-ligne-prix">{{ formaterEuros(l.sousTotal) }}</span>
            </li>
            <li v-for="e in extras" :key="e.id" class="val-extra">
              <span class="val-ligne-texte">
                <strong><i class="fa-solid fa-box-open" aria-hidden="true"></i> {{ e.libelle }}</strong>
                <small>Votre article · {{ formaterEuros(e.prix_unitaire) }} / {{ e.unite }}</small>
                <small v-if="e.stock != null" class="val-stock" :class="{ hors: e.quantite > e.stock }">Stock : {{ formaterQuantite(e.stock, e.unite) }}</small>
              </span>
              <span class="val-quantite">
                <button type="button" class="adm-icone-btn adm-icone-btn-bord" :aria-label="`Retirer ${e.libelle}`" title="Retirer" @click="retirerArticle(e)"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
                <span class="adm-saisie-unite">
                  <input :value="e.saisie" inputmode="decimal" :aria-label="`Quantité : ${e.libelle}`" @change="quantiteArticle(e, $event.target.value)" @keydown.enter.prevent="quantiteArticle(e, $event.target.value)" />
                  <span>{{ e.unite }}</span>
                </span>
                <span class="val-quantite-vide"></span>
              </span>
              <span class="val-ligne-prix">{{ formaterEuros(calcul.extras.find((x) => x.articleId === e.id)?.sousTotal || 0) }}</span>
            </li>
          </ul>
          <div v-if="articlesDisponibles.length" class="val-ajout">
            <label for="val-article" class="visually-hidden">Ajouter un de vos articles</label>
            <select id="val-article" v-model="articleAjoute" class="adm-saisie">
              <option value="">Ajouter un de vos articles…</option>
              <option v-for="a in articlesDisponibles" :key="a.id" :value="a.id">{{ a.libelle }} — {{ formaterEuros(a.prix_unitaire) }} / {{ a.unite }}</option>
            </select>
            <button type="button" class="adm-btn adm-btn-clair" :disabled="!articleAjoute" @click="ajouterArticle"><i class="fa-solid fa-plus" aria-hidden="true"></i> Ajouter</button>
          </div>
        </section>

        <aside class="adm-carte adm-carte-pad val-resume">
          <h2>À encaisser</h2>
          <div class="adm-champ">
            <label for="val-promo">Promotion</label>
            <select id="val-promo" v-model="promotionId">
              <option value="">Aucune promotion</option>
              <option v-for="p in promotionsValables" :key="p.id" :value="p.id" :disabled="promotionsUtilisees.has(p.id)">{{ libellePromo(p) }}{{ promotionsUtilisees.has(p.id) ? ' — déjà utilisée par ce client' : '' }}</option>
            </select>
            <span v-if="!promotionsValables.length" class="adm-champ-aide"><span>Créez vos promotions dans « Promotions ».</span></span>
          </div>
          <dl>
            <div><dt>Matériaux remis ({{ calcul.fournies.length }}/{{ calcul.lignes.length }})</dt><dd>{{ formaterEuros(calcul.materiaux) }}</dd></div>
            <div v-if="calcul.remiseFournisseur"><dt>{{ promotion?.libelle }}</dt><dd>−{{ formaterEuros(calcul.remiseFournisseur) }}</dd></div>
            <div v-if="calcul.reduction"><dt>Code BTM {{ calcul.remise.code }}</dt><dd>−{{ formaterEuros(calcul.reduction) }}</dd></div>
            <div v-if="calcul.creditUtilise"><dt>Crédit fidélité BTM</dt><dd>−{{ formaterEuros(calcul.creditUtilise) }}</dd></div>
          </dl>
          <label v-if="devis.credit_disponible > 0" class="val-credit">
            <input v-model="utiliserCredit" type="checkbox" />
            <span>Utiliser le crédit fidélité du client <strong>{{ formaterEuros(devis.credit_disponible) }}</strong><small>Offert par BTM : déduit de votre commission, pas de votre chiffre d’affaires.</small></span>
          </label>
          <p v-if="calcul.codeBtmIgnore" class="val-note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Le code {{ calcul.remise.code }} a déjà été utilisé par ce client sur un autre devis : il ne s’applique qu’une fois.</p>
          <p class="val-total"><span>Le client paie</span><strong>{{ formaterEuros(calcul.montant) }}</strong></p>
          <p class="val-commission"><i class="fa-solid fa-building-columns" aria-hidden="true"></i> Commission BTM ({{ String(calcul.taux).replace('.', ',') }} %) : {{ formaterEuros(calcul.commission) }}, à reverser — jamais payée par le client.</p>
          <p v-if="calcul.stockInsuffisant.length" class="adm-erreur-texte" role="alert"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Stock insuffisant : {{ calcul.stockInsuffisant.map((l) => l.libelle).join(', ') }}.</p>
          <button type="button" class="adm-btn adm-btn-noir val-plein" :disabled="!pretPreparation" @click="etape = 'caisse'">
            Passer en caisse <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
          </button>
          <p v-if="!calcul.fournies.length" class="adm-erreur-texte">Aucun matériau remis : rien à encaisser.</p>
        </aside>
      </div>

      <!-- ========== 3. Caisse (terminal) ========== -->
      <div v-else-if="etape === 'caisse'" class="val-grille">
        <section class="adm-carte adm-carte-pad">
          <div class="adm-carte-tete"><div><h2>Moyen de paiement</h2><p>Comment le client règle-t-il ?</p></div></div>
          <div class="val-moyens" role="radiogroup" aria-label="Moyen de paiement">
            <button v-for="(m, id) in MOYENS" :key="id" type="button" role="radio" class="val-moyen" :aria-checked="moyen === id" @click="choisirMoyen(id)">
              <i :class="m.icone" aria-hidden="true"></i><span>{{ m.libelle }}</span>
            </button>
          </div>

          <form v-if="moyen" class="val-saisie" novalidate @submit.prevent="encaisser">
            <!-- Carte : le TPE du magasin -->
            <template v-if="moyen === 'carte'">
              <ol class="val-consignes">
                <li>Saisissez <strong>{{ formaterEuros(calcul.montant) }}</strong> sur votre terminal de paiement.</li>
                <li>Le client présente sa carte et valide.</li>
                <li>Recopiez le n° de transaction imprimé sur le ticket.</li>
              </ol>
            </template>
            <template v-else-if="moyen === 'virement'">
              <p class="val-avertissement"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> N’encaissez qu’après avoir vu les fonds arriver sur votre compte.</p>
            </template>
            <template v-else-if="moyen === 'cheque'">
              <p class="val-avertissement"><i class="fa-solid fa-id-card" aria-hidden="true"></i> Vérifiez une pièce d’identité et reportez son numéro au dos du chèque.</p>
            </template>

            <div v-if="moyen === 'especes'" class="val-especes">
              <div class="adm-champ">
                <label for="caisse-recu">Montant remis par le client</label>
                <div class="adm-saisie-unite"><input id="caisse-recu" v-model="recuSaisi" inputmode="decimal" autocomplete="off" placeholder="0,00" /><span>€</span></div>
              </div>
              <div class="adm-pilules val-billets" aria-label="Montants rapides">
                <button v-for="s in suggestions" :key="s" type="button" class="adm-pilule" :class="{ actif: montantRecu === s }" @click="recuSaisi = String(s).replace('.', ',')">
                  {{ s === calcul.montant ? 'Compte juste' : formaterEuros(s) }}
                </button>
              </div>
              <p v-if="Number.isFinite(rendu) && recuSaisi" class="val-rendu" :class="{ manque: rendu < 0 }" role="status">
                <span>{{ rendu < 0 ? 'Il manque' : 'Monnaie à rendre' }}</span><strong>{{ formaterEuros(Math.abs(rendu)) }}</strong>
              </p>
            </div>
            <div v-else class="adm-champ">
              <label for="caisse-ref">{{ MOYENS[moyen].reference }}</label>
              <input id="caisse-ref" v-model="reference" maxlength="60" autocomplete="off" :placeholder="MOYENS[moyen].exemple" />
            </div>

            <p v-if="erreurCaisse" class="adm-erreur-texte" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ erreurCaisse }}</p>
          </form>
        </section>

        <!-- Écran du terminal -->
        <aside class="val-terminal" aria-label="Terminal d’encaissement">
          <span class="val-terminal-tete"><i class="fa-solid fa-cash-register" aria-hidden="true"></i> Caisse · {{ devis.code_retrait }}</span>
          <span class="val-terminal-libelle">À encaisser</span>
          <strong class="val-terminal-montant">{{ formaterEuros(calcul.montant) }}</strong>
          <span class="val-terminal-detail">{{ calcul.fournies.length }} matériau{{ calcul.fournies.length > 1 ? 'x' : '' }} · {{ devis.nom }}</span>
          <span v-if="calcul.remiseFournisseur" class="val-terminal-detail"><i class="fa-solid fa-tag" aria-hidden="true"></i> {{ promotion?.libelle }} : −{{ formaterEuros(calcul.remiseFournisseur) }}</span>
          <span v-if="moyen" class="val-terminal-moyen"><i :class="MOYENS[moyen].icone" aria-hidden="true"></i> {{ MOYENS[moyen].libelle }}</span>
          <button type="button" class="val-terminal-valider" :disabled="!pretAEncaisser || encaissement" @click="encaisser">
            <span v-if="encaissement" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-lock" aria-hidden="true"></i>
            Valider l’encaissement
          </button>
          <button type="button" class="val-terminal-retour" :disabled="encaissement" @click="etape = 'preparation'"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Modifier la préparation</button>
        </aside>
      </div>

      <!-- ========== 4. Reçu ========== -->
      <section v-else-if="etape === 'recu' && paiement" class="adm-carte adm-carte-pad val-recu">
        <span class="val-recu-icone" :class="{ ancien: devis.paiement }"><i :class="devis.paiement ? 'fa-solid fa-circle-info' : 'fa-solid fa-check'" aria-hidden="true"></i></span>
        <h2>{{ devis.paiement ? 'Ce devis a déjà été encaissé' : 'Encaissement enregistré' }}</h2>
        <p class="val-recu-numero">Reçu <strong class="adm-mono">{{ paiement.numero_recu || 'sans numéro (ancien paiement)' }}</strong></p>
        <dl class="val-recu-infos">
          <div><dt>Montant</dt><dd>{{ formaterEuros(paiement.montant_devis) }}</dd></div>
          <div><dt>Moyen</dt><dd>{{ MOYENS[paiement.moyen]?.libelle || '—' }}</dd></div>
          <div v-if="paiement.reference"><dt>Référence</dt><dd class="adm-mono">{{ paiement.reference }}</dd></div>
          <div v-if="paiement.moyen === 'especes'"><dt>Monnaie rendue</dt><dd>{{ formaterEuros(paiement.rendu || 0) }}</dd></div>
          <div><dt>Le</dt><dd>{{ formatHeure(paiement.paye_le) }}</dd></div>
        </dl>
        <div class="val-recu-actions">
          <template v-if="paiement.numero_recu">
            <button type="button" class="adm-btn adm-btn-noir" :disabled="!!telechargement" @click="recuPdf('visualiser')">
              <span v-if="telechargement === 'visualiser'" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-eye" aria-hidden="true"></i> Visualiser le reçu
            </button>
            <button type="button" class="adm-btn adm-btn-clair" :disabled="!!telechargement" @click="recuPdf('telecharger')">
              <span v-if="telechargement === 'telecharger'" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-download" aria-hidden="true"></i> Télécharger
            </button>
          </template>
          <button type="button" class="adm-btn adm-btn-clair" @click="recommencer"><i class="fa-solid fa-ticket" aria-hidden="true"></i> Nouveau retrait</button>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.val { display: flex; flex-direction: column; gap: 20px; }

/* Étapes */
.val-etapes { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
.val-etapes li { display: inline-flex; align-items: center; gap: 10px; padding: 6px 16px 6px 6px; border-radius: 999px; background: #fff; box-shadow: var(--adm-ombre); color: var(--adm-muet); font-size: .88rem; font-weight: 600; }
.val-etape-num { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 50%; background: var(--adm-ligne-2); font-size: .8rem; }
.val-etapes li.active { color: var(--adm-encre); }
.val-etapes li.active .val-etape-num { background: var(--adm-noir); color: #fff; }
.val-etapes li.faite { color: #047857; }
.val-etapes li.faite .val-etape-num { background: #d1fae5; }

/* 1. Code */
.val-code-grille { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; align-items: stretch; }
.val-code-grille > .adm-carte { display: flex; flex-direction: column; }
.val-code-grille > .adm-carte > .adm-vide { flex: 1; }
.val-code { justify-content: center; }
.val-code { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; padding-block: 36px; }
.val-code h2 { margin: 6px 0 0; font-family: var(--font-corps); font-size: 1.25rem; font-weight: 600; }
.val-code > p { margin: 0 0 8px; max-width: 380px; color: var(--adm-encre-2); font-size: .9rem; }
.val-code-icone { width: 60px; height: 60px; display: grid; place-items: center; border-radius: 18px; background: var(--adm-noir); color: #fff; font-size: 1.5rem; }
.val-code-champ {
  width: 100%; max-width: 340px; height: 68px; padding: 0 16px; border: 2px solid var(--adm-ligne); border-radius: 16px; background: #fff;
  font-family: var(--font-mono); font-size: 2rem; font-weight: 700; letter-spacing: .14em; text-align: center; text-transform: uppercase; color: var(--adm-encre);
  transition: border-color var(--transition), box-shadow var(--transition);
}
.val-code-champ::placeholder { color: #cfd5de; }
.val-code-champ:focus { outline: none; border-color: var(--adm-accent); box-shadow: 0 0 0 5px rgba(8, 145, 178, .14); }
.val-code-champ[aria-invalid="true"] { border-color: var(--adm-baisse); }
.val-code-btn { width: 100%; max-width: 340px; min-height: 48px; margin-top: 4px; }
.val-attente { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
.val-attente li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 0; border-top: 1px solid var(--adm-ligne-2); }
.val-attente li:first-child { border-top: 0; padding-top: 0; }

/* Devis retrouvé */
.val-devis { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; padding-block: 16px; }
.val-devis-icone { width: 48px; height: 48px; background: var(--adm-accent-doux); color: var(--lagon-700); font-size: 1.1rem; }
.val-devis-texte { flex: 1 1 240px; display: flex; flex-direction: column; min-width: 0; }
.val-devis-texte strong { font-size: 1.05rem; font-weight: 600; }
.val-devis-texte small { color: var(--adm-muet); font-size: .84rem; }

.val-grille { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 20px; align-items: start; }
.val-pad { padding: 22px 24px 0; }

/* 2. Préparation */
.val-lignes { margin: 0; padding: 8px 12px 12px; list-style: none; }
.val-lignes li { display: grid; grid-template-columns: minmax(0, 1fr) auto 96px; align-items: center; gap: 16px; padding: 14px 12px; border-top: 1px solid var(--adm-ligne-2); transition: background var(--transition); }
.val-lignes li:first-child { border-top: 0; }
.val-lignes li.manquant { background: #fffbeb; border-radius: 12px; }
.val-lignes li.manquant .val-ligne-texte strong, .val-lignes li.manquant .val-ligne-prix { color: var(--adm-muet); text-decoration: line-through; }
.val-lignes li.partiel { background: #f0f9ff; border-radius: 12px; }
.val-ligne-texte s { color: var(--adm-muet); }
.val-stock { color: #047857 !important; font-weight: 600; }
.val-stock.hors { color: var(--adm-baisse) !important; }
.val-quantite { display: inline-flex; align-items: center; gap: 6px; }
.val-quantite .adm-saisie-unite { width: 118px; }
.val-quantite input { width: 100%; min-height: 38px; padding: 6px 40px 6px 12px; border: 1px solid var(--adm-ligne); border-radius: 10px; font: inherit; font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }
.val-quantite input:focus { outline: none; border-color: var(--adm-accent); box-shadow: 0 0 0 3px rgba(8, 145, 178, .14); }
.val-ligne-prix { text-align: right; }
.val-extra { background: #f5f3ff; border-radius: 12px; }
.val-credit { display: flex; gap: 10px; padding: 12px; border-radius: 12px; background: #ecfdf5; color: #065f46; font-size: .86rem; cursor: pointer; }
.val-credit input { width: 18px; height: 18px; margin-top: 2px; accent-color: #059669; }
.val-credit span { display: flex; flex-direction: column; }
.val-credit small { color: #047857; font-size: .78rem; }
.val-commission { display: flex; gap: 8px; margin: 0; color: var(--adm-muet); font-size: .8rem; line-height: 1.45; }
.val-commission i { margin-top: 3px; }
.val-extra .val-ligne-texte strong i { margin-right: 4px; color: #6d28d9; }
.val-quantite-vide { width: 36px; }
.val-ajout { display: flex; gap: 8px; padding: 4px 24px 20px; }
.val-ajout select { flex: 1; min-height: 42px; }
.val-ligne-texte { display: flex; flex-direction: column; min-width: 0; }
.val-ligne-texte strong { font-weight: 600; }
.val-ligne-texte small { color: var(--adm-muet); font-size: .82rem; }
.val-ligne-prix { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }

.val-resume { position: sticky; top: 16px; display: flex; flex-direction: column; gap: 14px; }
.val-resume h2 { margin: 0; font-family: var(--font-corps); font-size: 1.02rem; font-weight: 600; }
.val-resume dl { display: flex; flex-direction: column; gap: 8px; margin: 0; }
.val-resume dl div { display: flex; justify-content: space-between; gap: 12px; font-size: .9rem; }
.val-resume dt { color: var(--adm-encre-2); }
.val-resume dd { margin: 0; font-variant-numeric: tabular-nums; }
.val-total { display: flex; align-items: baseline; justify-content: space-between; margin: 0; padding-top: 14px; border-top: 1px solid var(--adm-ligne); }
.val-total strong { font-size: 1.9rem; font-weight: 600; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.val-note { display: flex; gap: 8px; margin: 0; padding: 10px 12px; border-radius: 12px; background: #fffbeb; color: #92400e; font-size: .84rem; line-height: 1.45; }
.val-note i { margin-top: 3px; }
.val-plein { width: 100%; min-height: 48px; }

/* 3. Caisse */
.val-moyens { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.val-moyen {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; min-height: 104px; padding: 14px 10px;
  border: 2px solid var(--adm-ligne); border-radius: 18px; background: #fff; color: var(--adm-encre-2); font: inherit; font-size: .88rem; font-weight: 600; text-align: center; cursor: pointer;
  transition: border-color var(--transition), background var(--transition), color var(--transition);
}
.val-moyen i { font-size: 1.5rem; }
.val-moyen:hover { border-color: var(--adm-muet); color: var(--adm-encre); }
.val-moyen[aria-checked="true"] { border-color: var(--adm-noir); background: var(--adm-noir); color: #fff; }
.val-saisie { display: flex; flex-direction: column; gap: 16px; margin-top: 22px; padding-top: 22px; border-top: 1px solid var(--adm-ligne-2); }
.val-consignes { display: flex; flex-direction: column; gap: 6px; margin: 0; padding-left: 20px; color: var(--adm-encre-2); font-size: .9rem; line-height: 1.5; }
.val-avertissement { display: flex; align-items: flex-start; gap: 10px; margin: 0; padding: 12px 14px; border-radius: 12px; background: #fffbeb; color: #92400e; font-size: .88rem; }
.val-avertissement i { margin-top: 3px; }
.val-especes { display: flex; flex-direction: column; gap: 12px; }
.val-especes input { font-size: 1.3rem; font-weight: 600; }
.val-rendu { display: flex; align-items: baseline; justify-content: space-between; margin: 0; padding: 14px 18px; border-radius: 14px; background: #ecfdf5; color: #047857; }
.val-rendu strong { font-size: 1.6rem; font-variant-numeric: tabular-nums; }
.val-rendu.manque { background: #fff1f2; color: var(--adm-baisse); }

.val-terminal {
  position: sticky; top: 16px; display: flex; flex-direction: column; gap: 6px; padding: 24px; border-radius: 28px;
  background: var(--adm-noir); color: #fff; box-shadow: 0 20px 50px rgba(15, 23, 42, .25);
}
.val-terminal-tete { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 14px; color: rgba(255, 255, 255, .55); font-family: var(--font-mono); font-size: .8rem; }
.val-terminal-libelle { color: rgba(255, 255, 255, .6); font-size: .85rem; }
.val-terminal-montant { font-size: clamp(2.2rem, 3.4vw, 2.8rem); font-weight: 600; letter-spacing: -.02em; line-height: 1.05; font-variant-numeric: tabular-nums; color: #67e8f9; }
.val-terminal-detail { color: rgba(255, 255, 255, .55); font-size: .82rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.val-terminal-moyen { display: inline-flex; align-items: center; gap: 8px; align-self: flex-start; margin-top: 10px; padding: 6px 12px; border-radius: 999px; background: rgba(255, 255, 255, .1); font-size: .84rem; }
.val-terminal-valider {
  display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 54px; margin-top: 22px; border: 0; border-radius: 16px;
  background: #10b981; color: #fff; font: inherit; font-size: 1rem; font-weight: 700; cursor: pointer; transition: background var(--transition), opacity var(--transition);
}
.val-terminal-valider:hover:not(:disabled) { background: #059669; }
.val-terminal-valider:disabled { opacity: .35; cursor: not-allowed; }
.val-terminal-retour { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 40px; border: 0; background: none; color: rgba(255, 255, 255, .6); font: inherit; font-size: .86rem; cursor: pointer; }
.val-terminal-retour:hover:not(:disabled) { color: #fff; }

/* 4. Reçu */
.val-recu { display: flex; flex-direction: column; align-items: center; gap: 12px; padding-block: 40px; text-align: center; }
.val-recu-icone { width: 64px; height: 64px; display: grid; place-items: center; border-radius: 50%; background: #d1fae5; color: #047857; font-size: 1.6rem; }
.val-recu-icone.ancien { background: var(--adm-accent-doux); color: var(--lagon-700); }
.val-recu h2 { margin: 4px 0 0; font-family: var(--font-corps); font-size: 1.35rem; font-weight: 600; }
.val-recu-numero { margin: 0; color: var(--adm-encre-2); }
.val-recu-numero strong { font-size: 1.1rem; color: var(--adm-encre); }
.val-recu-infos { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; width: 100%; max-width: 720px; margin: 12px 0 8px; }
.val-recu-infos div { padding: 12px 14px; border-radius: 14px; background: var(--adm-ligne-2); text-align: left; }
.val-recu-infos dt { font-size: .78rem; color: var(--adm-muet); }
.val-recu-infos dd { margin: 2px 0 0; font-weight: 600; }
.val-recu-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }

@media (max-width: 1100px) {
  .val-grille, .val-code-grille { grid-template-columns: 1fr; }
  .val-resume, .val-terminal { position: static; }
}
@media (max-width: 640px) {
  .val-moyens { grid-template-columns: 1fr 1fr; }
  .val-lignes li { grid-template-columns: minmax(0, 1fr) auto; }
  .val-quantite { grid-column: 1 / -1; justify-self: start; }
  .val-code-champ { font-size: 1.6rem; }
}
</style>

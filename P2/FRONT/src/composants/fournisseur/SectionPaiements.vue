<script setup>
/**
 * Paiements — suivi des encaissements (traçabilité) :
 *  - Encaissements : filtre par période et par moyen, totaux, reçu PDF, export CSV pour la comptabilité,
 *    annulation avec motif obligatoire ;
 *  - Journal : toutes les opérations (encaissements et annulations), jamais modifiées ni effacées ;
 *  - Reversement à BTM : le fournisseur encaisse tout et reverse les frais de service BTM sur le RIB
 *    saisi par l'admin ; son virement est pris en compte dès qu'il le déclare (migrations 0014, 0015).
 */
import { computed, ref } from 'vue'
import { useAdmin } from '@/composables/useAdmin.js'
import { useEspaceFournisseur, formatDate, formatHeure } from '@/composables/useEspaceFournisseur.js'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'
import { formaterIban } from '@/services/versements.js'
import * as api from '@/services/supabase/serviceEspaceFournisseur.js'
import AdminPanneau from '@/composants/admin/AdminPanneau.vue'

const props = defineProps({ recherche: { type: String, default: '' } })
const { MOYENS } = api
const { notifier } = useAdmin()
const { fiche, paiements, journal, journalIndisponible, nomCompte, retirerPaiement, reversements, rib, soldeBtm } = useEspaceFournisseur()

const onglet = ref('encaissements')

// ---------- Filtres ----------
const periodes = [
  { id: 'jour', label: 'Aujourd’hui' },
  { id: '7j', label: '7 jours' },
  { id: 'mois', label: 'Ce mois-ci' },
  { id: 'tout', label: 'Tout' }
]
const periode = ref('mois')
const filtreMoyen = ref('')
const debutPeriode = computed(() => {
  const d = new Date()
  if (periode.value === 'jour') return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (periode.value === '7j') return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 6)
  if (periode.value === 'mois') return new Date(d.getFullYear(), d.getMonth(), 1)
  return null
})
const normaliser = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const correspond = (q, ...champs) => !q || champs.some((c) => normaliser(c).includes(q))

const dansPeriode = computed(() => paiements.value.filter((p) => !debutPeriode.value || new Date(p.paye_le) >= debutPeriode.value))
const liste = computed(() => {
  const q = normaliser(props.recherche.trim())
  return dansPeriode.value.filter((p) => (!filtreMoyen.value || p.moyen === filtreMoyen.value) && correspond(q, p.numero_recu, p.projet_nom, p.code_retrait, p.reference))
})
const totalParMoyen = computed(() => Object.fromEntries(Object.keys(MOYENS).map((m) => [m, dansPeriode.value.filter((p) => p.moyen === m).reduce((s, p) => s + p.montant_devis, 0)])))
const totalPeriode = computed(() => dansPeriode.value.reduce((s, p) => s + p.montant_devis, 0))
const totalListe = computed(() => liste.value.reduce((s, p) => s + p.montant_devis, 0))

const journalFiltre = computed(() => {
  const q = normaliser(props.recherche.trim())
  return journal.value.filter((j) => correspond(q, j.numero_recu, j.projet_nom, j.code_retrait, j.motif, j.par_email))
})

// ---------- Reversement à BTM ----------
const reversement = ref(null) // { montant, reference, envoi, erreur }
const referenceConseillee = computed(() => {
  const d = new Date()
  const nom = (fiche.value?.nom || 'FOURNISSEUR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 12)
  return `BTM-${nom}-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
})
function ouvrirReversement() {
  reversement.value = { montant: String(soldeBtm.value.reste).replace('.', ','), reference: referenceConseillee.value, envoi: false, erreur: '' }
}
async function copierTexte(texte, quoi) {
  try { await navigator.clipboard.writeText(texte); notifier(`${quoi} copié.`, 'info') } catch { notifier('Copie impossible.', 'erreur') }
}
async function declarer() {
  const r = reversement.value
  const montant = Number(String(r.montant).replace(/\s/g, '').replace(',', '.'))
  r.erreur = !(montant > 0) ? 'Le montant doit être supérieur à 0.'
    : montant > soldeBtm.value.reste + 0.001 ? `Vous devez au plus ${formaterEuros(soldeBtm.value.reste)} à BTM.`
    : r.reference.trim().length < 3 ? 'Indiquez la référence de votre virement.' : ''
  if (r.erreur) return
  r.envoi = true
  try {
    const nouveau = await api.declarerReversement(montant, r.reference.trim())
    reversements.value = [nouveau, ...reversements.value]
    notifier(`Reversement de ${formaterEuros(montant)} enregistré. Merci !`)
    reversement.value = null
  } catch (e) {
    r.erreur = e?.message || 'Déclaration impossible.'
    r.envoi = false
  }
}

// ---------- Reçu PDF ----------
const telechargement = ref(null) // `${id}:${mode}` pendant la génération
async function recuPdf(p, mode) {
  telechargement.value = `${p.id}:${mode}`
  try {
    const { exporterRecuPdf } = await import('@/services/export/exportRecu.js')
    await exporterRecuPdf({ paiement: p, fiche: fiche.value, encaissePar: nomCompte.value }, mode)
  } catch (e) {
    console.warn(e)
    notifier('Génération du reçu impossible.', 'erreur')
  } finally {
    telechargement.value = null
  }
}

// ---------- Export CSV (comptabilité) ----------
function exporterCsv() {
  const cellule = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const nombre = (n) => (n == null ? '' : String(n).replace('.', ','))
  const entete = ['N° reçu', 'Date', 'Heure', 'Projet', 'Code de retrait', 'Moyen', 'Référence', 'Matériaux', 'Montant encaissé', 'Espèces reçues', 'Monnaie rendue']
  const lignes = liste.value.map((p) => [
    p.numero_recu, formatDate(p.paye_le, { day: '2-digit', month: '2-digit', year: 'numeric' }), formatDate(p.paye_le, { hour: '2-digit', minute: '2-digit' }),
    p.projet_nom, p.code_retrait, MOYENS[p.moyen]?.court, p.reference, nombre(p.montant_materiaux), nombre(p.montant_devis), nombre(p.montant_recu), nombre(p.rendu)
  ])
  // point-virgule et BOM : ouverture directe dans Excel (paramètres français)
  const csv = '﻿' + [entete, ...lignes].map((l) => l.map(cellule).join(';')).join('\r\n')
  const lien = document.createElement('a')
  lien.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  lien.download = `Encaissements_${(fiche.value?.nom || 'BTM').replace(/[^a-z0-9]+/gi, '_')}_${new Date().toISOString().slice(0, 10)}.csv`
  lien.click()
  URL.revokeObjectURL(lien.href)
}

// ---------- Annulation (motif obligatoire) ----------
const annulation = ref(null) // { paiement, motif, envoi, erreur }
const MOTIFS = ['Erreur de saisie en caisse', 'Paiement refusé par la banque', 'Client remboursé', 'Matériaux retournés']
function ouvrirAnnulation(p) { annulation.value = { paiement: p, motif: '', envoi: false, erreur: '' } }
async function confirmerAnnulation() {
  const a = annulation.value
  if (a.motif.trim().length < 5) { a.erreur = 'Indiquez le motif de l’annulation (5 caractères minimum).'; return }
  a.envoi = true
  a.erreur = ''
  try {
    await api.annulerEncaissement(a.paiement.projet_id, a.motif.trim())
    retirerPaiement(a.paiement.projet_id)
    notifier(`Encaissement ${a.paiement.numero_recu || ''} annulé. L’opération reste inscrite au journal.`, 'info')
    annulation.value = null
  } catch (e) {
    a.erreur = e?.message || 'Annulation impossible.'
    a.envoi = false
  }
}
</script>

<template>
  <div class="pai">
    <!-- À reverser à BTM -->
    <section class="adm-carte rev">
      <span class="rev-icone"><i class="fa-solid fa-building-columns" aria-hidden="true"></i></span>
      <div class="rev-texte">
        <span>À reverser à BTM</span>
        <strong>{{ formaterEuros(soldeBtm.reste) }}</strong>
        <small>Frais de service BTM encaissés pour BTM<template v-if="soldeBtm.reverse"> · {{ formaterEuros(soldeBtm.reverse) }} déjà reversés</template></small>
      </div>
      <button type="button" class="adm-btn" :class="soldeBtm.reste > 0 ? 'adm-btn-noir' : 'adm-btn-clair'" @click="ouvrirReversement">
        <i class="fa-solid fa-paper-plane" aria-hidden="true"></i> {{ soldeBtm.reste > 0 ? 'Reverser à BTM' : 'Voir les reversements' }}
      </button>
    </section>

    <div class="pai-barre">
      <div class="adm-segments" role="tablist" aria-label="Paiements">
        <button type="button" role="tab" :aria-selected="onglet === 'encaissements'" @click="onglet = 'encaissements'"><i class="fa-solid fa-receipt" aria-hidden="true"></i> Encaissements</button>
        <button type="button" role="tab" :aria-selected="onglet === 'journal'" @click="onglet = 'journal'"><i class="fa-solid fa-list-check" aria-hidden="true"></i> Journal des opérations</button>
      </div>
      <button v-if="onglet === 'encaissements'" type="button" class="adm-btn adm-btn-clair" :disabled="!liste.length" @click="exporterCsv">
        <i class="fa-solid fa-file-csv" aria-hidden="true"></i> Exporter (CSV)
      </button>
    </div>

    <!-- ========== Encaissements ========== -->
    <template v-if="onglet === 'encaissements'">
      <div class="adm-pilules" role="group" aria-label="Période">
        <button v-for="p in periodes" :key="p.id" type="button" class="adm-pilule" :class="{ actif: periode === p.id }" :aria-pressed="periode === p.id" @click="periode = p.id">{{ p.label }}</button>
      </div>

      <ul class="pai-totaux">
        <li class="adm-carte pai-total-general">
          <span>Total encaissé</span><strong>{{ formaterEuros(totalPeriode) }}</strong><small>{{ dansPeriode.length }} reçu{{ dansPeriode.length > 1 ? 's' : '' }}</small>
        </li>
        <li v-for="(m, id) in MOYENS" :key="id">
          <button type="button" class="adm-carte pai-moyen" :class="{ actif: filtreMoyen === id }" :aria-pressed="filtreMoyen === id" :title="filtreMoyen === id ? 'Retirer le filtre' : `Afficher seulement : ${m.libelle}`" @click="filtreMoyen = filtreMoyen === id ? '' : id">
            <span><i :class="m.icone" aria-hidden="true"></i> {{ m.court }}</span><strong>{{ formaterEuros(totalParMoyen[id]) }}</strong>
          </button>
        </li>
      </ul>

      <section class="adm-carte">
        <div v-if="!liste.length" class="adm-vide">
          <i class="fa-solid fa-receipt" aria-hidden="true"></i>
          <p v-if="recherche">Aucun encaissement ne correspond à « {{ recherche }} ».</p>
          <p v-else>Aucun encaissement sur cette période{{ filtreMoyen ? ` en ${MOYENS[filtreMoyen].court.toLowerCase()}` : '' }}.</p>
        </div>
        <div v-else class="adm-table-cadre">
          <table class="adm-table adm-table-empile">
            <thead>
              <tr><th>Reçu</th><th>Date</th><th>Projet</th><th>Moyen</th><th>Référence</th><th class="num">Montant</th><th class="actions"><span class="visually-hidden">Actions</span></th></tr>
            </thead>
            <tbody>
              <tr v-for="p in liste" :key="p.id">
                <td class="principal"><strong class="adm-mono">{{ p.numero_recu || '—' }}</strong></td>
                <td data-label="Date">{{ formatHeure(p.paye_le) }}</td>
                <td data-label="Projet">
                  <span class="pai-projet"><span>{{ p.projet_nom }}</span><small v-if="p.code_retrait" class="adm-mono">{{ p.code_retrait }}</small></span>
                </td>
                <td data-label="Moyen">
                  <span v-if="MOYENS[p.moyen]" class="adm-badge sans-point pai-badge" :class="`pai-${p.moyen}`"><i :class="MOYENS[p.moyen].icone" aria-hidden="true"></i> {{ MOYENS[p.moyen].court }}</span>
                  <span v-else class="pai-muet">—</span>
                </td>
                <td data-label="Référence">
                  <span v-if="p.reference" class="adm-mono">{{ p.reference }}</span>
                  <span v-else-if="p.moyen === 'especes'" class="pai-muet">reçu {{ formaterEuros(p.montant_recu) }} · rendu {{ formaterEuros(p.rendu || 0) }}</span>
                  <span v-else class="pai-muet">—</span>
                </td>
                <td data-label="Montant" class="num">
                  <strong>{{ formaterEuros(p.montant_devis) }}</strong>
                  <small v-if="p.lignes_manquantes?.length" class="pai-partiel" :title="p.lignes_manquantes.map((l) => l.libelle).join(', ')">partiel · {{ p.lignes_manquantes.length }} manquant{{ p.lignes_manquantes.length > 1 ? 's' : '' }}</small>
                </td>
                <td class="actions">
                  <button type="button" class="adm-icone-btn" :disabled="!p.numero_recu || !!telechargement" :title="p.numero_recu ? 'Visualiser le reçu (PDF)' : 'Ancien paiement : pas de reçu'" :aria-label="`Visualiser le reçu ${p.numero_recu || ''}`" @click="recuPdf(p, 'visualiser')">
                    <span v-if="telechargement === `${p.id}:visualiser`" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-eye" aria-hidden="true"></i>
                  </button>
                  <button type="button" class="adm-icone-btn" :disabled="!p.numero_recu || !!telechargement" :title="p.numero_recu ? 'Télécharger le reçu (PDF)' : 'Ancien paiement : pas de reçu'" :aria-label="`Télécharger le reçu ${p.numero_recu || ''}`" @click="recuPdf(p, 'telecharger')">
                    <span v-if="telechargement === `${p.id}:telecharger`" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-download" aria-hidden="true"></i>
                  </button>
                  <button type="button" class="adm-icone-btn danger" title="Annuler l’encaissement" :aria-label="`Annuler l’encaissement ${p.numero_recu || ''}`" @click="ouvrirAnnulation(p)"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i></button>
                </td>
              </tr>
            </tbody>
            <tfoot v-if="liste.length > 1">
              <tr><td colspan="5" class="pai-pied">{{ liste.length }} encaissements</td><td class="num"><strong>{{ formaterEuros(totalListe) }}</strong></td><td></td></tr>
            </tfoot>
          </table>
        </div>
      </section>
    </template>

    <!-- ========== Journal ========== -->
    <section v-else class="adm-carte">
      <p class="adm-alerte adm-alerte-info pai-info"><i class="fa-solid fa-lock" aria-hidden="true"></i> Chaque encaissement et chaque annulation sont inscrits ici, avec la personne et l’heure. Le journal ne peut être ni modifié ni effacé.</p>
      <div v-if="journalIndisponible" class="adm-vide"><i class="fa-solid fa-database" aria-hidden="true"></i><p>Journal indisponible : exécutez la migration 0013 sur Supabase.</p></div>
      <div v-else-if="!journalFiltre.length" class="adm-vide"><i class="fa-solid fa-list-check" aria-hidden="true"></i><p>Aucune opération pour le moment.</p></div>
      <ol v-else class="pai-journal">
        <li v-for="j in journalFiltre" :key="j.id" :class="j.type">
          <span class="pai-journal-icone"><i :class="j.type === 'annulation' ? 'fa-solid fa-rotate-left' : 'fa-solid fa-check'" aria-hidden="true"></i></span>
          <div class="pai-journal-texte">
            <p>
              <strong>{{ j.type === 'annulation' ? 'Annulation' : 'Encaissement' }}</strong>
              <span class="adm-mono">{{ j.numero_recu || '' }}</span> · {{ j.projet_nom }}
              <span v-if="j.code_retrait" class="adm-mono pai-muet">({{ j.code_retrait }})</span>
            </p>
            <small>{{ formatHeure(j.le) }} · par {{ j.par_email || 'compte supprimé' }}<template v-if="MOYENS[j.moyen]"> · {{ MOYENS[j.moyen].court }}</template></small>
            <small v-if="j.motif" class="pai-motif">Motif : {{ j.motif }}</small>
          </div>
          <strong class="pai-journal-montant">{{ j.type === 'annulation' ? '−' : '' }}{{ formaterEuros(j.montant || 0) }}</strong>
        </li>
      </ol>
    </section>

    <!-- Reversement à BTM -->
    <AdminPanneau v-if="reversement" titre="Reverser à BTM" sous-titre="Faites un virement sur le compte de BTM, puis enregistrez-le ici." @fermer="reversement = null">
      <div class="rev-panneau">
        <div v-if="rib" class="rev-rib">
          <span class="rev-rib-banque"><i class="fa-solid fa-building-columns" aria-hidden="true"></i> {{ rib.banque || 'Compte BTM' }}</span>
          <span class="rev-rib-ligne"><small>Titulaire</small><strong>{{ rib.titulaire }}</strong></span>
          <span class="rev-rib-ligne">
            <small>IBAN</small><strong class="adm-mono">{{ formaterIban(rib.iban) }}</strong>
            <button type="button" class="rev-copier" aria-label="Copier l’IBAN" @click="copierTexte(rib.iban, 'IBAN')"><i class="fa-regular fa-copy" aria-hidden="true"></i></button>
          </span>
          <span v-if="rib.bic" class="rev-rib-ligne"><small>BIC</small><strong class="adm-mono">{{ rib.bic }}</strong></span>
        </div>
        <p v-else class="adm-alerte"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> BTM n’a pas encore communiqué son RIB. Contactez BTM avant de faire votre virement.</p>

        <dl class="rev-chiffres">
          <div><dt>Dû au total</dt><dd>{{ formaterEuros(soldeBtm.du) }}</dd></div>
          <div><dt>Déjà reversé</dt><dd>{{ formaterEuros(soldeBtm.reverse) }}</dd></div>
          <div><dt>Reste à reverser</dt><dd>{{ formaterEuros(soldeBtm.reste) }}</dd></div>
        </dl>

        <form v-if="soldeBtm.reste > 0 && rib" id="form-reversement" class="adm-grille-form" novalidate @submit.prevent="declarer">
          <div class="adm-champ">
            <label for="rev-montant">Montant viré</label>
            <span class="adm-saisie-unite"><input id="rev-montant" v-model="reversement.montant" inputmode="decimal" /><span>€</span></span>
          </div>
          <div class="adm-champ">
            <label for="rev-ref">Référence du virement</label>
            <span class="rev-ref"><input id="rev-ref" v-model="reversement.reference" class="adm-mono" maxlength="60" /><button type="button" class="rev-copier" aria-label="Copier la référence" @click="copierTexte(reversement.reference, 'Référence')"><i class="fa-regular fa-copy" aria-hidden="true"></i></button></span>
          </div>
          <p class="plein rev-aide"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Indiquez cette référence dans le libellé de votre virement : BTM retrouve ainsi votre paiement.</p>
        </form>
        <p v-if="reversement.erreur" class="adm-erreur-texte" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ reversement.erreur }}</p>

        <h3 class="rev-titre">Historique</h3>
        <ul v-if="reversements.length" class="rev-historique">
          <li v-for="r in reversements" :key="r.id">
            <span class="rev-h-icone"><i class="fa-solid fa-check" aria-hidden="true"></i></span>
            <span class="rev-h-texte">
              <strong>{{ formaterEuros(r.montant) }}</strong>
              <small>{{ formatHeure(r.declare_le) }} · <span class="adm-mono">{{ r.reference }}</span></small>
            </span>
            <span class="adm-badge adm-badge-ok">Reversé</span>
          </li>
        </ul>
        <p v-else class="rev-vide">Aucun reversement pour le moment.</p>
      </div>
      <template #pied>
        <button type="button" class="adm-btn adm-btn-clair" @click="reversement = null">Fermer</button>
        <button v-if="soldeBtm.reste > 0 && rib" type="submit" form="form-reversement" class="adm-btn adm-btn-noir" :disabled="reversement.envoi">
          <span v-if="reversement.envoi" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-check" aria-hidden="true"></i> J’ai effectué le virement
        </button>
      </template>
    </AdminPanneau>

    <!-- Annulation -->
    <AdminPanneau v-if="annulation" :titre="`Annuler l’encaissement ${annulation.paiement.numero_recu || ''}`" sous-titre="Le devis repassera « à encaisser ». L’opération et son motif restent inscrits au journal." @fermer="annulation = null">
      <form id="form-annulation" class="pai-annulation" novalidate @submit.prevent="confirmerAnnulation">
        <dl class="pai-annulation-recap">
          <div><dt>Projet</dt><dd>{{ annulation.paiement.projet_nom }}</dd></div>
          <div><dt>Montant</dt><dd>{{ formaterEuros(annulation.paiement.montant_devis) }}</dd></div>
          <div><dt>Moyen</dt><dd>{{ MOYENS[annulation.paiement.moyen]?.libelle || '—' }}</dd></div>
          <div><dt>Encaissé le</dt><dd>{{ formatHeure(annulation.paiement.paye_le) }}</dd></div>
        </dl>
        <div class="adm-champ">
          <label for="annul-motif">Motif de l’annulation *</label>
          <textarea id="annul-motif" v-model="annulation.motif" maxlength="300" rows="3" placeholder="Pourquoi annulez-vous cet encaissement ?"></textarea>
        </div>
        <div class="adm-pilules">
          <button v-for="m in MOTIFS" :key="m" type="button" class="adm-pilule" @click="annulation.motif = m">{{ m }}</button>
        </div>
        <p v-if="annulation.paiement.moyen === 'especes' || annulation.paiement.moyen === 'carte'" class="pai-rappel">
          <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
          {{ annulation.paiement.moyen === 'carte' ? 'Pensez à rembourser le client sur le TPE : l’annulation ici ne débite rien.' : 'Pensez à rendre les espèces au client : l’annulation ici ne fait que tracer l’opération.' }}
        </p>
        <p v-if="annulation.erreur" class="adm-erreur-texte" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ annulation.erreur }}</p>
      </form>
      <template #pied>
        <button type="button" class="adm-btn adm-btn-clair" @click="annulation = null">Retour</button>
        <button type="submit" form="form-annulation" class="adm-btn adm-btn-danger" :disabled="annulation.envoi">
          <span v-if="annulation.envoi" class="spinner" aria-hidden="true"></span> Annuler l’encaissement
        </button>
      </template>
    </AdminPanneau>
  </div>
</template>

<style scoped>
.pai { display: flex; flex-direction: column; gap: 18px; }
/* Reversement à BTM */
.rev { display: flex; flex-wrap: wrap; align-items: center; gap: 16px 20px; padding: 18px 22px; }
.rev-icone { width: 48px; height: 48px; flex: none; display: grid; place-items: center; border-radius: 14px; background: var(--adm-noir); color: #fff; font-size: 1.1rem; }
.rev-texte { flex: 1 1 260px; display: flex; flex-direction: column; min-width: 0; }
.rev-texte > span { color: var(--adm-encre-2); font-size: .86rem; }
.rev-texte strong { font-size: 1.6rem; font-weight: 600; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.rev-texte small { color: var(--adm-muet); font-size: .8rem; }
.rev-panneau { display: flex; flex-direction: column; gap: 18px; }
.rev-rib { display: flex; flex-direction: column; gap: 10px; padding: 20px; border-radius: 20px; color: #fff; background: linear-gradient(135deg, #0f172a 0%, #164e63 100%); }
.rev-rib-banque { font-size: .85rem; color: rgba(255, 255, 255, .75); }
.rev-rib-banque i { margin-right: 6px; }
.rev-rib-ligne { display: flex; align-items: center; gap: 12px; }
.rev-rib-ligne small { width: 70px; flex: none; color: rgba(255, 255, 255, .55); font-size: .78rem; }
.rev-rib-ligne strong { flex: 1; font-size: .95rem; letter-spacing: .04em; overflow-wrap: anywhere; }
.rev-copier { width: 32px; height: 32px; flex: none; display: grid; place-items: center; border: 0; border-radius: 8px; background: rgba(255, 255, 255, .12); color: inherit; cursor: pointer; }
.rev-copier:hover { background: rgba(255, 255, 255, .22); }
.rev-ref { position: relative; display: flex; }
.rev-ref input { flex: 1; padding-right: 48px !important; }
.rev-ref .rev-copier { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); background: var(--adm-ligne-2); color: var(--adm-encre); }
.rev-chiffres { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 0; }
.rev-chiffres div { padding: 12px 14px; border-radius: 14px; background: var(--adm-ligne-2); }
.rev-chiffres dt { font-size: .76rem; color: var(--adm-muet); }
.rev-chiffres dd { margin: 4px 0 0; font-weight: 600; font-variant-numeric: tabular-nums; }
.rev-aide { display: flex; gap: 8px; margin: 0; color: var(--adm-encre-2); font-size: .84rem; }
.rev-aide i { margin-top: 3px; }
.rev-titre { margin: 4px 0 0; font-family: var(--font-corps); font-size: .95rem; font-weight: 600; }
.rev-historique { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
.rev-historique li { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--adm-ligne-2); }
.rev-historique li:last-child { border-bottom: 0; }
.rev-h-icone { width: 34px; height: 34px; flex: none; display: grid; place-items: center; border-radius: 10px; background: #ecfdf5; color: #047857; }
.rev-h-texte { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.rev-h-texte small { color: var(--adm-muet); font-size: .8rem; }
.rev-vide { margin: 0; color: var(--adm-muet); font-size: .88rem; }

.pai-barre { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }

.pai-totaux { display: grid; grid-template-columns: 1.3fr repeat(4, minmax(0, 1fr)); gap: 12px; margin: 0; padding: 0; list-style: none; }
.pai-totaux > li { display: flex; }
.pai-total-general { flex: 1; display: flex; flex-direction: column; gap: 4px; padding: 18px 20px; background: var(--adm-noir); color: #fff; }
.pai-total-general span, .pai-total-general small { color: rgba(255, 255, 255, .6); font-size: .84rem; }
.pai-total-general strong { font-size: 1.7rem; font-weight: 600; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.pai-moyen {
  flex: 1; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 6px; padding: 16px 18px; border: 0;
  font: inherit; color: inherit; text-align: left; cursor: pointer; transition: box-shadow var(--transition);
}
.pai-moyen span { display: inline-flex; align-items: center; gap: 8px; color: var(--adm-encre-2); font-size: .86rem; }
.pai-moyen strong { font-size: 1.15rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.pai-moyen:hover { box-shadow: 0 0 0 1px var(--adm-muet), var(--adm-ombre); }
.pai-moyen.actif { box-shadow: 0 0 0 2px var(--adm-noir), var(--adm-ombre); }

.pai-projet { display: flex; flex-direction: column; }
.pai-projet small { color: var(--adm-muet); }
.pai-muet { color: var(--adm-muet); font-size: .84rem; }
.pai-badge i { font-size: .72rem; }
.pai-carte { background: var(--adm-accent-doux); color: var(--lagon-800); box-shadow: inset 0 0 0 1px var(--lagon-200); }
.pai-especes { background: #ecfdf5; color: #047857; box-shadow: inset 0 0 0 1px #a7f3d0; }
.pai-virement { background: #f5f3ff; color: #6d28d9; box-shadow: inset 0 0 0 1px #ddd6fe; }
.pai-cheque { background: #fffbeb; color: #b45309; box-shadow: inset 0 0 0 1px #fde68a; }
.pai-partiel { display: block; color: #b45309; font-size: .75rem; }
.pai-pied { color: var(--adm-muet); font-size: .84rem; }
.adm-table tfoot td { padding: 14px 16px; border-top: 1px solid var(--adm-ligne); }

.pai-info { margin: 18px 18px 6px; }
.pai-journal { margin: 0; padding: 8px 18px 14px; list-style: none; }
.pai-journal li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: 14px; padding: 14px 4px; border-top: 1px solid var(--adm-ligne-2); }
.pai-journal li:first-child { border-top: 0; }
.pai-journal-icone { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; background: #d1fae5; color: #047857; font-size: .85rem; }
.pai-journal li.annulation .pai-journal-icone { background: #fff1f2; color: var(--adm-baisse); }
.pai-journal-texte { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pai-journal-texte p { margin: 0; font-size: .92rem; }
.pai-journal-texte small { color: var(--adm-muet); font-size: .8rem; }
.pai-motif { color: var(--adm-encre-2) !important; font-style: italic; }
.pai-journal-montant { font-variant-numeric: tabular-nums; white-space: nowrap; }
.pai-journal li.annulation .pai-journal-montant { color: var(--adm-baisse); }

.pai-annulation { display: flex; flex-direction: column; gap: 16px; }
.pai-annulation-recap { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 0; }
.pai-annulation-recap div { padding: 10px 12px; border-radius: 12px; background: var(--adm-ligne-2); }
.pai-annulation-recap dt { font-size: .76rem; color: var(--adm-muet); }
.pai-annulation-recap dd { margin: 2px 0 0; font-weight: 600; font-size: .9rem; }
.pai-rappel { display: flex; gap: 8px; margin: 0; padding: 12px 14px; border-radius: 12px; background: #fffbeb; color: #92400e; font-size: .86rem; line-height: 1.45; }
.pai-rappel i { margin-top: 3px; }

@media (max-width: 1100px) { .pai-totaux { grid-template-columns: repeat(2, minmax(0, 1fr)); } .pai-totaux > li:first-child { grid-column: 1 / -1; } }
</style>

<script setup>
/**
 * Calculateur & prix :
 *  - Prix des matériaux (table materiaux) — les identifiants sont fixes, les formules y font référence ;
 *  - Ouvrages (table types_projets) — textes affichés et constantes de calcul, avec simulation avant / après.
 * Après enregistrement, le calculateur du site utilise immédiatement les nouvelles valeurs.
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useAdmin, formatDate } from '@/composables/useAdmin.js'
import { oublierCatalogue } from '@/composables/useCalculateur.js'
import { typesProjets, appliquerTypesDistants } from '@/donnees/typesProjets.js'
import { materiaux as materiauxLocaux, indexerMateriaux } from '@/donnees/materiaux.js'
import { calculerEstimation, formaterEuros } from '@/services/calculs/moteurCalculs.js'
import { useContenuSite, appliquerSection } from '@/composables/useContenuSite.js'
import { useAuth } from '@/composables/useAuth.js'

const { api, donnees, erreurs, charger, notifier, executer, confirmer } = useAdmin()
const contenu = useContenuSite()
const { utilisateur } = useAuth()
const onglet = ref('prix')
onMounted(() => charger(['materiaux', 'types'], { force: true }))

// =============================== Prix des matériaux ===============================
const brouillons = reactive({}) // id → copie modifiable
watch(() => donnees.materiaux, (liste) => {
  for (const m of liste || []) brouillons[m.id] = { ...m, prix_unitaire: String(m.prix_unitaire).replace('.', ',') }
}, { immediate: true })

const nombre = (v) => Number(String(v).replace(',', '.'))
const estModifie = (m) => {
  const b = brouillons[m.id]
  return b && (b.libelle !== m.libelle || b.unite !== m.unite || nombre(b.prix_unitaire) !== Number(m.prix_unitaire) || (b.source || '') !== (m.source || ''))
}
const prixInvalide = (m) => { const n = nombre(brouillons[m.id]?.prix_unitaire); return !Number.isFinite(n) || n < 0 }
const prixChange = (m) => nombre(brouillons[m.id]?.prix_unitaire) !== Number(m.prix_unitaire)
const modifies = computed(() => (donnees.materiaux || []).filter(estModifie))
const enregistrementPrix = ref(false)

async function enregistrerPrix(liste = modifies.value) {
  if (liste.some(prixInvalide) || liste.some((m) => !brouillons[m.id].libelle.trim() || !brouillons[m.id].unite.trim())) {
    notifier('Chaque matériau doit avoir un libellé, une unité et un prix positif.', 'erreur')
    return
  }
  enregistrementPrix.value = true
  await executer(async () => {
    for (const m of liste) {
      const maj = await api.enregistrerMateriau({ ...brouillons[m.id], prix_unitaire: nombre(brouillons[m.id].prix_unitaire) })
      const i = donnees.materiaux.findIndex((x) => x.id === m.id)
      donnees.materiaux.splice(i, 1, maj)
    }
    oublierCatalogue()
  }, liste.length > 1 ? `${liste.length} prix mis à jour.` : 'Prix mis à jour.')
  enregistrementPrix.value = false
}
const annulerPrix = (m) => { brouillons[m.id] = { ...m, prix_unitaire: String(m.prix_unitaire).replace('.', ',') } }
const annulerTousPrix = () => [...modifies.value].forEach(annulerPrix)

// =============================== Ouvrages ===============================
const LIBELLES_PARAMETRES = {
  surfaceParpaing: { label: 'Surface d’un parpaing', unite: 'm²' },
  margeParpaing: { label: 'Coefficient de marge (casse)', unite: '×', aide: '1,05 = 5 % de parpaings en plus' },
  m2ParSacCiment: { label: 'Surface montée par sac de ciment', unite: 'm²/sac' },
  m2ParM3Sable: { label: 'Surface montée par m³ de sable', unite: 'm²/m³' },
  densiteBeton: { label: 'Densité du béton', unite: 't/m³' },
  kgFerParM2: { label: 'Ferraillage par m²', unite: 'kg/m²' },
  tonnesGravierParM3: { label: 'Gravier par m³ de dalle', unite: 't/m³' },
  kgAcierParM3: { label: 'Acier par m³ de béton', unite: 'kg/m³' }
}

const typeActif = ref(typesProjets[0].id)
const type = computed(() => typesProjets.find((t) => t.id === typeActif.value))
const ligneType = computed(() => donnees.types?.find((t) => t.id === typeActif.value))
const cles = computed(() => Object.keys(type.value.parametres).filter((k) => typeof type.value.parametres[k] === 'number'))

const brouillonType = ref(null)
function preparerType() {
  const t = type.value
  brouillonType.value = {
    id: t.id, libelle: t.libelle, accroche: t.accroche || '', description: t.description || '', hypotheses: t.hypotheses || '',
    parametres: Object.fromEntries(cles.value.map((k) => [k, String(t.parametres[k]).replace('.', ',')]))
  }
}
watch([typeActif, () => donnees.types], preparerType, { immediate: true })

const parametresNumeriques = computed(() => Object.fromEntries(Object.entries(brouillonType.value.parametres).map(([k, v]) => [k, nombre(v)])))
const parametreInvalide = (k) => { const n = parametresNumeriques.value[k]; return !Number.isFinite(n) || n < 0 }
const typeModifie = computed(() => {
  const t = type.value
  const b = brouillonType.value
  return b.libelle !== t.libelle || b.accroche !== (t.accroche || '') || b.description !== (t.description || '') || b.hypotheses !== (t.hypotheses || '')
    || cles.value.some((k) => parametresNumeriques.value[k] !== t.parametres[k])
})
const parametresModifies = computed(() => cles.value.some((k) => parametresNumeriques.value[k] !== type.value.parametres[k]))
// changer d'ouvrage recharge le formulaire : on prévient si des modifications seraient perdues
async function choisirType(id) {
  if (id === typeActif.value) return
  if (typeModifie.value && !(await confirmer({ titre: 'Quitter sans enregistrer ?', texte: `Les modifications de « ${type.value.libelle} » seront perdues.`, libelle: 'Quitter' }))) return
  typeActif.value = id
}

// Simulation : exemple type (valeurs d'exemple du formulaire public), avant / après modification
const catalogue = computed(() => (donnees.materiaux?.length ? { ...materiauxLocaux, ...indexerMateriaux(donnees.materiaux) } : materiauxLocaux))
const exemple = computed(() => Object.fromEntries(type.value.champs.map((c) => [c.nom, c.type === 'select' ? c.defaut : c.placeholder])))
const resumeExemple = computed(() => type.value.champs.filter((c) => c.type !== 'select').map((c) => `${String(c.placeholder).replace('.', ',')} ${c.unite}`).join(' × '))
function simuler(parametres) {
  try { return calculerEstimation(type.value.id, exemple.value, { catalogue: catalogue.value, parametres }).total } catch { return null }
}
const simulation = computed(() => {
  const avant = simuler({})
  const invalide = cles.value.some(parametreInvalide)
  const apres = invalide ? null : simuler(parametresNumeriques.value)
  const ecart = avant && apres !== null ? ((apres - avant) / avant) * 100 : 0
  return { avant, apres, ecart }
})

const enregistrementType = ref(false)
async function enregistrerType() {
  const b = brouillonType.value
  if (!b.libelle.trim()) { notifier('Le nom de l’ouvrage est obligatoire.', 'erreur'); return }
  if (cles.value.some(parametreInvalide)) { notifier('Les constantes doivent être des nombres positifs.', 'erreur'); return }
  enregistrementType.value = true
  await executer(async () => {
    // uniquement les constantes de quantités utilisées par les formules (les anciennes clés en base sont écartées)
    const parametres = { ...parametresNumeriques.value }
    const maj = await api.enregistrerTypeProjet({ ...b, parametres })
    appliquerTypesDistants([maj])
    donnees.types = (donnees.types || []).map((t) => (t.id === maj.id ? maj : t))
    preparerType()
  }, `« ${b.libelle} » enregistré — le calculateur est à jour.`)
  enregistrementType.value = false
}

// =============================== Commission BTM et fidélité ===============================
// Modèle plateforme : le client ne paie aucun frais ; le fournisseur reverse une commission sur chaque vente
// faite avec un code de retrait, dont une part revient au client en crédit fidélité.
const brouillonTaux = ref(String(contenu.frais.taux).replace('.', ','))
const brouillonFidelite = ref(String(contenu.frais.fidelite ?? 25).replace('.', ','))
watch(() => contenu.frais.taux, (t) => { brouillonTaux.value = String(t).replace('.', ',') })
watch(() => contenu.frais.fidelite, (t) => { brouillonFidelite.value = String(t ?? 25).replace('.', ',') })
const tauxSaisi = computed(() => nombre(brouillonTaux.value))
const fideliteSaisie = computed(() => nombre(brouillonFidelite.value))
const tauxInvalide = computed(() => !Number.isFinite(tauxSaisi.value) || tauxSaisi.value < 0 || tauxSaisi.value > 30)
const fideliteInvalide = computed(() => !Number.isFinite(fideliteSaisie.value) || fideliteSaisie.value < 0 || fideliteSaisie.value > 100)
const tauxModifie = computed(() => !tauxInvalide.value && !fideliteInvalide.value
  && (tauxSaisi.value !== Number(contenu.frais.taux) || fideliteSaisie.value !== Number(contenu.frais.fidelite ?? 25)))
const exempleFrais = computed(() => {
  const ventes = 10000
  const taux = tauxInvalide.value ? Number(contenu.frais.taux) : tauxSaisi.value
  const fid = fideliteInvalide.value ? Number(contenu.frais.fidelite ?? 25) : fideliteSaisie.value
  const commission = (ventes * taux) / 100
  const credit = (commission * fid) / 100
  return { ventes, commission, credit, net: commission - credit }
})
const enregistrementTaux = ref(false)
async function enregistrerTaux() {
  if (tauxInvalide.value) { notifier('La commission doit être comprise entre 0 et 30 %.', 'erreur'); return }
  if (fideliteInvalide.value) { notifier('La part fidélité doit être comprise entre 0 et 100 %.', 'erreur'); return }
  enregistrementTaux.value = true
  await executer(async () => {
    const maj = await api.enregistrerContenu('frais', { taux: tauxSaisi.value, fidelite: fideliteSaisie.value }, utilisateur.value?.id)
    appliquerSection('frais', maj.valeur)
  }, `Commission réglée à ${String(tauxSaisi.value).replace('.', ',')} %, dont ${String(fideliteSaisie.value).replace('.', ',')} % rendus aux clients.`)
  enregistrementTaux.value = false
}
</script>

<template>
  <div class="calc">
    <div class="calc-onglets">
      <div class="adm-segments" role="tablist" aria-label="Paramètres du calculateur">
        <button type="button" role="tab" :aria-selected="onglet === 'prix'" @click="onglet = 'prix'"><i class="fa-solid fa-tags" aria-hidden="true"></i> Prix des matériaux<span v-if="modifies.length" class="calc-point"><span class="visually-hidden">(modifications non enregistrées)</span></span></button>
        <button type="button" role="tab" :aria-selected="onglet === 'ouvrages'" @click="onglet = 'ouvrages'"><i class="fa-solid fa-sliders" aria-hidden="true"></i> Ouvrages & formules<span v-if="typeModifie" class="calc-point"><span class="visually-hidden">(modifications non enregistrées)</span></span></button>
        <button type="button" role="tab" :aria-selected="onglet === 'frais'" @click="onglet = 'frais'"><i class="fa-solid fa-percent" aria-hidden="true"></i> Commission & fidélité<span v-if="tauxModifie" class="calc-point"><span class="visually-hidden">(modifications non enregistrées)</span></span></button>
      </div>
    </div>

    <!-- ===================== Prix ===================== -->
    <section v-if="onglet === 'prix'" class="adm-carte">
      <div class="adm-carte-tete adm-carte-pad prix-tete">
        <div>
          <h2>Prix unitaires</h2>
          <p>Utilisés pour chaque devis. Cliquez sur une valeur pour la modifier, puis enregistrez.</p>
        </div>
        <div class="prix-actions">
          <span v-if="modifies.length" class="adm-badge adm-badge-attention">{{ modifies.length }} modification{{ modifies.length > 1 ? 's' : '' }}</span>
          <button v-if="modifies.length" type="button" class="adm-btn adm-btn-clair" :disabled="enregistrementPrix" @click="annulerTousPrix">Annuler</button>
          <button type="button" class="adm-btn adm-btn-noir" :disabled="!modifies.length || enregistrementPrix" @click="enregistrerPrix()">
            <span v-if="enregistrementPrix" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-check" aria-hidden="true"></i> Tout enregistrer
          </button>
        </div>
      </div>

      <p v-if="erreurs.materiaux" class="adm-alerte prix-alerte" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.materiaux }}</p>
      <p v-else-if="donnees.materiaux && !donnees.materiaux.length" class="adm-alerte adm-alerte-info prix-alerte"><i class="fa-solid fa-circle-info"></i> La table des matériaux est vide : exécutez <span class="adm-mono">BACK/supabase/seed.sql</span> pour créer les prix de départ.</p>

      <div v-if="!donnees.materiaux" class="adm-chargement"><span class="spinner spinner-grand"></span></div>
      <div v-else-if="donnees.materiaux.length" class="adm-table-cadre">
        <table class="adm-table adm-table-empile prix-table">
          <thead><tr><th>Matériau</th><th>Unité</th><th>Prix unitaire</th><th>Source</th><th>Mis à jour</th><th><span class="visually-hidden">Actions</span></th></tr></thead>
          <tbody>
            <tr v-for="m in donnees.materiaux" :key="m.id" :class="{ modifiee: estModifie(m) }">
              <td class="principal">
                <label class="visually-hidden" :for="`m-lib-${m.id}`">Libellé</label>
                <input :id="`m-lib-${m.id}`" v-model="brouillons[m.id].libelle" class="adm-saisie prix-libelle" maxlength="80" />
              </td>
              <td data-label="Unité"><input v-model="brouillons[m.id].unite" class="adm-saisie prix-unite" maxlength="8" :aria-label="`Unité — ${m.libelle}`" /></td>
              <td data-label="Prix unitaire">
                <div class="prix-cellule">
                  <span class="adm-saisie-unite prix-montant">
                    <input v-model="brouillons[m.id].prix_unitaire" class="adm-saisie" inputmode="decimal" :aria-invalid="prixInvalide(m) || undefined" :aria-label="`Prix — ${m.libelle}`" @keydown.enter.prevent="enregistrerPrix([m])" />
                    <span>€ / {{ brouillons[m.id].unite || '—' }}</span>
                  </span>
                  <small v-if="prixInvalide(m)" class="prix-avant invalide">Prix invalide</small>
                  <small v-else-if="prixChange(m)" class="prix-avant">Avant : {{ formaterEuros(m.prix_unitaire) }}</small>
                </div>
              </td>
              <td data-label="Source"><input v-model="brouillons[m.id].source" class="adm-saisie" maxlength="120" placeholder="Fournisseur, date…" :aria-label="`Source — ${m.libelle}`" /></td>
              <td data-label="Mis à jour" class="prix-date">{{ formatDate(m.mis_a_jour_le) }}</td>
              <td class="actions">
                <template v-if="estModifie(m)">
                  <button type="button" class="adm-icone-btn" title="Annuler" :aria-label="`Annuler — ${m.libelle}`" @click="annulerPrix(m)"><i class="fa-solid fa-rotate-left"></i></button>
                  <button type="button" class="adm-icone-btn adm-icone-btn-bord" title="Enregistrer" :aria-label="`Enregistrer — ${m.libelle}`" @click="enregistrerPrix([m])"><i class="fa-solid fa-check"></i></button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ===================== Ouvrages ===================== -->
    <template v-else-if="onglet === 'ouvrages'">
      <p v-if="erreurs.types" class="adm-alerte" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.types }}</p>

      <div class="ouvrages-choix" role="tablist" aria-label="Ouvrage">
        <button
          v-for="t in typesProjets" :key="t.id" type="button" role="tab" class="adm-carte ouvrage-choix" :class="{ actif: typeActif === t.id }"
          :aria-selected="typeActif === t.id" @click="choisirType(t.id)"
        >
          <span class="ouvrage-choix-icone"><i :class="t.icone" aria-hidden="true"></i></span>
          <span><strong>{{ t.libelle }}</strong><small>{{ t.accroche }}</small></span>
        </button>
      </div>

      <form class="ouvrage-grille" novalidate @submit.prevent="enregistrerType">
        <section class="adm-carte adm-carte-pad">
          <div class="adm-carte-tete"><div><h2>Textes affichés</h2><p>Carte d’accueil, choix de l’ouvrage dans le calculateur et résultats.</p></div></div>
          <div class="adm-grille-form">
            <div class="adm-champ"><label for="t-lib">Nom</label><input id="t-lib" v-model="brouillonType.libelle" maxlength="40" /></div>
            <div class="adm-champ"><label for="t-acc">Accroche (carte d’accueil)</label><input id="t-acc" v-model="brouillonType.accroche" maxlength="60" /></div>
            <div class="adm-champ plein"><label for="t-desc">Description (choix de l’ouvrage dans le calculateur)</label><textarea id="t-desc" v-model="brouillonType.description" rows="2" maxlength="240"></textarea></div>
            <div class="adm-champ plein">
              <label for="t-hyp">Hypothèses de calcul</label>
              <textarea id="t-hyp" v-model="brouillonType.hypotheses" rows="3" maxlength="400"></textarea>
              <span class="adm-champ-aide"><span :class="{ trop: parametresModifies }">{{ parametresModifies ? 'Vous avez changé des constantes : pensez à mettre ce texte à jour.' : 'Affiché sous le devis pour expliquer le calcul.' }}</span></span>
            </div>
          </div>
        </section>

        <section class="adm-carte adm-carte-pad">
          <div class="adm-carte-tete"><div><h2>Quantités de matériaux</h2><p>Ratios utilisés pour calculer les quantités (valeurs du cahier des charges, à valider avec des professionnels locaux).</p></div></div>
          <div class="adm-grille-form">
            <div v-for="k in cles" :key="k" class="adm-champ">
              <label :for="`p-${k}`">{{ LIBELLES_PARAMETRES[k]?.label || k }}</label>
              <span class="adm-saisie-unite">
                <input :id="`p-${k}`" v-model="brouillonType.parametres[k]" inputmode="decimal" :aria-invalid="parametreInvalide(k) || undefined" />
                <span>{{ LIBELLES_PARAMETRES[k]?.unite }}</span>
              </span>
              <span v-if="LIBELLES_PARAMETRES[k]?.aide" class="adm-champ-aide"><span>{{ LIBELLES_PARAMETRES[k].aide }}</span></span>
            </div>
          </div>
        </section>

        <!-- Simulation -->
        <aside class="adm-carte adm-carte-pad simulation">
          <span class="simulation-label">Simulation</span>
          <p class="simulation-exemple">{{ type.libelle }} de {{ resumeExemple }}</p>
          <div class="simulation-valeurs">
            <div><small>Actuellement</small><strong>{{ simulation.avant !== null ? formaterEuros(simulation.avant) : '—' }}</strong></div>
            <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
            <div><small>Avec vos valeurs</small><strong>{{ simulation.apres !== null ? formaterEuros(simulation.apres) : '—' }}</strong></div>
          </div>
          <p v-if="simulation.ecart" class="simulation-ecart" :class="simulation.ecart > 0 ? 'hausse' : 'baisse'">
            {{ simulation.ecart > 0 ? '+' : '' }}{{ simulation.ecart.toFixed(1).replace('.', ',') }} % sur le total du devis
          </p>
          <p v-else class="simulation-ecart">Aucun changement sur le total.</p>

          <div class="simulation-actions">
            <button type="button" class="adm-btn adm-btn-contour" :disabled="!typeModifie || enregistrementType" @click="preparerType">Annuler</button>
            <button type="submit" class="adm-btn adm-btn-blanc" :disabled="!typeModifie || enregistrementType">
              <span v-if="enregistrementType" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-check" aria-hidden="true"></i> Enregistrer
            </button>
          </div>
          <p v-if="!ligneType && donnees.types" class="simulation-alerte">Cet ouvrage n’existe pas encore en base : exécutez <span class="adm-mono">seed.sql</span>.</p>
        </aside>
      </form>
    </template>

    <!-- ===================== Frais de service ===================== -->
    <form v-else class="frais-grille" novalidate @submit.prevent="enregistrerTaux">
      <section class="adm-carte adm-carte-pad">
        <div class="adm-carte-tete"><div><h2>Commission BTM</h2><p>Payée par le fournisseur sur chaque vente faite avec un code de retrait. Le client, lui, ne paie aucun frais.</p></div></div>
        <div class="frais-deux">
          <div class="adm-champ frais-champ">
            <label for="frais-taux">Commission</label>
            <span class="adm-saisie-unite">
              <input id="frais-taux" v-model="brouillonTaux" inputmode="decimal" :aria-invalid="tauxInvalide || undefined" />
              <span>%</span>
            </span>
            <span class="adm-champ-aide"><span :class="{ trop: tauxInvalide }">{{ tauxInvalide ? 'Entre 0 et 30 %.' : 'Des ventes du fournisseur' }}</span></span>
          </div>
          <div class="adm-champ frais-champ">
            <label for="frais-fidelite">Part rendue au client</label>
            <span class="adm-saisie-unite">
              <input id="frais-fidelite" v-model="brouillonFidelite" inputmode="decimal" :aria-invalid="fideliteInvalide || undefined" />
              <span>%</span>
            </span>
            <span class="adm-champ-aide"><span :class="{ trop: fideliteInvalide }">{{ fideliteInvalide ? 'Entre 0 et 100 %.' : 'De la commission, en crédit fidélité' }}</span></span>
          </div>
        </div>
        <ul class="frais-infos">
          <li><i class="fa-solid fa-hand-holding-heart" aria-hidden="true"></i> Le client paie le prix BTM du fournisseur, sans frais : passer par BTM est toujours son meilleur choix.</li>
          <li><i class="fa-solid fa-building-columns" aria-hidden="true"></i> Le fournisseur reverse la commission sur votre RIB (votre profil, en haut à droite).</li>
          <li><i class="fa-solid fa-gift" aria-hidden="true"></i> Le crédit fidélité s’utilise au comptoir lors d’un prochain retrait ; il est déduit de votre commission.</li>
        </ul>
        <div class="frais-actions">
          <button type="button" class="adm-btn adm-btn-clair" :disabled="!tauxModifie || enregistrementTaux" @click="brouillonTaux = String(contenu.frais.taux).replace('.', ','); brouillonFidelite = String(contenu.frais.fidelite ?? 25).replace('.', ',')">Annuler</button>
          <button type="submit" class="adm-btn adm-btn-noir" :disabled="!tauxModifie || enregistrementTaux">
            <span v-if="enregistrementTaux" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-check" aria-hidden="true"></i> Enregistrer
          </button>
        </div>
      </section>

      <aside class="adm-carte adm-carte-pad simulation">
        <span class="simulation-label">Exemple</span>
        <p class="simulation-exemple">Pour {{ formaterEuros(exempleFrais.ventes) }} vendus avec un code BTM :</p>
        <dl class="frais-exemple">
          <div><dt>Le client paie</dt><dd>{{ formaterEuros(exempleFrais.ventes) }}</dd></div>
          <div><dt>Le fournisseur reverse</dt><dd>{{ formaterEuros(exempleFrais.commission) }}</dd></div>
          <div><dt>Crédit fidélité du client</dt><dd>− {{ formaterEuros(exempleFrais.credit) }}</dd></div>
          <div class="frais-exemple-total"><dt>Revenu BTM</dt><dd>{{ formaterEuros(exempleFrais.net) }}</dd></div>
        </dl>
      </aside>
    </form>
  </div>
</template>

<style scoped>
.calc { display: flex; flex-direction: column; gap: 16px; }
.calc-onglets { display: flex; }
.calc-point { width: 7px; height: 7px; border-radius: 50%; background: #f59e0b; }
.calc [aria-invalid="true"] { border-color: var(--adm-baisse); background: var(--adm-danger-fond); }

/* Prix */
.prix-tete { margin: 0; flex-wrap: wrap; }
.prix-actions { display: flex; align-items: center; gap: 10px; }
.prix-alerte { margin: 0 24px 16px; }
.prix-table td { padding-block: 10px; }
.prix-table .adm-saisie { min-height: 40px; padding: 8px 12px; }
.prix-table td.principal { min-width: 220px; }
.prix-libelle { font-weight: 600; }
.prix-cellule { display: flex; flex-direction: column; gap: 4px; width: 170px; }
.prix-avant { color: var(--adm-muet); font-size: .76rem; text-align: right; }
.prix-avant.invalide { color: var(--adm-baisse); font-weight: 600; }
.prix-unite { width: 72px; }
.prix-montant { display: block; }
.prix-montant input { padding-right: 70px !important; font-weight: 600; text-align: right; }
.prix-montant span { font-size: .74rem; }
.prix-date { white-space: nowrap; color: var(--adm-muet); font-size: .84rem; }
.prix-table tr.modifiee { background: var(--adm-attention-fond); }
.prix-table tr.modifiee:hover { background: var(--adm-attention-fond-2); }
.prix-table td.actions { min-width: 90px; }
@media (max-width: 760px) {
  .prix-table td .adm-saisie, .prix-cellule, .prix-unite { width: 60%; }
  .prix-table td.principal .adm-saisie, .prix-table td .prix-montant .adm-saisie { width: 100%; }
}
/* Souris : le tableau se lit comme un tableau ; un champ ne montre son cadre qu'au survol ou à la saisie (le prix le garde) */
@media (hover: hover) and (min-width: 761px) {
  .prix-table .adm-saisie:not(:hover):not(:focus):not([aria-invalid]) { border-color: transparent; background: transparent; }
  .prix-table .prix-montant .adm-saisie:not(:focus):not([aria-invalid]) { border-color: var(--adm-ligne); background: var(--adm-champ); }
}
/* Ordinateur : page fixe (« ecran-fixe » dans AdminVue). Les onglets et l'en-tête restent en place, seul le contenu défile */
@media (min-width: 1024px) and (min-height: 640px) {
  .calc-onglets, .calc > .adm-alerte, .ouvrages-choix, .prix-tete, .prix-alerte { flex: none; }
  .calc > section.adm-carte { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
  .calc .adm-table-cadre { min-height: 0; overflow-y: auto; scrollbar-width: thin; }
  /* box-shadow : une bordure de cellule collée ne suit pas l'en-tête dans un tableau à bordures fusionnées */
  .prix-table thead th { position: sticky; top: 0; z-index: 2; border-bottom: 0; background: var(--adm-carte); box-shadow: inset 0 -1px 0 var(--adm-ligne); }
  .ouvrage-grille, .frais-grille { flex: 1; min-height: 0; grid-auto-rows: max-content; align-content: start; margin: 0 -8px; padding: 0 8px 24px; overflow-y: auto; scrollbar-width: thin; }
  .ouvrage-grille .simulation, .frais-grille .simulation { top: 0; }
}

/* Ouvrages */
.ouvrages-choix { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.ouvrage-choix {
  display: flex; align-items: center; gap: 14px; padding: 16px; border: 0; font: inherit; text-align: left; cursor: pointer;
  transition: background var(--transition), color var(--transition), box-shadow var(--transition);
}
.ouvrage-choix:hover { box-shadow: 0 0 0 1px var(--adm-muet), var(--adm-ombre); }
.ouvrage-choix.actif { background: var(--adm-noir); color: #fff; }
.ouvrage-choix-icone { width: 44px; height: 44px; flex: none; display: grid; place-items: center; border-radius: 14px; background: var(--adm-ligne-2); }
.ouvrage-choix.actif .ouvrage-choix-icone { background: rgba(255, 255, 255, .12); }
.ouvrage-choix > span:last-child { display: flex; flex-direction: column; min-width: 0; }
.ouvrage-choix strong { font-weight: 600; }
.ouvrage-choix small { color: var(--adm-muet); font-size: .8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ouvrage-choix.actif small { color: rgba(255, 255, 255, .6); }

.ouvrage-grille { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 300px; gap: 16px; align-items: start; }
.simulation { position: sticky; top: 16px; background: var(--adm-noir); color: #fff; }
.simulation-label { font-size: .78rem; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--lagon-300); }
.simulation-exemple { margin: 8px 0 20px; color: rgba(255, 255, 255, .75); font-size: .9rem; }
.simulation-valeurs { display: flex; align-items: center; gap: 14px; }
.simulation-valeurs > div { display: flex; flex-direction: column; gap: 2px; }
.simulation-valeurs small { font-size: .76rem; color: rgba(255, 255, 255, .55); }
.simulation-valeurs strong { font-size: 1.3rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.simulation-valeurs > i { color: rgba(255, 255, 255, .4); }
.simulation-ecart { margin: 14px 0 0; font-size: .86rem; color: rgba(255, 255, 255, .6); }
.simulation-ecart.hausse { color: #fcd34d; }
.simulation-ecart.baisse { color: #6ee7b7; }
.simulation-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 24px; }
.adm-btn-blanc { background: #fff; color: var(--adm-noir); }
.adm-btn-blanc:hover:not(:disabled) { background: #e2e8f0; }
.adm-btn-contour { background: transparent; color: #fff; border-color: rgba(255, 255, 255, .25); }
.adm-btn-contour:hover:not(:disabled) { border-color: #fff; }
.simulation-alerte { margin: 14px 0 0; font-size: .82rem; color: #fda4af; }

/* Frais de service */
.frais-deux { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.frais-grille { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; align-items: start; }
.frais-champ { max-width: 220px; }
.frais-champ input { font-size: 1.3rem; font-weight: 600; }
.frais-infos { display: flex; flex-direction: column; gap: 10px; margin: 22px 0 0; padding: 0; list-style: none; color: var(--adm-encre-2); font-size: .88rem; }
.frais-infos i { width: 20px; margin-right: 8px; color: var(--adm-muet); text-align: center; }
.frais-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--adm-ligne-2); }
.frais-exemple { margin: 0; }
.frais-exemple div { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; font-size: .9rem; color: rgba(255, 255, 255, .75); }
.frais-exemple dd { margin: 0; font-variant-numeric: tabular-nums; }
.frais-exemple-btm { color: var(--lagon-300) !important; font-weight: 600; }
.frais-exemple-total { margin-top: 6px; padding-top: 12px !important; border-top: 1px solid rgba(255, 255, 255, .15); color: #fff !important; font-weight: 700; font-size: 1rem !important; }
@media (max-width: 900px) { .frais-deux { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.frais-grille { grid-template-columns: minmax(0, 1fr); } }

@media (max-width: 1279px) {
  .ouvrage-grille { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .simulation { grid-column: 1 / -1; position: static; }
  .simulation-actions { max-width: 360px; }
}
@media (max-width: 900px) {
  .ouvrages-choix { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ouvrage-grille { grid-template-columns: minmax(0, 1fr); }
}
</style>

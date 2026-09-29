<script setup>
/** Tableau de bord : indicateurs sur la période choisie (comparés à la période précédente), évolution, activité récente */
import { computed, onMounted, ref } from 'vue'
import { useAdmin, formatDate } from '@/composables/useAdmin.js'
import { useContenuSite } from '@/composables/useContenuSite.js'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'
import { typesProjets, trouverTypeProjet } from '@/donnees/typesProjets.js'
import AdminGraphiqueBarres from './AdminGraphiqueBarres.vue'

const { donnees, erreurs, charger, compteOuvert } = useAdmin()
const ouvrirCompte = () => { compteOuvert.value = true }
const contenu = useContenuSite()
const pret = ref(false)
onMounted(async () => { await charger(['profils', 'projets', 'avis', 'fournisseurs', 'materiaux', 'paiements', 'reversements', 'versement']); pret.value = true })

// ---------- Période ----------
const periodes = [
  { id: '7j', label: '7 jours' },
  { id: '30j', label: '30 jours' },
  { id: '12m', label: '12 mois' }
]
const periode = ref('30j') // '7j' | '30j' | '12m' | 'perso'
const JOUR = 86400000

// Dates « calendaires » locales (minuit), pour ne pas décaler d'un jour avec le fuseau horaire
const jour = (a, m, j) => new Date(a, m, j)
const aujourdhui = () => { const d = new Date(); return jour(d.getFullYear(), d.getMonth(), d.getDate()) }
const ajouterJours = (d, n) => jour(d.getFullYear(), d.getMonth(), d.getDate() + n)
const versIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const depuisIso = (s) => { const [a, m, j] = s.split('-').map(Number); return jour(a, m - 1, j) }
const fmt = (options) => new Intl.DateTimeFormat('fr-FR', options)

/** Plage choisie : début inclus, fin exclue (lendemain du dernier jour affiché) */
const plagePerso = ref({ debut: versIso(ajouterJours(aujourdhui(), -29)), fin: versIso(aujourdhui()) })
const plage = computed(() => {
  const demain = ajouterJours(aujourdhui(), 1)
  if (periode.value === '7j') return { debut: ajouterJours(demain, -7), fin: demain }
  if (periode.value === '12m') { const a = aujourdhui(); return { debut: jour(a.getFullYear(), a.getMonth() - 11, 1), fin: jour(a.getFullYear(), a.getMonth() + 1, 1) } }
  if (periode.value === 'perso') return { debut: depuisIso(plagePerso.value.debut), fin: ajouterJours(depuisIso(plagePerso.value.fin), 1) }
  return { debut: ajouterJours(demain, -30), fin: demain }
})

/** Découpe la plage en barres : par jour jusqu'à 2 mois, par mois au-delà */
const intervalles = computed(() => {
  const { debut, fin } = plage.value
  const nbJours = Math.round((fin - debut) / JOUR)
  const liste = []
  if (nbJours <= 62) {
    for (let d = debut; d < fin; d = ajouterJours(d, 1)) {
      liste.push({
        cle: versIso(d), debut: d, fin: ajouterJours(d, 1),
        libelle: nbJours <= 7 ? fmt({ weekday: 'short' }).format(d).replace('.', '') : d.getDate() === 1 || d.getTime() === debut.getTime() ? fmt({ day: 'numeric', month: 'short' }).format(d).replace('.', '') : String(d.getDate()),
        libelleLong: fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d)
      })
    }
  } else {
    const plusieursAnnees = debut.getFullYear() !== ajouterJours(fin, -1).getFullYear()
    for (let m = jour(debut.getFullYear(), debut.getMonth(), 1); m < fin; m = jour(m.getFullYear(), m.getMonth() + 1, 1)) {
      const suivant = jour(m.getFullYear(), m.getMonth() + 1, 1)
      liste.push({
        cle: versIso(m), debut: m < debut ? debut : m, fin: suivant > fin ? fin : suivant, // premier / dernier mois : tronqués à la plage
        libelle: fmt(plusieursAnnees ? { month: 'short', year: '2-digit' } : { month: 'short' }).format(m).replace('.', ''),
        libelleLong: fmt({ month: 'long', year: 'numeric' }).format(m)
      })
    }
  }
  return liste
})
const parMois = computed(() => Math.round((plage.value.fin - plage.value.debut) / JOUR) > 62)
const bornes = computed(() => {
  const { debut, fin } = plage.value
  return { debut, fin, precedent: new Date(debut.getTime() - (fin - debut)) }
})

// ---------- Calendrier (plage personnalisée) ----------
const calendrierOuvert = ref(false)
const saisie = ref({ ...plagePerso.value })
const maxIso = computed(() => versIso(aujourdhui()))
const saisieInvalide = computed(() => !saisie.value.debut || !saisie.value.fin || saisie.value.debut > saisie.value.fin)
const raccourcis = computed(() => {
  const a = aujourdhui()
  return [
    { label: 'Aujourd’hui', debut: a, fin: a },
    { label: 'Hier', debut: ajouterJours(a, -1), fin: ajouterJours(a, -1) },
    { label: 'Cette semaine', debut: ajouterJours(a, -((a.getDay() + 6) % 7)), fin: a },
    { label: 'Ce mois-ci', debut: jour(a.getFullYear(), a.getMonth(), 1), fin: a },
    { label: 'Mois dernier', debut: jour(a.getFullYear(), a.getMonth() - 1, 1), fin: jour(a.getFullYear(), a.getMonth(), 0) },
    { label: '3 derniers mois', debut: jour(a.getFullYear(), a.getMonth() - 2, 1), fin: a },
    { label: 'Cette année', debut: jour(a.getFullYear(), 0, 1), fin: a },
    { label: 'Année dernière', debut: jour(a.getFullYear() - 1, 0, 1), fin: jour(a.getFullYear() - 1, 11, 31) }
  ].map((r) => ({ ...r, debut: versIso(r.debut), fin: versIso(r.fin) }))
})
function ouvrirCalendrier() {
  // on part de la période affichée (y compris 7 jours / 30 jours / 12 mois)
  saisie.value = { debut: versIso(bornes.value.debut), fin: versIso(ajouterJours(bornes.value.fin, -1)) }
  calendrierOuvert.value = !calendrierOuvert.value
}
function appliquerPlage(p = saisie.value) {
  if (!p.debut || !p.fin || p.debut > p.fin) return
  plagePerso.value = { debut: p.debut, fin: p.fin }
  periode.value = 'perso'
  calendrierOuvert.value = false
}
const libellePlage = computed(() => {
  const d = bornes.value.debut
  const f = ajouterJours(bornes.value.fin, -1)
  const o = { day: 'numeric', month: 'short', year: 'numeric' }
  return d.getTime() === f.getTime() ? fmt(o).format(d) : `${fmt(o).format(d)} – ${fmt(o).format(f)}`
})
const dans = (d, debut, fin) => { const t = new Date(d).getTime(); return t >= debut.getTime() && t < fin.getTime() }
const surPeriode = (liste) => (liste || []).filter((x) => dans(x.cree_le, bornes.value.debut, bornes.value.fin))
const surPrecedente = (liste) => (liste || []).filter((x) => dans(x.cree_le, bornes.value.precedent, bornes.value.debut))
const somme = (liste) => liste.reduce((s, p) => s + Number(p.cout_total || 0), 0)

// Revenus BTM (commission payée par le fournisseur, moins ce que BTM offre : code promo, crédit fidélité) :
//  - PRÉVISIONNELS : devis enregistrés pas encore encaissés — commission au taux actuel sur le montant du devis ;
//  - ENCAISSÉS : paiements enregistrés au comptoir (date du paiement, montant figé).
const taux = computed(() => Number(contenu.frais.taux) || 0)
const tauxTexte = computed(() => `${taux.value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`)
const fraisDe = (p) => (Number(p.cout_total || 0) * taux.value) / 100
const idsPayes = computed(() => new Set((donnees.paiements || []).map((pa) => pa.projet_id)))
const estPaye = (p) => idsPayes.value.has(p.id)
const previsionnels = (liste) => liste.filter((p) => !estPaye(p)).reduce((s, p) => s + fraisDe(p), 0)
const paiementsEntre = (debut, fin) => (donnees.paiements || []).filter((pa) => dans(pa.paye_le, debut, fin))
const encaisses = (debut, fin) => paiementsEntre(debut, fin).reduce((s, pa) => s + pa.revenu_btm, 0)

function evolution(actuel, precedent) {
  if (!actuel && !precedent) return null
  if (!precedent) return { texte: 'nouveau', hausse: true }
  const pct = ((actuel - precedent) / precedent) * 100
  return { texte: `${pct > 0 ? '+' : ''}${pct.toFixed(Math.abs(pct) < 10 ? 1 : 0).replace('.', ',')} %`, hausse: pct >= 0 }
}

// ---------- Indicateurs ----------
const kpis = computed(() => {
  const { debut, fin, precedent } = bornes.value
  const projets = surPeriode(donnees.projets)
  const projetsAvant = surPrecedente(donnees.projets)
  const comptes = surPeriode(donnees.profils)
  const comptesAvant = surPrecedente(donnees.profils)
  const enAttente = projets.filter((p) => !estPaye(p)).length
  return [
    { id: 'encaisses', label: 'Revenus encaissés', aide: `${paiementsEntre(debut, fin).length} paiement(s) confirmé(s) par les fournisseurs`, valeur: formaterEuros(encaisses(debut, fin)), evolution: evolution(encaisses(debut, fin), encaisses(precedent, debut)), sombre: true },
    { id: 'previsionnels', label: 'Revenus prévisionnels', aide: `${enAttente} devis en attente de paiement`, valeur: formaterEuros(previsionnels(projets)), evolution: evolution(previsionnels(projets), previsionnels(projetsAvant)) },
    { id: 'projets', label: 'Devis enregistrés', aide: `Budget matériaux : ${formaterEuros(somme(projets))}`, valeur: projets.length, evolution: evolution(projets.length, projetsAvant.length) },
    { id: 'comptes', label: 'Nouveaux comptes', aide: `${donnees.profils?.length || 0} comptes au total`, valeur: comptes.length, evolution: evolution(comptes.length, comptesAvant.length) }
  ]
})
const noteMoyenne = computed(() => {
  const visibles = (donnees.avis || []).filter((a) => a.visible)
  return { nombre: visibles.length, valeur: visibles.length ? visibles.reduce((s, a) => s + a.note, 0) / visibles.length : 0 }
})

// ---------- Graphique ----------
const mesures = [
  { id: 'encaisses', label: 'Encaissés', titre: 'Revenus encaissés' },
  { id: 'previsionnels', label: 'Prévisionnels', titre: 'Revenus prévisionnels (en attente de paiement)' },
  { id: 'budget', label: 'Budget clients', titre: 'Budget matériaux des clients' },
  { id: 'projets', label: 'Devis', titre: 'Devis enregistrés' }
]
const mesure = ref('encaisses')
const enEuros = computed(() => mesure.value !== 'projets')
const points = computed(() => intervalles.value.map((iv) => {
  const projets = (donnees.projets || []).filter((p) => dans(p.cree_le, iv.debut, iv.fin))
  const valeur = mesure.value === 'encaisses' ? encaisses(iv.debut, iv.fin)
    : mesure.value === 'previsionnels' ? previsionnels(projets)
    : mesure.value === 'budget' ? somme(projets)
    : projets.length
  return { ...iv, valeur }
}))
const formaterMesure = (v) => (enEuros.value ? formaterEuros(v) : `${v} devis`)
const formaterAxe = (v) => (enEuros.value ? (v >= 1000 ? `${(v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k€` : `${v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`) : v.toLocaleString('fr-FR'))
const titreGraphe = computed(() => mesures.find((m) => m.id === mesure.value).titre)

// ---------- Répartition par ouvrage ----------
const repartition = computed(() => {
  const projets = surPeriode(donnees.projets)
  return typesProjets.map((t) => {
    const nombre = projets.filter((p) => p.type_projet_id === t.id).length
    return { ...t, nombre, part: projets.length ? (nombre / projets.length) * 100 : 0 }
  }).sort((a, b) => b.nombre - a.nombre)
})

// ---------- À surveiller ----------
const vigilance = computed(() => {
  const liste = []
  const masques = (donnees.avis || []).filter((a) => !a.visible).length
  const inactifs = (donnees.fournisseurs || []).filter((f) => !f.actif).length
  const anciens = (donnees.materiaux || []).filter((m) => Date.now() - new Date(m.mis_a_jour_le).getTime() > 180 * JOUR).length
  // Reversements des fournisseurs : RIB à fournir (action = « Compte & reversements »)
  if (!donnees.versement?.iban) liste.push({ icone: 'fa-solid fa-building-columns', texte: 'Ajoutez le RIB de BTM : les fournisseurs en ont besoin pour reverser vos frais', action: ouvrirCompte })
  const prosAVerifier = (donnees.profils || []).filter((p) => p.pro_statut === 'en_attente').length
  if (prosAVerifier) liste.push({ icone: 'fa-solid fa-helmet-safety', texte: `${prosAVerifier} compte${prosAVerifier > 1 ? 's' : ''} professionnel${prosAVerifier > 1 ? 's' : ''} à vérifier`, lien: '/admin/utilisateurs' })
  const enAttente = (donnees.projets || []).filter((p) => p.fournisseur_id && !estPaye(p)).length
  if (enAttente) liste.push({ icone: 'fa-solid fa-hourglass-half', texte: `${enAttente} devis en attente de confirmation de paiement`, lien: '/admin/projets', ok: true })
  if (anciens) liste.push({ icone: 'fa-solid fa-tags', texte: `${anciens} prix non mis à jour depuis plus de 6 mois`, lien: '/admin/calculateur' })
  if (masques) liste.push({ icone: 'fa-solid fa-eye-slash', texte: `${masques} avis masqué${masques > 1 ? 's' : ''}`, lien: '/admin/avis' })
  if (inactifs) liste.push({ icone: 'fa-solid fa-truck', texte: `${inactifs} fournisseur${inactifs > 1 ? 's' : ''} désactivé${inactifs > 1 ? 's' : ''}`, lien: '/admin/fournisseurs' })
  liste.push({ icone: 'fa-solid fa-star', texte: noteMoyenne.value.nombre ? `Note moyenne ${noteMoyenne.value.valeur.toFixed(1).replace('.', ',')} / 5 · ${noteMoyenne.value.nombre} avis` : 'Aucun avis publié', lien: '/admin/avis', ok: true })
  liste.push({ icone: 'fa-solid fa-percent', texte: `Frais de service : ${tauxTexte.value} par devis`, lien: '/admin/calculateur', ok: true })
  liste.push(contenu.annonce.actif
    ? { icone: 'fa-solid fa-bullhorn', texte: 'Bandeau d’annonce en ligne', lien: '/admin/contenus', ok: true }
    : { icone: 'fa-solid fa-bullhorn', texte: 'Aucun bandeau d’annonce affiché', lien: '/admin/contenus', ok: true })
  return liste
})

const nomProfil = computed(() => Object.fromEntries((donnees.profils || []).map((p) => [p.id, p.nom_affiche || p.email])))
const derniersProjets = computed(() => (donnees.projets || []).slice(0, 10))
const erreurGlobale = computed(() => Object.values(erreurs)[0])
</script>

<template>
  <!-- Sur ordinateur, le tableau de bord tient dans l'écran : grille à hauteur fixe, seules les listes défilent -->
  <div class="apercu">
    <p v-if="erreurGlobale" class="adm-alerte apercu-alerte" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurGlobale }}</p>

    <div class="apercu-filtres">
      <div class="adm-pilules" role="group" aria-label="Période">
        <button v-for="p in periodes" :key="p.id" type="button" class="adm-pilule" :class="{ actif: periode === p.id }" :aria-pressed="periode === p.id" @click="periode = p.id">{{ p.label }}</button>
      </div>
      <div class="calendrier" @keydown.esc="calendrierOuvert = false">
        <button
          type="button" class="adm-pilule apercu-dates" :class="{ actif: periode === 'perso' }"
          :aria-expanded="calendrierOuvert" aria-haspopup="dialog" aria-live="polite" @click="ouvrirCalendrier"
        >
          <i class="fa-regular fa-calendar" aria-hidden="true"></i> {{ libellePlage }} <i class="fa-solid fa-chevron-down calendrier-chevron" aria-hidden="true"></i>
        </button>

        <template v-if="calendrierOuvert">
          <div class="calendrier-voile" @click="calendrierOuvert = false"></div>
          <form class="calendrier-panneau adm-carte" role="dialog" aria-label="Choisir la période" @submit.prevent="appliquerPlage()">
            <ul class="calendrier-raccourcis">
              <li v-for="r in raccourcis" :key="r.label">
                <button type="button" :class="{ actif: periode === 'perso' && plagePerso.debut === r.debut && plagePerso.fin === r.fin }" @click="appliquerPlage(r)">{{ r.label }}</button>
              </li>
            </ul>
            <div class="calendrier-saisie">
              <p class="calendrier-titre">Période personnalisée</p>
              <div class="adm-champ"><label for="cal-debut">Du</label><input id="cal-debut" v-model="saisie.debut" type="date" :max="saisie.fin || maxIso" required /></div>
              <div class="adm-champ"><label for="cal-fin">Au</label><input id="cal-fin" v-model="saisie.fin" type="date" :min="saisie.debut" :max="maxIso" required /></div>
              <p v-if="saisieInvalide" class="calendrier-erreur">La date de début doit précéder la date de fin.</p>
              <div class="calendrier-actions">
                <button type="button" class="adm-btn adm-btn-clair adm-btn-sm" @click="calendrierOuvert = false">Annuler</button>
                <button type="submit" class="adm-btn adm-btn-noir adm-btn-sm" :disabled="saisieInvalide">Appliquer</button>
              </div>
            </div>
          </form>
        </template>
      </div>
    </div>

    <!-- Indicateurs -->
    <ul class="apercu-kpis">
      <li v-for="k in kpis" :key="k.id" class="adm-carte kpi" :class="{ sombre: k.sombre }" :title="k.aide">
        <span class="kpi-label">{{ k.label }}</span>
        <strong v-if="pret" class="kpi-valeur">{{ k.valeur }}</strong>
        <span v-else class="adm-squelette kpi-squelette"></span>
        <span class="kpi-pied">
          <template v-if="k.evolution">
            <span class="kpi-evolution" :class="k.evolution.hausse ? 'hausse' : 'baisse'">
              <i :class="k.evolution.hausse ? 'fa-solid fa-arrow-trend-up' : 'fa-solid fa-arrow-trend-down'" aria-hidden="true"></i>{{ k.evolution.texte }}
            </span>
            vs période préc.
          </template>
          <template v-else>{{ k.aide }}</template>
        </span>
      </li>
    </ul>

    <!-- Évolution -->
    <section class="adm-carte apercu-carte apercu-graphe">
      <div class="adm-carte-tete">
        <div class="apercu-graphe-titre"><h2>{{ titreGraphe }}</h2><p>Par {{ parMois ? 'mois' : 'jour' }} · survolez une barre</p></div>
        <div class="adm-segments" role="tablist" aria-label="Mesure affichée">
          <button v-for="m in mesures" :key="m.id" type="button" role="tab" :aria-selected="mesure === m.id" @click="mesure = m.id">{{ m.label }}</button>
        </div>
      </div>
      <div class="apercu-graphe-zone">
        <AdminGraphiqueBarres v-if="pret" :points="points" :formater="formaterMesure" :formater-axe="formaterAxe" :titre="titreGraphe" />
        <div v-else class="adm-squelette apercu-graphe-squelette"></div>
      </div>
    </section>

    <!-- Répartition -->
    <section class="adm-carte apercu-carte apercu-ouvrages">
      <div class="adm-carte-tete"><div><h2>Ouvrages demandés</h2><p>Devis enregistrés sur la période</p></div></div>
      <ul class="repartition">
        <li v-for="t in repartition" :key="t.id">
          <span class="repartition-nom"><i :class="t.icone" aria-hidden="true"></i>{{ t.libelle }}</span>
          <span class="repartition-barre"><span :style="{ width: `${t.part}%` }"></span></span>
          <span class="repartition-nombre">{{ t.nombre }}</span>
        </li>
      </ul>
    </section>

    <!-- Derniers projets -->
    <section class="adm-carte apercu-carte apercu-projets">
      <div class="adm-carte-tete">
        <h2>Derniers projets</h2>
        <router-link to="/admin/projets" class="adm-icone-btn adm-icone-btn-bord" aria-label="Voir tous les projets"><i class="fa-solid fa-arrow-right"></i></router-link>
      </div>
      <div class="apercu-defile">
        <table class="adm-table adm-table-empile">
          <thead><tr><th>Projet</th><th>Client</th><th>Date</th><th class="num">Devis client</th><th class="num">Revenu BTM</th></tr></thead>
          <tbody>
            <tr v-for="p in derniersProjets" :key="p.id">
              <td class="principal">
                <span class="adm-identite">
                  <span class="adm-avatar"><i :class="trouverTypeProjet(p.type_projet_id)?.icone || 'fa-solid fa-folder'" aria-hidden="true"></i></span>
                  <span><strong>{{ p.nom }}</strong><small>{{ trouverTypeProjet(p.type_projet_id)?.libelle || p.type_projet_id }}</small></span>
                </span>
              </td>
              <td data-label="Client">{{ nomProfil[p.utilisateur_id] || 'Compte supprimé' }}</td>
              <td data-label="Date">{{ formatDate(p.cree_le) }}</td>
              <td data-label="Devis client" class="num">{{ formaterEuros(p.cout_total) }}</td>
              <td data-label="Revenu BTM" class="num">
                <strong>{{ formaterEuros(fraisDe(p)) }}</strong>
                <small class="statut" :class="estPaye(p) ? 'paye' : 'attente'">{{ estPaye(p) ? 'encaissé' : 'prévisionnel' }}</small>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="pret && !derniersProjets.length" class="adm-vide"><i class="fa-regular fa-folder-open"></i><p>Aucun projet enregistré.</p></div>
      </div>
    </section>

    <!-- À surveiller -->
    <section class="adm-carte apercu-carte apercu-vigilance">
      <div class="adm-carte-tete"><div><h2>À surveiller</h2></div></div>
      <ul class="vigilance apercu-defile">
        <li v-for="v in vigilance" :key="v.texte">
          <component :is="v.action ? 'button' : 'router-link'" v-bind="v.action ? { type: 'button' } : { to: v.lien }" class="vigilance-lien" @click="v.action?.()">
            <span class="vigilance-icone" :class="{ ok: v.ok }"><i :class="v.icone" aria-hidden="true"></i></span>
            <span>{{ v.texte }}</span>
            <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
          </component>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.apercu {
  display: grid; gap: 14px;
  grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
  grid-template-rows: auto auto auto minmax(0, 1.25fr) minmax(0, 1fr);
  grid-template-areas: "alerte alerte" "filtres filtres" "kpis kpis" "graphe ouvrages" "projets vigilance";
}
.apercu-alerte { grid-area: alerte; margin: 0; }
.apercu-filtres { grid-area: filtres; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
.apercu-dates { font-variant-numeric: tabular-nums; }
.calendrier-chevron { font-size: .65rem; opacity: .6; transition: transform var(--transition); }
.apercu-dates[aria-expanded="true"] .calendrier-chevron { transform: rotate(180deg); }

/* Calendrier : raccourcis à gauche, saisie libre à droite */
.calendrier { position: relative; }
.calendrier-voile { position: fixed; inset: 0; z-index: 40; }
.calendrier-panneau {
  position: absolute; top: calc(100% + 8px); right: 0; z-index: 41; display: grid; grid-template-columns: 170px 250px;
  padding: 8px; box-shadow: 0 24px 60px rgba(15, 23, 42, .18), 0 0 0 1px var(--adm-ligne); animation: calendrier-entree .18s ease;
}
.calendrier-raccourcis { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 6px 8px 6px 0; border-right: 1px solid var(--adm-ligne-2); list-style: none; }
.calendrier-raccourcis button {
  width: 100%; padding: 8px 12px; border: 0; border-radius: 10px; background: transparent; color: var(--adm-encre-2);
  font: inherit; font-size: .86rem; text-align: left; cursor: pointer; transition: background var(--transition), color var(--transition);
}
.calendrier-raccourcis button:hover { background: var(--adm-ligne-2); color: var(--adm-encre); }
.calendrier-raccourcis button.actif { background: var(--adm-noir); color: #fff; }
.calendrier-saisie { display: flex; flex-direction: column; gap: 12px; padding: 10px 8px 8px 16px; }
.calendrier-titre { margin: 0; font-size: .9rem; font-weight: 600; }
.calendrier-saisie input { min-height: 40px; }
.calendrier-erreur { margin: 0; color: var(--adm-baisse); font-size: .8rem; }
.calendrier-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: auto; }
@keyframes calendrier-entree { from { opacity: 0; transform: translateY(-6px); } }
@media (max-width: 560px) {
  .calendrier-panneau { position: fixed; top: auto; left: 12px; right: 12px; bottom: 12px; grid-template-columns: 1fr; }
  .calendrier-raccourcis { flex-direction: row; flex-wrap: wrap; padding: 4px 4px 10px; border-right: 0; border-bottom: 1px solid var(--adm-ligne-2); }
  .calendrier-raccourcis button { width: auto; }
  .calendrier-saisie { padding: 12px 4px 4px; }
}

/* Indicateurs */
.apercu-kpis { grid-area: kpis; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin: 0; padding: 0; list-style: none; }
.kpi { display: flex; flex-direction: column; gap: 6px; padding: 16px 20px; min-width: 0; }
.kpi-label { font-size: .88rem; font-weight: 500; color: var(--adm-encre-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kpi-valeur { font-size: clamp(1.4rem, 2vw, 1.8rem); font-weight: 600; letter-spacing: -.02em; line-height: 1.1; font-variant-numeric: tabular-nums; white-space: nowrap; }
.kpi-squelette { width: 60%; height: 30px; }
.kpi-pied { font-size: .78rem; color: var(--adm-muet); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kpi-evolution { display: inline-flex; align-items: center; gap: 5px; margin-right: 4px; font-weight: 600; }
.kpi-evolution.hausse { color: var(--adm-hausse); }
.kpi-evolution.baisse { color: var(--adm-baisse); }
.kpi.sombre { position: relative; overflow: hidden; background: var(--adm-noir); color: #fff; }
.kpi.sombre::after { content: ''; position: absolute; right: -40px; top: -60px; width: 200px; height: 200px; border-radius: 50%; background: radial-gradient(circle, rgba(34, 211, 238, .18), transparent 70%); pointer-events: none; }
.kpi.sombre .kpi-label { color: rgba(255, 255, 255, .72); }
.kpi.sombre .kpi-pied { color: rgba(255, 255, 255, .6); }
.kpi.sombre .kpi-evolution.hausse { color: #6ee7b7; }
.kpi.sombre .kpi-evolution.baisse { color: #fda4af; }
.kpi.sombre .kpi-squelette { opacity: .15; }

/* Cartes : en-tête fixe, contenu qui s'adapte à la hauteur disponible */
.apercu-carte { display: flex; flex-direction: column; min-height: 0; overflow: hidden; padding: 18px 20px; }
.apercu-carte .adm-carte-tete { flex: none; margin-bottom: 12px; }
.apercu-defile { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; }
.apercu-graphe { grid-area: graphe; }
.apercu-graphe .adm-carte-tete { flex-wrap: wrap; gap: 8px 12px; }
.apercu-graphe-titre { flex: 1 1 180px; min-width: 0; }
.apercu-graphe .adm-segments { flex: none; padding: 3px; box-shadow: inset 0 0 0 1px var(--adm-ligne); }
.apercu-graphe .adm-segments button { min-height: 32px; padding: 0 12px; font-size: .82rem; }
.apercu-graphe-zone { flex: 1; min-height: 0; display: flex; }
.apercu-graphe-zone > * { flex: 1; }
.apercu-graphe-zone :deep(.graphe) { height: 100%; min-height: 150px; }
.apercu-graphe-squelette { min-height: 150px; }
.apercu-ouvrages { grid-area: ouvrages; }
.apercu-projets { grid-area: projets; padding: 18px 8px 8px; }
.apercu-projets .adm-carte-tete { padding: 0 12px; }
.apercu-vigilance { grid-area: vigilance; }

.repartition { display: flex; flex: 1; flex-direction: column; justify-content: space-evenly; gap: 10px; margin: 0; padding: 0; list-style: none; }
.repartition li { display: grid; grid-template-columns: 104px 1fr 32px; align-items: center; gap: 12px; font-size: .9rem; }
.repartition-nom { display: flex; align-items: center; gap: 10px; font-weight: 500; }
.repartition-nom i { width: 16px; color: var(--adm-muet); text-align: center; }
.repartition-barre { height: 10px; border-radius: 999px; background: var(--adm-ligne-2); overflow: hidden; }
.repartition-barre span { display: block; height: 100%; min-width: 0; border-radius: 999px; background: var(--adm-noir); transition: width .5s cubic-bezier(.22, .61, .36, 1); }
.repartition-nombre { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }

.adm-table th { position: sticky; top: 0; z-index: 1; background: #fff; }
.adm-table td { padding-block: 9px; }
.adm-table td .adm-avatar { width: 34px; height: 34px; font-size: .85rem; }

.vigilance { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none; }
.vigilance-lien { width: 100%; border: 0; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; }
.vigilance a, .vigilance button { display: flex; align-items: center; gap: 12px; padding: 6px 8px; border-radius: 12px; font-size: .88rem; transition: background var(--transition); }
.vigilance a:hover, .vigilance button:hover { background: var(--adm-ligne-2); }
.vigilance-lien > span:nth-child(2) { flex: 1; }
.vigilance-lien > i { color: var(--adm-muet); font-size: .75rem; }
.statut { display: block; font-size: .72rem; font-weight: 600; }
.statut.paye { color: var(--adm-hausse); }
.statut.attente { color: var(--adm-muet); }
.vigilance-icone { width: 30px; height: 30px; flex: none; display: grid; place-items: center; border-radius: 10px; background: #fffbeb; color: #b45309; font-size: .8rem; }
.vigilance-icone.ok { background: var(--adm-ligne-2); color: var(--adm-encre-2); }

/* Écrans d'ordinateur peu hauts (ex. 1366 × 768) : on resserre pour que tout reste visible */
@media (min-width: 1024px) and (max-height: 820px) {
  .apercu { gap: 12px; }
  .kpi { gap: 4px; padding: 12px 18px; }
  .kpi-valeur { font-size: 1.45rem; }
  .apercu-carte { padding: 14px 18px; }
  .apercu-carte .adm-carte-tete { margin-bottom: 8px; }
  .apercu-carte .adm-carte-tete p { display: none; }
  .apercu-graphe-zone :deep(.graphe) { min-height: 120px; }
  .apercu-projets { padding: 14px 6px 6px; }
  .repartition { gap: 6px; }
  .vigilance a, .vigilance button { padding: 4px 8px; font-size: .84rem; }
  .vigilance-icone { width: 26px; height: 26px; }
}

/* Écrans trop petits pour tout afficher : les blocs s'empilent et la page défile normalement */
@media (max-width: 1023px), (max-height: 639px) {
  .apercu { grid-template-rows: none; grid-template-areas: "alerte alerte" "filtres filtres" "kpis kpis" "graphe graphe" "ouvrages ouvrages" "projets projets" "vigilance vigilance"; }
  .apercu-graphe-zone :deep(.graphe) { height: 240px; }
  .apercu-defile { overflow: visible; }
  .adm-table th { position: static; }
}
@media (max-width: 1023px) { .apercu-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 480px) { .apercu-kpis { grid-template-columns: minmax(0, 1fr); } }
</style>

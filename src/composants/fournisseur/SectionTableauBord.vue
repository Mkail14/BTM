<script setup>
/**
 * Tableau de bord fournisseur, sur la période choisie (aujourd'hui, 7 jours, 30 jours, 12 mois ou dates libres) :
 * encaissé, nombre de reçus et panier moyen, évolution des ventes, répartition par moyen de paiement,
 * derniers encaissements ; plus les devis en attente, le reste à reverser à BTM et les ruptures de stock.
 * Tient sur un écran d'ordinateur (les listes défilent dans leur carte).
 */
import { computed, ref } from 'vue'
import { useEspaceFournisseur, formatDate, formatHeure } from '@/composables/useEspaceFournisseur.js'
import { trouverTypeProjet } from '@/donnees/typesProjets.js'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'
import { MOYENS } from '@/services/supabase/serviceEspaceFournisseur.js'
import AdminGraphiqueBarres from '@/composants/admin/AdminGraphiqueBarres.vue'

const { fiche, paiements, enAttente, soldeBtm, ruptures } = useEspaceFournisseur()
const lienValider = (code) => ({ path: '/espace-fournisseur/valider', query: code ? { code } : {} })

// ---------- Période (dates calendaires locales : début inclus, fin exclue) ----------
const jour = (a, m, j) => new Date(a, m, j)
const aujourdhui = () => { const d = new Date(); return jour(d.getFullYear(), d.getMonth(), d.getDate()) }
const ajouterJours = (d, n) => jour(d.getFullYear(), d.getMonth(), d.getDate() + n)
const versIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const depuisIso = (t) => { const [a, m, j] = t.split('-').map(Number); return jour(a, m - 1, j) }

const periodes = [
  { id: 'jour', label: 'Aujourd’hui' },
  { id: '7j', label: '7 jours' },
  { id: '30j', label: '30 jours' },
  { id: '12m', label: '12 mois' },
  { id: 'perso', label: 'Personnalisée' }
]
const periode = ref('30j')
const plagePerso = ref({ debut: versIso(ajouterJours(aujourdhui(), -29)), fin: versIso(aujourdhui()) })
const plage = computed(() => {
  const demain = ajouterJours(aujourdhui(), 1)
  if (periode.value === 'jour') return { debut: aujourdhui(), fin: demain }
  if (periode.value === '7j') return { debut: ajouterJours(demain, -7), fin: demain }
  if (periode.value === '12m') { const a = aujourdhui(); return { debut: jour(a.getFullYear(), a.getMonth() - 11, 1), fin: jour(a.getFullYear(), a.getMonth() + 1, 1) } }
  if (periode.value === 'perso') {
    const d = plagePerso.value.debut ? depuisIso(plagePerso.value.debut) : ajouterJours(demain, -30)
    const fin = plagePerso.value.fin ? ajouterJours(depuisIso(plagePerso.value.fin), 1) : demain
    return fin > d ? { debut: d, fin } : { debut: d, fin: ajouterJours(d, 1) }
  }
  return { debut: ajouterJours(demain, -30), fin: demain }
})
const libellePeriode = computed(() => {
  const { debut, fin } = plage.value
  const dernier = ajouterJours(fin, -1)
  return debut.getTime() === dernier.getTime()
    ? formatDate(debut, { weekday: 'long', day: 'numeric', month: 'long' })
    : `du ${formatDate(debut, { day: 'numeric', month: 'short' })} au ${formatDate(dernier, { day: 'numeric', month: 'short', year: 'numeric' })}`
})

const somme = (liste) => liste.reduce((s, p) => s + p.montant_devis, 0)
const dansPlage = (d, debut, fin) => { const t = new Date(d); return t >= debut && t < fin }
const periodePaiements = computed(() => paiements.value.filter((p) => dansPlage(p.paye_le, plage.value.debut, plage.value.fin)))
const chiffres = computed(() => {
  const liste = periodePaiements.value
  return {
    encaisse: somme(liste),
    recus: liste.length,
    panier: liste.length ? somme(liste) / liste.length : 0,
    attente: enAttente.value.reduce((s, d) => s + d.cout_total, 0)
  }
})

// Évolution : par heure (un jour), par jour (jusqu'à 2 mois), par mois au-delà
const points = computed(() => {
  const { debut, fin } = plage.value
  const nbJours = Math.round((fin - debut) / 86400000)
  const liste = []
  if (nbJours <= 1) {
    for (let h = 0; h < 24; h += 3) {
      const a = new Date(debut); a.setHours(h)
      const b = new Date(debut); b.setHours(h + 3)
      liste.push({ cle: `h${h}`, libelle: `${h}h`, libelleLong: `de ${h} h à ${h + 3} h`, debut: a, fin: b })
    }
  } else if (nbJours <= 62) {
    for (let d = debut; d < fin; d = ajouterJours(d, 1)) {
      liste.push({
        cle: versIso(d), debut: d, fin: ajouterJours(d, 1),
        libelle: nbJours <= 7 ? formatDate(d, { weekday: 'short' }).replace('.', '') : String(d.getDate()),
        libelleLong: formatDate(d, { weekday: 'long', day: 'numeric', month: 'long' })
      })
    }
  } else {
    for (let m = jour(debut.getFullYear(), debut.getMonth(), 1); m < fin; m = jour(m.getFullYear(), m.getMonth() + 1, 1)) {
      liste.push({ cle: `${m.getFullYear()}-${m.getMonth()}`, debut: m, fin: jour(m.getFullYear(), m.getMonth() + 1, 1), libelle: formatDate(m, { month: 'short' }).replace('.', ''), libelleLong: formatDate(m, { month: 'long', year: 'numeric' }) })
    }
  }
  return liste.map(({ debut: a, fin: b, ...p }) => ({ ...p, valeur: somme(periodePaiements.value.filter((x) => dansPlage(x.paye_le, a, b))) }))
})
const eurosCourts = (v) => (v >= 1000 ? `${String(Math.round(v / 100) / 10).replace('.', ',')} k€` : `${v} €`)

const repartition = computed(() => {
  const total = chiffres.value.encaisse
  return Object.entries(MOYENS).map(([id, m]) => {
    const valeur = somme(periodePaiements.value.filter((p) => p.moyen === id))
    return { id, ...m, valeur, part: total ? Math.round((valeur / total) * 100) : 0 }
  })
})
</script>

<template>
  <div class="tb">
    <div v-if="fiche && !fiche.actif" class="adm-alerte adm-alerte-info">
      <i class="fa-solid fa-eye-slash" aria-hidden="true"></i>
      <span>Votre fiche est masquée de l’annuaire BTM : les clients ne peuvent plus vous choisir. Contactez BTM pour la réactiver.</span>
    </div>

    <!-- Période -->
    <div class="tb-periode">
      <div class="adm-pilules" role="group" aria-label="Période">
        <button v-for="p in periodes" :key="p.id" type="button" class="adm-pilule" :class="{ actif: periode === p.id }" :aria-pressed="periode === p.id" @click="periode = p.id">{{ p.label }}</button>
      </div>
      <div v-if="periode === 'perso'" class="tb-dates">
        <label><span class="visually-hidden">Du</span><input v-model="plagePerso.debut" type="date" :max="plagePerso.fin" aria-label="Date de début" /></label>
        <span>→</span>
        <label><span class="visually-hidden">Au</span><input v-model="plagePerso.fin" type="date" :min="plagePerso.debut" aria-label="Date de fin" /></label>
      </div>
      <span v-else class="tb-libelle-periode"><i class="fa-regular fa-calendar" aria-hidden="true"></i> {{ libellePeriode }}</span>
      <router-link v-if="ruptures.length" to="/espace-fournisseur/materiaux" class="tb-ruptures" :title="ruptures.join(', ')">
        <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> {{ ruptures.length }} en rupture de stock
      </router-link>
    </div>

    <ul class="tb-kpis">
      <li class="adm-carte adm-carte-pad tb-kpi tb-kpi-noir">
        <span><i class="fa-solid fa-cash-register" aria-hidden="true"></i> Encaissé</span>
        <strong>{{ formaterEuros(chiffres.encaisse) }}</strong>
        <small>{{ libellePeriode }}</small>
      </li>
      <li class="adm-carte adm-carte-pad tb-kpi">
        <span><i class="fa-solid fa-receipt" aria-hidden="true"></i> Reçus émis</span>
        <strong>{{ chiffres.recus }}</strong>
        <small>panier moyen {{ formaterEuros(chiffres.panier) }}</small>
      </li>
      <li>
        <router-link :to="lienValider()" class="adm-carte adm-carte-pad tb-kpi tb-kpi-lien">
          <span><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> Devis en attente</span>
          <strong>{{ enAttente.length }}</strong>
          <small>{{ formaterEuros(chiffres.attente) }} à retirer chez vous</small>
        </router-link>
      </li>
      <li>
        <router-link to="/espace-fournisseur/paiements" class="adm-carte adm-carte-pad tb-kpi tb-kpi-lien" :class="{ 'tb-kpi-alerte': soldeBtm.reste > 0 }">
          <span><i class="fa-solid fa-building-columns" aria-hidden="true"></i> À reverser à BTM</span>
          <strong>{{ formaterEuros(soldeBtm.reste) }}</strong>
          <small>Frais de service BTM encaissés</small>
        </router-link>
      </li>
    </ul>

    <div class="tb-colonnes tb-colonnes-graphe">
      <section class="adm-carte adm-carte-pad">
        <div class="adm-carte-tete"><div><h2>Ventes encaissées</h2><p>{{ libellePeriode }}</p></div></div>
        <AdminGraphiqueBarres :points="points" :formater="formaterEuros" :formater-axe="eurosCourts" titre="Ventes encaissées sur la période" />
      </section>

      <section class="adm-carte adm-carte-pad">
        <div class="adm-carte-tete"><div><h2>Moyens de paiement</h2><p>Répartition sur la période.</p></div></div>
        <ul class="tb-moyens">
          <li v-for="m in repartition" :key="m.id">
            <span class="tb-moyen-tete"><span><i :class="m.icone" aria-hidden="true"></i> {{ m.court }}</span><strong>{{ formaterEuros(m.valeur) }}</strong></span>
            <span class="tb-barre" role="img" :aria-label="`${m.court} : ${m.part} %`"><span :style="{ width: `${m.part}%` }"></span></span>
          </li>
        </ul>
      </section>
    </div>

    <div class="tb-colonnes">
      <section class="adm-carte adm-carte-pad">
        <div class="adm-carte-tete">
          <div><h2>Devis qui vous ont choisi</h2><p>Le client viendra avec son code de retrait.</p></div>
          <router-link :to="lienValider()" class="adm-btn adm-btn-noir adm-btn-sm"><i class="fa-solid fa-ticket" aria-hidden="true"></i> Saisir un code</router-link>
        </div>
        <ul v-if="enAttente.length" class="tb-liste">
          <li v-for="d in enAttente" :key="d.id">
            <span class="adm-identite">
              <span class="adm-avatar"><i :class="trouverTypeProjet(d.type_projet_id)?.icone || 'fa-solid fa-file-invoice'" aria-hidden="true"></i></span>
              <span><strong>{{ d.nom }}</strong><small><span class="adm-mono">{{ d.code_retrait }}</span> · {{ formatDate(d.cree_le, { day: 'numeric', month: 'short' }) }}</small></span>
            </span>
            <span class="tb-droite">
              <strong class="tb-montant">{{ formaterEuros(d.cout_total) }}</strong>
              <router-link v-if="d.code_retrait" :to="lienValider(d.code_retrait)" class="adm-btn adm-btn-clair adm-btn-sm">Valider</router-link>
            </span>
          </li>
        </ul>
        <div v-else class="adm-vide"><i class="fa-solid fa-inbox" aria-hidden="true"></i><p>Aucun devis en attente.</p></div>
      </section>

      <section class="adm-carte adm-carte-pad">
        <div class="adm-carte-tete">
          <div><h2>Encaissements</h2><p>{{ libellePeriode }}</p></div>
          <router-link v-if="paiements.length" to="/espace-fournisseur/paiements" class="adm-btn adm-btn-clair adm-btn-sm">Tout voir</router-link>
        </div>
        <ul v-if="periodePaiements.length" class="tb-liste">
          <li v-for="p in periodePaiements" :key="p.id">
            <span class="adm-identite">
              <span class="adm-avatar tb-avatar-ok"><i :class="MOYENS[p.moyen]?.icone || 'fa-solid fa-check'" aria-hidden="true"></i></span>
              <span><strong>{{ p.projet_nom }}</strong><small><span class="adm-mono">{{ p.numero_recu || 'sans reçu' }}</span> · {{ formatHeure(p.paye_le) }}</small></span>
            </span>
            <strong class="tb-montant">{{ formaterEuros(p.montant_devis) }}</strong>
          </li>
        </ul>
        <div v-else class="adm-vide"><i class="fa-solid fa-receipt" aria-hidden="true"></i><p>Aucun encaissement sur cette période.</p></div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.tb { display: flex; flex-direction: column; gap: 20px; }
.tb-periode { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; }
.tb-dates { display: inline-flex; align-items: center; gap: 8px; color: var(--adm-muet); }
.tb-dates input { min-height: 36px; padding: 0 12px; border: 0; border-radius: 999px; background: #fff; box-shadow: inset 0 0 0 1px var(--adm-ligne); font: inherit; font-size: .86rem; color: var(--adm-encre); }
.tb-dates input:focus { outline: none; box-shadow: inset 0 0 0 2px var(--adm-accent); }
.tb-libelle-periode { color: var(--adm-encre-2); font-size: .86rem; }
.tb-libelle-periode::first-letter { text-transform: uppercase; }
.tb-libelle-periode i { margin-right: 6px; color: var(--adm-muet); }
.tb-ruptures { display: inline-flex; align-items: center; gap: 8px; margin-left: auto; padding: 7px 14px; border-radius: 999px; background: #fff1f2; color: var(--adm-baisse); font-size: .84rem; font-weight: 600; text-decoration: none; }
.tb-ruptures:hover { background: #ffe4e6; }
.tb-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin: 0; padding: 0; list-style: none; }
.tb-kpis > li { display: flex; }
.tb-kpi { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.tb-kpi span { display: inline-flex; align-items: center; gap: 8px; color: var(--adm-encre-2); font-size: .88rem; font-weight: 500; }
.tb-kpi strong { font-size: clamp(1.6rem, 2.6vw, 2.2rem); font-weight: 600; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.tb-kpi small { color: var(--adm-muet); font-size: .82rem; }
.tb-kpi-noir { background: var(--adm-noir); color: #fff; }
.tb-kpi-noir span, .tb-kpi-noir small { color: rgba(255, 255, 255, .65); }
.tb-kpi-lien { color: inherit; text-decoration: none; transition: box-shadow var(--transition), transform var(--transition); }
.tb-kpi-lien:hover { box-shadow: 0 0 0 1px var(--adm-muet), var(--adm-ombre); transform: translateY(-1px); }
.tb-kpi-alerte strong { color: #b45309; }

.tb-colonnes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; align-items: start; }
.tb-colonnes-graphe { grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); align-items: stretch; }
.tb-moyens { display: flex; flex-direction: column; gap: 18px; margin: 0; padding: 0; list-style: none; }
.tb-moyen-tete { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; font-size: .9rem; }
.tb-moyen-tete span { display: inline-flex; align-items: center; gap: 8px; color: var(--adm-encre-2); }
.tb-moyen-tete strong { font-variant-numeric: tabular-nums; font-weight: 600; }
.tb-barre { display: block; height: 8px; border-radius: 999px; background: var(--adm-ligne-2); overflow: hidden; }
.tb-barre span { display: block; height: 100%; border-radius: inherit; background: var(--adm-accent); transition: width .4s ease; }

.tb-liste { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
.tb-liste li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 0; border-top: 1px solid var(--adm-ligne-2); }
.tb-liste li:first-child { border-top: 0; padding-top: 0; }
.tb-droite { display: inline-flex; align-items: center; gap: 12px; }
.tb-montant { font-variant-numeric: tabular-nums; white-space: nowrap; }
.tb-avatar-ok { background: #ecfdf5; color: #047857; }

@media (max-width: 1100px) { .tb-colonnes, .tb-colonnes-graphe { grid-template-columns: 1fr; } .tb-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 760px) { .tb-kpis { grid-template-columns: 1fr; } }

/* Ordinateur : une seule page, sans défilement — les lignes se partagent la hauteur, les listes défilent dans leur carte */
@media (min-width: 1024px) and (min-height: 640px) {
  .tb { height: 100%; gap: 16px; padding-bottom: 16px; }
  .tb > .adm-alerte, .tb-kpis, .tb-periode { flex: none; margin: 0; }
  .tb-colonnes { flex: 1 1 0; }
  .tb-kpi { padding: 16px 20px; gap: 4px; }
  .tb-kpi strong { font-size: clamp(1.4rem, 2vw, 1.9rem); }
  .tb-colonnes, .tb-colonnes-graphe { min-height: 0; gap: 16px; align-items: stretch; }
  .tb-colonnes > section { display: flex; flex-direction: column; min-height: 0; padding: 18px 22px; }
  .tb-colonnes .adm-carte-tete { flex: none; margin-bottom: 12px; }
  .tb-colonnes .tb-liste, .tb-colonnes .tb-moyens { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; padding-right: 4px; }
  .tb-colonnes .adm-vide { flex: 1; padding: 12px; }
  .tb-colonnes :deep(.graphe) { flex: 1; min-height: 0; height: auto; }
  .tb-moyens { justify-content: space-around; gap: 12px; }
}
@media (min-width: 1024px) and (max-height: 820px) {
  .tb-colonnes .adm-carte-tete p { display: none; }
  .tb-kpi small { display: none; }
}
</style>

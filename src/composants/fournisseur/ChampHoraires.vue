<script setup>
/**
 * Horaires d'ouverture en tableau : un interrupteur par jour, heures choisies dans des listes (pas de saisie libre).
 * La colonne reste un texte (« Lun–Ven 7h–12h / 14h–17h · Sam 8h–12h ») : ce composant le lit et l'écrit.
 * Un ancien texte qu'on ne sait pas relire est conservé tant qu'on ne touche pas au tableau.
 */
import { computed, ref, watch } from 'vue'

const props = defineProps({ modelValue: { type: String, default: '' }, max: { type: Number, default: 120 } })
const emit = defineEmits(['update:modelValue'])

const JOURS = [['Lun', 'Lundi'], ['Mar', 'Mardi'], ['Mer', 'Mercredi'], ['Jeu', 'Jeudi'], ['Ven', 'Vendredi'], ['Sam', 'Samedi'], ['Dim', 'Dimanche']]
const DEBUT = 5 * 60, FIN = 22 * 60, PAS = 30
const HEURES = Array.from({ length: (FIN - DEBUT) / PAS + 1 }, (_, i) => DEBUT + i * PAS)

const enTexte = (m) => `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`
const enMinutes = (h, mm) => Number(h) * 60 + Number(mm || 0)
const fermes = () => JOURS.map(() => ({ ouvert: false, plages: [] }))

// Texte → tableau ; null si le texte n'a pas été écrit par ce composant
function lire(texte) {
  const jours = fermes()
  if (!texte?.trim()) return jours
  const abr = JOURS.map((j) => j[0])
  for (const morceau of texte.split(' · ')) {
    const m = morceau.trim().match(/^(\p{L}{3})(?:–(\p{L}{3}))?\s+(.+)$/u)
    const de = m && abr.indexOf(m[1]), a = m && (m[2] ? abr.indexOf(m[2]) : de)
    if (!m || de < 0 || a < de) return null
    const plages = m[3].split(' / ').map((p) => p.match(/^(\d{1,2})h(\d{2})?–(\d{1,2})h(\d{2})?$/))
    if (plages.some((p) => !p) || plages.length > 2) return null
    for (let i = de; i <= a; i++) jours[i] = { ouvert: true, plages: plages.map((p) => [enMinutes(p[1], p[2]), enMinutes(p[3], p[4])]) }
  }
  return jours
}

// Tableau → texte, jours consécutifs identiques regroupés
function ecrire(jours) {
  const cle = (j) => j.plages.map((p) => `${enTexte(p[0])}–${enTexte(p[1])}`).join(' / ')
  const morceaux = []
  for (let i = 0; i < 7; i++) {
    if (!jours[i].ouvert) continue
    let fin = i
    while (fin < 6 && jours[fin + 1].ouvert && cle(jours[fin + 1]) === cle(jours[i])) fin++
    morceaux.push(`${JOURS[i][0]}${fin > i ? `–${JOURS[fin][0]}` : ''} ${cle(jours[i])}`)
    i = fin
  }
  return morceaux.join(' · ')
}

const jours = ref(fermes())
const ancien = ref('')
let dernier = null
function charger(v) {
  if (v === dernier) return
  const lu = lire(v)
  jours.value = lu || fermes()
  ancien.value = lu ? '' : v
}
watch(() => props.modelValue, charger, { immediate: true })

function publier() {
  ancien.value = ''
  dernier = ecrire(jours.value)
  emit('update:modelValue', dernier)
}

// Ouvrir un jour reprend les heures du jour ouvert le plus proche avant lui (sinon 7h–16h)
function basculer(i) {
  const j = jours.value[i]
  if (!j.ouvert) {
    const modele = jours.value.slice(0, i).reverse().find((x) => x.ouvert) || jours.value.find((x) => x.ouvert)
    j.plages = modele ? modele.plages.map((p) => [...p]) : [[7 * 60, 16 * 60]]
  }
  j.ouvert = !j.ouvert
  publier()
}

// Garde les plages dans l'ordre : fin après début, l'après-midi après le matin
function corriger(j) {
  const [m, s] = j.plages
  if (m[1] <= m[0]) m[1] = Math.min(m[0] + PAS, FIN)
  if (s) {
    if (s[0] <= m[1]) s[0] = Math.min(m[1] + PAS, FIN - PAS)
    if (s[1] <= s[0]) s[1] = Math.min(s[0] + PAS, FIN)
  }
  publier()
}

function ajouterPause(j) {
  const [d, f] = j.plages[0]
  j.plages = f > 13 * 60 && d < 12 * 60 ? [[d, 12 * 60], [14 * 60, Math.max(f, 14 * 60 + PAS)]] : [[d, f], [Math.min(f + 2 * 60, FIN - PAS), Math.min(f + 5 * 60, FIN)]]
  corriger(j)
}
function retirerPause(j) { j.plages = [[j.plages[0][0], j.plages[1][1]]]; publier() }

function appliquerPartout(i) {
  const modele = jours.value[i]
  jours.value.forEach((j, k) => { if (k !== i && j.ouvert) j.plages = modele.plages.map((p) => [...p]) })
  publier()
}

const texte = computed(() => ancien.value || ecrire(jours.value))
const premierOuvert = computed(() => jours.value.findIndex((j) => j.ouvert))
const nbOuverts = computed(() => jours.value.filter((j) => j.ouvert).length)
</script>

<template>
  <div class="hor">
    <p v-if="ancien" class="hor-ancien"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Horaires actuels : « {{ ancien }} ». Cochez les jours d’ouverture pour les remplacer.</p>

    <ul class="hor-jours">
      <li v-for="(j, i) in jours" :key="JOURS[i][0]" class="hor-ligne" :class="{ ferme: !j.ouvert }">
        <button type="button" role="switch" class="adm-interrupteur" :aria-checked="j.ouvert" :aria-label="`${JOURS[i][1]} : ouvert`" @click="basculer(i)"></button>
        <span class="hor-jour">{{ JOURS[i][1] }}</span>

        <div v-if="j.ouvert" class="hor-plages">
          <span v-for="(p, n) in j.plages" :key="n" class="hor-plage">
            <select v-model.number="p[0]" :aria-label="`${JOURS[i][1]}, ouverture${n ? ' après la pause' : ''}`" @change="corriger(j)">
              <option v-for="h in HEURES.slice(0, -1)" :key="h" :value="h">{{ enTexte(h) }}</option>
            </select>
            <span aria-hidden="true">–</span>
            <select v-model.number="p[1]" :aria-label="`${JOURS[i][1]}, fermeture${n ? '' : j.plages[1] ? ' avant la pause' : ''}`" @change="corriger(j)">
              <option v-for="h in HEURES.filter((x) => x > p[0])" :key="h" :value="h">{{ enTexte(h) }}</option>
            </select>
            <button v-if="n" type="button" class="hor-icone" title="Retirer la pause" aria-label="Retirer la pause" @click="retirerPause(j)"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
          </span>
          <button v-if="j.plages.length < 2" type="button" class="hor-lien" @click="ajouterPause(j)"><i class="fa-solid fa-plus" aria-hidden="true"></i> Pause</button>
          <button v-if="i === premierOuvert && nbOuverts > 1" type="button" class="hor-lien" @click="appliquerPartout(i)"><i class="fa-regular fa-copy" aria-hidden="true"></i> Appliquer à tous</button>
        </div>
        <span v-else class="hor-ferme">Fermé</span>
      </li>
    </ul>

    <p class="hor-resultat" :class="{ trop: texte.length > max }">
      <span><i class="fa-regular fa-clock" aria-hidden="true"></i> {{ texte || 'Aucun jour d’ouverture' }}</span>
      <span v-if="texte.length > max">Trop de variations ({{ texte.length }} / {{ max }})</span>
    </p>
  </div>
</template>

<style scoped>
.hor { display: flex; flex-direction: column; gap: 10px; }
.hor-jours { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; border: 1px solid var(--adm-ligne); border-radius: 14px; overflow: hidden; }
.hor-ligne { display: grid; grid-template-columns: auto 84px 1fr; align-items: center; gap: 12px; min-height: 52px; padding: 6px 12px; background: var(--adm-champ); }
.hor-ligne + .hor-ligne { border-top: 1px solid var(--adm-ligne-2); }
.hor-jour { font-size: .88rem; font-weight: 600; color: var(--adm-encre); }
.ferme .hor-jour, .hor-ferme { color: var(--adm-muet); }
.hor-ferme { font-size: .85rem; }
.hor-plages { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; min-width: 0; }
.hor-plage { display: inline-flex; align-items: center; gap: 4px; color: var(--adm-muet); }
.hor-plage select {
  min-height: 36px; padding: 4px 6px; border: 1px solid var(--adm-ligne); border-radius: 10px; background: var(--adm-champ);
  color: var(--adm-encre); font: inherit; font-size: .88rem; font-variant-numeric: tabular-nums; cursor: pointer;
}
.hor-plage select:hover { border-color: var(--adm-ligne-forte); }
.hor-plage select:focus { outline: none; border-color: var(--adm-accent); box-shadow: 0 0 0 3px rgba(8, 145, 178, .14); }
.hor-lien, .hor-icone { border: 0; background: none; color: var(--adm-encre-2); font: inherit; font-size: .8rem; font-weight: 600; cursor: pointer; }
.hor-lien { display: inline-flex; align-items: center; gap: 5px; padding: 6px 2px; }
.hor-lien:hover, .hor-icone:hover { color: var(--adm-accent); }
.hor-icone { width: 28px; height: 28px; border-radius: 8px; color: var(--adm-muet); }
.hor-ancien { display: flex; gap: 8px; margin: 0; font-size: .8rem; color: var(--adm-attention-texte); }
.hor-ancien i { margin-top: 3px; }
.hor-resultat { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 10px; margin: 0; font-size: .8rem; color: var(--adm-muet); }
.hor-resultat i { margin-right: 4px; }
.hor-resultat.trop { color: var(--adm-baisse); font-weight: 600; }
@media (max-width: 520px) {
  .hor-ligne { grid-template-columns: auto 1fr; }
  .hor-plages, .hor-ferme { grid-column: 2; }
}
</style>

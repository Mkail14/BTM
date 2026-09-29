<script setup>
/**
 * ChampTelephone — sélecteur de pays + saisie formatée en direct.
 * v-model : numéro au format international (« +262639123456 ») lorsqu'il est complet et valide, sinon ''.
 * `valide` (v-model:valide) est faux tant qu'une saisie est partielle ou erronée (vrai si vide ou complète).
 */
import { ref, computed, watch } from 'vue'
import { PAYS, trouverPays, nettoyerNational, formaterNational, versE164, analyserTelephone } from '@/services/telephone.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  id: { type: String, default: 'champ-telephone' },
  label: { type: String, default: 'Numéro de téléphone' },
  erreur: { type: String, default: '' },
  requis: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'update:valide'])

const initial = analyserTelephone(props.modelValue)
const codePays = ref(initial?.pays.code || 'YT')
const national = ref(initial?.national || '')

const pays = computed(() => trouverPays(codePays.value))
const affiche = computed(() => formaterNational(national.value, pays.value))
const complet = computed(() => national.value.length === pays.value.longueur)
const valide = computed(() => pays.value.valide(national.value))
// Champ vide = acceptable (à chacun d'exiger le numéro) ; saisie partielle ou erronée = non acceptable
const acceptable = computed(() => valide.value || national.value === '')
const formatInvalide = computed(() => complet.value && !valide.value)

function publier() {
  emit('update:modelValue', valide.value ? versE164(national.value, pays.value) : '')
  emit('update:valide', acceptable.value)
}

function surSaisie(e) {
  national.value = nettoyerNational(e.target.value, pays.value)
  e.target.value = affiche.value // reformate immédiatement (espaces, chiffres uniquement)
  publier()
}
// Collage d'un numéro international (+33 6 12 …, 0033 …) : bascule sur le bon pays
function surCollage(e) {
  const texte = (e.clipboardData || window.clipboardData)?.getData('text') || ''
  if (!/^\s*(\+|00)/.test(texte)) return
  const a = analyserTelephone(texte)
  if (!a) return
  e.preventDefault()
  codePays.value = a.pays.code
  national.value = nettoyerNational(a.national, a.pays)
  publier()
}
function surPays() {
  national.value = nettoyerNational(national.value, pays.value)
  publier()
}

// Valeur modifiée depuis l'extérieur (ex. réinitialisation)
watch(() => props.modelValue, (v) => {
  if (v === (valide.value ? versE164(national.value, pays.value) : '')) return
  const a = analyserTelephone(v)
  codePays.value = a?.pays.code || codePays.value
  national.value = a?.national || ''
})
watch(acceptable, (v) => emit('update:valide', v), { immediate: true })

const message = computed(() => props.erreur || (formatInvalide.value ? `Numéro ${pays.value.nom} invalide — ${pays.value.aide}` : ''))
</script>

<template>
  <div class="champ tel">
    <label :for="id">{{ label }}<span v-if="requis" class="tel-requis" aria-hidden="true"> *</span></label>
    <div class="tel-groupe" :class="{ 'tel-invalide': !!message, 'tel-ok': valide && !message }">
      <label class="tel-pays" :for="`${id}-pays`">
        <span class="sr-only">Pays</span>
        <select :id="`${id}-pays`" v-model="codePays" @change="surPays" :aria-label="'Pays du numéro de téléphone'">
          <option v-for="p in PAYS" :key="p.code" :value="p.code">{{ p.nom }} (+{{ p.indicatif }})</option>
        </select>
        <span class="tel-indicatif" aria-hidden="true">+{{ pays.indicatif }}</span>
        <i class="fa-solid fa-chevron-down tel-chevron" aria-hidden="true"></i>
      </label>
      <input :id="id" type="tel" inputmode="tel" autocomplete="tel-national" :value="affiche" :placeholder="pays.exemple"
        :aria-invalid="!!message" :required="requis" @input="surSaisie" @paste="surCollage" />
      <i v-if="valide && !message" class="fa-solid fa-circle-check tel-coche" aria-hidden="true"></i>
    </div>
    <p v-if="message" :id="`${id}-aide`" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ message }}</p>
  </div>
</template>

<style scoped>
.tel-groupe {
  position: relative; display: flex; align-items: stretch; border: 1.5px solid var(--gris-300); border-radius: var(--rayon-sm);
  background: var(--blanc); transition: border-color var(--transition), box-shadow var(--transition);
}
.tel-groupe:focus-within { border-color: var(--lagon-500); box-shadow: 0 0 0 4px rgba(6, 182, 212, .18); }
.tel-groupe.tel-invalide { border-color: var(--erreur); background: var(--erreur-clair); }
.tel-groupe.tel-ok { border-color: var(--succes, #16a34a); }

.tel-pays { position: relative; display: flex; align-items: center; flex: 0 0 auto; border-right: 1.5px solid var(--gris-300); cursor: pointer; }
/* Le select couvre toute la zone (liste native) ; l'indicatif court est affiché par-dessus */
.tel-pays select {
  position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; padding: 0; border: 0;
}
.tel-indicatif { padding: 0 30px 0 14px; font-family: var(--font-mono); font-weight: 600; color: var(--texte); white-space: nowrap; }
.tel-chevron { position: absolute; right: 11px; font-size: .7rem; color: var(--gris-400); pointer-events: none; }

/* Le champ de saisie hérite du style global .champ input : on retire sa bordure, portée par le groupe */
.tel input { flex: 1; min-width: 0; border: 0; border-radius: 0 var(--rayon-sm) var(--rayon-sm) 0; background: transparent; box-shadow: none; letter-spacing: .02em; }
.tel input:focus { box-shadow: none; }
.tel input[aria-invalid="true"] { background: transparent; }
.tel-coche { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); color: var(--succes, #16a34a); pointer-events: none; }
.tel-requis { color: var(--erreur); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>

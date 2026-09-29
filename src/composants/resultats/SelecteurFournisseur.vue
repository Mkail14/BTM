<script setup>
import { ref, onMounted, computed } from 'vue'
import { chargerFournisseurs } from '@/services/supabase/serviceFournisseurs.js'
import CarteBase from '@/composants/commun/CarteBase.vue'

const props = defineProps({ modelValue: { type: String, default: '' } })
const emit = defineEmits(['update:modelValue', 'fournisseur'])
const liste = ref([])
const chargement = ref(true)
const selection = computed(() => liste.value.find((f) => f.id === props.modelValue) || null)

onMounted(async () => {
  const { donnees } = await chargerFournisseurs()
  liste.value = donnees
  chargement.value = false
  if (selection.value) emit('fournisseur', selection.value)
})

function choisir(f) {
  const nouveau = props.modelValue === f.id ? '' : f.id
  emit('update:modelValue', nouveau)
  emit('fournisseur', nouveau ? f : null)
}
const lienSite = (url) => (url?.startsWith('http') ? url : `https://${url}`)
</script>

<template>
  <CarteBase titre="Où acheter ? (facultatif)" icone="fa-solid fa-store" id="selecteur-fournisseur">
    <p class="texte-secondaire sf-intro">Choisissez un fournisseur de Mayotte : son adresse et son téléphone seront ajoutés au PDF.</p>
    <div v-if="chargement" class="sf-chargement"><span class="spinner spinner-grand"></span></div>
    <div v-else class="sf-liste" role="radiogroup" aria-label="Fournisseurs">
      <button
        v-for="f in liste" :key="f.id" type="button" role="radio" :aria-checked="modelValue === f.id"
        class="sf-option" :class="{ actif: modelValue === f.id }" @click="choisir(f)"
      >
        <img :src="f.logo" :alt="''" width="44" height="44" loading="lazy" />
        <span class="sf-texte">
          <strong>{{ f.nom }}</strong>
          <small>{{ f.categorie }} · {{ f.commune }}</small>
        </span>
        <i class="fa-solid fa-circle-check sf-coche" aria-hidden="true"></i>
      </button>
    </div>

    <transition name="glisser">
      <address v-if="selection" class="sf-coordonnees">
        <p><i class="fa-solid fa-location-dot"></i> {{ selection.adresse || selection.commune }}</p>
        <p><i class="fa-solid fa-phone"></i> <a :href="`tel:${selection.telephone.replace(/\s/g, '')}`" class="mono">{{ selection.telephone }}</a></p>
        <p v-if="selection.site_web"><i class="fa-solid fa-globe"></i> <a :href="lienSite(selection.site_web)" target="_blank" rel="noopener noreferrer">{{ selection.site_web.replace(/^https?:\/\//, '') }}</a></p>
        <p v-if="selection.livraison" class="badge badge-vert"><i class="fa-solid fa-truck-fast"></i> Livraison disponible</p>
      </address>
    </transition>
  </CarteBase>
</template>

<style scoped>
.sf-intro { font-size: .9rem; margin-bottom: 16px; }
.sf-chargement { display: grid; place-items: center; padding: 24px; }
.sf-liste { display: flex; flex-direction: column; gap: 10px; }
.sf-option {
  display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-radius: var(--rayon); text-align: left;
  border: 2px solid var(--bordure); background: var(--blanc); transition: border-color var(--transition), background var(--transition), transform var(--transition);
}
.sf-option:hover { border-color: var(--lagon-300); transform: translateX(3px); }
.sf-option.actif { border-color: var(--lagon-600); background: var(--lagon-50); }
.sf-option img { width: 44px; height: 44px; border-radius: 12px; }
.sf-texte { display: flex; flex-direction: column; flex: 1; line-height: 1.3; }
.sf-texte strong { font-family: var(--font-display); font-size: 1.15rem; color: var(--ardoise); }
.sf-texte small { color: var(--texte-secondaire); font-size: .82rem; }
.sf-coche { color: var(--lagon-600); opacity: 0; transform: scale(.6); transition: all var(--transition); }
.actif .sf-coche { opacity: 1; transform: scale(1); }
.sf-coordonnees { margin-top: 16px; padding: 14px 16px; border-radius: var(--rayon); background: var(--gris-50); font-style: normal; font-size: .92rem; display: flex; flex-direction: column; gap: 8px; }
.sf-coordonnees i { width: 18px; color: var(--lagon-600); }
.sf-coordonnees a { color: var(--lagon-800); font-weight: 600; }
.sf-coordonnees a:hover { text-decoration: underline; }
.sf-coordonnees .badge { align-self: flex-start; }
</style>

<script setup>
/**
 * Ma fiche : coordonnées et présentation affichées dans l'annuaire et sur les devis PDF des clients.
 * Nom, catégorie et visibilité restent gérés par BTM (fonction modifier_ma_fiche, migration 0012).
 * Aperçu en direct : la même ligne que sur la page Fournisseurs.
 */
import { computed, ref, watch } from 'vue'
import { useAdmin } from '@/composables/useAdmin.js'
import { normaliserFournisseur, libelleCategorie } from '@/donnees/fournisseurs.js'
import * as api from '@/services/supabase/serviceEspaceFournisseur.js'
import CarteFournisseur from '@/composants/fournisseurs/CarteFournisseur.vue'

const props = defineProps({ fiche: { type: Object, default: null } })
const emit = defineEmits(['maj'])
const { executer } = useAdmin()

const COMMUNES = ['Acoua', 'Bandraboua', 'Bandrélé', 'Bouéni', 'Chiconi', 'Chirongui', 'Dembéni', 'Dzaoudzi', 'Kani-Kéli', 'Koungou', 'Mamoudzou', 'Mtsamboro', 'M’Tsangamouji', 'Ouangani', 'Pamandzi', 'Sada', 'Tsingoni']
const CHAMPS = ['telephone', 'email', 'adresse', 'commune', 'site_web', 'description', 'horaires', 'logo_url', 'livraison']
const LIMITES = { description: 600, horaires: 120, adresse: 200 }

const depuisFiche = (f) => Object.fromEntries(CHAMPS.map((c) => [c, c === 'livraison' ? !!f?.[c] : f?.[c] || '']))
const brouillon = ref(depuisFiche(props.fiche))
watch(() => props.fiche, (f) => { brouillon.value = depuisFiche(f) })

const modifie = computed(() => CHAMPS.some((c) => brouillon.value[c] !== depuisFiche(props.fiche)[c]))
const erreur = computed(() => {
  const b = brouillon.value
  if (!b.telephone.trim()) return 'Le téléphone est obligatoire : c’est lui que les clients appellent.'
  if (!b.commune.trim()) return 'Indiquez la commune.'
  if (b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(b.email.trim())) return 'Adresse e-mail invalide.'
  if (b.site_web && !/^https?:\/\//.test(b.site_web.trim())) return 'Le site web doit commencer par https://'
  if (b.logo_url && !/^https:\/\//.test(b.logo_url.trim())) return 'Le logo doit être une adresse https://'
  const trop = Object.entries(LIMITES).find(([c, max]) => b[c].length > max)
  return trop ? `Texte trop long (${trop[1]} caractères maximum).` : ''
})
const tentative = ref(false)
const enregistrement = ref(false)

// sans logo saisi, l'annuaire affiche le logo par défaut (/logos/<slug>.svg)
const apercu = computed(() => props.fiche && normaliserFournisseur({ ...props.fiche, ...brouillon.value }))

async function enregistrer() {
  tentative.value = true
  if (erreur.value) return
  enregistrement.value = true
  await executer(async () => { emit('maj', await api.modifierMaFiche(brouillon.value)) }, 'Fiche mise à jour : elle est visible dans l’annuaire.')
  enregistrement.value = false
  tentative.value = false
}
const annuler = () => { brouillon.value = depuisFiche(props.fiche); tentative.value = false }
</script>

<template>
  <div class="mf">
    <form class="adm-carte adm-carte-pad" novalidate @submit.prevent="enregistrer">
      <div class="adm-carte-tete">
        <div><h2>Coordonnées</h2><p>Ce que les clients voient dans l’annuaire et sur leur devis.</p></div>
      </div>

      <div class="mf-fixes">
        <div><span>Entreprise</span><strong>{{ fiche?.nom }}</strong></div>
        <div><span>Catégorie</span><strong>{{ libelleCategorie(fiche?.categorie_id) }}</strong></div>
        <div>
          <span>Annuaire</span>
          <span v-if="fiche?.actif" class="adm-badge adm-badge-ok">Visible</span>
          <span v-else class="adm-badge adm-badge-attention">Masquée par BTM</span>
        </div>
        <p><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Pour changer ces informations, contactez BTM.</p>
      </div>

      <div class="adm-grille-form">
        <div class="adm-champ"><label for="mf-tel">Téléphone *</label><input id="mf-tel" v-model="brouillon.telephone" type="tel" autocomplete="tel" placeholder="0269 00 00 00" /></div>
        <div class="adm-champ"><label for="mf-email">E-mail</label><input id="mf-email" v-model="brouillon.email" type="email" autocomplete="email" placeholder="contact@entreprise.yt" /></div>
        <div class="adm-champ"><label for="mf-commune">Commune *</label><input id="mf-commune" v-model="brouillon.commune" list="mf-communes" autocomplete="off" /></div>
        <datalist id="mf-communes"><option v-for="c in COMMUNES" :key="c" :value="c" /></datalist>
        <div class="adm-champ"><label for="mf-adresse">Adresse</label><input id="mf-adresse" v-model="brouillon.adresse" autocomplete="street-address" placeholder="Zone industrielle, rue…" /></div>
        <div class="adm-champ"><label for="mf-web">Site web</label><input id="mf-web" v-model="brouillon.site_web" type="url" placeholder="https://" /></div>
        <div class="adm-champ"><label for="mf-hor">Horaires</label><input id="mf-hor" v-model="brouillon.horaires" placeholder="Lun–Ven 7h–16h, Sam 7h–12h" /></div>
        <div class="adm-champ plein"><label for="mf-logo">Logo (adresse d’une image)</label><input id="mf-logo" v-model="brouillon.logo_url" type="url" placeholder="https://…/logo.png" /></div>
        <div class="adm-champ plein">
          <label for="mf-desc">Présentation</label>
          <textarea id="mf-desc" v-model="brouillon.description" rows="2" placeholder="Vos produits, vos marques, vos services…"></textarea>
          <span class="adm-champ-aide"><span>Affichée quand un client déplie votre fiche.</span><span :class="{ trop: brouillon.description.length > LIMITES.description }">{{ brouillon.description.length }} / {{ LIMITES.description }}</span></span>
        </div>
        <label class="plein mf-option">
          <button type="button" role="switch" class="adm-interrupteur" :aria-checked="brouillon.livraison" @click="brouillon.livraison = !brouillon.livraison"></button>
          Livraison sur chantier possible
        </label>
      </div>

      <p v-if="tentative && erreur" class="adm-erreur-texte" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ erreur }}</p>

      <div class="mf-actions">
        <button type="button" class="adm-btn adm-btn-fantome" :disabled="!modifie || enregistrement" @click="annuler">Annuler les modifications</button>
        <button type="submit" class="adm-btn adm-btn-noir" :disabled="!modifie || enregistrement">
          <span v-if="enregistrement" class="spinner" aria-hidden="true"></span> Enregistrer
        </button>
      </div>
    </form>

    <aside class="adm-carte adm-carte-pad mf-apercu" aria-label="Aperçu de votre fiche">
      <div class="adm-carte-tete"><div><h2>Aperçu</h2><p>Votre ligne dans l’annuaire. Cliquez dessus pour la déplier.</p></div></div>
      <ul v-if="apercu" class="mf-apercu-liste"><CarteFournisseur :fournisseur="apercu" /></ul>
    </aside>
  </div>
</template>

<style scoped>
.mf { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 20px; align-items: start; }
.mf-fixes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 16px; margin-bottom: 22px; padding: 16px 18px; border-radius: var(--adm-rayon-sm); background: var(--adm-ligne-2); }
.mf-fixes > div { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 0; }
.mf-fixes span:first-child { font-size: .78rem; color: var(--adm-muet); }
.mf-fixes strong { font-size: .92rem; font-weight: 600; overflow-wrap: anywhere; }
.mf-fixes p { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; margin: 0; font-size: .82rem; color: var(--adm-encre-2); }
.mf-option { display: flex; align-items: center; gap: 12px; font-size: .92rem; font-weight: 500; cursor: pointer; }
.mf-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--adm-ligne-2); }
.mf-apercu { position: sticky; top: 16px; }
.mf-apercu-liste { margin: 0; padding: 0; list-style: none; }
@media (max-width: 1100px) {
  .mf { grid-template-columns: 1fr; }
  .mf-apercu { position: static; }
}
@media (max-width: 640px) { .mf-fixes { grid-template-columns: 1fr 1fr; } }

/* Mon compte sur ordinateur : tient dans l'écran (la carte défile seulement si l'écran est trop petit) */
@media (min-width: 1101px) and (min-height: 640px) {
  .mf { height: 100%; align-items: stretch; }
  .mf > form { display: flex; flex-direction: column; min-height: 0; overflow-y: auto; scrollbar-width: thin; }
  .mf > form .adm-grille-form { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 14px; }
  .mf > form .adm-grille-form > .plein { grid-column: 1 / -1; }
  .mf > form textarea { min-height: 64px; }
  .mf-fixes { margin-bottom: 16px; padding: 12px 16px; }
  .mf-actions { margin-top: auto; padding-top: 14px; }
  .mf-apercu { position: static; overflow-y: auto; }
}
</style>

<script setup>
/** Ligne de l'annuaire : identité + appel direct ; se déplie pour afficher description, adresse, horaires et site. */
import { ref } from 'vue'

const props = defineProps({ fournisseur: { type: Object, required: true } })
const ouvert = ref(false)
const lienSite = (url) => (url?.startsWith('http') ? url : `https://${url}`)
const domaine = (url) => url?.replace(/^https?:\/\//, '').replace(/\/$/, '')
const idDetails = `fournisseur-${props.fournisseur.id}`
</script>

<template>
  <li class="fr" :class="{ ouvert }">
    <div class="fr-ligne">
      <button type="button" class="fr-principal" :aria-expanded="ouvert" :aria-controls="idDetails" @click="ouvert = !ouvert">
        <img :src="fournisseur.logo" alt="" width="48" height="48" loading="lazy" class="fr-logo" />
        <span class="fr-texte">
          <strong>{{ fournisseur.nom }}</strong>
          <span>{{ fournisseur.categorie }} · {{ fournisseur.commune }}<template v-if="fournisseur.livraison"> · Livraison</template></span>
        </span>
        <i class="fa-solid fa-chevron-down fr-chevron" aria-hidden="true"></i>
      </button>
      <a :href="`tel:${fournisseur.telephone.replace(/\s/g, '')}`" class="fr-appel" :aria-label="`Appeler ${fournisseur.nom} au ${fournisseur.telephone}`">
        <i class="fa-solid fa-phone" aria-hidden="true"></i><span>{{ fournisseur.telephone }}</span>
      </a>
    </div>

    <div v-show="ouvert" :id="idDetails" class="fr-details">
      <p v-if="fournisseur.description">{{ fournisseur.description }}</p>
      <dl>
        <div><dt>Adresse</dt><dd>{{ fournisseur.adresse || fournisseur.commune }}</dd></div>
        <div v-if="fournisseur.horaires"><dt>Horaires</dt><dd>{{ fournisseur.horaires }}</dd></div>
        <div v-if="fournisseur.site_web">
          <dt>Site web</dt>
          <dd><a :href="lienSite(fournisseur.site_web)" target="_blank" rel="noopener noreferrer">{{ domaine(fournisseur.site_web) }} <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a></dd>
        </div>
      </dl>
    </div>
  </li>
</template>

<style scoped>
.fr { border-bottom: 1px solid var(--gris-100); }

.fr-ligne { display: flex; align-items: center; gap: 12px; }
.fr-principal {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: 16px; padding: 18px 0;
  border: 0; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer;
}
.fr-principal:focus-visible { outline: 2px solid var(--lagon-600); outline-offset: 4px; border-radius: 8px; }
.fr-logo { width: 48px; height: 48px; flex-shrink: 0; border-radius: 12px; border: 1px solid var(--gris-100); background: #fff; object-fit: contain; }
.fr-texte { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.fr-texte strong { font-size: 1.05rem; font-weight: 600; color: var(--ardoise); }
.fr-texte span { font-size: .86rem; color: var(--gris-500); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fr-chevron { color: var(--gris-400); font-size: .8rem; transition: transform var(--transition); }
.fr.ouvert .fr-chevron { transform: rotate(180deg); }

.fr-appel {
  flex-shrink: 0; display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 999px;
  border: 1px solid var(--gris-200); color: var(--ardoise); font-size: .88rem; font-weight: 600; font-variant-numeric: tabular-nums;
  transition: background var(--transition), border-color var(--transition), color var(--transition);
}
.fr-appel i { font-size: .8rem; color: var(--lagon-600); transition: color var(--transition); }
.fr-appel:hover { background: var(--ardoise); border-color: var(--ardoise); color: #fff; }
.fr-appel:hover i { color: #fff; }

.fr-details { padding: 0 0 22px 64px; animation: apparaitre .2s ease; }
.fr-details p { margin: 0 0 16px; max-width: 560px; color: var(--gris-600); font-size: .92rem; line-height: 1.6; }
.fr-details dl { display: grid; gap: 8px; margin: 0; }
.fr-details dl > div { display: grid; grid-template-columns: 90px 1fr; gap: 12px; font-size: .88rem; }
.fr-details dt { color: var(--gris-400); }
.fr-details dd { margin: 0; color: var(--ardoise); }
.fr-details a { color: var(--lagon-700); font-weight: 600; }
.fr-details a i { font-size: .7rem; margin-left: 2px; }

@media (max-width: 600px) {
  .fr-appel { width: 44px; height: 44px; padding: 0; justify-content: center; }
  .fr-appel span { display: none; }
  .fr-details { padding-left: 0; }
}
</style>

<script setup>
/** Ligne de l'annuaire : identité + appel direct ; se déplie pour la description, les horaires et les autres moyens de contact. */
import { computed, ref } from 'vue'

const props = defineProps({ fournisseur: { type: Object, required: true } })
const ouvert = ref(false)
const logoCasse = ref(false) // fournisseur ajouté sans logo : ses initiales à la place d'une image cassée
const idDetails = `fournisseur-${props.fournisseur.id}`

const initiales = computed(() => props.fournisseur.nom.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join('').toUpperCase())
const telephone = computed(() => props.fournisseur.telephone?.replace(/\s/g, '') || '')
const lienSite = (url) => (url?.startsWith('http') ? url : `https://${url}`)
const domaine = (url) => url?.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
// itinéraire : coordonnées GPS si connues (plus précis à Mayotte, où les adresses sont rares), sinon l'adresse
const itineraire = computed(() => {
  const f = props.fournisseur
  const destination = f.latitude != null && f.longitude != null ? `${f.latitude},${f.longitude}` : `${f.adresse || f.nom}, ${f.commune}, Mayotte`
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
})
</script>

<template>
  <li class="fr" :class="{ ouvert }">
    <div class="fr-ligne">
      <button type="button" class="fr-principal" :aria-expanded="ouvert" :aria-controls="idDetails" @click="ouvert = !ouvert">
        <img v-if="fournisseur.logo && !logoCasse" :src="fournisseur.logo" alt="" width="52" height="52" loading="lazy" decoding="async" class="fr-logo" @error="logoCasse = true" />
        <span v-else class="fr-logo fr-initiales" aria-hidden="true">{{ initiales }}</span>
        <span class="fr-texte">
          <!-- badge « Livraison » à côté du nom : la ligne d'infos reste sur une seule ligne, même en carte étroite -->
          <span class="fr-nom">
            <strong>{{ fournisseur.nom }}</strong>
            <span v-if="fournisseur.livraison" class="fr-badge"><i class="fa-solid fa-truck" aria-hidden="true"></i>Livraison</span>
          </span>
          <span class="fr-infos">
            <span>{{ fournisseur.categorie }}</span>
            <span><i class="fa-solid fa-location-dot" aria-hidden="true"></i>{{ fournisseur.commune }}</span>
          </span>
        </span>
        <i class="fa-solid fa-chevron-down fr-chevron" aria-hidden="true"></i>
      </button>
      <a v-if="telephone" :href="`tel:${telephone}`" class="fr-appel" :aria-label="`Appeler ${fournisseur.nom} au ${fournisseur.telephone}`">
        <i class="fa-solid fa-phone" aria-hidden="true"></i><span>{{ fournisseur.telephone }}</span>
      </a>
    </div>

    <div v-show="ouvert" :id="idDetails" class="fr-details">
      <p v-if="fournisseur.description" class="fr-description">{{ fournisseur.description }}</p>
      <dl>
        <div><dt><i class="fa-solid fa-location-dot" aria-hidden="true"></i>Adresse</dt><dd>{{ fournisseur.adresse || fournisseur.commune }}</dd></div>
        <div v-if="fournisseur.horaires"><dt><i class="fa-regular fa-clock" aria-hidden="true"></i>Horaires</dt><dd>{{ fournisseur.horaires }}</dd></div>
      </dl>
      <div class="fr-actions">
        <a :href="itineraire" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-route" aria-hidden="true"></i>Itinéraire</a>
        <a v-if="fournisseur.email" :href="`mailto:${fournisseur.email}`"><i class="fa-solid fa-envelope" aria-hidden="true"></i>E-mail</a>
        <a v-if="fournisseur.site_web" :href="lienSite(fournisseur.site_web)" target="_blank" rel="noopener noreferrer">
          <i class="fa-solid fa-globe" aria-hidden="true"></i>{{ domaine(fournisseur.site_web) }}
        </a>
      </div>
    </div>
  </li>
</template>

<style scoped>
.fr { border-bottom: 1px solid var(--gris-100); }
.fr:last-child { border-bottom: 0; }

.fr-ligne { display: flex; align-items: center; gap: 12px; padding: 0 16px; transition: background var(--transition); }
.fr-ligne:hover, .fr.ouvert .fr-ligne { background: var(--gris-50); }
.fr-principal {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: 16px; padding: 16px 0;
  border: 0; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer;
}
.fr-principal:focus-visible { outline: 2px solid var(--lagon-600); outline-offset: 4px; border-radius: 8px; }
.fr-logo { width: 52px; height: 52px; flex-shrink: 0; border-radius: 14px; border: 1px solid var(--gris-100); background: #fff; object-fit: contain; }
.fr-initiales { display: grid; place-items: center; border: 0; background: var(--lagon-100); color: var(--lagon-800); font-size: 1rem; font-weight: 700; letter-spacing: .02em; }
.fr-texte { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.fr-nom { display: flex; align-items: center; gap: 10px; min-width: 0; }
.fr-nom strong { min-width: 0; font-size: 1.05rem; font-weight: 650; color: var(--ardoise); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fr-nom .fr-badge { flex: none; }
.fr-badge i { margin-right: 5px; font-size: .72rem; }
.fr-infos { display: flex; align-items: center; gap: 4px 12px; min-width: 0; overflow: hidden; font-size: .84rem; color: var(--gris-500); white-space: nowrap; }
.fr-infos > span { overflow: hidden; text-overflow: ellipsis; }
.fr-infos i { margin-right: 4px; font-size: .74rem; color: var(--gris-400); }
.fr-badge { display: inline-flex; align-items: center; padding: 1px 8px; border-radius: 999px; background: var(--lagon-50); color: var(--lagon-800); font-size: .74rem; font-weight: 600; }
.fr-badge i { color: var(--lagon-600); }
.fr-chevron { color: var(--gris-400); font-size: .8rem; transition: transform var(--transition); }
.fr.ouvert .fr-chevron { transform: rotate(180deg); }

.fr-appel {
  flex-shrink: 0; display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 16px; border-radius: 999px;
  border: 1px solid var(--gris-200); background: #fff; color: var(--ardoise); font-size: .88rem; font-weight: 600; font-variant-numeric: tabular-nums;
  transition: background var(--transition), border-color var(--transition), color var(--transition);
}
.fr-appel i { font-size: .8rem; color: var(--lagon-600); transition: color var(--transition); }
.fr-appel:hover { background: var(--ardoise); border-color: var(--ardoise); color: #fff; }
.fr-appel:hover i { color: #fff; }

.fr-details { padding: 4px 16px 22px 84px; background: var(--gris-50); animation: apparaitre .2s ease; }
.fr-description { margin: 0 0 16px; max-width: 580px; color: var(--gris-600); font-size: .92rem; line-height: 1.6; }
.fr-details dl { display: grid; gap: 8px; margin: 0; }
.fr-details dl > div { display: grid; grid-template-columns: 110px 1fr; gap: 12px; font-size: .88rem; }
.fr-details dt { color: var(--gris-500); }
.fr-details dt i { width: 16px; margin-right: 6px; color: var(--gris-400); text-align: center; }
.fr-details dd { margin: 0; color: var(--ardoise); }
.fr-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
.fr-actions a {
  display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 14px; border: 1px solid var(--gris-200); border-radius: 999px;
  background: #fff; color: var(--lagon-800); font-size: .86rem; font-weight: 600; transition: border-color var(--transition), background var(--transition);
}
.fr-actions a:hover { border-color: var(--lagon-500); background: var(--lagon-50); }
.fr-actions a i { font-size: .8rem; color: var(--lagon-600); }

@media (max-width: 600px) {
  .fr-ligne { gap: 8px; padding: 0 12px; }
  .fr-principal { gap: 12px; padding: 14px 0; }
  .fr-logo { width: 44px; height: 44px; border-radius: 12px; }
  .fr-chevron { display: none; }
  .fr-appel { width: 44px; padding: 0; justify-content: center; }
  .fr-appel span { display: none; }
  .fr-details { padding: 4px 12px 18px; }
  .fr-details dl > div { grid-template-columns: 1fr; gap: 2px; }
  .fr-actions a { flex: 1 1 auto; justify-content: center; }
}
</style>

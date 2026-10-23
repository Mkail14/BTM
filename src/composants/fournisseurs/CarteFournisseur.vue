<script setup>
/** Ligne de l'annuaire : identité + appel direct ; se déplie pour la description, les horaires et les autres moyens de contact. */
import { computed, ref } from 'vue'

const props = defineProps({ fournisseur: { type: Object, required: true }, deplie: { type: Boolean, default: false } })
const ouvert = ref(props.deplie) // dépliée d'emblée dans l'aperçu de l'espace fournisseur
const logoCasse = ref(false) // fournisseur ajouté sans logo : ses initiales à la place d'une image cassée
const idDetails = `fournisseur-${props.fournisseur.id}`

const initiales = computed(() => props.fournisseur.nom.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join('').toUpperCase())
const telephone = computed(() => props.fournisseur.telephone?.replace(/\s/g, '') || '')
const noteTexte = computed(() => String(props.fournisseur.avis?.moyenne ?? '').replace('.', ','))
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
            <span v-if="fournisseur.livraison" class="fr-badge" :title="fournisseur.livraison_payante ? 'Livraison payante sur chantier' : 'Livraison gratuite sur chantier'"><i class="fa-solid fa-truck" aria-hidden="true"></i><span class="fr-badge-texte">Livraison</span></span>
          </span>
          <span class="fr-infos">
            <span>{{ fournisseur.categorie }}</span>
            <span><i class="fa-solid fa-location-dot" aria-hidden="true"></i>{{ fournisseur.commune }}</span>
            <span v-if="fournisseur.avis" class="fr-note" :aria-label="`Noté ${noteTexte} sur 5 par ${fournisseur.avis.nombre} client${fournisseur.avis.nombre > 1 ? 's' : ''}`"><i class="fa-solid fa-star" aria-hidden="true"></i>{{ noteTexte }} <small>({{ fournisseur.avis.nombre }})</small></span>
          </span>
        </span>
        <i class="fa-solid fa-chevron-down fr-chevron" aria-hidden="true"></i>
      </button>
      <a v-if="telephone" :href="`tel:${telephone}`" class="fr-appel" :aria-label="`Appeler ${fournisseur.nom} au ${fournisseur.telephone}`">
        <i class="fa-solid fa-phone" aria-hidden="true"></i><span>{{ fournisseur.telephone }}</span>
      </a>
    </div>

    <div v-show="ouvert" :id="idDetails" class="fr-details">
      <p v-if="fournisseur.demonstration" class="fr-avertissement"><i class="fa-solid fa-flask" aria-hidden="true"></i> Fiche fictive : ce fournisseur n’existe pas. Ses prix servent seulement à montrer le fonctionnement du site, en attendant nos premiers partenaires.</p>
      <p v-if="fournisseur.description" class="fr-description">{{ fournisseur.description }}</p>
      <dl>
        <div><dt><i class="fa-solid fa-location-dot" aria-hidden="true"></i>Adresse</dt><dd>{{ fournisseur.adresse || fournisseur.commune }}</dd></div>
        <div v-if="fournisseur.horaires"><dt><i class="fa-regular fa-clock" aria-hidden="true"></i>Horaires</dt><dd>{{ fournisseur.horaires }}</dd></div>
        <div v-if="fournisseur.livraison">
          <dt><i class="fa-solid fa-truck" aria-hidden="true"></i>Livraison</dt>
          <dd>{{ fournisseur.livraison_payante ? `Payante${fournisseur.livraison_tarif ? ` : ${fournisseur.livraison_tarif}` : ''}` : 'Gratuite sur chantier' }}</dd>
        </div>
      </dl>
      <!-- Avis des clients venus retirer leur commande (les 3 plus récents) -->
      <ul v-if="fournisseur.avis" class="fr-avis" aria-label="Avis des clients">
        <li v-for="a in fournisseur.avis.liste.slice(0, 3)" :key="a.id">
          <span class="fr-avis-tete">
            <span class="fr-etoiles" :aria-label="`${a.note} sur 5`"><i v-for="n in 5" :key="n" class="fa-solid fa-star" :class="{ eteinte: n > a.note }" aria-hidden="true"></i></span>
            <strong>{{ a.nom }}</strong>
          </span>
          <p v-if="a.commentaire">{{ a.commentaire }}</p>
        </li>
      </ul>
      <div class="fr-actions">
        <a :href="itineraire" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-route" aria-hidden="true"></i>Itinéraire</a>
        <a v-if="fournisseur.email" :href="`mailto:${fournisseur.email}`"><i class="fa-solid fa-envelope" aria-hidden="true"></i>E-mail</a>
        <a v-if="fournisseur.site_web" :href="lienSite(fournisseur.site_web)" target="_blank" rel="noopener noreferrer">
          <i class="fa-solid fa-globe" aria-hidden="true"></i><span class="fr-action-texte">{{ domaine(fournisseur.site_web) }}</span>
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
.fr-logo { width: 52px; height: 52px; flex-shrink: 0; border-radius: 14px; border: 1px solid var(--gris-100); background: var(--carte); object-fit: contain; }
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
  border: 1px solid var(--gris-200); background: var(--carte); color: var(--ardoise); font-size: .88rem; font-weight: 600; font-variant-numeric: tabular-nums;
  transition: background var(--transition), border-color var(--transition), color var(--transition);
}
.fr-appel i { font-size: .8rem; color: var(--lagon-600); transition: color var(--transition); }
.fr-appel:hover { background: var(--ardoise); border-color: var(--ardoise); color: var(--carte); }
.fr-appel:hover i { color: #fff; }

.fr-details { padding: 4px 16px 22px 84px; background: var(--gris-50); animation: apparaitre .2s ease; }
.fr-avertissement { display: flex; gap: 8px; margin: 0 0 14px; max-width: 580px; padding: 10px 12px; border-radius: 10px; background: #fffbeb; color: #92400e; font-size: .86rem; line-height: 1.5; }
.fr-avertissement i { margin-top: 3px; }
.fr-description { margin: 0 0 16px; max-width: 580px; color: var(--gris-600); font-size: .92rem; line-height: 1.6; }
.fr-details dl { display: grid; gap: 8px; margin: 0; }
.fr-details dl > div { display: grid; grid-template-columns: 110px 1fr; gap: 12px; font-size: .88rem; }
.fr-details dt { color: var(--gris-500); }
.fr-details dt i { width: 16px; margin-right: 6px; color: var(--gris-400); text-align: center; }
.fr-details dd { margin: 0; color: var(--ardoise); }
.fr-note { flex: none; color: var(--ardoise); font-weight: 600; }
.fr-note i { color: #f59e0b !important; }
.fr-note small { color: var(--gris-500); font-weight: 400; }
.fr-avis { display: flex; flex-direction: column; gap: 10px; max-width: 580px; margin: 16px 0 0; padding: 0; list-style: none; }
.fr-avis li { padding: 10px 12px; border-radius: 12px; background: var(--gris-100); }
.fr-avis-tete { display: flex; align-items: center; gap: 10px; font-size: .84rem; }
.fr-avis-tete strong { color: var(--ardoise); font-weight: 600; }
.fr-etoiles { display: inline-flex; gap: 2px; color: #f59e0b; font-size: .72rem; }
.fr-etoiles .eteinte { color: var(--gris-300); }
.fr-avis p { margin: 4px 0 0; color: var(--gris-600); font-size: .86rem; line-height: 1.5; }
.fr-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
.fr-actions a {
  display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 14px; border: 1px solid var(--gris-200); border-radius: 999px;
  background: var(--carte); color: var(--lagon-800); font-size: .86rem; font-weight: 600; transition: border-color var(--transition), background var(--transition);
}
.fr-actions a:hover { border-color: var(--lagon-500); background: var(--lagon-50); }
.fr-actions a i { font-size: .8rem; color: var(--lagon-600); }

/* Téléphone : carte arrondie (voir l'annuaire), appel en bouton rond plein, détails en liste claire
   et actions en grandes touches égales */
@media (max-width: 600px) {
  .fr, .fr:last-child { border-bottom: 0; }
  .fr-ligne { gap: 10px; padding: 0 12px 0 14px; }
  .fr-ligne:hover { background: none; }
  .fr.ouvert .fr-ligne { background: none; }
  .fr-principal { gap: 12px; padding: 14px 0; }
  .fr-principal:active { opacity: .7; }
  .fr-logo { width: 46px; height: 46px; border-radius: 13px; }
  .fr-nom strong { font-size: 1rem; }
  .fr-badge-texte { display: none; } /* téléphone : le camion seul, le nom garde la place */
  .fr-nom .fr-badge { gap: 0; }
  .fr-infos { font-size: .8rem; }
  .fr-chevron { display: none; }
  .fr-appel { width: 44px; padding: 0; justify-content: center; border: 0; background: var(--lagon-600); box-shadow: 0 6px 14px -6px rgba(8, 145, 178, .7); }
  .fr-appel i { color: #fff; font-size: .9rem; }
  .fr-appel span { display: none; }
  .fr-appel:active { background: var(--lagon-700); }

  .fr-details { margin: 0 12px 12px; padding: 14px; border-radius: 14px; background: var(--gris-50); }
  .fr-description { font-size: .9rem; }
  .fr-details dl > div { grid-template-columns: 1fr; gap: 2px; }
  .fr-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 8px; margin-top: 14px; }
  .fr-actions a {
    flex-direction: column; justify-content: center; gap: 4px; min-height: 58px; padding: 6px 4px; border-radius: 14px;
    font-size: .76rem; text-align: center; overflow: hidden;
  }
  .fr-actions a i { font-size: 1rem; }
  .fr-action-texte { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}
</style>

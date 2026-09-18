<script setup>
defineProps({ fournisseur: { type: Object, required: true } })
const lienSite = (url) => (url?.startsWith('http') ? url : `https://${url}`)
</script>

<template>
  <article class="carte carte-interactive cf" :style="{ '--couleur': fournisseur.couleur || 'var(--lagon-600)' }">
    <header class="cf-entete">
      <img :src="fournisseur.logo" :alt="`Logo ${fournisseur.nom}`" width="60" height="60" loading="lazy" class="cf-logo" />
      <div class="cf-titre">
        <h3>{{ fournisseur.nom }}</h3>
        <span class="badge">{{ fournisseur.categorie }}</span>
      </div>
      <span v-if="fournisseur.livraison" class="badge badge-vert cf-livraison" title="Livraison disponible"><i class="fa-solid fa-truck-fast"></i> Livraison</span>
    </header>

    <p class="cf-desc">{{ fournisseur.description }}</p>

    <ul class="cf-infos">
      <li><i class="fa-solid fa-location-dot"></i><span>{{ fournisseur.adresse || fournisseur.commune }}</span></li>
      <li v-if="fournisseur.horaires"><i class="fa-regular fa-clock"></i><span>{{ fournisseur.horaires }}</span></li>
    </ul>

    <footer class="cf-actions">
      <a :href="`tel:${fournisseur.telephone.replace(/\s/g, '')}`" class="btn btn-primaire btn-sm"><i class="fa-solid fa-phone"></i> {{ fournisseur.telephone }}</a>
      <a v-if="fournisseur.site_web" :href="lienSite(fournisseur.site_web)" target="_blank" rel="noopener noreferrer" class="btn btn-secondaire btn-sm">
        <i class="fa-solid fa-arrow-up-right-from-square"></i> Site web
      </a>
    </footer>
  </article>
</template>

<style scoped>
.cf { display: flex; flex-direction: column; gap: 16px; position: relative; overflow: hidden; }
.cf::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--lagon-700); }
.cf-entete { display: flex; gap: 14px; align-items: flex-start; }
.cf-logo { width: 60px; height: 60px; border-radius: 16px; box-shadow: var(--ombre-sm); flex-shrink: 0; }
.cf-titre { flex: 1; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.cf-titre h3 { font-size: 1.55rem; color: var(--ardoise); }
.cf-livraison { flex-shrink: 0; }
.cf-desc { color: var(--texte-secondaire); font-size: .93rem; line-height: 1.55; flex: 1; }
.cf-infos { display: flex; flex-direction: column; gap: 8px; font-size: .88rem; color: var(--gris-700); }
.cf-infos li { display: flex; gap: 10px; align-items: flex-start; }
.cf-infos i { color: var(--lagon-600); width: 16px; margin-top: 3px; }
.cf-actions { display: flex; flex-wrap: wrap; gap: 10px; padding-top: 6px; border-top: 1px solid var(--bordure); }
.cf-actions .btn { text-transform: none; font-family: var(--font-mono); letter-spacing: 0; }
</style>

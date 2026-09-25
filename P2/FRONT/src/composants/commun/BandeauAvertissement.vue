<script setup>
/** Bandeau de message — types : avertissement | info | erreur | succes */
defineProps({ type: { type: String, default: 'avertissement' }, compact: Boolean })
const icones = { avertissement: 'fa-solid fa-triangle-exclamation', info: 'fa-solid fa-circle-info', erreur: 'fa-solid fa-circle-xmark', succes: 'fa-solid fa-circle-check' }
</script>

<template>
  <aside class="bandeau" :class="[`bandeau-${type}`, { 'bandeau-compact': compact }]" role="note">
    <i :class="icones[type]" aria-hidden="true"></i>
    <div class="bandeau-contenu">
      <slot></slot>
    </div>
  </aside>
</template>

<style scoped>
.bandeau {
  display: flex; gap: 14px; align-items: flex-start; padding: 16px 18px; border-radius: var(--rayon);
  border: 1px solid; font-size: .93rem; line-height: 1.55;
}
.bandeau i { font-size: 1.2rem; margin-top: 2px; flex-shrink: 0; }
.bandeau-compact { padding: 10px 14px; font-size: .86rem; }
.bandeau-avertissement { background: #fff; border-color: var(--gris-300); border-left: 4px solid var(--sable-fonce); color: var(--gris-700); }
.bandeau-avertissement i { color: var(--sable-fonce); }
.bandeau-info { background: var(--lagon-50); border-color: var(--lagon-200); color: var(--lagon-900); }
.bandeau-info i { color: var(--lagon-600); }
.bandeau-erreur { background: var(--erreur-clair); border-color: #fecdd3; color: #881337; }
.bandeau-erreur i { color: var(--erreur); }
.bandeau-succes { background: #ecfdf5; border-color: #a7f3d0; color: #064e3b; }
.bandeau-succes i { color: var(--succes); }
</style>

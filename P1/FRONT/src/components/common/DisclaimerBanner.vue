<script setup>
defineProps({
  compact: { type: Boolean, default: false }
})
</script>

<template>
  <div class="disclaimer" :class="{ 'disclaimer--compact': compact }">
    <span class="disclaimer__icon" aria-hidden="true">!</span>
    <p>
      <strong>Estimation indicative, pas un devis.</strong>
      <span v-if="!compact">
        Les quantités et prix sont calculés à partir de ratios BTP standards et doivent être validés
        par un professionnel avant tout achat ou chantier.
      </span>
    </p>
  </div>
</template>

<style scoped>
.disclaimer {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 18px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-left: 4px solid var(--color-red);
  border-radius: var(--radius-sm);
}

.disclaimer p {
  margin: 0;
  font-size: 0.88rem;
  color: var(--text-on-dark);
  line-height: 1.5;
}

.disclaimer p strong {
  display: block;
  color: var(--text-on-dark);
  font-family: var(--font-mono);
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-bottom: 2px;
}

.disclaimer--compact p strong {
  margin-bottom: 0;
}

.disclaimer__icon {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--color-red);
  color: var(--text-on-dark);
  font-family: var(--font-mono);
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
}
</style>

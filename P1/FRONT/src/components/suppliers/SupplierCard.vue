<script setup>
defineProps({
  supplier: { type: Object, required: true }
})
</script>

<template>
  <article class="supplier-card">
    <div class="supplier-card__brand">
      <img v-if="supplier.logo" :src="supplier.logo" :alt="`${supplier.name} logo`" class="supplier-card__logo" />
      <span class="tag tag--violet">{{ supplier.category }}</span>
    </div>

    <div class="supplier-card__head">
      <div>
        <h3>{{ supplier.name }}</h3>
        <span class="supplier-card__fullname">{{ supplier.fullName }}</span>
      </div>
    </div>

    <p class="supplier-card__desc">{{ supplier.description }}</p>

    <dl class="supplier-card__meta">
      <div>
        <dt>Commune</dt>
        <dd>{{ supplier.commune }}</dd>
      </div>
      <div>
        <dt>Téléphone</dt>
        <dd class="mono">{{ supplier.phone }}</dd>
      </div>
      <div>
        <dt>Site web</dt>
        <dd>
          <a :href="supplier.website" target="_blank" rel="noopener noreferrer">Visiter →</a>
        </dd>
      </div>
    </dl>

    <span class="tag" :class="supplier.deliveryAvailable ? 'tag--yellow' : 'tag--concrete'">
      {{ supplier.deliveryAvailable ? 'Livraison disponible' : 'Retrait sur place' }}
    </span>
  </article>
</template>

<style scoped>
.supplier-card {
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: rgba(9, 17, 31, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 18px 32px rgba(15, 23, 42, 0.18);
}

.supplier-card__brand {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.supplier-card__logo {
  width: 58px;
  height: 58px;
  object-fit: cover;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.supplier-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.supplier-card__head h3 {
  font-size: 1.05rem;
  margin: 0;
  color: var(--text-on-dark);
}

.supplier-card__fullname {
  display: block;
  font-size: 0.78rem;
  color: rgba(244, 243, 239, 0.9);
  margin-top: 2px;
}

.supplier-card__desc {
  font-size: 0.88rem;
  color: rgba(244, 243, 239, 0.96);
  margin: 0;
  line-height: 1.6;
}

.supplier-card__meta {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin: 0;
  padding-top: 10px;
  border-top: 1px dashed rgba(255, 255, 255, 0.2);
}

.supplier-card__meta dt {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(244, 243, 239, 0.8);
}

.supplier-card__meta dd {
  margin: 2px 0 0;
  font-size: 0.85rem;
  color: var(--text-on-dark);
}

.supplier-card__meta dd a {
  color: var(--color-yellow);
  font-weight: 700;
}

.mono {
  font-family: var(--font-mono);
}
</style>

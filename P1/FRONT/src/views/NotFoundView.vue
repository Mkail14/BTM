<script setup></script>

<template>
  <div class="section not-found">
    <div class="container not-found__inner">
      <span class="not-found__code">404</span>
      <h1 class="section-title">Page introuvable</h1>
      <p class="section-sub">Cette page n'existe pas ou a été déplacée.</p>
      <router-link to="/" class="btn btn--primary">Retour à l'accueil</router-link>
    </div>
  </div>
</template>

<style scoped>
.not-found {
  min-height: calc(100vh - var(--header-h));
  display: flex;
  align-items: center;
}

.not-found__inner {
  text-align: center;
}

.not-found__code {
  display: block;
  font-family: var(--font-display);
  font-size: 5rem;
  color: var(--color-violet);
  opacity: 0.3;
  line-height: 1;
  margin-bottom: 10px;
}

.not-found__inner .section-sub {
  margin: 0 auto 28px;
}
</style>

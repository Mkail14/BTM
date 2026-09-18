<script setup>
const year = new Date().getFullYear()
</script>

<template>
  <footer class="app-footer">
    <div class="container footer-grid">
      <div class="footer-brand">
        <strong>BTM</strong>
        <p>Bâtiment &amp; Travaux Mayotte — estimez vos matériaux de construction en quelques minutes.</p>
      </div>

      <nav class="footer-col" aria-label="Navigation">
        <span class="footer-col__title">Navigation</span>
        <router-link to="/calculateur">Calculateur</router-link>
        <router-link to="/fournisseurs">Fournisseurs</router-link>
        <router-link to="/dashboard">Mes projets</router-link>
      </nav>

      <div class="footer-col">
        <span class="footer-col__title">À retenir</span>
        <span class="footer-note">Les estimations fournies sont indicatives. Elles ne remplacent pas un devis établi par un professionnel du BTP.</span>
      </div>
    </div>
    <div class="footer-bottom container">
      <span>© {{ year }} BTM — Projet réalisé à Mayotte.</span>
    </div>
  </footer>
</template>

<style scoped>
.app-footer {
  background: rgba(15, 23, 42, 0.92);
  color: var(--text-on-dark-dim);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  margin-top: 0;
}

.footer-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1.2fr;
  gap: 40px;
  padding: 52px 24px 32px;
}

.footer-brand strong {
  font-family: var(--font-display);
  color: var(--text-on-dark);
  font-size: 1.3rem;
}

.footer-brand p {
  margin-top: 10px;
  max-width: 340px;
  font-size: 0.92rem;
  line-height: 1.7;
}

.footer-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.footer-col__title {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-yellow);
  margin-bottom: 4px;
}

.footer-col a {
  font-size: 0.9rem;
  color: var(--text-on-dark-dim);
  transition: color 0.18s ease;
}

.footer-col a:hover {
  color: var(--text-on-dark);
}

.footer-note {
  font-size: 0.85rem;
  line-height: 1.6;
}

.footer-bottom {
  border-top: 1px solid rgba(244, 243, 239, 0.1);
  padding: 18px 24px 28px;
  font-size: 0.8rem;
  font-family: var(--font-mono);
}

@media (max-width: 760px) {
  .footer-grid {
    grid-template-columns: 1fr;
    gap: 28px;
    padding: 40px 20px 24px;
  }
}
</style>

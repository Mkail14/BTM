<script setup>
/**
 * Bandeau en tête de page (Mes projets, Fournisseurs…) : même ambiance que le haut de l'accueil
 * (ardoise → lagon, coins arrondis), petit surtitre doré, titre, résumé en pastilles et un bouton blanc.
 *   pastilles : [{ icone, valeur, texte?, avant?, prix? }]  → « 5 devis », « 9 191,30 € au total », « dernier hier »…
 *   slot « action » : le bouton blanc (router-link ou lien, classe .bandeau-action)
 */
defineProps({
  surtitre: { type: String, default: '' },
  titre: { type: String, required: true },
  texte: { type: String, default: '' }, // phrase affichée quand il n'y a pas de pastilles
  pastilles: { type: Array, default: () => [] }
})
</script>

<template>
  <header class="bandeau">
    <div class="bandeau-texte">
      <span v-if="surtitre" class="bandeau-surtitre">{{ surtitre }}</span>
      <h1>{{ titre }}</h1>
      <ul v-if="pastilles.length" class="bandeau-pastilles" aria-label="Résumé">
        <li v-for="(p, i) in pastilles" :key="i">
          <i :class="p.icone" aria-hidden="true"></i>{{ p.avant }} <strong :class="{ prix: p.prix }">{{ p.valeur }}</strong> {{ p.texte }}
        </li>
      </ul>
      <p v-else-if="texte">{{ texte }}</p>
    </div>
    <slot name="action" />
  </header>
</template>

<style scoped>
.bandeau {
  position: relative; display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 20px;
  padding: 34px 36px; overflow: hidden; border-radius: 28px; color: #fff;
  background: radial-gradient(90% 140% at 100% 0%, rgba(34, 211, 238, .28), transparent 55%), linear-gradient(135deg, #0b1f2a 0%, #0f3b4d 60%, #0e5566 100%);
}
.bandeau::after { content: ''; position: absolute; right: -60px; bottom: -80px; width: 260px; height: 260px; border-radius: 50%; border: 40px solid rgba(255, 255, 255, .05); pointer-events: none; }
.bandeau-surtitre { display: inline-flex; align-items: center; gap: 10px; color: #f7c77a; font-size: .74rem; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; }
.bandeau-surtitre::before { content: ''; width: 22px; height: 2px; background: #f59e0b; }
.bandeau h1 { margin: 10px 0 0; font-size: clamp(2.2rem, 4.5vw, 3.2rem); font-weight: 700; color: #fff; }
.bandeau-texte > p { margin: 10px 0 0; max-width: 620px; color: rgba(255, 255, 255, .72); line-height: 1.55; }
.bandeau-pastilles { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 0; padding: 0; list-style: none; }
.bandeau-pastilles li { display: inline-flex; align-items: center; gap: 8px; padding: 7px 14px; border: 1px solid rgba(255, 255, 255, .14); border-radius: 999px; background: rgba(255, 255, 255, .08); color: rgba(255, 255, 255, .78); font-size: .88rem; backdrop-filter: blur(6px); }
.bandeau-pastilles i { color: #67e8f9; font-size: .8rem; }
.bandeau-pastilles strong { color: #fff; }

/* bouton blanc passé dans le slot « action » */
.bandeau :slotted(.bandeau-action) {
  position: relative; z-index: 1; display: inline-flex; align-items: center; gap: 10px; min-height: 50px; padding: 0 22px; border-radius: 14px;
  background: #fff; color: var(--ardoise); font-weight: 700; box-shadow: 0 10px 24px -10px rgba(0, 0, 0, .5); transition: transform var(--transition);
}
.bandeau :slotted(.bandeau-action:hover) { transform: translateY(-2px); }
.bandeau :slotted(.bandeau-action i) { color: var(--lagon-600); }

@media (max-width: 760px) {
  .bandeau { padding: 26px 22px; border-radius: 22px; }
  .bandeau :slotted(.bandeau-action) { width: 100%; justify-content: center; }
}
</style>

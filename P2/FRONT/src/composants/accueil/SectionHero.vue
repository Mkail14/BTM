<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import Scene3DChantier from './Scene3DChantier.vue'

const decalage = ref(0)
let raf = null
const surScroll = () => {
  if (raf) return
  raf = requestAnimationFrame(() => { decalage.value = window.scrollY; raf = null })
}
onMounted(() => window.addEventListener('scroll', surScroll, { passive: true }))
onBeforeUnmount(() => { window.removeEventListener('scroll', surScroll); if (raf) cancelAnimationFrame(raf) })

</script>

<template>
  <section id="hero-section" class="hero fond-plan" aria-labelledby="hero-titre">
    <div class="hero-fond-parallax" :style="{ transform: `translate3d(0, ${decalage * 0.25}px, 0)` }" aria-hidden="true"></div>

    <div class="conteneur hero-grille">
      <div class="hero-texte" :style="{ transform: `translate3d(0, ${decalage * 0.08}px, 0)` }">
        <p class="hero-surtitre">Plateforme d’estimation BTP · Mayotte</p>
        <h1 id="hero-titre" class="hero-titre">
          Estimer vos travaux
        </h1>
        <p class="hero-desc">
          Budget, quantités et fournisseurs pour mur, dalle, fondation ou terrasse.
        </p>
        <div class="hero-actions">
          <BoutonBase to="/calculateur" variante="primaire" icone-droite="fa-solid fa-arrow-right">Lancer une estimation</BoutonBase>
          <BoutonBase to="/fournisseurs" variante="contour-clair">Annuaire des fournisseurs</BoutonBase>
        </div>
      </div>

      <div class="hero-visuel" :style="{ transform: `translate3d(0, ${decalage * -0.06}px, 0)` }">
        <Scene3DChantier />
      </div>
    </div>

    <div class="hero-bas" aria-hidden="true">
      <span class="hero-bas-item"><i class="fa-solid fa-circle-check"></i> Formules issues des règles de gestion BTP</span>
      <span class="hero-bas-item"><i class="fa-solid fa-circle-check"></i> Export PDF</span>
      <span class="hero-bas-item"><i class="fa-solid fa-circle-check"></i> Fournisseurs vérifiés localement</span>
    </div>
  </section>
</template>

<style scoped>
.hero {
  position: relative; min-height: 100svh; display: flex; flex-direction: column; justify-content: center; overflow: hidden;
  color: #fff; padding: calc(var(--hauteur-entete) + 48px) 0 0; isolation: isolate;
}
.hero-fond-parallax {
  position: absolute; inset: -20% -10%; z-index: -1; pointer-events: none;
  background:
    radial-gradient(ellipse 50% 60% at 78% 45%, rgba(8,145,178,.22), transparent 70%),
    radial-gradient(ellipse 40% 40% at 10% 90%, rgba(14,116,144,.18), transparent 70%);
}
.hero-grille {
  display: grid; gap: 32px 56px; grid-template-columns: 1fr; align-items: center; justify-items: center;
  flex: 1; width: min(100%, 1260px); margin: 0 auto; padding-bottom: 40px;
}
@media (min-width: 900px) {
  .hero-grille {
    grid-template-columns: minmax(0, 1fr) minmax(340px, 520px);
    gap: 48px; justify-items: center; align-items: center;
  }
}

.hero-texte {
  display: flex; flex-direction: column; justify-content: center; width: 100%; max-width: 610px; margin-inline: auto;
  text-align: left;
}
@media (min-width: 900px) { .hero-texte { justify-self: end; margin-inline: 0; } }

.hero-surtitre {
  display: inline-flex; align-items: center; gap: 10px; font-size: .78rem; font-weight: 600; letter-spacing: .14em; text-transform: uppercase;
  color: var(--lagon-300); margin-bottom: 22px; animation: apparaitre .6s ease both;
}
.hero-surtitre::before { content: ''; width: 26px; height: 2px; background: var(--lagon-400); }
.hero-titre {
  font-size: clamp(2.6rem, 6vw, 4.6rem); font-weight: 700; line-height: 1.02; letter-spacing: -.01em;
  animation: apparaitre .7s .08s ease both;
}
.hero-desc { margin-top: 24px; font-size: clamp(1rem, 1.4vw, 1.15rem); line-height: 1.65; color: var(--beton); max-width: 560px; animation: apparaitre .7s .18s ease both; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 34px; animation: apparaitre .7s .28s ease both; }
.hero-visuel {
  width: 100%; max-width: 520px; display: flex; align-items: center; justify-content: center; position: relative; top: 48px;
  transform: translateY(18px);
  animation: apparaitre .9s .2s ease both;
}
@media (min-width: 900px) { .hero-visuel { justify-self: center; transform: translateY(26px); } }

.hero-bas {
  display: flex; flex-wrap: wrap; gap: 12px 32px; justify-content: center; padding: 18px 20px;
  border-top: 1px solid rgba(255,255,255,.08); background: rgba(15,23,42,.55); font-size: .84rem; color: var(--gris-400);
}
.hero-bas-item { display: inline-flex; gap: 8px; align-items: center; }
.hero-bas-item i { color: var(--lagon-400); }
</style>

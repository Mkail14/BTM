<script setup>
import BoutonBase from '@/composants/commun/BoutonBase.vue'
</script>

<template>
  <div id="page-404" class="page introuvable">
    <div class="conteneur introuvable-grille">
      <div>
        <span class="section-surtitre">Erreur 404</span>
        <h1>Cette page n’est pas au plan.</h1>
        <p class="texte-secondaire">L’adresse demandée n’existe pas ou a été déplacée. Vérifiez l’URL ou revenez à l’accueil.</p>
        <div class="introuvable-actions">
          <BoutonBase to="/" icone="fa-solid fa-house">Retour à l’accueil</BoutonBase>
          <BoutonBase to="/calculateur" variante="secondaire">Calculateur</BoutonBase>
        </div>
      </div>
      <div class="introuvable-visuel fond-plan" aria-hidden="true">
        <span class="mono">404</span>
        <i class="fa-solid fa-triangle-exclamation"></i>
      </div>
    </div>
  </div>
</template>

<style scoped>
.introuvable { display: flex; align-items: center; min-height: 80vh; }
.introuvable-grille { display: grid; gap: 40px; grid-template-columns: 1fr; align-items: center; }
@media (min-width: 900px) { .introuvable-grille { grid-template-columns: 1.1fr 1fr; } }
h1 { font-size: clamp(2.2rem, 5vw, 3.4rem); color: var(--ardoise); margin-bottom: 12px; line-height: 1.05; }
.introuvable-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 28px; }
.introuvable-visuel { position: relative; height: 320px; border-radius: var(--rayon-lg); display: grid; place-items: center; color: #fff; }
.introuvable-visuel span { font-size: clamp(5rem, 12vw, 8rem); font-weight: 600; color: rgba(255,255,255,.08); letter-spacing: -.04em; }
.introuvable-visuel i { position: absolute; font-size: 3rem; color: var(--sable-fonce); }
</style>

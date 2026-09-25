<script setup>
/** Bande sombre « plan » : rappel de la proposition de valeur + hypothèses transparentes */
import BoutonBase from '@/composants/commun/BoutonBase.vue'
const regles = [
  { titre: 'Mur', formule: 'S = L × H − ouvertures', detail: 'Parpaings S / 0,08 × 1,05' },
  { titre: 'Dalle', formule: 'V = L × l × ép.', detail: 'Béton 2,4 t/m³ · fer 5 kg/m²' },
  { titre: 'Fondation', formule: 'V = L × l × prof.', detail: 'Béton armé · acier 50 kg/m³' },
  { titre: 'Terrasse', formule: 'Dalle + finition', detail: 'Carrelage 50 €/m² · lissé 15 €/m²' }
]
</script>

<template>
  <section id="regles-calcul" class="section regles fond-plan" aria-labelledby="regles-titre">
    <div class="conteneur regles-grille">
      <div class="reveal">
        <p>Chaque devis détaille les formules appliquées, les quantités arrondies et les prix unitaires utilisés.</p>
        <BoutonBase to="/calculateur" variante="primaire" icone-droite="fa-solid fa-arrow-right">Tester le calculateur</BoutonBase>
      </div>
      <dl class="regles-liste">
        <div v-for="(r, i) in regles" :key="r.titre" class="regle reveal" :data-delai="i + 1">
          <dt>{{ r.titre }}</dt>
          <dd class="mono">{{ r.formule }}</dd>
          <dd class="regle-detail">{{ r.detail }}</dd>
        </div>
      </dl>
    </div>
  </section>
</template>

<style scoped>
.regles { color: #fff; }
.regles-grille { display: grid; gap: 40px; grid-template-columns: 1fr; align-items: center; }
@media (min-width: 900px) { .regles-grille { grid-template-columns: 1fr 1fr; gap: 72px; } }
.regles-surtitre { color: var(--lagon-300); }
.regles-surtitre::before { background: var(--lagon-400); }
.regles h2 { font-size: clamp(2rem, 4vw, 2.9rem); font-weight: 700; line-height: 1.08; }
.regles p { margin: 18px 0 28px; color: var(--beton); line-height: 1.65; max-width: 520px; }
.regles-liste { display: grid; grid-template-columns: 1fr; gap: 1px; background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.1); margin: 0; }
@media (min-width: 640px) { .regles-liste { grid-template-columns: 1fr 1fr; } }
.regle { background: var(--ardoise); padding: 24px; }
.regle dt { font-family: var(--font-display); font-size: 1.3rem; font-weight: 700; color: #fff; }
.regle dd { margin: 8px 0 0; color: var(--lagon-300); font-size: .95rem; }
.regle-detail { color: var(--gris-400) !important; font-size: .85rem !important; }
</style>

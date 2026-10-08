<script setup>
const etapes = [
  { num: '01', icone: 'fa-solid fa-list-check', titre: 'Sélectionnez l’ouvrage', texte: 'Mur, dalle, fondation ou terrasse. Chaque type possède son formulaire et ses règles de calcul.' },
  { num: '02', icone: 'fa-solid fa-ruler-combined', titre: 'Renseignez les dimensions', texte: 'Longueur, hauteur, épaisseur, ouvertures… Les saisies sont contrôlées avant le calcul.' },
  { num: '03', icone: 'fa-solid fa-calculator', titre: 'Obtenez votre devis', texte: 'Quantités et coût de chaque matériau, et le total à prévoir.' },
  { num: '04', icone: 'fa-solid fa-file-invoice', titre: 'Exportez et contactez', texte: 'PDF récapitulatif, sauvegarde du projet et coordonnées directes des fournisseurs de Mayotte.' }
]
</script>

<template>
  <section id="comment-ca-marche" class="section ccm" aria-labelledby="ccm-titre">
    <div class="conteneur ccm-grille">
      <header class="section-entete reveal ccm-entete">
        <p class="section-sous-titre">Un parcours pensé pour les particuliers comme pour les artisans : rapide, lisible, sans inscription obligatoire.</p>
        <router-link to="/calculateur" class="btn btn-primaire ccm-btn">Commencer <i class="fa-solid fa-arrow-right"></i></router-link>
      </header>

      <ol class="ccm-liste">
        <li v-for="(e, i) in etapes" :key="e.num" class="ccm-etape reveal" :data-delai="i + 1">
          <span class="ccm-num mono">{{ e.num }}</span>
          <span class="ccm-icone"><i :class="e.icone" aria-hidden="true"></i></span>
          <div>
            <h3>{{ e.titre }}</h3>
            <p>{{ e.texte }}</p>
          </div>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
.ccm { background: var(--fond); }
.ccm-grille { display: grid; gap: 40px; grid-template-columns: 1fr; align-items: start; }
@media (min-width: 900px) { .ccm-grille { grid-template-columns: 1fr 1.3fr; gap: 72px; } .ccm-entete { position: sticky; top: 110px; margin: 0; } }
.ccm-btn { margin-top: 26px; }
.ccm-liste { display: flex; flex-direction: column; }
.ccm-etape {
  display: grid; grid-template-columns: auto auto 1fr; gap: 18px; align-items: start; padding: 26px 0; border-top: 1px solid var(--gris-300);
}
.ccm-etape:last-child { border-bottom: 1px solid var(--gris-300); }
.ccm-num { font-size: .85rem; font-weight: 600; color: var(--lagon-700); padding-top: 12px; min-width: 24px; }
.ccm-icone { width: 46px; height: 46px; border-radius: var(--rayon-sm); display: grid; place-items: center; background: var(--ardoise); color: var(--lagon-300); font-size: 1.1rem; }
.ccm-etape h3 { font-size: 1.35rem; font-weight: 700; color: var(--ardoise); }
.ccm-etape p { color: var(--texte-secondaire); margin-top: 6px; font-size: .95rem; line-height: 1.6; }
@media (max-width: 640px) { .ccm-etape { grid-template-columns: auto 1fr; } .ccm-num { display: none; } }
</style>

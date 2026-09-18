<script setup>
import { categories } from '@/donnees/fournisseurs.js'
const props = defineProps({ recherche: { type: String, default: '' }, categorie: { type: String, default: '' }, nbResultats: { type: Number, default: 0 } })
const emit = defineEmits(['update:recherche', 'update:categorie', 'reinitialiser'])
</script>

<template>
  <section class="filtres" aria-label="Recherche et filtres">
    <div class="filtres-recherche champ">
      <label for="recherche-fournisseur" class="visually-hidden">Rechercher un fournisseur</label>
      <div class="champ-saisie">
        <i class="fa-solid fa-magnifying-glass filtres-loupe" aria-hidden="true"></i>
        <input id="recherche-fournisseur" type="search" :value="recherche" placeholder="Nom, commune ou description… (ex. béton, Koungou)" autocomplete="off"
          style="font-family: var(--font-corps); padding-left: 44px" @input="emit('update:recherche', $event.target.value)" />
        <button v-if="recherche" type="button" class="filtres-effacer" aria-label="Effacer la recherche" @click="emit('update:recherche', '')"><i class="fa-solid fa-xmark"></i></button>
      </div>
    </div>

    <div class="filtres-categories" role="radiogroup" aria-label="Filtrer par catégorie">
      <button
        v-for="c in categories" :key="c.id" type="button" role="radio" :aria-checked="categorie === c.id"
        class="filtres-puce" :class="{ actif: categorie === c.id }" @click="emit('update:categorie', c.id)"
      >
        <i :class="c.icone" aria-hidden="true"></i> {{ c.libelle }}
      </button>
    </div>

    <p class="filtres-compteur" role="status" aria-live="polite">
      <strong class="mono">{{ nbResultats }}</strong> fournisseur{{ nbResultats > 1 ? 's' : '' }} trouvé{{ nbResultats > 1 ? 's' : '' }}
      <button v-if="recherche || categorie" type="button" class="filtres-reset" @click="emit('reinitialiser')"><i class="fa-solid fa-rotate-left"></i> Réinitialiser</button>
    </p>
  </section>
</template>

<style scoped>
.filtres { display: flex; flex-direction: column; gap: 16px; margin-bottom: 32px; }
.filtres-recherche input { padding: 15px 44px 15px 44px !important; border-radius: 999px !important; font-size: 1rem; box-shadow: var(--ombre-sm); }
.filtres-loupe { position: absolute; left: 18px; color: var(--lagon-600); pointer-events: none; }
.filtres-effacer { position: absolute; right: 12px; width: 30px; height: 30px; border-radius: 50%; border: none; background: var(--gris-100); color: var(--gris-600); display: grid; place-items: center; }
.filtres-effacer:hover { background: var(--gris-200); }
.filtres-categories { display: flex; flex-wrap: wrap; gap: 8px; }
.filtres-puce {
  display: inline-flex; gap: 8px; align-items: center; padding: 9px 16px; border-radius: 999px; font-size: .9rem; font-weight: 500;
  border: 1.5px solid var(--bordure); background: var(--blanc); color: var(--gris-700);
  transition: all var(--transition);
}
.filtres-puce:hover { border-color: var(--lagon-300); color: var(--lagon-800); transform: translateY(-1px); }
.filtres-puce.actif { background: var(--lagon-700); border-color: var(--lagon-700); color: #fff; box-shadow: 0 6px 16px rgba(14,116,144,.3); }
.filtres-compteur { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; color: var(--texte-secondaire); font-size: .92rem; }
.filtres-compteur strong { color: var(--lagon-700); font-size: 1.1rem; margin-right: 4px; }
.filtres-reset { background: none; border: none; color: var(--lagon-700); font-weight: 600; display: inline-flex; gap: 6px; align-items: center; padding: 4px 8px; border-radius: 6px; }
.filtres-reset:hover { background: var(--lagon-50); }
</style>

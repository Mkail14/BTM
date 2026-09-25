<script setup>
/** Recherche + onglets de catégories */
import { categories } from '@/donnees/fournisseurs.js'
defineProps({ recherche: { type: String, default: '' }, categorie: { type: String, default: '' } })
const emit = defineEmits(['update:recherche', 'update:categorie'])
const onglets = categories.map((c) => (c.id ? c : { ...c, libelle: 'Tous' }))
</script>

<template>
  <section class="filtres" aria-label="Recherche et filtres">
    <div class="filtres-recherche">
      <label for="recherche-fournisseur" class="visually-hidden">Rechercher un fournisseur</label>
      <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
      <input
        id="recherche-fournisseur" type="search" :value="recherche" placeholder="Rechercher : béton, Koungou…" autocomplete="off"
        @input="emit('update:recherche', $event.target.value)"
      />
      <button v-if="recherche" type="button" aria-label="Effacer la recherche" @click="emit('update:recherche', '')"><i class="fa-solid fa-xmark"></i></button>
    </div>

    <div class="filtres-onglets" role="group" aria-label="Catégories">
      <button
        v-for="c in onglets" :key="c.id" type="button" :aria-pressed="categorie === c.id"
        :class="{ actif: categorie === c.id }" @click="emit('update:categorie', c.id)"
      >{{ c.libelle }}</button>
    </div>
  </section>
</template>

<style scoped>
.filtres { display: flex; flex-direction: column; gap: 20px; margin-bottom: 8px; }

.filtres-recherche { position: relative; display: flex; align-items: center; }
.filtres-recherche > i { position: absolute; left: 16px; color: var(--gris-400); pointer-events: none; }
.filtres-recherche input {
  width: 100%; padding: 14px 44px; border: 1px solid var(--gris-200); border-radius: 14px; background: var(--gris-50);
  font: inherit; font-size: 1rem; color: var(--ardoise); transition: border-color var(--transition), background var(--transition), box-shadow var(--transition);
}
.filtres-recherche input::placeholder { color: var(--gris-400); }
.filtres-recherche input:focus { outline: none; background: #fff; border-color: var(--lagon-500); box-shadow: 0 0 0 4px rgba(6, 182, 212, .14); }
.filtres-recherche input::-webkit-search-cancel-button { display: none; }
.filtres-recherche button {
  position: absolute; right: 10px; width: 28px; height: 28px; display: grid; place-items: center;
  border: 0; border-radius: 50%; background: var(--gris-200); color: var(--gris-600); cursor: pointer;
}

.filtres-onglets { display: flex; gap: 24px; overflow-x: auto; border-bottom: 1px solid var(--gris-200); scrollbar-width: none; }
.filtres-onglets::-webkit-scrollbar { display: none; }
.filtres-onglets button {
  flex-shrink: 0; padding: 0 0 12px; margin-bottom: -1px; border: 0; border-bottom: 2px solid transparent; background: none;
  font: inherit; font-size: .92rem; font-weight: 500; color: var(--gris-500); cursor: pointer; white-space: nowrap;
  transition: color var(--transition), border-color var(--transition);
}
.filtres-onglets button:hover { color: var(--ardoise); }
.filtres-onglets button.actif { color: var(--ardoise); border-bottom-color: var(--ardoise); }
.filtres-onglets button:focus-visible { outline: 2px solid var(--lagon-600); outline-offset: 2px; border-radius: 4px; }
</style>

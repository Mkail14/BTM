<script setup>
/** Recherche + catégories (avec le nombre de fournisseurs de chacune) + filtre « livraison » */
defineProps({
  recherche: { type: String, default: '' },
  categorie: { type: String, default: '' },
  livraison: { type: Boolean, default: false },
  // [{ id, libelle, icone, nombre }] : catégories ayant au moins un fournisseur, « Tous » en tête
  onglets: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:recherche', 'update:categorie', 'update:livraison'])
</script>

<template>
  <section class="filtres" aria-label="Recherche et filtres">
    <div class="filtres-recherche">
      <label for="recherche-fournisseur" class="visually-hidden">Rechercher un fournisseur</label>
      <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
      <input
        id="recherche-fournisseur" type="search" :value="recherche" placeholder="Nom, commune, matériau…" autocomplete="off" enterkeyhint="search"
        @input="emit('update:recherche', $event.target.value)"
      />
      <button v-if="recherche" type="button" aria-label="Effacer la recherche" @click="emit('update:recherche', '')"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
    </div>

    <div class="filtres-ligne">
      <div class="filtres-puces" role="group" aria-label="Catégories">
        <button
          v-for="c in onglets" :key="c.id" type="button" :aria-pressed="categorie === c.id"
          :class="{ actif: categorie === c.id }" @click="emit('update:categorie', c.id)"
        >
          <i v-if="c.icone" :class="c.icone" aria-hidden="true"></i>{{ c.libelle }}<span class="filtres-nombre">{{ c.nombre }}</span>
        </button>
      </div>
      <label class="filtres-livraison" :class="{ actif: livraison }">
        <input type="checkbox" :checked="livraison" @change="emit('update:livraison', $event.target.checked)" />
        <i class="fa-solid fa-truck" aria-hidden="true"></i> Livre sur chantier
      </label>
    </div>
  </section>
</template>

<style scoped>
/* une seule barre blanche, comme sur « Mes projets » : recherche, catégories, livraison */
.filtres { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 10px; border: 1px solid var(--gris-200); border-radius: 20px; background: #fff; box-shadow: 0 6px 20px -14px rgba(11, 58, 77, .3); }

.filtres-recherche { position: relative; flex: 1 1 280px; display: flex; align-items: center; }
.filtres-recherche > i { position: absolute; left: 16px; color: var(--gris-400); pointer-events: none; }
.filtres-recherche input {
  width: 100%; min-height: 44px; padding: 0 48px 0 44px; border: 1px solid transparent; border-radius: 12px; background: var(--gris-50);
  font: inherit; font-size: .95rem; color: var(--ardoise); transition: border-color var(--transition), background var(--transition), box-shadow var(--transition);
}
.filtres-recherche input::placeholder { color: var(--gris-400); }
.filtres-recherche input:focus { outline: none; background: #fff; border-color: var(--lagon-500); box-shadow: 0 0 0 4px rgba(6, 182, 212, .14); }
.filtres-recherche input::-webkit-search-cancel-button { display: none; }
.filtres-recherche button {
  position: absolute; right: 8px; width: 36px; height: 36px; display: grid; place-items: center;
  border: 0; border-radius: 50%; background: transparent; color: var(--gris-500); cursor: pointer;
}
.filtres-recherche button:hover { background: var(--gris-200); }

.filtres-ligne { display: flex; flex: 2 1 420px; align-items: center; gap: 10px; min-width: 0; }
/* puces sur une ligne qui défile au doigt, fondu à droite pour signaler la suite */
.filtres-puces {
  display: flex; flex: 1; gap: 8px; min-width: 0; overflow-x: auto; padding: 2px; scrollbar-width: none;
  mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);
}
.filtres-puces::-webkit-scrollbar { display: none; }
.filtres-puces button, .filtres-livraison {
  flex-shrink: 0; display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 14px;
  border: 1px solid var(--gris-200); border-radius: 999px; background: #fff;
  font: inherit; font-size: .88rem; font-weight: 600; color: var(--gris-600); white-space: nowrap; cursor: pointer;
  transition: color var(--transition), background var(--transition), border-color var(--transition);
}
.filtres-puces button i { font-size: .8rem; color: var(--gris-400); }
.filtres-puces button:hover, .filtres-livraison:hover { border-color: var(--gris-300); color: var(--ardoise); }
.filtres-puces button.actif { border-color: var(--ardoise); background: var(--ardoise); color: #fff; }
.filtres-puces button.actif i { color: inherit; }
.filtres-nombre { min-width: 20px; padding: 0 6px; border-radius: 999px; background: var(--gris-100); color: var(--gris-500); font-size: .74rem; text-align: center; font-variant-numeric: tabular-nums; }
.filtres-puces button.actif .filtres-nombre { background: rgba(255,255,255,.2); color: #fff; }
.filtres-puces button:focus-visible { outline: 2px solid var(--lagon-600); outline-offset: 2px; }

.filtres-livraison input { position: absolute; opacity: 0; pointer-events: none; }
.filtres-livraison i { font-size: .8rem; color: var(--lagon-600); }
.filtres-livraison.actif { border-color: var(--lagon-600); background: var(--lagon-50); color: var(--lagon-800); }
.filtres-livraison:has(input:focus-visible) { outline: 2px solid var(--lagon-600); outline-offset: 2px; }

@media (max-width: 600px) {
  .filtres { flex-direction: column; align-items: stretch; }
  .filtres-recherche, .filtres-ligne { flex-basis: auto; width: 100%; min-width: 0; }
  .filtres-puces { width: 100%; }
  .filtres-ligne { flex-direction: column; align-items: stretch; gap: 10px; }
  .filtres-livraison { align-self: flex-start; }
  .filtres-puces { margin: 0; padding: 2px; }
}
</style>

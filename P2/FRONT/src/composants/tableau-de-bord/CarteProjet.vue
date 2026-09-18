<script setup>
import { computed } from 'vue'
import { formaterEuros, resumerDimensions } from '@/services/calculs/moteurCalculs.js'
import { trouverTypeProjet } from '@/donnees/typesProjets.js'

const props = defineProps({ projet: { type: Object, required: true } })
const emit = defineEmits(['voir', 'dupliquer', 'supprimer'])
const type = computed(() => trouverTypeProjet(props.projet.type))
const date = computed(() => new Date(props.projet.cree_le).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }))
const cout = computed(() => props.projet.cout_total ?? props.projet.resultat?.total ?? 0)
</script>

<template>
  <article class="carte carte-interactive cp" :style="{ '--couleur': type?.couleur || 'var(--lagon-600)' }">
    <header class="cp-entete">
      <span class="cp-icone"><i :class="type?.icone || 'fa-solid fa-cube'" aria-hidden="true"></i></span>
      <div class="cp-titre">
        <h3>{{ projet.nom }}</h3>
        <p class="cp-meta">
          <span class="badge">{{ type?.libelle || projet.type }}</span>
          <span v-if="projet.cloud" class="badge badge-vert" title="Synchronisé avec Supabase"><i class="fa-solid fa-cloud"></i> Cloud</span>
        </p>
      </div>
    </header>

    <dl class="cp-details">
      <div><dt>Dimensions</dt><dd class="mono">{{ resumerDimensions(projet.type, projet.dimensions) || '—' }}</dd></div>
      <div><dt>Créé le</dt><dd>{{ date }}</dd></div>
    </dl>

    <p class="cp-cout"><span>Coût total indicatif</span><strong class="prix">{{ formaterEuros(cout) }}</strong></p>

    <footer class="cp-actions">
      <button type="button" class="btn btn-primaire btn-sm" @click="emit('voir', projet)"><i class="fa-solid fa-eye"></i> Voir</button>
      <button type="button" class="btn btn-secondaire btn-sm" @click="emit('dupliquer', projet)"><i class="fa-regular fa-copy"></i> Dupliquer</button>
      <button type="button" class="btn btn-danger btn-sm" :aria-label="`Supprimer ${projet.nom}`" @click="emit('supprimer', projet)"><i class="fa-regular fa-trash-can"></i></button>
    </footer>
  </article>
</template>

<style scoped>
.cp { display: flex; flex-direction: column; gap: 16px; }
.cp-entete { display: flex; gap: 14px; align-items: flex-start; }
.cp-icone { width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; background: var(--ardoise); color: var(--lagon-300); font-size: 1.2rem; flex-shrink: 0; }
.cp-titre h3 { font-size: 1.4rem; color: var(--ardoise); line-height: 1.15; word-break: break-word; }
.cp-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.cp-details { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 0; }
.cp-details dt { font-size: .74rem; text-transform: uppercase; letter-spacing: .06em; color: var(--gris-500); font-weight: 600; }
.cp-details dd { margin: 2px 0 0; font-size: .92rem; font-weight: 500; color: var(--gris-700); }
.cp-cout { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-radius: var(--rayon-sm); background: var(--lagon-50); font-size: .88rem; color: var(--lagon-900); }
.cp-cout strong { font-size: 1.25rem; color: var(--lagon-700); }
.cp-actions { display: flex; gap: 8px; margin-top: auto; }
.cp-actions .btn-secondaire { flex: 1; }
</style>

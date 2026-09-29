<script setup>
/** Ligne de projet : nom, type, date et coût. Clic = voir ; actions secondaires au survol. */
import { computed } from 'vue'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'
import { infoType } from '@/services/calculs/fusion.js'

const props = defineProps({ projet: { type: Object, required: true } })
const emit = defineEmits(['voir', 'dupliquer', 'supprimer'])
// achat direct et devis pro (plusieurs ouvrages) n'ont pas de type du calculateur
const type = computed(() => {
  const t = infoType(props.projet.resultat || { type: props.projet.type })
  const n = props.projet.resultat?.ouvrages?.length
  return n ? { ...t, libelle: `${t.libelle} · ${n} ouvrages` } : t
})
const date = computed(() => new Date(props.projet.cree_le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }))
const cout = computed(() => props.projet.cout_total ?? props.projet.resultat?.total ?? 0)
// Code à présenter au fournisseur pour retirer et payer (projets enregistrés en ligne uniquement)
const reference = computed(() => (props.projet.code_retrait ? `code de retrait ${props.projet.code_retrait}` : ''))
</script>

<template>
  <li class="lp">
    <button type="button" class="lp-principal" @click="emit('voir', projet)">
      <span class="lp-icone"><i :class="type?.icone || 'fa-solid fa-cube'" aria-hidden="true"></i></span>
      <span class="lp-texte">
        <strong>{{ projet.nom }}</strong>
        <span>{{ type?.libelle || projet.type }} · {{ date }}<template v-if="reference"> · {{ reference }}</template></span>
      </span>
      <span class="lp-cout prix">{{ formaterEuros(cout) }}</span>
    </button>
    <div class="lp-actions">
      <button type="button" :aria-label="`Dupliquer ${projet.nom}`" title="Dupliquer" @click="emit('dupliquer', projet)"><i class="fa-regular fa-copy"></i></button>
      <button type="button" class="lp-suppr" :aria-label="`Supprimer ${projet.nom}`" title="Supprimer" @click="emit('supprimer', projet)"><i class="fa-regular fa-trash-can"></i></button>
    </div>
  </li>
</template>

<style scoped>
.lp { display: flex; align-items: center; gap: 8px; padding-right: 12px; border-radius: 14px; transition: background var(--transition); }
.lp:hover, .lp:focus-within { background: var(--gris-50); }

.lp-principal {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: 16px; padding: 16px 12px;
  background: none; border: 0; text-align: left; cursor: pointer; color: inherit; font: inherit; border-radius: 14px;
}
.lp-principal:focus-visible { outline: 2px solid var(--lagon-600); outline-offset: -2px; }

.lp-icone { width: 44px; height: 44px; flex-shrink: 0; display: grid; place-items: center; border-radius: 12px; background: var(--gris-100); color: var(--gris-600); }
.lp-texte { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.lp-texte strong { font-weight: 600; color: var(--ardoise); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lp-texte span { font-size: .85rem; color: var(--gris-500); }
.lp-cout { font-size: 1.05rem; color: var(--ardoise); white-space: nowrap; }

.lp-actions { display: flex; gap: 2px; opacity: 0; transition: opacity var(--transition); }
.lp:hover .lp-actions, .lp:focus-within .lp-actions { opacity: 1; }
.lp-actions button {
  width: 36px; height: 36px; display: grid; place-items: center; border: 0; border-radius: 10px;
  background: none; color: var(--gris-500); cursor: pointer; transition: background var(--transition), color var(--transition);
}
.lp-actions button:hover { background: #fff; color: var(--ardoise); }
.lp-actions .lp-suppr:hover { color: var(--erreur); }

@media (hover: none) { .lp-actions { opacity: 1; } }
@media (max-width: 520px) {
  .lp-principal { gap: 12px; }
  .lp-icone { display: none; }
}
</style>

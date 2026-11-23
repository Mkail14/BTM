<script setup>
/**
 * Admin — carreaux d'un fournisseur (migration 0029), affichés dans son panneau « Modifier le fournisseur ».
 * Le fournisseur les gère depuis son espace ; l'admin peut seulement masquer un modèle (il disparaît du
 * calculateur) ou le supprimer.
 */
import { useAdmin } from '@/composables/useAdmin.js'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'
import * as api from '@/services/supabase/serviceCarreaux.js'

defineProps({ carreaux: { type: Array, required: true } })
const emit = defineEmits(['maj'])
const { confirmer, notifier } = useAdmin()

async function basculer(c) {
  try {
    await api.enregistrerCarreau(c.fournisseur_id, { ...c, actif: !c.actif })
    notifier(c.actif ? `« ${c.nom} » est masqué du calculateur.` : `« ${c.nom} » est de nouveau proposé.`, 'info')
    emit('maj')
  } catch (e) { notifier(e?.message || 'Modification impossible.', 'erreur') }
}
async function supprimer(c) {
  if (!(await confirmer({ titre: 'Supprimer ce modèle ?', texte: `« ${c.nom} » ne sera plus proposé. Préférez « masquer » si le fournisseur doit pouvoir le corriger.`, libelle: 'Supprimer', danger: true }))) return
  try {
    await api.supprimerCarreau(c.id)
    notifier('Modèle supprimé.')
    emit('maj')
  } catch (e) { notifier(e?.message || 'Suppression impossible.', 'erreur') }
}
</script>

<template>
  <section class="acar" aria-labelledby="acar-titre">
    <h3 id="acar-titre"><i class="fa-solid fa-table-cells" aria-hidden="true"></i> Carreaux en ligne <small>{{ carreaux.length }}</small></h3>
    <p class="acar-aide">Le fournisseur les gère depuis son espace. Masquer un modèle le retire du calculateur.</p>
    <ul class="acar-liste">
      <li v-for="c in carreaux" :key="c.id" class="acar-ligne" :class="{ masque: !c.actif }">
        <span class="acar-visuel" :style="{ '--teinte': c.couleur }" aria-hidden="true"><img v-if="c.photo_url" :src="c.photo_url" alt="" loading="lazy" /></span>
        <span class="acar-infos">
          <strong>{{ c.nom }}</strong>
          <small>{{ [api.libelleFormat(c.format), c.finition].filter(Boolean).join(' · ') }} · {{ formaterEuros(c.prix_unitaire) }} {{ api.libelleVente(c) }}</small>
          <span v-if="c.rupture || !c.actif" class="acar-badges">
            <em v-if="c.rupture" class="adm-badge acar-rupture">Rupture</em>
            <em v-if="!c.actif" class="adm-badge">Masqué</em>
          </span>
        </span>
        <span class="acar-actions">
          <button type="button" role="switch" class="adm-interrupteur" :aria-checked="c.actif" :aria-label="`Proposer ${c.nom}`" :title="c.actif ? 'Masquer' : 'Proposer'" @click="basculer(c)"></button>
          <button type="button" class="adm-icone-btn danger" :aria-label="`Supprimer ${c.nom}`" title="Supprimer" @click="supprimer(c)"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
        </span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.acar { margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--adm-ligne-2); }
.acar h3 { display: flex; align-items: center; gap: 8px; margin: 0; font-family: var(--font-corps); font-size: 1rem; font-weight: 600; }
.acar h3 i { color: var(--adm-muet); }
.acar h3 small { color: var(--adm-muet); font-weight: 500; }
.acar-aide { margin: 4px 0 12px; color: var(--adm-encre-2); font-size: .84rem; }
.acar-liste { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.acar-ligne { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--adm-ligne-2); border-radius: 12px; }
.acar-ligne.masque { opacity: .62; }
.acar-visuel {
  position: relative; width: 44px; height: 44px; flex: none; overflow: hidden; border-radius: 10px;
  background-color: var(--teinte, #e9e5de);
  background-image: linear-gradient(rgba(255,255,255,.55) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,.55) 2px, transparent 2px);
  background-size: 15px 15px;
}
.acar-visuel img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.acar-infos { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.acar-infos small { color: var(--adm-encre-2); font-size: .8rem; }
.acar-badges { display: flex; gap: 6px; margin-top: 2px; }
.acar-rupture { background: #fee2e2; color: #991b1b; }
.acar-actions { display: flex; align-items: center; gap: 8px; }
</style>

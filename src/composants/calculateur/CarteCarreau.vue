<script setup>
/**
 * CarteCarreau — une carte de modèle de carreaux (aperçu, nom, fournisseur, prix au carreau ou au carton), cliquable.
 * Sans `carreau` : la carte « Modèle standard » (prix moyen du catalogue BTM).
 * Utilisée par le carrousel du calculateur et par la fenêtre « Tous les modèles » (SelecteurCarreau).
 * `nbCarreaux` : carreaux à commander pour la pièce, pour afficher le coût du modèle sur ce chantier.
 * `ligne` : sur téléphone, présentation en ligne compacte (aperçu à gauche, texte à droite).
 */
import { computed } from 'vue'
import { libelleFormat, libelleVente, prixAuM2, unitesPour, uniteVente } from '@/services/supabase/serviceCarreaux.js'
import { formaterEuros, formaterNombre } from '@/services/calculs/moteurCalculs.js'

const props = defineProps({
  carreau: { type: Object, default: null },
  actif: Boolean,
  nbCarreaux: { type: Number, default: 0 },
  ligne: Boolean
})
// stock suivi mais trop juste pour la pièce : le client est prévenu avant de choisir
const manque = computed(() => props.carreau && !props.carreau.rupture && props.carreau.stock != null && props.nbCarreaux > 0
  && unitesPour(props.carreau, props.nbCarreaux) > props.carreau.stock)
</script>

<template>
  <button
    v-if="!carreau" type="button" role="option" class="cc" :class="{ actif, ligne }" :aria-selected="actif"
  >
    <span class="cc-visuel cc-standard" aria-hidden="true"><i class="fa-solid fa-table-cells"></i></span>
    <span class="cc-texte">
      <strong>Modèle standard</strong>
      <small>Je choisirai en magasin</small>
      <span class="cc-prix"><b>Prix moyen</b><small>du catalogue BTM</small></span>
    </span>
    <i v-if="actif" class="fa-solid fa-circle-check cc-coche" aria-hidden="true"></i>
  </button>
  <button
    v-else type="button" role="option" class="cc" :class="{ actif, ligne, rupture: carreau.rupture }"
    :aria-selected="actif" :aria-disabled="carreau.rupture || undefined"
  >
    <span class="cc-visuel" :style="{ '--teinte': carreau.couleur }" aria-hidden="true">
      <img v-if="carreau.photo_url" :src="carreau.photo_url" alt="" loading="lazy" decoding="async" />
      <em v-if="carreau.rupture" class="cc-badge cc-badge-rupture">Rupture</em>
      <em v-else-if="carreau.devis" class="cc-badge"><i class="fa-solid fa-fire"></i> {{ carreau.devis }} choix</em>
    </span>
    <span class="cc-texte">
      <strong>{{ carreau.nom }}</strong>
      <small>{{ [carreau.finition, libelleFormat(carreau.format)].filter(Boolean).join(' · ') }}</small>
      <small class="cc-fournisseur"><i class="fa-solid fa-store" aria-hidden="true"></i> {{ carreau.fournisseur }}<template v-if="carreau.commune"> · {{ carreau.commune }}</template></small>
      <span class="cc-prix">
        <b>{{ formaterEuros(carreau.prix_unitaire) }}</b><small>{{ libelleVente(carreau) }}<span class="cc-m2"> · ≈ {{ formaterEuros(prixAuM2(carreau)) }} / m²</span></small>
        <small v-if="manque" class="cc-total cc-manque"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Plus que {{ formaterNombre(carreau.stock) }} {{ uniteVente(carreau) }}{{ carreau.stock > 1 ? 's' : '' }} en stock</small>
        <small v-if="nbCarreaux && !carreau.rupture" class="cc-total">≈ {{ formaterEuros(unitesPour(carreau, nbCarreaux) * carreau.prix_unitaire) }} au total pour la pièce</small>
        <small v-else-if="carreau.rupture" class="cc-total">Indisponible pour le moment</small>
      </span>
    </span>
    <i v-if="actif" class="fa-solid fa-circle-check cc-coche" aria-hidden="true"></i>
  </button>
</template>

<style scoped>
.cc {
  position: relative; display: flex; flex-direction: column; width: 100%; height: 100%; padding: 0; overflow: hidden;
  border: 1.5px solid var(--gris-200); border-radius: var(--rayon); background: var(--carte);
  font: inherit; color: inherit; text-align: left; cursor: pointer; transition: border-color var(--transition), box-shadow var(--transition);
}
.cc:hover { border-color: var(--lagon-500); }
.cc:focus-visible { outline: 3px solid var(--lagon-500); outline-offset: 2px; }
.cc.actif { border-color: var(--lagon-600); box-shadow: 0 0 0 3px rgba(6, 182, 212, .18); }
.cc.rupture { cursor: not-allowed; opacity: .55; }
.cc-coche { position: absolute; top: 8px; right: 8px; display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--carte); color: var(--lagon-600); font-size: 1.5rem; }
/* aperçu : la teinte du modèle, quadrillée comme un sol carrelé (ou sa photo) */
.cc-visuel {
  position: relative; display: grid; place-items: center; flex: none; height: 110px;
  background-color: var(--teinte, #e9e5de);
  background-image: linear-gradient(rgba(255,255,255,.55) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,.55) 2px, transparent 2px);
  background-size: 36px 36px;
}
.cc-visuel img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.cc-standard { background-color: var(--gris-100); color: var(--gris-500); font-size: 2rem; }
.cc-badge { position: absolute; top: 8px; left: 8px; padding: 2px 8px; border-radius: 999px; background: var(--alerte-pastille); color: var(--alerte-texte); font-style: normal; font-size: .7rem; font-weight: 800; }
.cc-badge i { margin-right: 2px; }
.cc-badge-rupture { background: var(--erreur-pastille); color: var(--erreur-texte); text-transform: uppercase; }
.cc-texte { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding: 12px 14px 14px; flex: 1; }
.cc-texte strong { color: var(--ardoise); line-height: 1.25; }
.cc-texte small { color: var(--texte-secondaire); font-size: .8rem; }
.cc-fournisseur i { color: var(--lagon-600); margin-right: 2px; }
.cc-prix { display: flex; flex-direction: column; margin-top: auto; padding-top: 8px; }
.cc-prix b { color: var(--lagon-700); font-size: 1.15rem; font-variant-numeric: tabular-nums; }
.cc-prix .cc-total { margin-top: 2px; color: var(--ardoise); font-weight: 700; }
.cc-prix .cc-manque { color: #9a3412; }

/* Téléphone : ligne compacte, aperçu carré à gauche, une information par ligne */
@media (max-width: 599px) {
  .cc.ligne { flex-direction: row; align-items: stretch; min-height: 88px; }
  .cc.ligne .cc-visuel { width: 84px; height: auto; background-size: 28px 28px; }
  .cc.ligne .cc-standard { font-size: 1.5rem; }
  .cc.ligne .cc-badge { top: 6px; left: 6px; padding: 1px 6px; font-size: .62rem; }
  .cc.ligne .cc-texte { gap: 1px; padding: 10px 40px 10px 12px; }
  .cc.ligne .cc-texte strong { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  .cc.ligne .cc-fournisseur { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cc.ligne .cc-m2 { display: none; }
  .cc.ligne .cc-prix { flex-direction: row; flex-wrap: wrap; align-items: baseline; gap: 0 8px; padding-top: 4px; }
  .cc.ligne .cc-prix b { font-size: 1.05rem; }
  .cc.ligne .cc-prix .cc-total { flex-basis: 100%; margin: 0; }
  .cc.ligne .cc-coche { top: 50%; right: 10px; transform: translateY(-50%); }
}
</style>

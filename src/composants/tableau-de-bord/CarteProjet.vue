<script setup>
/**
 * Carte d'un projet, façon carte haute : fond en dégradé doux à la couleur de l'ouvrage, icône centrée,
 * nom, détail, prix, puis un bouton blanc « Voir le devis ». Dupliquer et supprimer en haut de la carte.
 */
import { computed, ref } from 'vue'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'
import { infoType, libelleOuvrage } from '@/services/calculs/fusion.js'
import { trouverTypeProjet } from '@/donnees/typesProjets.js'

const props = defineProps({
  projet: { type: Object, required: true },
  fournisseur: { type: String, default: '' }, // nom du fournisseur choisi dans le devis
  numero: { type: Number, default: 0 }
})
const emit = defineEmits(['voir', 'dupliquer', 'supprimer'])

// achat direct et devis pro (plusieurs ouvrages) n'ont pas de type du calculateur
const type = computed(() => {
  const t = infoType(props.projet.resultat || { type: props.projet.type })
  const n = props.projet.resultat?.ouvrages?.length
  return n ? { ...t, libelle: `${t.libelle} · ${n} ouvrages` } : t
})
const couleur = computed(() => trouverTypeProjet(props.projet.type)?.couleur || '#334155')
// « Dalle 8 × 6 m » : ce que mesure le devis, s'il le précise
const detail = computed(() => {
  try {
    const l = props.projet.resultat ? libelleOuvrage(props.projet.resultat) : ''
    return l && l !== type.value?.libelle ? l : ''
  } catch { return '' }
})
const date = computed(() => new Date(props.projet.cree_le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }))
const cout = computed(() => props.projet.cout_total ?? props.projet.resultat?.total ?? 0)

// Code à présenter au fournisseur pour retirer et payer (projets enregistrés en ligne uniquement)
const copie = ref(false)
async function copierCode() {
  try {
    await navigator.clipboard.writeText(props.projet.code_retrait)
    copie.value = true
    setTimeout(() => { copie.value = false }, 1800)
  } catch { /* presse-papiers refusé : le code reste lisible */ }
}
</script>

<template>
  <li class="cp" :style="{ '--teinte': couleur }">
    <span class="cp-actions">
      <button type="button" :aria-label="`Dupliquer ${projet.nom}`" title="Dupliquer" @click="emit('dupliquer', projet)"><i class="fa-regular fa-copy"></i></button>
      <button type="button" class="cp-suppr" :aria-label="`Supprimer ${projet.nom}`" title="Supprimer" @click="emit('supprimer', projet)"><i class="fa-regular fa-trash-can"></i></button>
    </span>
    <span v-if="numero" class="cp-numero">{{ String(numero).padStart(2, '0') }}</span>

    <span class="cp-icone" aria-hidden="true"><i :class="type?.icone || 'fa-solid fa-cube'"></i></span>
    <h3 class="cp-nom">{{ projet.nom }}</h3>
    <p class="cp-texte">
      {{ type?.libelle || projet.type }}<template v-if="detail"> · {{ detail }}</template><br />
      <span>{{ fournisseur ? `Matériaux chez ${fournisseur}` : 'Fournisseur au choix' }} · {{ date }}</span>
    </p>
    <strong class="cp-prix prix">{{ formaterEuros(cout) }}</strong>

    <button v-if="projet.code_retrait" type="button" class="cp-code" :title="copie ? 'Copié' : 'Copier le code de retrait'" @click="copierCode">
      <i :class="copie ? 'fa-solid fa-check' : 'fa-solid fa-ticket'" aria-hidden="true"></i>
      {{ copie ? 'Code copié' : projet.code_retrait }}
    </button>
    <span v-else class="cp-code cp-code-local"><i class="fa-solid fa-mobile-screen" aria-hidden="true"></i> Sur cet appareil</span>

    <button type="button" class="cp-voir" @click="emit('voir', projet)">Voir le devis</button>
  </li>
</template>

<style scoped>
/* carte haute, fond dégradé doux à la couleur de l'ouvrage (comme une carte de collection) */
.cp {
  position: relative; display: flex; flex-direction: column; align-items: center; min-height: 400px; padding: 34px 24px 22px;
  border-radius: 26px; text-align: center; color: var(--ardoise); isolation: isolate; overflow: hidden;
  background:
    radial-gradient(120% 70% at 50% 0%, rgba(255, 255, 255, .85), transparent 60%),
    linear-gradient(170deg, color-mix(in srgb, var(--teinte) 10%, #fff) 0%, color-mix(in srgb, var(--teinte) 30%, #f4efe6) 55%, color-mix(in srgb, var(--teinte) 62%, #0b3a4d) 100%);
  box-shadow: 0 18px 40px -18px color-mix(in srgb, var(--teinte) 55%, #0b3a4d);
  transition: transform .35s cubic-bezier(.2, .7, .2, 1), box-shadow .35s ease;
}
.cp:hover { transform: translateY(-6px); box-shadow: 0 28px 50px -20px color-mix(in srgb, var(--teinte) 65%, #0b3a4d); }

.cp-numero { position: absolute; top: 18px; left: 22px; font-family: var(--font-mono); font-size: .74rem; letter-spacing: .1em; color: color-mix(in srgb, var(--teinte) 50%, #0b3a4d); }
.cp-actions { position: absolute; top: 12px; right: 12px; display: flex; gap: 2px; opacity: .55; transition: opacity var(--transition); }
.cp:hover .cp-actions, .cp:focus-within .cp-actions { opacity: 1; }
.cp-actions button {
  width: 34px; height: 34px; display: grid; place-items: center; border: 0; border-radius: 50%;
  background: rgba(255, 255, 255, .55); color: var(--ardoise); cursor: pointer; transition: background var(--transition), color var(--transition);
}
.cp-actions button:hover { background: #fff; }
.cp-actions .cp-suppr:hover { color: var(--erreur); }

.cp-icone { width: 58px; height: 58px; display: grid; place-items: center; margin-bottom: 18px; border-radius: 18px; background: rgba(255, 255, 255, .7); color: var(--teinte); font-size: 1.45rem; box-shadow: 0 6px 18px -8px rgba(11, 58, 77, .35); }
.cp-nom { margin: 0; font-size: 1.75rem; font-weight: 700; line-height: 1.1; overflow-wrap: anywhere; }
.cp-texte { margin: 12px 0 0; max-width: 260px; font-size: .9rem; line-height: 1.5; color: color-mix(in srgb, var(--ardoise) 85%, var(--teinte)); }
.cp-texte span { font-size: .82rem; opacity: .8; }
.cp-prix { margin-top: auto; padding-top: 20px; font-size: 1.5rem; color: #fff; text-shadow: 0 1px 10px rgba(11, 58, 77, .35); }

.cp-code {
  display: inline-flex; align-items: center; gap: 8px; margin-top: 8px; padding: 4px 12px; border: 1px dashed rgba(255, 255, 255, .7); border-radius: 999px;
  background: rgba(255, 255, 255, .14); color: #fff; font-family: var(--font-mono); font-size: .8rem; letter-spacing: .06em; cursor: pointer;
}
.cp-code:hover { background: rgba(255, 255, 255, .25); }
.cp-code-local { border-style: solid; border-color: transparent; font-family: var(--font-corps); letter-spacing: 0; cursor: default; }
.cp-code-local:hover { background: rgba(255, 255, 255, .14); }

/* le bouton blanc du modèle */
.cp-voir {
  width: 100%; min-height: 48px; margin-top: 18px; border: 0; border-radius: 14px; background: #fff; color: var(--ardoise);
  font-family: var(--font-mono); font-size: .86rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; cursor: pointer;
  box-shadow: 0 8px 20px -10px rgba(11, 58, 77, .45); transition: transform var(--transition), box-shadow var(--transition);
}
.cp-voir:hover { transform: translateY(-1px); box-shadow: 0 12px 24px -10px rgba(11, 58, 77, .55); }
.cp-voir:focus-visible { outline: 3px solid var(--lagon-400); outline-offset: 2px; }
@media (hover: none) { .cp-actions { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .cp, .cp:hover { transform: none; } }
</style>

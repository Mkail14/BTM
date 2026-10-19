<script setup>
/**
 * Page d'attente de btm.yt : le site est en création et n'ouvre qu'avec au moins SEUIL_FOURNISSEURS
 * fournisseurs partenaires. Affichée à la place du site public (voir useOuverture et App.vue).
 */
import { computed } from 'vue'
import LogoBtm from '@/composants/commun/LogoBtm.vue'
import { useFenetreAuth } from '@/composables/useFenetreAuth.js'
import { SEUIL_FOURNISSEURS } from '@/composables/useOuverture.js'

const props = defineProps({ partenaires: { type: Number, default: 0 } })
const { ouvrirAuth } = useFenetreAuth()

const prets = computed(() => Math.min(props.partenaires, SEUIL_FOURNISSEURS))
const reste = computed(() => SEUIL_FOURNISSEURS - prets.value)
const annee = new Date().getFullYear()

const ETAPES = [
  { icone: 'fa-solid fa-ruler-combined', titre: 'Chiffrez', texte: 'Mur, dalle, fondation, terrasse ou carrelage : vos quantités et votre budget en quelques questions.' },
  { icone: 'fa-solid fa-scale-balanced', titre: 'Comparez', texte: 'Le prix exact de votre devis chez chaque fournisseur de l’île, et ce qu’il a en stock.' },
  { icone: 'fa-solid fa-ticket', titre: 'Retirez', texte: 'Un code de retrait à présenter au comptoir, pour payer le prix BTM.' }
]
const sujet = encodeURIComponent('Devenir fournisseur partenaire BTM')
</script>

<template>
  <div class="bientot">
    <div class="bientot-fond" aria-hidden="true"></div>

    <header class="bientot-entete">
      <span class="bientot-logo"><LogoBtm :taille="44" /><span><strong>BTM</strong><small>Bâtiment &amp; Travaux Mayotte</small></span></span>
      <button type="button" class="bientot-partenaires" @click="ouvrirAuth('connexion')"><i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i> Espace partenaires</button>
    </header>

    <main class="bientot-corps">
      <p class="bientot-surtitre"><span class="bientot-point" aria-hidden="true"></span> Site en cours de création</p>
      <h1>Le devis de vos travaux arrive bientôt à Mayotte.</h1>
      <p class="bientot-intro">
        BTM ouvrira dès que <strong>{{ SEUIL_FOURNISSEURS }} fournisseurs partenaires</strong> seront prêts à servir vos devis,
        pour que vous puissiez toujours comparer leurs prix.
      </p>

      <section class="bientot-jauge" aria-label="Fournisseurs partenaires">
        <div class="bientot-jauge-tete">
          <span>Fournisseurs partenaires</span>
          <strong>{{ prets }} / {{ SEUIL_FOURNISSEURS }}</strong>
        </div>
        <div class="bientot-barre" role="progressbar" :aria-valuenow="prets" aria-valuemin="0" :aria-valuemax="SEUIL_FOURNISSEURS">
          <span :style="{ width: `${(prets / SEUIL_FOURNISSEURS) * 100}%` }"></span>
        </div>
        <p>{{ reste > 0 ? `Encore ${reste} partenaire${reste > 1 ? 's' : ''} avant l’ouverture.` : 'Tout est prêt : ouverture imminente.' }}</p>
      </section>

      <ul class="bientot-etapes">
        <li v-for="(e, i) in ETAPES" :key="e.titre">
          <span class="bientot-etape-icone"><i :class="e.icone" aria-hidden="true"></i></span>
          <span><small>0{{ i + 1 }}</small><strong>{{ e.titre }}</strong><span>{{ e.texte }}</span></span>
        </li>
      </ul>

      <section class="bientot-fournisseur">
        <div>
          <h2>Vous vendez des matériaux à Mayotte ?</h2>
          <p>Mettez vos prix et vos produits en ligne, recevez des clients avec leur commande déjà chiffrée. Sans abonnement.</p>
        </div>
        <a class="bientot-bouton" :href="`mailto:contact@btm.yt?subject=${sujet}`"><i class="fa-solid fa-handshake" aria-hidden="true"></i> Devenir partenaire</a>
      </section>
    </main>

    <footer class="bientot-pied">
      <span><a href="mailto:contact@btm.yt">contact@btm.yt</a> · <a href="tel:+262639941101">0639 94 11 01</a> · Mamoudzou, Mayotte (976)</span>
      <span>© {{ annee }} BTM · <router-link to="/conditions">Conditions</router-link> · <router-link to="/confidentialite">Confidentialité</router-link></span>
    </footer>
  </div>
</template>

<style scoped>
.bientot {
  position: relative; min-height: 100dvh; display: flex; flex-direction: column; overflow: hidden;
  background: var(--ardoise); color: #e2e8f0; font-family: var(--font-corps);
}
/* lagon et sable en halos, quadrillage de chantier très léger */
.bientot-fond {
  position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(60rem 40rem at 85% -10%, rgba(8, 145, 178, .35), transparent 60%),
    radial-gradient(40rem 30rem at -10% 110%, rgba(245, 158, 11, .14), transparent 60%),
    linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px) 0 0 / 48px 48px,
    linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px) 0 0 / 48px 48px;
}
.bientot > *:not(.bientot-fond) { position: relative; }

.bientot-entete { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 22px clamp(16px, 5vw, 56px); }
.bientot-logo { display: flex; align-items: center; gap: 12px; }
.bientot-logo strong { display: block; font-family: var(--font-display); font-size: 1.6rem; letter-spacing: .04em; color: #fff; line-height: 1; }
.bientot-logo small { color: #94a3b8; font-size: .72rem; letter-spacing: .08em; text-transform: uppercase; }
.bientot-partenaires {
  display: inline-flex; align-items: center; gap: 8px; padding: 9px 16px; border: 1px solid rgba(255,255,255,.18); border-radius: 999px;
  background: rgba(255,255,255,.04); color: #e2e8f0; font: inherit; font-size: .88rem; font-weight: 600; cursor: pointer;
}
.bientot-partenaires:hover { border-color: var(--lagon-400); color: #fff; }

.bientot-corps { flex: 1; width: min(100%, 980px); margin: 0 auto; padding: clamp(24px, 6vh, 72px) clamp(16px, 5vw, 56px) 48px; }
.bientot-surtitre {
  display: inline-flex; align-items: center; gap: 10px; margin: 0 0 18px; padding: 6px 14px; border-radius: 999px;
  background: rgba(8, 145, 178, .16); color: var(--lagon-200); font-size: .8rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
}
.bientot-point { width: 8px; height: 8px; border-radius: 50%; background: var(--sable-fonce); box-shadow: 0 0 0 0 rgba(245, 158, 11, .6); animation: bientot-pouls 2s infinite; }
@keyframes bientot-pouls { 70% { box-shadow: 0 0 0 10px rgba(245, 158, 11, 0); } 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); } }
@media (prefers-reduced-motion: reduce) { .bientot-point { animation: none; } }
.bientot h1 { margin: 0; max-width: 18ch; font-family: var(--font-display); font-size: clamp(2.5rem, 7vw, 4.6rem); font-weight: 700; line-height: 1; color: #fff; }
.bientot-intro { max-width: 56ch; margin: 20px 0 0; color: #cbd5e1; font-size: clamp(1rem, 2.2vw, 1.15rem); line-height: 1.6; }
.bientot-intro strong { color: var(--sable); }

.bientot-jauge { max-width: 460px; margin-top: 32px; padding: 18px 20px; border: 1px solid rgba(255,255,255,.1); border-radius: 16px; background: rgba(15, 23, 42, .6); backdrop-filter: blur(6px); }
.bientot-jauge-tete { display: flex; align-items: baseline; justify-content: space-between; color: #94a3b8; font-size: .88rem; }
.bientot-jauge-tete strong { color: #fff; font-family: var(--font-display); font-size: 1.6rem; }
.bientot-barre { height: 10px; margin: 10px 0; border-radius: 999px; background: rgba(255,255,255,.08); overflow: hidden; }
.bientot-barre span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--lagon-500), var(--lagon-300)); transition: width .6s ease; }
.bientot-jauge p { margin: 0; color: #94a3b8; font-size: .84rem; }

.bientot-etapes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin: 40px 0 0; padding: 0; list-style: none; }
.bientot-etapes li { display: flex; gap: 14px; padding: 18px; border: 1px solid rgba(255,255,255,.08); border-radius: 16px; background: rgba(255,255,255,.03); }
.bientot-etape-icone { width: 42px; height: 42px; flex: none; display: grid; place-items: center; border-radius: 12px; background: rgba(8, 145, 178, .18); color: var(--lagon-300); }
.bientot-etapes li > span:last-child { display: flex; flex-direction: column; gap: 3px; }
.bientot-etapes small { color: #64748b; font-size: .72rem; font-weight: 700; letter-spacing: .08em; }
.bientot-etapes strong { color: #fff; font-size: 1.02rem; }
.bientot-etapes li > span:last-child > span { color: #94a3b8; font-size: .86rem; line-height: 1.5; }

.bientot-fournisseur {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 18px; margin-top: 28px; padding: 22px 24px;
  border-radius: 18px; background: linear-gradient(120deg, rgba(8, 145, 178, .28), rgba(14, 116, 144, .12)); border: 1px solid rgba(103, 232, 249, .2);
}
.bientot-fournisseur h2 { margin: 0; color: #fff; font-family: var(--font-corps); font-size: 1.15rem; }
.bientot-fournisseur p { margin: 6px 0 0; max-width: 52ch; color: #cbd5e1; font-size: .92rem; line-height: 1.5; }
.bientot-bouton {
  display: inline-flex; align-items: center; gap: 10px; padding: 12px 20px; border-radius: 12px;
  background: var(--sable-fonce); color: var(--ardoise); font-weight: 700; text-decoration: none; white-space: nowrap;
}
.bientot-bouton:hover { background: var(--sable); }

.bientot-pied { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 20px; padding: 18px clamp(16px, 5vw, 56px) 24px; border-top: 1px solid rgba(255,255,255,.08); color: #64748b; font-size: .82rem; }
.bientot-pied a { color: #94a3b8; text-decoration: none; }
.bientot-pied a:hover { color: #fff; }

@media (max-width: 760px) {
  .bientot-etapes { grid-template-columns: 1fr; }
  .bientot-partenaires span, .bientot-logo small { display: none; }
}
</style>

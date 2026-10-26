<script setup>
/**
 * « Fidélité BTM » : ouverte d'un clic sur le crédit de l'entête, par-dessus la page (voile flouté, comme la connexion).
 * La carte du compte (solde, jauge vers 5 €), ce qu'un achat rapporte, puis les trois façons d'utiliser ses crédits :
 * sur la plateforme (déduits d'un achat), retrait en argent ou livraison offerte par BTM, ces deux-là dès 5 €.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth.js'
import { useContenuSite } from '@/composables/useContenuSite.js'
import { useCreditFidelite } from '@/composables/useCreditFidelite.js'
import { fermerFidelite } from '@/composables/useFenetreFidelite.js'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'

const SEUIL = 5 // retrait en argent et livraison offerte : à partir de 5 € de crédits

const { utilisateur } = useAuth()
const contenu = useContenuSite()
const { credit, charger } = useCreditFidelite()
const route = useRoute()
watch(() => route.path, fermerFidelite)

const pseudo = computed(() => utilisateur.value?.user_metadata?.pseudo || utilisateur.value?.email?.split('@')[0] || '')
// Gain pour 100 € d'achat : la part de la commission BTM (réglée dans l'admin) rendue au client
const creditPour100 = computed(() => (100 * contenu.frais.taux / 100) * (contenu.frais.fidelite / 100))
const solde = computed(() => credit.value.solde)
const debloque = computed(() => solde.value >= SEUIL)
const progression = computed(() => Math.min(100, (solde.value / SEUIL) * 100))

const FACONS = computed(() => [
  { cle: 'plateforme', icone: 'fa-solid fa-store', titre: 'Sur la plateforme', texte: 'Déduits de votre prochain achat chez un partenaire.', ouvert: solde.value > 0, condition: 'Dès votre 1er achat' },
  { cle: 'retrait', icone: 'fa-solid fa-money-bill-transfer', titre: 'En argent', texte: 'Retirez vos crédits sur votre compte bancaire.', ouvert: debloque.value, condition: `Dès ${SEUIL} €` },
  { cle: 'livraison', icone: 'fa-solid fa-truck-fast', titre: 'Livraison offerte', texte: 'Une livraison sur chantier offerte par BTM.', ouvert: debloque.value, condition: `Dès ${SEUIL} €` }
])

const date = (t) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

// le solde défile de 0 à sa valeur à l'ouverture (sauf mouvement réduit demandé)
const affiche = ref(0)
let animation = 0
function compter(cible) {
  cancelAnimationFrame(animation)
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { affiche.value = cible; return }
  const depart = performance.now(), de = affiche.value
  const pas = (t) => {
    const k = Math.min(1, (t - depart) / 900)
    affiche.value = de + (cible - de) * (1 - (1 - k) ** 3)
    if (k < 1) animation = requestAnimationFrame(pas)
  }
  animation = requestAnimationFrame(pas)
}
watch(solde, compter)

const fenetre = ref(null)
onMounted(() => { fenetre.value?.focus(); compter(solde.value); charger() })
onBeforeUnmount(() => cancelAnimationFrame(animation))
</script>

<template>
  <div class="fid-voile" @click.self="fermerFidelite" @keydown.esc="fermerFidelite">
    <section ref="fenetre" class="fid" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="fid-titre">
      <button type="button" class="fid-fermer" aria-label="Fermer" @click="fermerFidelite"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>

      <!-- la carte de fidélité du compte -->
      <div class="fid-carte">
        <i class="fa-solid fa-coins fid-filigrane" aria-hidden="true"></i>
        <div class="fid-carte-haut">
          <h2 id="fid-titre" class="fid-marque"><i class="fa-solid fa-coins" aria-hidden="true"></i> Fidélité BTM</h2>
          <span v-if="pseudo" class="fid-titulaire">{{ pseudo }}</span>
        </div>
        <p class="fid-solde"><span>Vos crédits</span><strong>{{ formaterEuros(affiche) }}</strong></p>
        <div class="fid-jauge" role="progressbar" :aria-valuenow="Math.round(progression)" aria-valuemin="0" aria-valuemax="100" :aria-label="`Crédits accumulés vers ${SEUIL} €`">
          <span :style="{ width: `${progression}%` }"></span>
        </div>
        <p class="fid-jauge-texte">
          <template v-if="debloque"><i class="fa-solid fa-unlock" aria-hidden="true"></i> Retrait et livraison offerte débloqués</template>
          <template v-else>Encore <strong>{{ formaterEuros(SEUIL - solde) }}</strong> pour débloquer le retrait et la livraison offerte</template>
        </p>
      </div>

      <p class="fid-gain">
        <i class="fa-solid fa-arrow-trend-up" aria-hidden="true"></i>
        <span>Chaque achat payé avec un code de retrait vous rapporte environ <strong>{{ formaterEuros(creditPour100) }} pour 100 €</strong>.
          <router-link to="/calculateur" class="fid-lien">Faire une estimation <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></router-link></span>
      </p>

      <h3 class="fid-sous-titre">3 façons d’utiliser vos crédits</h3>
      <ul class="fid-facons">
        <li v-for="f in FACONS" :key="f.cle" class="fid-facon" :class="{ ouvert: f.ouvert }">
          <span class="fid-facon-icone" aria-hidden="true"><i :class="f.icone"></i></span>
          <strong>{{ f.titre }}</strong>
          <p>{{ f.texte }}</p>
          <span class="fid-etat"><i :class="f.ouvert ? 'fa-solid fa-check' : 'fa-solid fa-lock'" aria-hidden="true"></i> {{ f.ouvert ? 'Disponible' : f.condition }}</span>
        </li>
      </ul>

      <h3 class="fid-sous-titre">Derniers mouvements</h3>
      <ul v-if="credit.mouvements.length" class="fid-mouvements">
        <li v-for="(m, i) in credit.mouvements.slice(0, 3)" :key="i">
          <span>{{ m.libelle }}<small v-if="m.cree_le">{{ date(m.cree_le) }}</small></span>
          <strong :class="{ plus: m.montant > 0 }">{{ m.montant > 0 ? '+' : '' }}{{ formaterEuros(m.montant) }}</strong>
        </li>
      </ul>
      <p v-else class="fid-vide">Aucun mouvement pour l’instant : votre premier achat avec un code de retrait lancera votre cagnotte.</p>
    </section>
  </div>
</template>

<style scoped>
.fid-voile {
  position: fixed; inset: 0; z-index: 260; display: grid; place-items: center; padding: 24px;
  background: rgba(17, 17, 17, .58); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); animation: fid-fondu .2s ease;
}
@keyframes fid-fondu { from { opacity: 0; } }
.fid {
  position: relative; display: flex; flex-direction: column; width: min(100%, 600px); max-height: calc(100dvh - 48px); overflow: hidden auto; overscroll-behavior: contain;
  padding: 24px 28px 26px; border-radius: 28px; background: var(--gris-50); color: var(--ardoise);
  box-shadow: 0 30px 80px rgba(17, 17, 17, .45); animation: fid-monter .34s cubic-bezier(.22, .61, .36, 1);
}
@keyframes fid-monter { from { transform: translateY(18px); opacity: 0; } }
.fid:focus { outline: none; }
.fid > * { flex-shrink: 0; } /* la fenêtre défile plutôt que d'écraser la carte */
.fid-fermer {
  position: absolute; top: 34px; right: 38px; z-index: 3; display: grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: 50%;
  background: rgba(255, 255, 255, .12); color: #fff; font-size: .95rem; cursor: pointer; transition: background .15s;
}
.fid-fermer:hover { background: rgba(255, 255, 255, .22); }

/* ---------- La carte : nuit du lagon, reflets dorés ---------- */
.fid-carte {
  position: relative; overflow: hidden; padding: 20px 24px 18px; border-radius: 22px; color: #fff; isolation: isolate;
  background:
    radial-gradient(110% 130% at 100% 0%, rgba(251, 191, 36, .34), transparent 55%),
    radial-gradient(90% 120% at 0% 110%, rgba(17, 17, 17, .4), transparent 60%),
    linear-gradient(135deg, #0b2f3f, #111111 55%, #03141c);
  box-shadow: inset 0 0 0 1px rgba(253, 230, 138, .22), 0 18px 40px rgba(17, 17, 17, .3);
}
/* reflet qui traverse la carte à l'ouverture */
.fid-carte::after {
  content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none;
  background: linear-gradient(105deg, transparent 35%, rgba(255, 255, 255, .14) 48%, transparent 60%);
  transform: translateX(-100%); animation: fid-reflet 1.4s .25s ease-out forwards;
}
@keyframes fid-reflet { to { transform: translateX(100%); } }
.fid-filigrane { position: absolute; right: -18px; bottom: -34px; z-index: -1; font-size: 9.5rem; color: #fde68a; opacity: .07; transform: rotate(-14deg); }
.fid-carte-haut { display: flex; align-items: center; gap: 12px; margin-right: 44px; }
.fid-marque { margin: 0; color: #fde68a; font-size: .78rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
.fid-marque i { margin-right: 4px; }
.fid-titulaire { overflow: hidden; color: rgba(255, 255, 255, .6); font-size: .8rem; text-overflow: ellipsis; white-space: nowrap; }
.fid-titulaire::before { content: '·'; margin-right: 12px; }
.fid-solde { display: flex; flex-direction: column; margin: 14px 0 0; }
.fid-solde span { color: rgba(255, 255, 255, .7); font-size: .85rem; }
.fid-solde strong {
  font-family: var(--font-display); font-size: 3.6rem; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; letter-spacing: -.01em;
  background: linear-gradient(180deg, #fff8dc 10%, #fbbf24 95%); -webkit-background-clip: text; background-clip: text; color: transparent;
}
.fid-jauge { height: 8px; margin-top: 16px; border-radius: 999px; background: rgba(255, 255, 255, .12); overflow: hidden; }
.fid-jauge span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #f59e0b, #fde68a); box-shadow: 0 0 12px rgba(251, 191, 36, .6); transition: width .9s cubic-bezier(.22, .61, .36, 1); }
.fid-jauge-texte { margin: 8px 0 0; color: rgba(255, 255, 255, .75); font-size: .82rem; }
.fid-jauge-texte strong { color: #fde68a; }
.fid-jauge-texte i { margin-right: 4px; color: #fde68a; }

/* ---------- Gagner ---------- */
.fid-gain { display: flex; gap: 12px; margin: 16px 0 0; color: var(--texte-secondaire); font-size: .88rem; line-height: 1.5; }
.fid-gain > i { display: grid; place-items: center; flex: none; width: 32px; height: 32px; border-radius: 10px; background: rgba(16, 185, 129, .12); color: #059669; font-size: .85rem; }
.fid-gain strong { color: var(--ardoise); }
.fid-lien { display: inline-flex; align-items: center; gap: 5px; margin-left: 4px; color: var(--lagon-700); font-weight: 700; white-space: nowrap; }
.fid-lien:hover { text-decoration: underline; text-underline-offset: 3px; }

/* ---------- Utiliser ---------- */
.fid-sous-titre { margin: 18px 0 10px; color: var(--texte-secondaire); font-size: .74rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.fid-facons { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 0; padding: 0; list-style: none; }
.fid-facon {
  display: flex; flex-direction: column; gap: 4px; min-width: 0; padding: 14px; border: 1.5px solid var(--gris-200); border-radius: 18px; background: var(--carte);
  transition: border-color var(--transition), transform var(--transition);
}
.fid-facon:hover { transform: translateY(-2px); border-color: rgba(245, 158, 11, .45); }
.fid-facon-icone { display: grid; place-items: center; width: 38px; height: 38px; margin-bottom: 6px; border-radius: 12px; background: rgba(245, 158, 11, .14); color: #d97706; font-size: .95rem; }
.fid-facon strong { color: var(--ardoise); font-size: .95rem; }
.fid-facon p { flex: 1; margin: 0; color: var(--texte-secondaire); font-size: .8rem; line-height: 1.45; }
.fid-etat {
  display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; margin-top: 8px; padding: 4px 10px; border-radius: 999px;
  background: var(--gris-100); color: var(--texte-secondaire); font-size: .74rem; font-weight: 700; white-space: nowrap;
}
.fid-facon.ouvert { border-color: rgba(16, 185, 129, .35); }
.fid-facon.ouvert .fid-etat { background: rgba(16, 185, 129, .14); color: #059669; }

/* ---------- Mouvements ---------- */
.fid-mouvements { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
.fid-mouvements li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; color: var(--gris-700); font-size: .86rem; }
.fid-mouvements li + li { border-top: 1px solid var(--gris-200); }
.fid-mouvements small { margin-left: 8px; color: var(--gris-400); font-size: .76rem; }
.fid-mouvements strong { color: var(--ardoise); font-variant-numeric: tabular-nums; white-space: nowrap; }
.fid-mouvements strong.plus { color: #059669; }
.fid-vide { margin: 0; padding: 12px 14px; border-radius: 14px; background: rgba(245, 158, 11, .1); color: var(--texte-secondaire); font-size: .84rem; line-height: 1.45; }

@media (prefers-reduced-motion: reduce) {
  .fid-carte::after { display: none; }
  .fid-jauge span { transition: none; }
}
/* écran peu haut : carte et espacements resserrés */
@media (min-width: 640px) and (max-height: 720px) {
  .fid { padding: 18px 24px 20px; }
  .fid-fermer { top: 28px; right: 34px; }
  .fid-carte { padding: 16px 20px 14px; }
  .fid-solde { margin-top: 8px; }
  .fid-solde strong { font-size: 2.7rem; }
  .fid-jauge { margin-top: 12px; }
  .fid-gain { margin-top: 12px; }
  .fid-sous-titre { margin: 14px 0 8px; }
  /* façons : icône à côté du titre */
  .fid-facon { display: grid; grid-template-columns: auto 1fr; grid-template-areas: 'icone titre' 'texte texte' 'etat etat'; align-items: center; gap: 6px 10px; padding: 12px; }
  .fid-facon-icone { grid-area: icone; width: 32px; height: 32px; margin: 0; border-radius: 10px; font-size: .85rem; }
  .fid-facon strong { grid-area: titre; }
  .fid-facon p { grid-area: texte; }
  .fid-etat { grid-area: etat; justify-self: start; margin-top: 2px; }
  .fid-mouvements li { padding: 6px 0; }
}
/* téléphone : feuille qui monte du bas, façons en lignes (icône, texte, état) */
@media (max-width: 639px) {
  .fid-voile { place-items: end center; padding: 0; }
  .fid { width: 100%; max-height: calc(100dvh - 12px); padding: 14px 16px calc(18px + env(safe-area-inset-bottom)); border-radius: 26px 26px 0 0; }
  .fid-fermer { top: 24px; right: 26px; }
  .fid-carte { padding: 18px 18px 16px; }
  .fid-solde strong { font-size: 3rem; }
  .fid-facons { grid-template-columns: 1fr; gap: 8px; }
  .fid-facon { display: grid; grid-template-columns: auto 1fr auto; grid-template-areas: 'icone titre etat' 'icone texte texte'; align-items: center; gap: 2px 12px; padding: 10px 12px; }
  .fid-facon-icone { grid-area: icone; margin: 0; align-self: start; }
  .fid-facon strong { grid-area: titre; }
  .fid-facon p { grid-area: texte; }
  .fid-etat { grid-area: etat; margin: 0; }
}
</style>

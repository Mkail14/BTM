<script setup>
import { ref, computed, onMounted, onBeforeUnmount, defineAsyncComponent } from 'vue'
import { useAuth } from '@/composables/useAuth.js'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import { typesProjets } from '@/donnees/typesProjets.js'
import { useContenuSite } from '@/composables/useContenuSite.js'
const Scene3DChantier = defineAsyncComponent(() => import('./Scene3DChantier.vue'))
import HeroPaysage from './HeroPaysage.vue'

const { utilisateur, fournisseurLie, demandePro } = useAuth()
const contenu = useContenuSite()

// Surtitre : pour un compte connecté, la fin « · Mayotte » est remplacée par le type de compte
const typeCompte = computed(() => {
  if (!utilisateur.value) return null
  if (fournisseurLie.value || demandePro.value?.statut === 'verifie') return { cle: 'pro', libelle: 'Professionnel', icone: 'fa-solid fa-briefcase' }
  return { cle: 'utilisateur', libelle: 'Utilisateur', icone: 'fa-solid fa-user' }
})
const debutSurtitre = computed(() => {
  const texte = contenu.hero.surtitre
  const i = texte.lastIndexOf('·')
  return (i > 0 ? texte.slice(0, i) : texte).trim()
})
// « Bonjour Monsieur Dupont » si la civilité est connue, sinon « Bonjour Prénom Nom » (anciens comptes)
const salutation = computed(() => {
  const infos = utilisateur.value?.user_metadata
  if (!utilisateur.value) return ''
  const civilite = { 'M.': 'Monsieur', Mme: 'Madame' }[infos?.civilite]
  if (civilite && infos?.nom) return `Bonjour ${civilite} ${infos.nom}`
  const nomComplet = [infos?.prenom, infos?.nom].filter(Boolean).join(' ')
  return `Bonjour ${nomComplet || infos?.pseudo || utilisateur.value.email.split('@')[0]}`
})

// Téléphone (< 640 px) : la maquette 3D est remplacée par des raccourcis vers les 4 types de devis
const requete = typeof window !== 'undefined' ? window.matchMedia('(max-width: 639px)') : null
const telephone = ref(!!requete?.matches)
const surTaille = (e) => { telephone.value = e.matches }
onMounted(() => requete?.addEventListener('change', surTaille))
onBeforeUnmount(() => requete?.removeEventListener('change', surTaille))

const decalage = ref(0)
let raf = null
const surScroll = () => {
  if (raf) return
  raf = requestAnimationFrame(() => { decalage.value = window.scrollY; raf = null })
}
onMounted(() => window.addEventListener('scroll', surScroll, { passive: true }))
onBeforeUnmount(() => { window.removeEventListener('scroll', surScroll); if (raf) cancelAnimationFrame(raf) })

</script>

<template>
  <section id="hero-section" class="hero" aria-labelledby="hero-titre">
    <HeroPaysage :style="{ transform: `translate3d(0, ${decalage * 0.2}px, 0)` }" />

    <div class="conteneur hero-grille">
      <div class="hero-texte" :style="{ transform: `translate3d(0, ${decalage * 0.08}px, 0)` }">
        <p v-if="typeCompte" class="hero-surtitre">
          {{ debutSurtitre }}
          <span class="hero-compte" :class="`hero-compte-${typeCompte.cle}`">
            <i :class="typeCompte.icone" aria-hidden="true"></i>{{ typeCompte.libelle }}
          </span>
        </p>
        <p v-else class="hero-surtitre">{{ contenu.hero.surtitre }}</p>
        <h1 id="hero-titre" class="hero-titre">
          {{ salutation || contenu.hero.titre }}
        </h1>
        <p class="hero-desc">
          {{ contenu.hero.description }}
        </p>
        <div class="hero-actions">
          <BoutonBase to="/calculateur" variante="primaire" icone-droite="fa-solid fa-arrow-right">{{ contenu.hero.boutonPrincipal }}</BoutonBase>
          <BoutonBase to="/fournisseurs" variante="contour-clair">{{ contenu.hero.boutonSecondaire }}</BoutonBase>
        </div>
      </div>

      <div v-if="!telephone" class="hero-visuel" :style="{ transform: `translate3d(0, ${decalage * -0.06}px, 0)` }">
        <Scene3DChantier />
      </div>

      <!-- Téléphone : accès direct à chaque type de devis -->
      <nav v-else class="hero-raccourcis" aria-label="Commencer un devis">
        <p class="hero-raccourcis-titre">{{ contenu.hero.raccourcisTitre }}</p>
        <ul>
          <li v-for="t in typesProjets" :key="t.id">
            <router-link :to="{ path: '/calculateur', query: { type: t.id } }">
              <i :class="t.icone" aria-hidden="true"></i>
              <span>{{ t.libelle }}</span>
            </router-link>
          </li>
        </ul>
      </nav>
    </div>

    <a href="#types-projets" class="hero-defiler" aria-label="Voir la suite"><span></span></a>
  </section>
</template>

<style scoped>
.hero {
  position: relative; min-height: 100svh; display: flex; flex-direction: column; justify-content: center; overflow: hidden;
  color: #fff; padding: calc(var(--hauteur-entete) + 48px) 0 0; isolation: isolate; background: #0a0f14;
}
.hero-grille {
  display: grid; gap: 32px 56px; grid-template-columns: 1fr; align-items: center; justify-items: center;
  flex: 1; width: 100%; margin: 0 auto; padding: 0 7vw 40px;
}
@media (min-width: 900px) {
  .hero-grille {
    grid-template-columns: minmax(0, 1fr) minmax(460px, 1fr);
    gap: 4vw; justify-items: stretch; align-items: center;
  }
}
@media (min-width: 1200px) {
  .hero-grille { max-width: 1800px; padding-inline: 5vw; }
  .hero-titre { white-space: nowrap; }
  .hero-actions { flex-wrap: nowrap; }
}
.hero-texte {
  display: flex; flex-direction: column; justify-content: center; width: 100%; max-width: 610px; margin-inline: auto;
  text-align: left;
}
@media (min-width: 900px) { .hero-texte { justify-self: end; margin-inline: 0; } }

.hero-surtitre {
  display: inline-flex; align-items: center; gap: 10px; font-size: .78rem; font-weight: 600; letter-spacing: .14em; text-transform: uppercase;
  color: #f7c77a; margin-bottom: 22px; animation: apparaitre .6s ease both;
}
.hero-surtitre::before { content: ''; width: 26px; height: 2px; background: #f59e0b; }
/* Type du compte connecté (à la place de « Mayotte ») */
.hero-compte {
  display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px;
  font-size: .72rem; letter-spacing: .1em; border: 1px solid currentColor;
}
.hero-compte i { font-size: .7rem; }
.hero-compte-utilisateur { color: #67e8f9; background: rgba(6, 182, 212, .14); }
.hero-compte-pro { color: #fcd34d; background: rgba(245, 158, 11, .14); }
.hero-compte-fournisseur { color: #6ee7b7; background: rgba(16, 185, 129, .14); }
.hero-titre {
  font-size: clamp(2.6rem, 6vw, 4.6rem); font-weight: 700; line-height: 1.02; letter-spacing: -.01em;
  animation: apparaitre .7s .08s ease both;
}
.hero-desc { margin-top: 24px; font-size: clamp(1rem, 1.4vw, 1.15rem); line-height: 1.65; color: var(--beton); max-width: 560px; animation: apparaitre .7s .18s ease both; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 34px; animation: apparaitre .7s .28s ease both; }
.hero-visuel {
  width: 100%; max-width: 620px; display: flex; align-items: center; justify-content: center; position: relative; top: 48px;
  transform: translateY(18px);
  animation: apparaitre .9s .2s ease both;
}
/* Téléphone : hero centré, boutons larges, raccourcis à la place de la maquette 3D */
@media (max-width: 639px) {
  .hero { padding-top: calc(var(--hauteur-entete) + 20px); justify-content: flex-start; }
  .hero-grille { grid-template-columns: minmax(0, 1fr); gap: 26px; padding: 8px 20px 96px; align-content: center; }
  .hero-grille > * { min-width: 0; }
  .hero-texte { max-width: none; }
  .hero-surtitre { font-size: .7rem; letter-spacing: .12em; margin-bottom: 14px; }
  .hero-titre { font-size: clamp(1.9rem, 10.5vw, 3rem); overflow-wrap: break-word; hyphens: auto; }
  .hero-desc { margin-top: 14px; font-size: 1.02rem; line-height: 1.55; }
  .hero-actions { flex-direction: column; align-items: stretch; gap: 10px; margin-top: 24px; }
  .hero-actions :deep(.btn), .hero-actions :deep(a) { width: 100%; justify-content: center; min-height: 50px; }
  .hero-defiler { display: none; }
}
/* Petits téléphones (≤ 360 px) */
@media (max-width: 360px) {
  .hero-grille { padding-inline: 16px; gap: 22px; }
  .hero-surtitre { font-size: .62rem; letter-spacing: .08em; gap: 8px; }
  .hero-surtitre::before { width: 18px; }
  .hero-desc { font-size: .95rem; }
  .hero-raccourcis ul { gap: 8px; }
  .hero-raccourcis a { gap: 8px; padding: 0 10px; min-height: 54px; font-size: .92rem; }
  .hero-raccourcis i { width: 28px; height: 28px; font-size: .82rem; }
}

/* Raccourcis (téléphone uniquement) */
.hero-raccourcis { width: 100%; animation: apparaitre .8s .3s ease both; }
.hero-raccourcis-titre { margin: 0 0 10px; font-size: .72rem; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: rgba(255, 255, 255, .55); }
.hero-raccourcis ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.hero-raccourcis a {
  display: flex; align-items: center; gap: 12px; min-height: 58px; padding: 0 14px; border-radius: 14px; color: #fff; font-weight: 600;
  background: rgba(255, 255, 255, .07); border: 1px solid rgba(255, 255, 255, .14); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  transition: background var(--transition), transform var(--transition);
}
.hero-raccourcis a:active { background: rgba(6, 182, 212, .22); transform: scale(.98); }
.hero-raccourcis i { width: 34px; height: 34px; flex: none; display: grid; place-items: center; border-radius: 10px; background: rgba(6, 182, 212, .2); color: #67e8f9; font-size: .95rem; }
@media (min-width: 900px) { .hero-texte { justify-self: start; } .hero-visuel { justify-self: end; transform: translateY(26px); } }
@media (min-width: 1800px) {
  .hero-grille { max-width: 2100px; grid-template-columns: minmax(0, 1fr) minmax(720px, 1fr); }
  .hero-visuel, .scene { max-width: 720px; }
}

.hero-titre { text-shadow: 0 2px 30px rgba(10, 15, 20, .5); }
.hero-desc { color: rgba(255, 255, 255, .72); }

/* Indicateur de défilement : une souris dont la molette descend */
.hero-defiler {
  position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%);
  width: 26px; height: 40px; border: 1.5px solid rgba(255, 255, 255, .45); border-radius: 14px;
  transition: border-color var(--transition);
}
.hero-defiler:hover { border-color: #fff; }
.hero-defiler span { position: absolute; left: 50%; top: 8px; width: 3px; height: 8px; margin-left: -1.5px; border-radius: 2px; background: #fff; animation: molette 1.8s ease-in-out infinite; }
@keyframes molette { 0% { opacity: 0; transform: translateY(0); } 30% { opacity: 1; } 100% { opacity: 0; transform: translateY(12px); } }
@media (prefers-reduced-motion: reduce) { .hero-defiler span { animation: none; } }
</style>

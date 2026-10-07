<script setup>
import { computed } from 'vue'
import LogoBtm from './LogoBtm.vue'
import { useContenuSite } from '@/composables/useContenuSite.js'
import { typesProjets } from '@/donnees/typesProjets.js'

const contenu = useContenuSite()
const annee = new Date().getFullYear()
// 0269 61 12 11 → +262269611211 (lien tel: international)
const lienTelephone = computed(() => {
  const chiffres = String(contenu.contact.telephone || '').replace(/\D/g, '')
  return chiffres.startsWith('0') ? `+262${chiffres.slice(1)}` : `+${chiffres}`
})
</script>

<template>
  <footer id="pied-de-page" class="pied">
    <div class="conteneur pied-grille">
      <section class="pied-marque">
        <router-link to="/" class="pied-logo"><LogoBtm :taille="46" /> <span>BTM</span></router-link>
        <p>{{ contenu.pied.description }}</p>
        <p class="pied-localisation"><i class="fa-solid fa-location-dot"></i> {{ contenu.contact.localisation }}</p>
      </section>

      <nav class="pied-nav" aria-label="Navigation pied de page">
        <h4>Navigation</h4>
        <router-link to="/">Accueil</router-link>
        <router-link to="/calculateur">Calculateur</router-link>
        <router-link to="/fournisseurs">Fournisseurs</router-link>
        <router-link to="/dashboard">Mes projets</router-link>
      </nav>

      <nav class="pied-nav" aria-label="Types de projets">
        <h4>Devis</h4>
        <router-link v-for="t in typesProjets" :key="t.id" :to="{ path: '/calculateur', query: { type: t.id } }">{{ t.libelle }}</router-link>
      </nav>

      <section class="pied-nav">
        <h4>Contact</h4>
        <a :href="`mailto:${contenu.contact.email}`"><i class="fa-regular fa-envelope"></i> {{ contenu.contact.email }}</a>
        <a :href="`tel:${lienTelephone}`"><i class="fa-solid fa-phone"></i> {{ contenu.contact.telephone }}</a>
        <p class="pied-note">{{ contenu.pied.note }}</p>
      </section>
    </div>

    <div class="conteneur pied-bas">
      <p>
        © {{ annee }} BTM — Bâtiment & Travaux Mayotte. · <router-link to="/conditions">Conditions générales d’utilisation</router-link>
        · <router-link to="/confidentialite">Cookies et confidentialité</router-link>
      </p>
      <p class="pied-tech">{{ contenu.pied.mention }}</p>
    </div>
  </footer>
</template>

<style scoped>
.pied { position: relative; background: var(--ardoise); color: rgba(255,255,255,.78); border-top: 3px solid var(--lagon-700); }
.pied-grille { display: grid; gap: 36px; padding: 64px 20px 40px; grid-template-columns: 1fr; }
@media (max-width: 639px) {
  .pied-grille { grid-template-columns: 1fr 1fr; gap: 28px 20px; padding-top: 44px; }
  .pied-marque, .pied-nav:last-child { grid-column: 1 / -1; }
}
@media (min-width: 640px) { .pied-grille { grid-template-columns: 1fr 1fr; } }
@media (min-width: 900px) { .pied-grille { grid-template-columns: 1.6fr 1fr 1fr 1.2fr; padding-inline: 32px; } }
.pied-logo { display: inline-flex; align-items: center; gap: 12px; font-family: var(--font-display); font-size: 1.7rem; font-weight: 700; letter-spacing: .06em; color: #fff; margin-bottom: 14px; }
.pied-marque p { max-width: 380px; font-size: .95rem; line-height: 1.6; }
.pied-localisation { margin-top: 12px !important; color: var(--lagon-300); }
.pied-nav { display: flex; flex-direction: column; gap: 10px; }
.pied-nav h4 { color: var(--gris-400); font-family: var(--font-corps); font-size: .74rem; font-weight: 600; text-transform: uppercase; letter-spacing: .14em; margin-bottom: 6px; }
.pied-nav a { font-size: .95rem; transition: color var(--transition), transform var(--transition); display: inline-flex; gap: 8px; align-items: center; }
.pied-nav a:hover { color: var(--lagon-300); transform: translateX(4px); }
.pied-note { font-size: .8rem; opacity: .6; margin-top: 8px; }
.pied-bas {
  border-top: 1px solid rgba(255,255,255,.1); padding: 20px; display: flex; flex-wrap: wrap; gap: 8px 24px;
  justify-content: space-between; font-size: .82rem; opacity: .75;
}
</style>

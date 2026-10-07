<script setup>
/**
 * Bandeau d'information sur les cookies et le stockage local (voir useCookies).
 * Pas de bouton « Refuser » : il n'y a rien de facultatif à refuser, tout ce qui est enregistré est indispensable.
 */
import { useCookies } from '@/composables/useCookies.js'

const { bandeauVisible, confirmer } = useCookies()
</script>

<template>
  <transition name="cookies">
    <aside v-if="bandeauVisible" class="cookies" role="region" aria-labelledby="cookies-titre">
      <p id="cookies-titre" class="cookies-titre"><i class="fa-solid fa-cookie-bite" aria-hidden="true"></i> Vos données, en toute transparence</p>
      <p class="cookies-texte">
        BTM n’utilise <strong>aucun cookie publicitaire ni de mesure d’audience</strong>. Seul l’indispensable est enregistré sur votre appareil :
        votre connexion, votre devis en cours et vos préférences.
      </p>
      <div class="cookies-actions">
        <button type="button" class="btn btn-primaire btn-sm" @click="confirmer">J’ai compris</button>
        <router-link to="/confidentialite" class="cookies-lien" @click="confirmer">En savoir plus</router-link>
      </div>
    </aside>
  </transition>
</template>

<style scoped>
.cookies {
  position: fixed; left: 16px; bottom: 16px; z-index: 150; width: min(420px, calc(100vw - 32px));
  padding: 18px 20px; border: 1px solid var(--gris-200); border-radius: var(--rayon-lg); background: #fff; box-shadow: var(--ombre-lg);
}
.cookies-titre { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; color: var(--ardoise); font-weight: 700; }
.cookies-titre i { color: var(--lagon-600); }
.cookies-texte { margin: 0; color: var(--texte-secondaire); font-size: .88rem; line-height: 1.55; }
.cookies-texte strong { color: var(--ardoise); }
.cookies-actions { display: flex; align-items: center; gap: 16px; margin-top: 14px; }
.cookies-lien { color: var(--lagon-700); font-size: .88rem; font-weight: 600; }
.cookies-lien:hover { text-decoration: underline; text-underline-offset: 3px; }
.cookies-enter-active, .cookies-leave-active { transition: opacity .25s ease, transform .25s ease; }
.cookies-enter-from, .cookies-leave-to { opacity: 0; transform: translateY(12px); }
/* téléphone : en bas de l'écran, sans masquer le bouton d'aide (à droite) */
@media (max-width: 560px) { .cookies { left: 12px; bottom: 12px; width: calc(100vw - 96px); padding: 14px 16px; } }
</style>

<script setup>
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EnteteApp from '@/composants/commun/EnteteApp.vue'
import PiedDePage from '@/composants/commun/PiedDePage.vue'
import AideFlottante from '@/composants/commun/AideFlottante.vue'
import BandeauAnnonce from '@/composants/commun/BandeauAnnonce.vue'
import { useAuth } from '@/composables/useAuth.js'
import { PAGES_ESPACE } from '@/routeur/index.js'
import { modeSite, quitterModeSite } from '@/composables/useModeSite.js'

// L'espace admin a sa propre mise en page (barre latérale) : pas d'en-tête ni de pied du site
const route = useRoute()
const router = useRouter()
const pleinEcran = computed(() => !!route.meta.pleinEcran)

// Les comptes admin et fournisseur n'utilisent pas le site public : si le compte le devient sur une page
// publique (connexion dans un autre onglet…), il rejoint son espace.
const { admin, fournisseurLie } = useAuth()
watch(admin, (estAdmin) => {
  if (estAdmin && !PAGES_ESPACE.admin.includes(route.name)) router.replace({ name: 'admin' })
})
watch(fournisseurLie, (fid) => {
  if (fid && !modeSite.value && !PAGES_ESPACE.fournisseur.includes(route.name)) router.replace({ name: 'espace-fournisseur' })
})
// Fournisseur en visite sur le site : retour à son espace
const visiteFournisseur = computed(() => !!fournisseurLie.value && modeSite.value && !pleinEcran.value)
function retourEspace() {
  quitterModeSite()
  router.push({ name: 'espace-fournisseur' })
}
</script>

<template>
  <a class="lien-evitement" href="#contenu-principal">Aller au contenu</a>
  <EnteteApp v-if="!pleinEcran" />
  <main id="contenu-principal">
    <router-view v-slot="{ Component }">
      <transition name="fondu" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </main>
  <template v-if="!pleinEcran">
    <PiedDePage />
    <AideFlottante />
    <BandeauAnnonce />
  </template>
  <div v-if="visiteFournisseur" class="visite-fournisseur" role="region" aria-label="Visite du site">
    <span><i class="fa-solid fa-briefcase" aria-hidden="true"></i> Vous visitez le site en tant que <strong>professionnel</strong></span>
    <button type="button" @click="retourEspace"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Retour à mon espace</button>
  </div>
</template>

<style>
.lien-evitement {
  position: absolute; left: 16px; top: -60px; z-index: 1000; padding: 10px 16px;
  background: var(--ardoise); color: #fff; border-radius: 8px; transition: top .2s;
}
.lien-evitement:focus { top: 12px; }
.visite-fournisseur {
  position: fixed; left: 50%; bottom: 18px; z-index: 300; transform: translateX(-50%); display: flex; align-items: center; gap: 14px;
  max-width: calc(100vw - 32px); padding: 8px 8px 8px 18px; border-radius: 999px; background: #0f172a; color: #fff; font-size: .88rem;
  box-shadow: 0 16px 40px rgba(15, 23, 42, .35);
}
.visite-fournisseur i { margin-right: 6px; color: #fcd34d; }
.visite-fournisseur button { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 16px; border: 0; border-radius: 999px; background: #fff; color: #0f172a; font: inherit; font-weight: 600; cursor: pointer; white-space: nowrap; }
.visite-fournisseur button i { margin: 0; color: inherit; }
@media (max-width: 560px) { .visite-fournisseur > span { display: none; } }
</style>

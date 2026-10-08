<script setup>
import { computed, defineAsyncComponent, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useFenetreAuth } from '@/composables/useFenetreAuth.js'
import EnteteApp from '@/composants/commun/EnteteApp.vue'
import PiedDePage from '@/composants/commun/PiedDePage.vue'
import AideFlottante from '@/composants/commun/AideFlottante.vue'
import BandeauAnnonce from '@/composants/commun/BandeauAnnonce.vue'
import BandeauCookies from '@/composants/commun/BandeauCookies.vue'
import ApercuPdf from '@/composants/commun/ApercuPdf.vue'
import { useAuth } from '@/composables/useAuth.js'
import { PAGES_ESPACE } from '@/routeur/index.js'
import { modeSite, quitterModeSite } from '@/composables/useModeSite.js'

// L'espace admin a sa propre mise en page (barre latérale) : pas d'en-tête ni de pied du site
const route = useRoute()
const router = useRouter()
const pleinEcran = computed(() => !!route.meta.pleinEcran)

// Les comptes admin et fournisseur n'utilisent pas le site public : si le compte le devient sur une page
// publique (connexion dans un autre onglet…), il rejoint son espace.
// Au premier chargement, le rôle peut être connu avant la page demandée : on attend le routeur, sinon un administrateur
// arrivant par le lien « mot de passe oublié » de l'e-mail était envoyé dans son espace sans choisir son mot de passe.
const { admin, fournisseurLie } = useAuth()
watch(admin, async (estAdmin) => {
  if (!estAdmin) return
  await router.isReady()
  if (admin.value && !PAGES_ESPACE.admin.includes(route.name)) router.replace({ name: 'admin' })
})
watch(fournisseurLie, async (fid) => {
  if (!fid) return
  await router.isReady()
  if (fournisseurLie.value && !modeSite.value && !PAGES_ESPACE.fournisseur.includes(route.name)) router.replace({ name: 'espace-fournisseur' })
})
// Fournisseur en visite sur le site : retour à son espace
const visiteFournisseur = computed(() => !!fournisseurLie.value && modeSite.value && !pleinEcran.value)
function retourEspace() {
  quitterModeSite()
  router.push({ name: 'espace-fournisseur' })
}

// Connexion / inscription : une fenêtre superposée au site (il n'y a pas de page de connexion).
// Disponible partout, y compris dans les espaces admin et fournisseur (qui n'ont pas l'en-tête du site).
const FenetreConnexion = defineAsyncComponent(() => import('@/composants/commun/FenetreConnexion.vue'))
const { etat: fenetreAuth, ouvrirAuth, fermerAuth } = useFenetreAuth()
watch(() => fenetreAuth.ouverte, (ouverte) => { document.body.style.overflow = ouverte ? 'hidden' : '' })
// lien « ?connexion » ou « ?inscription » (assistance, compte suspendu…) : ouvre la fenêtre sur la page en cours
watch(() => route.query, (q) => {
  const mode = 'inscription' in q ? 'inscription' : 'connexion' in q ? 'connexion' : null
  if (!mode) return
  ouvrirAuth(mode, { redirect: q.redirect, suspendu: typeof q.suspendu === 'string' ? q.suspendu : null, profil: q.profil, oubli: 'oubli' in q })
  const { connexion: _c, inscription: _i, redirect: _r, suspendu: _s, profil: _p, oubli: _o, ...reste } = q
  router.replace({ query: reste, hash: route.hash })
}, { immediate: true })
</script>

<template>
  <a class="lien-evitement" href="#contenu-principal">Aller au contenu</a>
  <EnteteApp v-if="!pleinEcran" />
  <main id="contenu-principal">
    <router-view v-slot="{ Component }">
      <transition name="fondu" mode="out-in">
        <!-- L'accueil reste en mémoire : y revenir ne reconstruit pas ses 5 scènes 3D (≈ 0,6 s de page figée) -->
        <keep-alive include="AccueilVue">
          <component :is="Component" />
        </keep-alive>
      </transition>
    </router-view>
  </main>
  <template v-if="!pleinEcran">
    <PiedDePage />
    <AideFlottante />
    <BandeauAnnonce />
    <BandeauCookies />
  </template>
  <ApercuPdf />
  <FenetreConnexion
    v-if="fenetreAuth.ouverte"
    :mode="fenetreAuth.mode" :redirect="fenetreAuth.redirect" :suspendu="fenetreAuth.suspendu" :profil="fenetreAuth.profil" :oubli="fenetreAuth.oubli" :par-lien="fenetreAuth.parLien" :lien-expire="fenetreAuth.lienExpire" :message="fenetreAuth.message"
    @fermer="fermerAuth" @changer-mode="fenetreAuth.mode = $event"
  />
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

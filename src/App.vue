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
import { useOuverture, PAGES_LIBRES, LIBELLES_ENVIRONNEMENT } from '@/composables/useOuverture.js'
import BientotVue from '@/vues/BientotVue.vue'

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

// Trois versions : en ligne (btm.yt), develop, locale. En ligne, tant que le site n'a pas assez de fournisseurs
// partenaires, la page d'attente remplace le site public (espaces admin / fournisseur et pages légales exceptés).
const { environnement, partenaires, mode: modeOuverture, enAttente } = useOuverture()
const pageAttente = computed(() => enAttente.value !== false && !PAGES_LIBRES.includes(route.name) && !admin.value && !fournisseurLie.value)

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
  <!-- En ligne, avant l'ouverture : page d'attente (rien pendant la vérification, pour ne pas montrer le site une seconde) -->
  <template v-if="pageAttente">
    <BientotVue v-if="enAttente" :partenaires="partenaires || 0" :maintenance="modeOuverture === 'maintenance'" />
  </template>
  <template v-else>
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
  </template>
  <FenetreConnexion
    v-if="fenetreAuth.ouverte"
    :mode="fenetreAuth.mode" :redirect="fenetreAuth.redirect" :suspendu="fenetreAuth.suspendu" :profil="fenetreAuth.profil" :oubli="fenetreAuth.oubli" :par-lien="fenetreAuth.parLien" :lien-expire="fenetreAuth.lienExpire" :message="fenetreAuth.message"
    :partenaires-seuls="pageAttente"
    @fermer="fermerAuth" @changer-mode="fenetreAuth.mode = $event"
  />
  <!-- Repère de version (develop, locale) : jamais sur btm.yt -->
  <span v-if="environnement !== 'en-ligne'" class="repere-version" :class="environnement" :title="`Version ${LIBELLES_ENVIRONNEMENT[environnement].toLowerCase()} du site`">{{ LIBELLES_ENVIRONNEMENT[environnement] }}</span>
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
  position: fixed; left: 50%; bottom: calc(18px + var(--barre-onglets, 0px)); z-index: 300; transform: translateX(-50%); display: flex; align-items: center; gap: 14px;
  max-width: calc(100vw - 32px); padding: 8px 8px 8px 18px; border-radius: 999px; background: #0f172a; color: #fff; font-size: .88rem;
  box-shadow: 0 16px 40px rgba(15, 23, 42, .35);
}
.visite-fournisseur i { margin-right: 6px; color: #fcd34d; }
.visite-fournisseur button { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 16px; border: 0; border-radius: 999px; background: #fff; color: #0f172a; font: inherit; font-weight: 600; cursor: pointer; white-space: nowrap; }
.visite-fournisseur button i { margin: 0; color: inherit; }
@media (max-width: 560px) { .visite-fournisseur > span { display: none; } }
.repere-version {
  position: fixed; left: 12px; bottom: 12px; z-index: 900; padding: 4px 10px; border-radius: 999px; pointer-events: none;
  color: #fff; font: 700 .68rem/1.4 var(--font-corps); letter-spacing: .08em; text-transform: uppercase; box-shadow: 0 4px 12px rgba(15, 23, 42, .25);
}
/* téléphone : en haut au centre, pour ne couvrir ni le contenu ni les onglets du bas de l'espace fournisseur */
@media (max-width: 767px) { .repere-version { left: 50%; bottom: auto; top: 4px; transform: translateX(-50%); padding: 1px 8px; font-size: .6rem; } }
.repere-version.develop { background: #7c3aed; }
.repere-version.local { background: #ea580c; }
</style>

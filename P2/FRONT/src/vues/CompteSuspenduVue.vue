<script setup>
/**
 * Compte suspendu (banni par un administrateur, migration 0022).
 * On y arrive déconnecté : après une tentative de connexion refusée, ou quand une session encore ouverte
 * est fermée par useAuth. La fin de la suspension (date ISO ou « vie ») et le motif saisi par l'administrateur
 * viennent de services/suspension.js ; `?jusqua=` reste lu pour les anciens liens.
 * Un rat déguisé en policier annonce la nouvelle ; le motif s'affiche sous lui.
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useContenuSite } from '@/composables/useContenuSite.js'
import { ouvrirAuth } from '@/composables/useFenetreAuth.js'
import { suspensionMemorisee } from '@/services/suspension.js'
import RatPolicier from '@/composants/commun/RatPolicier.vue'
import BoutonBase from '@/composants/commun/BoutonBase.vue'

const route = useRoute()
const contenu = useContenuSite()

const memoire = suspensionMemorisee()
const jusqua = computed(() => (typeof route.query.jusqua === 'string' ? route.query.jusqua : memoire?.jusqua || ''))
const motif = (memoire?.motif || '').trim()
const aVie = computed(() => jusqua.value === 'vie')
const fin = computed(() => {
  const d = jusqua.value && !aVie.value ? new Date(jusqua.value) : null
  return d && !Number.isNaN(d.getTime()) ? d : null
})
const terminee = computed(() => !!fin.value && fin.value <= new Date())
const dateFin = computed(() => fin.value?.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' }))
const restant = computed(() => {
  if (!fin.value || terminee.value) return ''
  const ms = fin.value - Date.now()
  const jours = Math.floor(ms / 86400000)
  return jours >= 1 ? `encore ${jours} jour${jours > 1 ? 's' : ''}` : `encore ${Math.max(1, Math.ceil(ms / 3600000))} h`
})
const lienContact = computed(() => `mailto:${contenu.contact.email}?subject=${encodeURIComponent('Compte BTM suspendu')}`)
</script>

<template>
  <div id="page-compte-suspendu" class="page suspendu">
    <div class="conteneur suspendu-grille">
      <div>
        <!-- Suspension temporaire arrivée à son terme -->
        <template v-if="terminee">
          <span class="section-surtitre">Suspension terminée</span>
          <h1>Votre compte est de nouveau actif.</h1>
          <p class="texte-secondaire">La suspension a pris fin le {{ dateFin }}. Vous pouvez vous reconnecter.</p>
          <div class="suspendu-actions">
            <BoutonBase icone="fa-solid fa-right-to-bracket" @click="ouvrirAuth('connexion')">Se connecter</BoutonBase>
            <BoutonBase to="/" variante="secondaire">Retour à l’accueil</BoutonBase>
          </div>
        </template>

        <template v-else>
          <span class="section-surtitre">Compte suspendu</span>
          <h1>Votre accès à BTM est suspendu.</h1>
          <p class="texte-secondaire">
            L’équipe BTM a suspendu ce compte<template v-if="aVie"> définitivement</template><template v-else-if="fin"> jusqu’au <strong>{{ dateFin }}</strong></template>.
            Tant que la suspension dure, vous ne pouvez plus vous connecter ni retrouver vos projets enregistrés.
          </p>

          <ul class="suspendu-infos">
            <li v-if="fin"><i class="fa-regular fa-clock" aria-hidden="true"></i> <span><strong>{{ restant }}</strong> : votre compte se réactive tout seul, sans rien faire.</span></li>
            <li><i class="fa-solid fa-calculator" aria-hidden="true"></i> <span>Le calculateur et l’annuaire des fournisseurs restent accessibles sans compte.</span></li>
            <li><i class="fa-regular fa-envelope" aria-hidden="true"></i> <span>Une erreur, une question ? Écrivez-nous à <a :href="lienContact">{{ contenu.contact.email }}</a>.</span></li>
          </ul>

          <div class="suspendu-actions">
            <a class="btn btn-primaire" :href="lienContact"><i class="fa-solid fa-envelope" aria-hidden="true"></i> Contacter BTM</a>
            <BoutonBase to="/" variante="secondaire">Retour à l’accueil</BoutonBase>
          </div>
        </template>
      </div>

      <figure class="suspendu-rat">
        <p class="suspendu-bulle">{{ terminee ? 'C’est bon, circule : ton compte est débloqué.' : 'Halte ! Ton compte est banni.' }}</p>
        <RatPolicier :content="terminee" />
        <figcaption v-if="motif && !terminee" class="suspendu-motif">
          <span>Motif donné par l’équipe BTM</span>
          <p>« {{ motif }} »</p>
        </figcaption>
      </figure>
    </div>
  </div>
</template>

<style scoped>
.suspendu { display: flex; align-items: center; min-height: 80vh; }
.suspendu-grille { display: grid; gap: 40px; grid-template-columns: 1fr; align-items: center; }
@media (min-width: 900px) { .suspendu-grille { grid-template-columns: 1.1fr 1fr; } }
h1 { margin-bottom: 12px; font-size: clamp(2.2rem, 5vw, 3.4rem); line-height: 1.05; color: var(--ardoise); }
.texte-secondaire { max-width: 560px; line-height: 1.6; }
.texte-secondaire strong { color: var(--ardoise); }
.suspendu-infos { display: flex; flex-direction: column; gap: 12px; max-width: 560px; margin-top: 24px; }
.suspendu-infos li { display: flex; align-items: flex-start; gap: 12px; color: var(--gris-700); line-height: 1.5; }
.suspendu-infos i { width: 34px; height: 34px; flex: none; display: grid; place-items: center; border-radius: 10px; background: var(--gris-100); color: var(--ardoise); font-size: .9rem; }
.suspendu-infos span { padding-top: 5px; }
.suspendu-infos a { color: var(--lagon-700); font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
.suspendu-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 28px; }
.suspendu-rat { display: flex; flex-direction: column; align-items: center; width: min(100%, 380px); margin: 0 auto; }
/* bulle : la pointe descend vers le rat */
.suspendu-bulle {
  position: relative; z-index: 1; margin-bottom: -6px; padding: 14px 22px; border: 3px solid var(--ardoise); border-radius: 22px; background: #fff;
  font-family: var(--font-display); font-size: 1.55rem; font-weight: 700; line-height: 1.15; text-align: center; color: var(--ardoise);
}
.suspendu-bulle::after {
  content: ''; position: absolute; left: 50%; bottom: -13px; width: 20px; height: 20px; margin-left: -10px;
  border-right: 3px solid var(--ardoise); border-bottom: 3px solid var(--ardoise); background: #fff; transform: rotate(45deg);
}
.suspendu-motif { width: 100%; margin-top: 8px; padding: 16px 18px; border-left: 4px solid var(--corail-fonce); border-radius: 0 var(--rayon) var(--rayon) 0; background: var(--erreur-clair); }
.suspendu-motif span { display: block; margin-bottom: 4px; font-size: .74rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--corail-fonce); }
.suspendu-motif p { color: var(--ardoise); font-weight: 500; line-height: 1.5; overflow-wrap: anywhere; }
@media (max-width: 899px) { .suspendu-rat { order: -1; width: min(100%, 300px); } .suspendu-bulle { font-size: 1.3rem; } }
</style>

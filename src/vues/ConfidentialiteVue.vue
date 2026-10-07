<script setup>
/**
 * Cookies et confidentialité : ce que BTM collecte, où c'est hébergé, ce qui est enregistré dans le navigateur
 * et comment exercer ses droits. Même mise en page que les CGU (ConditionsVue).
 */
import { computed, ref } from 'vue'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import { useContenuSite } from '@/composables/useContenuSite.js'
import { useCookies } from '@/composables/useCookies.js'

const contenu = useContenuSite()
const { rouvrir, effacerDonneesLocales } = useCookies()
const miseAJour = '2 octobre 2026'

// Tout ce que le site enregistre dans le navigateur (aucun cookie publicitaire ni de mesure d'audience)
const stockage = [
  { nom: 'Session de connexion', ou: 'Stockage local', role: 'Vous garder connecté d’une page à l’autre', duree: 'Jusqu’à la déconnexion' },
  { nom: 'Devis en cours', ou: 'Stockage de l’onglet', role: 'Retrouver votre estimation pendant votre visite', duree: 'Fermeture de l’onglet' },
  { nom: 'Devis mis de côté à l’inscription', ou: 'Stockage local', role: 'Retrouver votre devis après la confirmation de votre e-mail', duree: '48 heures' },
  { nom: 'Projets enregistrés sur l’appareil', ou: 'Stockage local', role: 'Garder vos projets si vous n’avez pas de compte', duree: 'Jusqu’à leur suppression' },
  { nom: 'Préférences d’affichage', ou: 'Stockage de l’onglet', role: 'Annonce fermée, mode de visite, devis pro en cours', duree: 'Fermeture de l’onglet' },
  { nom: 'Information cookies', ou: 'Stockage local', role: 'Ne pas réafficher ce bandeau à chaque visite', duree: '13 mois' }
]

const sections = computed(() => [
  { id: 'resume', titre: 'En bref', texte: [
    'BTM n’utilise aucun cookie publicitaire, aucun outil de mesure d’audience et ne revend aucune donnée. Les polices et icônes du site sont hébergées par BTM : aucun service tiers ne reçoit votre adresse IP quand vous visitez le site.'] },
  { id: 'donnees', titre: 'Données collectées et finalités', texte: [
    'Si vous créez un compte : civilité, nom, prénom, adresse e-mail, téléphone et, pour un compte professionnel, raison sociale et SIRET. Ils servent à gérer votre compte, enregistrer vos devis et vous permettre de retirer vos matériaux chez un fournisseur avec votre code de retrait.',
    'Vos devis enregistrés, vos achats validés au comptoir, votre crédit fidélité et les avis que vous publiez sont conservés tant que votre compte existe.',
    'Base légale : l’exécution du service que vous demandez (article 6.1.b du RGPD).'] },
  { id: 'hebergement', titre: 'Hébergement et prestataires', texte: [
    'Base de données et comptes : Supabase, serveurs situés en Irlande (Union européenne). Site web : Vercel. E-mails (confirmation, mot de passe oublié) : OVHcloud, en France.',
    'Lors de l’inscription, le domaine de votre adresse e-mail est vérifié auprès de Cloudflare (pour refuser les adresses jetables) ; pour un compte professionnel, le SIRET est vérifié auprès de l’annuaire public des entreprises (api.gouv.fr).'] },
  { id: 'cookies', titre: 'Cookies et stockage dans votre navigateur', texte: [
    'BTM ne dépose que des éléments indispensables au fonctionnement du site. Ils sont exemptés de consentement selon les recommandations de la CNIL ; vous pouvez les effacer à tout moment (bouton ci-dessous ou réglages de votre navigateur).'], tableau: true },
  { id: 'droits', titre: 'Vos droits', texte: [
    `Vous pouvez consulter, corriger ou supprimer vos données : votre profil se modifie depuis votre compte, et « Supprimer mon compte » efface définitivement votre compte et vos projets. Pour toute autre demande (accès, portabilité, opposition) : ${contenu.contact.email}.`,
    'Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à la CNIL (cnil.fr).'] },
  { id: 'securite', titre: 'Sécurité', texte: [
    'Les échanges sont chiffrés (HTTPS). Chaque utilisateur n’accède qu’à ses propres données, contrôlé directement par la base de données. Les mots de passe ne sont jamais stockés en clair et les adresses e-mail jetables sont refusées.'] }
])

const efface = ref(false)
function effacer() {
  effacerDonneesLocales()
  efface.value = true
}
</script>

<template>
  <div id="page-confidentialite" class="page">
    <div class="conteneur cgu">
      <header class="page-entete">
        <span class="section-surtitre">Informations légales</span>
        <h1 class="page-titre">Cookies et confidentialité</h1>
        <p class="texte-secondaire">Dernière mise à jour : {{ miseAJour }}</p>
      </header>

      <div class="cgu-corps">
        <nav class="cgu-sommaire carte" aria-label="Sommaire">
          <h2>Sommaire</h2>
          <ol>
            <li v-for="s in sections" :key="s.id"><a :href="`#${s.id}`">{{ s.titre }}</a></li>
          </ol>
        </nav>

        <article class="cgu-texte">
          <section v-for="(s, i) in sections" :id="s.id" :key="s.id" class="cgu-section">
            <h2><span class="cgu-num">{{ i + 1 }}</span> {{ s.titre }}</h2>
            <p v-for="(p, j) in s.texte" :key="j">{{ p }}</p>

            <template v-if="s.tableau">
              <div class="tableau-scroll">
                <table class="conf-tableau">
                  <thead><tr><th scope="col">Élément</th><th scope="col">Rôle</th><th scope="col">Durée</th></tr></thead>
                  <tbody>
                    <tr v-for="l in stockage" :key="l.nom">
                      <td><strong>{{ l.nom }}</strong><small>{{ l.ou }}</small></td>
                      <td>{{ l.role }}</td>
                      <td>{{ l.duree }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="conf-actions">
                <button type="button" class="btn btn-secondaire btn-sm" @click="effacer"><i class="fa-solid fa-broom" aria-hidden="true"></i> Effacer les données de cet appareil</button>
                <button type="button" class="btn btn-ghost btn-sm" @click="rouvrir">Revoir le bandeau d’information</button>
              </div>
              <p v-if="efface" class="conf-ok" role="status"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> C’est fait : devis non enregistrés et préférences effacés de cet appareil (votre connexion est conservée).</p>
            </template>
          </section>

          <div class="cgu-actions">
            <BoutonBase to="/conditions" variante="secondaire">Conditions générales d’utilisation</BoutonBase>
            <BoutonBase to="/" variante="ghost">Retour à l’accueil</BoutonBase>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cgu-section { max-width: 860px; } /* largeur de lecture ; la page suit le gabarit commun */
.cgu-corps { display: grid; grid-template-columns: 1fr; gap: 28px; align-items: start; }
@media (min-width: 900px) { .cgu-corps { grid-template-columns: 250px minmax(0, 1fr); gap: 44px; } .cgu-sommaire { position: sticky; top: calc(var(--hauteur-entete) + 20px); } }
.cgu-sommaire { padding: 20px 22px; }
.cgu-sommaire h2 { font-size: .8rem; letter-spacing: .12em; text-transform: uppercase; color: var(--texte-secondaire); margin-bottom: 10px; }
.cgu-sommaire ol { margin: 0; padding-left: 20px; display: grid; gap: 7px; font-size: .92rem; }
.cgu-sommaire a { color: var(--gris-700); text-decoration: none; }
.cgu-sommaire a:hover { color: var(--lagon-600); text-decoration: underline; }
.cgu-section { padding-bottom: 26px; scroll-margin-top: calc(var(--hauteur-entete) + 20px); }
.cgu-section h2 { display: flex; align-items: center; gap: 12px; font-size: 1.25rem; color: var(--ardoise); margin-bottom: 10px; }
.cgu-num { display: inline-grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: var(--lagon-600); color: #fff; font-size: .9rem; flex: none; }
.cgu-section p { line-height: 1.7; color: var(--gris-700); margin-bottom: 10px; }
.cgu-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; padding-top: 24px; border-top: 1px solid var(--gris-200, #e5e7eb); }

.conf-tableau { width: 100%; border-collapse: collapse; font-size: .88rem; }
.conf-tableau th { padding: 10px 12px; border-bottom: 2px solid var(--gris-200); color: var(--texte-secondaire); font-size: .75rem; letter-spacing: .06em; text-align: left; text-transform: uppercase; }
.conf-tableau td { padding: 10px 12px; border-bottom: 1px solid var(--gris-200); color: var(--gris-700); vertical-align: top; }
.conf-tableau td strong { display: block; color: var(--ardoise); }
.conf-tableau td small { color: var(--gris-500); font-size: .78rem; }
.conf-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
.conf-ok { display: flex; align-items: center; gap: 8px; margin-top: 12px; color: #047857; font-size: .88rem; }
</style>

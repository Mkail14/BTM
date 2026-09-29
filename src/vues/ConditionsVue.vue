<script setup>
import { computed } from 'vue'
import BoutonBase from '@/composants/commun/BoutonBase.vue'
import { useContenuSite } from '@/composables/useContenuSite.js'
import { formaterNombre } from '@/services/calculs/moteurCalculs.js'

const contenu = useContenuSite()
const taux = computed(() => `${formaterNombre(contenu.frais.taux, 2)} %`)

const miseAJour = '28 septembre 2026'
// Le taux des frais et l'adresse de contact suivent les réglages de l'admin
const sections = computed(() => [
  { id: 'objet', titre: 'Objet du service', texte: [
    'BTM — Bâtiment & Travaux Mayotte est une plateforme qui permet d’estimer le budget d’un projet de construction (mur, dalle, fondation, terrasse), de consulter un annuaire de fournisseurs de matériaux à Mayotte et d’enregistrer ses estimations dans un espace personnel.',
    'Les présentes conditions encadrent l’utilisation du site et la création d’un compte. En créant un compte, vous les acceptez.' ] },
  { id: 'estimations', titre: 'Nature des estimations', texte: [
    'Les quantités, prix et budgets affichés sont des estimations indicatives. Ils reposent sur des formules de calcul simplifiées et des prix unitaires provisoires ; ils ne constituent ni un devis, ni une offre de prix, ni un engagement contractuel.',
    'Avant tout achat ou lancement de travaux, vérifiez les prix auprès des fournisseurs et faites valider votre projet par un professionnel qualifié (maçon, bureau d’études, architecte). BTM ne peut être tenu responsable des écarts entre l’estimation et le coût réel.' ] },
  { id: 'frais', titre: 'Gratuité pour le client, commission et fidélité', texte: [
    'L’inscription, les estimations, l’export PDF et la consultation de l’annuaire sont gratuits.',
    'BTM est une plateforme de mise en relation : il ne vend aucun matériau. L’utilisation de BTM est gratuite pour le client, qui ne paie aucun frais de service.',
    `Sur présentation du code de retrait d’un devis enregistré, le fournisseur applique son « prix BTM », en principe inférieur à son prix au comptoir. Le fournisseur verse à BTM une commission de ${taux.value} de la vente réalisée.`,
    'Chaque achat réalisé avec un code de retrait rapporte au client un crédit fidélité, utilisable lors d’un prochain retrait chez un fournisseur partenaire. Le crédit n’est ni échangeable ni remboursable en espèces.',
    'BTM peut proposer des codes promo. Un code valable s’applique une seule fois par compte, dans les conditions indiquées (montant ou pourcentage) et jusqu’à sa date d’expiration. Un code n’est ni échangeable ni remboursable.' ] },
  { id: 'compte', titre: 'Création et gestion du compte', texte: [
    'Pour enregistrer vos projets, vous devez créer un compte avec des informations exactes (nom, prénom, adresse e-mail, numéro de téléphone) et un mot de passe personnel de 8 caractères minimum.',
    'Vous êtes responsable de la confidentialité de votre mot de passe et de l’activité réalisée depuis votre compte. En cas de doute sur un accès non autorisé, changez votre mot de passe sans délai. Vous pouvez modifier vos informations ou supprimer votre compte à tout moment depuis votre profil.' ] },
  { id: 'donnees', titre: 'Données personnelles', texte: [
    'Les données collectées (nom, prénom, e-mail, téléphone, projets enregistrés) servent uniquement à faire fonctionner votre compte et à synchroniser vos projets entre vos appareils. Elles ne sont ni vendues ni cédées à des tiers à des fins commerciales.',
    'Elles sont hébergées de manière sécurisée chez notre prestataire Supabase ; chaque utilisateur n’a accès qu’à ses propres projets. Conformément au RGPD, vous disposez d’un droit d’accès, de rectification, d’effacement et d’opposition, que vous pouvez exercer depuis votre profil (modification ou suppression du compte) ou en nous écrivant à l’adresse indiquée ci-dessous.',
    'La suppression du compte efface définitivement votre profil et tous vos projets enregistrés.' ] },
  { id: 'usage', titre: 'Utilisation acceptable', texte: [
    'Vous vous engagez à utiliser le service de bonne foi : pas d’usurpation d’identité, pas de tentative d’accès aux données d’autres utilisateurs, pas d’action visant à perturber le fonctionnement du site.',
    'Nous pouvons suspendre ou supprimer un compte en cas d’usage contraire à ces règles.' ] },
  { id: 'fournisseurs', titre: 'Annuaire des fournisseurs', texte: [
    'Les fiches fournisseurs (coordonnées, horaires, livraison) sont fournies à titre d’information et peuvent évoluer. Vérifiez-les directement auprès du fournisseur. BTM n’est pas partie aux échanges ni aux commandes conclus entre vous et un fournisseur.' ] },
  { id: 'propriete', titre: 'Propriété intellectuelle', texte: [
    'Le site, son design, ses textes et ses calculs sont protégés. Vous pouvez utiliser les estimations générées pour vos besoins personnels ou professionnels, mais vous ne pouvez pas reproduire ou revendre le service lui-même.' ] },
  { id: 'evolution', titre: 'Disponibilité et évolution des conditions', texte: [
    'Le service est proposé « en l’état » et peut être interrompu temporairement pour maintenance. Ces conditions peuvent être mises à jour ; la date de dernière modification figure en haut de cette page.' ] },
  { id: 'contact', titre: 'Contact', texte: [`Pour toute question ou demande relative à vos données : ${contenu.contact.email}.`] }
])
</script>

<template>
  <div id="page-conditions" class="page">
    <div class="conteneur cgu">
      <header class="page-entete">
        <span class="section-surtitre">Informations légales</span>
        <h1 class="page-titre">Conditions générales d’utilisation</h1>
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
          </section>

          <div class="cgu-actions">
            <BoutonBase to="/inscription" icone="fa-solid fa-user-plus">Créer un compte</BoutonBase>
            <BoutonBase to="/" variante="secondaire">Retour à l’accueil</BoutonBase>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cgu { max-width: 1040px; }
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
</style>

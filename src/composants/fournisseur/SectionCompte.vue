<script setup>
/**
 * Mon compte (espace fournisseur) — même principe que le profil du site public :
 * un menu de réglages à gauche (l'entreprise en tête), le contenu à droite.
 * Téléphone : le menu seul, puis le contenu choisi avec un bouton retour.
 */
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { initiales } from '@/composables/useAdmin.js'
import { useEspaceFournisseur } from '@/composables/useEspaceFournisseur.js'
import { libelleCategorie } from '@/donnees/fournisseurs.js'
import SectionMaFiche from '@/composants/fournisseur/SectionMaFiche.vue'
import SectionMonCompte from '@/composants/fournisseur/SectionMonCompte.vue'
import SectionMonRib from '@/composants/fournisseur/SectionMonRib.vue'

defineProps({ fiche: { type: Object, default: null } })
const emit = defineEmits(['maj'])

const MENU = [
  { titre: 'Entreprise', items: [
    { id: 'fiche', label: 'Fiche entreprise', aide: 'Coordonnées, horaires, aperçu dans l’annuaire', icone: 'fa-solid fa-store' },
    { id: 'rib', label: 'RIB pour les remboursements', aide: 'Privé : seul BTM le voit', icone: 'fa-solid fa-building-columns' }
  ] },
  { titre: 'Compte', items: [
    { id: 'connexion', label: 'Connexion et sécurité', aide: 'Identifiants, mot de passe, appareils', icone: 'fa-solid fa-user-shield' }
  ] }
]

// Ordinateur : la fiche est ouverte d'emblée ; téléphone : le menu d'abord (le contenu s'ouvre au toucher).
// ?vue=rib (lien depuis Paiements) ouvre directement la rubrique demandée.
const route = useRoute()
const VUES = MENU.flatMap((g) => g.items.map((i) => i.id))
const vue = ref(VUES.includes(route.query.vue) ? route.query.vue : window.matchMedia('(max-width: 767px)').matches ? null : 'fiche')
// BTM vous doit de l'argent mais n'a pas de RIB : pastille sur la rubrique
const { monRib, soldeBtm } = useEspaceFournisseur()
const ribManquant = computed(() => !monRib.value && soldeBtm.value.btmDoit > 0)
const affichee = computed(() => vue.value || 'fiche') // fenêtre agrandie depuis le menu du téléphone : la fiche
const logoCasse = ref(false)
</script>

<template>
  <div class="adm-carte cp" :class="{ 'cp-detail': vue }">
    <nav class="cp-menu" aria-label="Réglages du compte">
      <div class="cp-entreprise">
        <span class="cp-logo">
          <img v-if="fiche?.logo_url && !logoCasse" :src="fiche.logo_url" alt="" @error="logoCasse = true" />
          <template v-else>{{ initiales(fiche?.nom || '') }}</template>
        </span>
        <span class="cp-entreprise-texte"><strong>{{ fiche?.nom }}</strong><small>{{ libelleCategorie(fiche?.categorie_id) }}</small></span>
      </div>

      <div v-for="g in MENU" :key="g.titre" class="cp-menu-groupe">
        <p>{{ g.titre }}</p>
        <button
          v-for="i in g.items" :key="i.id" type="button" class="cp-lien" :class="{ actif: vue === i.id }"
          :aria-current="vue === i.id ? 'page' : undefined" @click="vue = i.id"
        >
          <i :class="i.icone" aria-hidden="true"></i>
          <span><strong>{{ i.label }}</strong><small>{{ i.aide }}</small></span>
          <span v-if="i.id === 'rib' && ribManquant" class="cp-pastille" title="BTM vous doit de l’argent : ajoutez votre RIB"></span>
          <i class="fa-solid fa-chevron-right cp-chevron" aria-hidden="true"></i>
        </button>
      </div>
    </nav>

    <div class="cp-contenu">
      <button type="button" class="cp-retour" @click="vue = null"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i> Mon compte</button>

      <SectionMaFiche v-if="affichee === 'fiche'" :fiche="fiche" @maj="emit('maj', $event)" />


      <SectionMonRib v-else-if="affichee === 'rib'" />

      <SectionMonCompte v-else />
    </div>
  </div>
</template>

<style>
/* Mise en page (non « scoped » : les vues de SectionMaFiche et SectionMonCompte partagent ces classes cp-) */
.cp { display: grid; grid-template-columns: 300px minmax(0, 1fr); overflow: hidden; }

/* ---------- Menu ---------- */
.cp-menu { display: flex; flex-direction: column; gap: 18px; padding: 18px; border-right: 1px solid var(--adm-ligne-2); overflow-y: auto; }
.cp-entreprise { display: flex; align-items: center; gap: 12px; padding: 4px 4px 18px; border-bottom: 1px solid var(--adm-ligne-2); }
.cp-logo {
  width: 48px; height: 48px; flex: none; display: grid; place-items: center; overflow: hidden; border-radius: 14px;
  background: var(--adm-noir); color: #fff; font-size: .95rem; font-weight: 700;
}
.cp-logo img { width: 100%; height: 100%; object-fit: contain; background: #fff; }
.cp-entreprise-texte { display: flex; flex-direction: column; min-width: 0; line-height: 1.3; }
.cp-entreprise-texte strong { font-size: .98rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-entreprise-texte small { color: var(--adm-muet); font-size: .8rem; }
.cp-menu-groupe { display: flex; flex-direction: column; gap: 2px; }
.cp-menu-groupe > p { margin: 0 0 6px; padding: 0 10px; color: var(--adm-muet); font-size: .72rem; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
.cp-lien {
  display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px; border: 0; border-radius: 12px;
  background: none; color: var(--adm-encre-2); font: inherit; text-align: left; cursor: pointer; transition: background var(--transition), color var(--transition);
}
.cp-lien > i:first-child { width: 18px; text-align: center; color: var(--adm-muet); font-size: .9rem; }
.cp-lien > span:not(.cp-pastille) { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.cp-lien strong { font-size: .88rem; font-weight: 600; }
.cp-lien small { color: var(--adm-muet); font-size: .76rem; }
.cp-chevron { display: none; color: var(--adm-muet); font-size: .7rem; }
.cp-lien:hover { background: var(--adm-ligne-2); color: var(--adm-encre); }
.cp-lien.actif { background: var(--adm-ligne-2); color: var(--adm-encre); }
.cp-lien.actif > i:first-child { color: var(--adm-accent); }

/* ---------- Contenu ---------- */
.cp-contenu { min-width: 0; padding: 28px 32px; overflow-y: auto; }
.cp-retour { display: none; }
.cp-vue { max-width: 1080px; }
.cp-tete { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
.cp-tete h2 { margin: 0; font-family: var(--font-corps); font-size: 1.3rem; font-weight: 600; letter-spacing: -.01em; }
.cp-tete p { margin: 4px 0 0; color: var(--adm-encre-2); font-size: .9rem; }
.cp-tete .adm-btn { flex: none; }

/* Fiche : deux colonnes, pour tout voir d'un coup sans faire défiler */
.cp-colonnes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 48px; }
.cp-groupe + .cp-groupe { margin-top: 24px; }
.cp-groupe > h3 { margin: 0 0 2px; color: var(--adm-muet); font-family: var(--font-corps); font-size: .74rem; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
.cp-lignes { margin: 0; }
.cp-lignes > div { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 16px; padding: 11px 0; border-bottom: 1px solid var(--adm-ligne-2); }
.cp-lignes dt { color: var(--adm-encre-2); font-size: .88rem; }
.cp-lignes dd { display: flex; align-items: center; gap: 8px; min-width: 0; margin: 0; font-size: .9rem; font-weight: 500; }
.cp-lignes dd > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-lignes dd.vide, .cp-paragraphe.vide { color: var(--adm-muet); font-weight: 400; }
.cp-lignes dd.ok { color: var(--adm-ok-texte); }
.cp-lignes dd.attention { color: var(--adm-attention-texte); }
.cp-verrou { color: var(--adm-muet); font-size: .72rem; }
/* Connexion et sécurité : une seule colonne, libellés plus larges, action en bout de ligne */
.cp-lignes-larges { max-width: 640px; }
.cp-lignes-larges > div { grid-template-columns: 160px minmax(0, 1fr); }
.cp-discret { color: var(--adm-muet); font-weight: 400; }
.cp-lien-action:disabled { color: var(--adm-muet); text-decoration: none; cursor: default; }
/* Encart d'action (Appareils) : icône, explication, bouton */
.cp-encart {
  display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 4px 14px; margin-top: 12px;
  padding: 16px; border: 1px solid var(--adm-ligne); border-radius: 14px;
}
.cp-encart > i { width: 36px; height: 36px; display: grid; place-items: center; grid-row: span 2; border-radius: 10px; background: var(--adm-ligne-2); color: var(--adm-encre-2); }
.cp-encart > span { color: var(--adm-encre-2); font-size: .86rem; line-height: 1.55; }
.cp-encart strong { display: block; margin-bottom: 2px; color: var(--adm-encre); font-size: .9rem; font-weight: 600; }
.cp-encart > .adm-btn { grid-column: 2; justify-self: start; margin-top: 10px; }
.cp-masque { color: var(--adm-encre-2); letter-spacing: .12em; }
/* Connexion et sécurité : groupes serrés à gauche, encarts d'action à droite */
.cp-compte .cp-groupe + .cp-groupe { margin-top: 20px; }
.cp-compte .cp-lignes > div { padding: 9px 0; }
.cp-compte .cp-groupe-tete { margin-bottom: 2px; }
.cp-compte .cp-encart { margin-top: 10px; }
.cp-verifie { color: var(--adm-ok-texte); font-size: .8rem; }
/* Fermer le compte : encart et bouton rouges */
.cp-encart-danger { border-color: var(--adm-danger-fond-2); background: var(--adm-danger-fond); }
.cp-encart-danger > i { background: var(--adm-danger-fond-2); color: var(--adm-baisse); }
.cp-encart-danger > .adm-btn { background: var(--adm-baisse); color: #fff; }
.cp-btn-rouge { background: var(--adm-baisse); color: #fff; }
.cp-btn-rouge:hover:not(:disabled) { filter: brightness(.92); }
.cp-btn-rouge:disabled { opacity: .45; cursor: not-allowed; }
.cp-phrase { color: var(--adm-encre); font-weight: 700; user-select: none; }
.cp-alerte-bloc { max-width: none; margin: 0; align-items: flex-start; line-height: 1.5; }
.cp-lien-action {
  margin-left: auto; padding: 0; border: 0; background: none; color: var(--adm-accent);
  font: inherit; font-size: .88rem; font-weight: 600; cursor: pointer;
}
.cp-lien-action:hover { text-decoration: underline; }
.cp-etroit { max-width: 640px; }
.cp-paragraphe {
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 6; overflow: hidden;
  margin: 10px 0 0; color: var(--adm-encre); font-size: .9rem; line-height: 1.6; white-space: pre-line;
}
/* Formulaire de la fiche : deux champs par ligne dans chaque colonne */
.cp-champs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 14px; margin-top: 10px; }
.cp-champs .plein { grid-column: 1 / -1; }
.cp-champs .adm-champ > label { display: flex; justify-content: space-between; gap: 8px; }
.cp-champs .adm-champ > label small { color: var(--adm-muet); font-weight: 500; }
.cp-champs .adm-champ > label small.trop { color: var(--adm-baisse); }
.cp-champs textarea { min-height: 0; }
.cp-tete-boutons { display: flex; flex: none; gap: 8px; }
.cp-erreur { margin: -8px 0 16px; }

.cp-champs input:disabled { opacity: .5; cursor: not-allowed; }
.cp-mdp { display: flex; flex-direction: column; gap: 16px; max-width: 420px; }
.cp-boutons { display: flex; gap: 10px; margin-top: 28px; }
/* Fiche en lecture : informations serrées à gauche, aperçu à droite — tout tient dans l'écran */
.cp-fiche { gap: 0 40px; }
.cp-fiche .cp-groupe + .cp-groupe { margin-top: 20px; }
.cp-fiche .cp-lignes > div { padding: 9px 0; }
/* Fiche en modification : les lignes deviennent des champs, à la même hauteur qu'en lecture (39 px) — la page ne défile pas */
.cp-fiche-edition .cp-lignes > div { align-items: center; height: 39px; padding: 0; }
.cp-fiche-edition .cp-lignes dt label { cursor: pointer; }
.cp-fiche-edition .adm-saisie { height: 31px; min-height: 0; padding: 0 10px; border-radius: 8px; font-size: .9rem; }
.cp-dd-champs .adm-saisie { flex: 1; min-width: 0; }
/* horaires : la fenêtre défile entre l'en-tête et les boutons si l'écran est bas */
.cp-fenetre-horaires { max-height: calc(100dvh - 32px); }
/* Aperçu de l'annuaire : une petite fenêtre de navigateur (barre d'adresse, page, carte), aux couleurs du thème choisi */
.cp-apercu-page {
  --gris-300: #cbd5e1; --gris-400: #94a3b8; --lagon-300: #67e8f9; --blanc: #fff; --texte: var(--gris-900);
  --ap-fond: linear-gradient(160deg, var(--lagon-50), var(--gris-100) 55%); --ap-barre: #fff; --ap-carte: #fff; --ap-bouton: #fff;
  margin-top: 12px; overflow: hidden; border-radius: 18px; color: var(--ardoise); background: var(--ap-fond);
  box-shadow: 0 0 0 1px var(--adm-ligne), 0 24px 48px -28px rgba(2, 6, 23, .55);
}
/* thème sombre : la carte du site reprend les teintes de l'espace (les variables du site public sont redéfinies ici) */
.adm-sombre .cp-apercu-page {
  --ardoise: var(--adm-encre); --gris-50: var(--adm-ligne-2); --gris-100: var(--adm-ligne-2); --gris-200: var(--adm-ligne);
  --gris-400: var(--adm-muet); --gris-500: var(--adm-muet); --gris-600: var(--adm-encre-2); --gris-900: var(--adm-encre);
  --lagon-50: rgba(34, 211, 238, .12); --lagon-100: rgba(34, 211, 238, .16); --lagon-800: #67e8f9;
  --ap-fond: linear-gradient(160deg, rgba(34, 211, 238, .07), var(--adm-toile) 55%); --ap-barre: var(--adm-champ); --ap-carte: var(--adm-carte); --ap-bouton: var(--adm-champ);
  box-shadow: 0 0 0 1px var(--adm-ligne);
}
.cp-apercu-barre { display: flex; align-items: center; gap: 14px; padding: 10px 16px; border-bottom: 1px solid var(--gris-200); background: var(--ap-barre); }
.cp-apercu-points { display: inline-flex; gap: 6px; }
.cp-apercu-points i { width: 10px; height: 10px; border-radius: 50%; background: var(--gris-200); }
.cp-apercu-adresse { display: inline-flex; align-items: center; gap: 8px; flex: 1; max-width: 360px; padding: 5px 12px; border-radius: 999px; background: var(--gris-100); color: var(--gris-500); font-size: .78rem; }
.cp-apercu-adresse i { color: var(--gris-400); font-size: .68rem; }
.cp-apercu-corps { padding: 16px 18px 18px; }
/* présentation dans l'aperçu : trois lignes au plus, l'aperçu garde sa hauteur */
.cp-apercu-page .cp-apercu .fr-description { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; margin-bottom: 12px; }
.cp-apercu { margin: 0; padding: 0; list-style: none; overflow: hidden; border: 1px solid var(--gris-200); border-radius: 16px; background: var(--ap-carte); box-shadow: 0 10px 28px -16px rgba(11, 58, 77, .35); }
/* carte dépliée sur un fond uni (sur le site elle grise au survol) */
.cp-apercu-page .cp-apercu .fr.ouvert .fr-ligne, .cp-apercu-page .cp-apercu .fr .fr-details { background: var(--ap-carte); }
.cp-apercu-page .cp-apercu .fr .fr-details { border-top: 1px solid var(--gris-100); padding-top: 14px; padding-bottom: 16px; }
.cp-apercu-page .cp-apercu .fr-appel, .cp-apercu-page .cp-apercu .fr-actions a { background: var(--ap-bouton); }
/* Itinéraire, e-mail et site sur une seule ligne : l'aperçu reste court */
.cp-apercu-page .cp-apercu .fr-actions { flex-wrap: nowrap; gap: 6px; margin-top: 14px; }
.cp-apercu-page .cp-apercu .fr-actions a { flex: none; min-height: 36px; padding: 0 12px; font-size: .82rem; }
.cp-apercu-page .cp-apercu .fr-actions a:last-child { flex: 0 1 auto; min-width: 0; }
.cp-apercu-page .cp-apercu .fr-action-texte { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* aperçu étroit (petit écran d'ordinateur) : le nom garde la place, l'appel devient une pastille ronde comme sur téléphone */
.cp-apercu { container-type: inline-size; }
.cp-apercu-page .cp-apercu .fr-chevron { display: none; }
@container (max-width: 460px) {
  .cp-apercu-page .cp-apercu .fr-appel { width: 44px; padding: 0; justify-content: center; border: 0; background: var(--lagon-600); }
  .cp-apercu-page .cp-apercu .fr-appel i { color: #fff; font-size: .9rem; }
  .cp-apercu-page .cp-apercu .fr-appel span { display: none; }
  .cp-apercu-page .cp-apercu .fr-details { padding-left: 16px; }
}

/* RIB : une colonne étroite, puis « à quoi il sert / qui le voit » */
.cp-rib { max-width: 560px; }

/* Titre de groupe avec une action à droite (aperçu : « Écrire la présentation ») */
.cp-groupe-tete { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.cp-groupe-tete h3 { margin: 0; color: var(--adm-muet); font-family: var(--font-corps); font-size: .74rem; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
.cp-groupe-tete .cp-lien-action { display: inline-flex; align-items: center; gap: 6px; margin: 0; font-size: .82rem; white-space: nowrap; }
.cp-groupe-tete .cp-lien-action i { font-size: .7rem; }

/* Fenêtre par-dessus la page, fond flouté (présentation) */
.cp-fenetre-fond {
  position: fixed; inset: 0; z-index: 300; display: grid; place-items: center; padding: 16px;
  background: rgba(15, 23, 42, .4); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); animation: cp-fondu .2s ease;
}
.cp-fenetre {
  width: min(620px, 100%); display: flex; flex-direction: column; gap: 14px; padding: 24px;
  border-radius: 24px; background: var(--adm-carte); box-shadow: 0 30px 80px rgba(2, 6, 23, .4); animation: cp-entree .25s cubic-bezier(.22, .61, .36, 1);
}
.cp-fenetre-tete { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.cp-fenetre-tete h2 { margin: 0; font-family: var(--font-corps); font-size: 1.2rem; font-weight: 700; }
.cp-fenetre-tete p { margin: 4px 0 0; color: var(--adm-muet); font-size: .86rem; }
.cp-fenetre-texte {
  width: 100%; min-height: 220px; padding: 14px 16px; border: 1px solid var(--adm-ligne); border-radius: 14px;
  background: var(--adm-champ); color: var(--adm-encre); font: inherit; font-size: .95rem; line-height: 1.6; resize: vertical;
}
.cp-fenetre-texte:focus { outline: none; border-color: var(--adm-accent); box-shadow: 0 0 0 3px var(--adm-accent-doux); }
.cp-fenetre-aide { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; color: var(--adm-muet); font-size: .8rem; line-height: 1.5; }
/* compteur : toujours sur une ligne, chiffres alignés */
.cp-fenetre-aide > span:last-child { flex: none; white-space: nowrap; font-variant-numeric: tabular-nums; }
.cp-fenetre-aide .trop { color: var(--adm-baisse); font-weight: 600; }
.cp-fenetre-pied { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
/* formulaire complet (modifier la fiche) : plus large, le contenu défile entre l'en-tête et les boutons */
.cp-fenetre-large { width: min(960px, 100%); max-height: calc(100dvh - 32px); }
.cp-fenetre-corps { min-height: 0; overflow-y: auto; overscroll-behavior: contain; margin: 0 -24px; padding: 4px 24px 8px; border-block: 1px solid var(--adm-ligne-2); }
.cp-fenetre-corps .cp-erreur { margin: 8px 0 4px; }
@keyframes cp-fondu { from { opacity: 0; } }
@keyframes cp-entree { from { opacity: 0; transform: translateY(12px) scale(.98); } }
@media (prefers-reduced-motion: reduce) { .cp-fenetre-fond, .cp-fenetre { animation: none; } }
.cp-alerte {
  display: flex; align-items: center; gap: 10px; max-width: 560px; margin: -8px 0 20px; padding: 12px 14px; border-radius: 12px;
  background: var(--adm-attention-fond); color: var(--adm-attention-texte); font-size: .88rem; font-weight: 500;
}
.cp-infos { display: flex; flex-direction: column; gap: 16px; max-width: 560px; margin: 28px 0 0; padding: 18px 0 0; border-top: 1px solid var(--adm-ligne-2); list-style: none; }
.cp-infos li { display: flex; gap: 14px; }
.cp-infos i { width: 32px; height: 32px; flex: none; display: grid; place-items: center; border-radius: 10px; background: var(--adm-ligne-2); color: var(--adm-encre-2); font-size: .82rem; }
.cp-infos span { color: var(--adm-encre-2); font-size: .86rem; line-height: 1.55; }
.cp-infos strong { display: block; margin-bottom: 2px; color: var(--adm-encre); font-size: .88rem; font-weight: 600; }
.cp-pastille { width: 8px; height: 8px; flex: none; border-radius: 50%; background: #f59e0b; }

/* Téléphone : le menu, puis le contenu choisi en plein écran avec un retour */
@media (max-width: 1100px) {
  .cp-colonnes { grid-template-columns: minmax(0, 1fr); }
  .cp-colonne + .cp-colonne { margin-top: 24px; }
}
@media (max-width: 767px) {
  .cp { grid-template-columns: minmax(0, 1fr); }
  .cp-menu { border-right: 0; padding: 14px; }
  .cp-chevron { display: inline; }
  .cp-lien.actif { background: none; }
  .cp-contenu { display: none; padding: 16px; }
  .cp-detail .cp-menu { display: none; }
  .cp-detail .cp-contenu { display: block; }
  .cp-retour {
    display: inline-flex; align-items: center; gap: 8px; margin: 0 0 14px; padding: 0; border: 0; background: none;
    color: var(--adm-accent); font: inherit; font-size: .88rem; font-weight: 600; cursor: pointer;
  }
  .cp-tete { flex-direction: column; margin-bottom: 18px; }
  .cp-tete h2 { font-size: 1.15rem; }
  .cp-lignes > div { grid-template-columns: minmax(0, 1fr); gap: 2px; }
  .cp-lignes dd > span { white-space: normal; overflow-wrap: anywhere; }
  .cp-boutons .adm-btn, .cp-tete-boutons .adm-btn { flex: 1; }
  .cp-tete-boutons { align-self: stretch; }
  .cp-champs { grid-template-columns: minmax(0, 1fr); }
  .cp-fiche-edition .cp-lignes > div { height: auto; padding: 6px 0; }
  /* fenêtre : remonte du bas de l'écran */
  .cp-fenetre-fond { place-items: end center; padding: 0; }
  .cp-fenetre { padding: 20px 16px calc(16px + env(safe-area-inset-bottom)); border-radius: 24px 24px 0 0; }
  .cp-fenetre-large { max-height: calc(100dvh - 24px); }
  .cp-fenetre-corps { margin: 0 -16px; padding: 4px 16px 8px; }
  .cp-fenetre-pied .adm-btn { flex: 1; }
}
</style>

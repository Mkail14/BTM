# BTM — Bâtiment & Travaux Mayotte

> **« Estimez gratuitement votre projet BTP en 2 minutes avec les vrais fournisseurs de Mayotte. »**

Plateforme web d'estimation de projets BTP (mur, dalle, fondation, terrasse) et annuaire des fournisseurs
de matériaux à Mayotte. Projet fil rouge — Titre professionnel **DWWM**.

Thème visuel « lagon » : turquoise, sable et corail, défilement fluide, effets parallax, transitions douces,
design épuré et 100 % responsive (mobile-first).

## Organisation du dépôt

```
webapp/
├── FRONT/     # Application Vue 3 + Vite  →  déployée sur Vercel
├── BACK/      # Backend Supabase (PostgreSQL, Auth, RLS, Edge Functions)
├── ecosystem.config.cjs   # PM2 (prévisualisation sandbox du build FRONT)
└── README.md
```

### FRONT (Vue 3 · Vite · Vercel)

```
FRONT/
├── public/                 favicon.svg, logos/ (ETPC, IBS, Batimax)
├── src/
│   ├── assets/             hero-lagon.webp / -mobile.webp / .jpg (image de fond)
│   ├── composants/
│   │   ├── commun/         EnteteApp, PiedDePage, BoutonBase, CarteBase, BandeauAvertissement, EtatVide, LogoBtm
│   │   ├── accueil/        SectionHero (parallax), CommentCaMarche, VitrineTypesProjets, FournisseursPartenaires, BandeauMayotte
│   │   ├── calculateur/    SelecteurTypeProjet, FormulaireMur/Dalle/Fondation/Terrasse, ChampDimension, ApercuProjet
│   │   ├── resultats/      ListeMateriaux, EstimationMainOeuvre, ResumeBudget, SelecteurFournisseur
│   │   ├── fournisseurs/   CarteFournisseur, FiltresFournisseurs
│   │   └── tableau-de-bord/ CarteProjet
│   ├── vues/               AccueilVue, CalculateurVue, ResultatsVue, FournisseursVue, TableauDeBordVue, AuthentificationVue, IntrouvableVue
│   ├── composables/        useCalculateur, useProjets, useAuth, useReveal
│   ├── services/
│   │   ├── calculs/        moteurCalculs + formuleMur / formuleDalle / formuleFondation / formuleTerrasse
│   │   ├── stockage/       stockageProjets (localStorage), stockageCalcul (sessionStorage)
│   │   ├── supabase/       client, serviceFournisseurs, serviceMateriaux, serviceProjets, serviceAuth
│   │   └── export/         exportPdf (jsPDF + autoTable)
│   ├── donnees/            materiaux.js, fournisseurs.js, typesProjets.js (repli hors-ligne)
│   ├── routeur/index.js
│   ├── App.vue · main.js · style.css
├── index.html · vite.config.js · vercel.json · package.json · .env.example
```

### BACK (Supabase)

Voir [`BACK/README.md`](BACK/README.md) : migrations SQL (`0001_schema_initial`, `0002_politiques_rls`),
`seed.sql` (fournisseurs, types de projets, matériaux) et Edge Function `estimation`.

## Fonctionnalités réalisées (CDC F01 → F07)

| Réf. | Fonctionnalité | État |
|---|---|---|
| F01 | Calculateur : 4 types (Mur, Dalle, Fondation, Terrasse), formulaires dédiés, validation (ER01-ER03) | ✅ |
| F02 | Estimation : matériaux, quantités, prix, sous-totaux, main-d'œuvre, livraison, total indicatif | ✅ |
| F03 | Annuaire fournisseurs (ETPC, IBS, Batimax) avec téléphone cliquable et site web | ✅ |
| F04 | Recherche (nom, commune, description) + filtre par catégorie + compteur + état vide | ✅ |
| F05 | Sauvegarde, dashboard, voir / dupliquer (dimensions modifiables) / supprimer avec confirmation | ✅ |
| F06 | Export PDF (dimensions, matériaux, MO, total, fournisseur, disclaimer) | ✅ |
| F07 | Accueil (hero, 4 étapes, 4 types, partenaires, disclaimer, footer), navigation, 404 | ✅ |
| — | Connexion / Inscription : formulaires fonctionnels, branchés sur Supabase Auth si configuré | ✅ |
| — | Synchronisation cloud des projets (table `projets` + RLS) quand l'utilisateur est connecté | ✅ |

## Pages

| URL | Nom |
|---|---|
| `/` | Accueil |
| `/calculateur?type=mur\|dalle\|fondation\|terrasse` | Calculateur |
| `/resultats` | Résultats de l'estimation |
| `/fournisseurs?q=…&categorie=…` | Annuaire fournisseurs |
| `/dashboard` | Mes projets |
| `/connexion`, `/inscription` | Authentification (Supabase) |
| `/*` | Page 404 |

## Règles de calcul (section 9 du CDC — prix provisoires)

- **Mur** : surface nette = L × H − ouvertures · parpaings = S/0,08 × 1,05 · ciment = S/2,5 sacs · sable = S/10 m³ · MO 8 h/10 m² à 15 €/h · livraison 50 €
- **Dalle** : volume = L × l × ép/100 · béton 2,4 t/m³ · ferraillage 5 kg/m² · gravier 0,8 t/m³ · MO 4 h/10 m² à 20 €/h · livraison 50 € + 20 €/t
- **Fondation** : volume = L × l × prof · béton armé 2,4 t/m³ · acier 50 kg/m³ · MO 6 h/m³ à 20 €/h · livraison 100 € + 20 €/t
- **Terrasse** : dalle + finition carrelage 50 €/m² ou béton lissé 15 €/m²

Les formules sont testées (`node` : 15 assertions ✓) et les prix unitaires sont surchargés par la table Supabase `materiaux` si elle est disponible.

## Architecture des données

- **sessionStorage** `btm:calcul-courant` — calcul en cours (type, dimensions, résultat, fournisseur)
- **localStorage** `btm:projets` — projets sauvegardés hors connexion
- **Supabase** — `fournisseurs`, `categories_fournisseurs`, `types_projets`, `materiaux` (lecture publique) ; `profils`, `projets` (RLS : propriétaire uniquement)
- Mode dégradé : sans variables `VITE_SUPABASE_*`, le front utilise les données locales de `src/donnees/`.

## Démarrage local

```bash
cd FRONT
npm install
cp .env.example .env          # renseigner VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (optionnel)
npm run dev                   # http://localhost:5173
npm run build && npm run preview
```

## Déploiement

### Front → Vercel
1. Importer le dépôt sur <https://vercel.com>, **Root Directory = `FRONT`** (framework Vite détecté, `vercel.json` gère le fallback SPA).
2. Ajouter les variables d'environnement `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
3. Déployer. Ajouter ensuite l'URL Vercel dans Supabase → Authentication → Redirect URLs.

### Back → Supabase
1. Créer un projet, exécuter `BACK/supabase/migrations/0001_schema_initial.sql`, `0002_politiques_rls.sql` puis `seed.sql` dans le SQL Editor.
2. (Optionnel) `supabase functions deploy estimation`.

- **Prévisualisation sandbox** : https://3000-isxt901nwc1ccey9i5bhx-5634da27.sandbox.novita.ai
- **Production Vercel** : à renseigner après le premier déploiement.

## Design system

- Couleurs : lagon `#06b6d4 → #0e7490`, océan `#0b3a4d`, sable `#fde68a / #f59e0b`, corail `#e11d48` (erreurs)
- Typographies : Barlow Condensed (titres), Inter (texte), JetBrains Mono (prix, nombres)
- Breakpoints : mobile < 640 px · tablette 640–900 px · desktop > 900 px
- Accessibilité : navigation clavier, `aria-invalid` / `role="alert"`, contraste ≥ 4,5:1, `prefers-reduced-motion`

## Prochaines étapes recommandées

- Vérifier les prix unitaires et formules avec les fournisseurs locaux (C04, section 9).
- Ajouter davantage de fournisseurs (Sud, Petite-Terre) et une carte interactive.
- Back-office d'administration des prix et fournisseurs (Supabase Studio ou page protégée).
- Tests unitaires Vitest sur `services/calculs` et tests E2E Playwright.

*Dernière mise à jour : 2026-09-11*

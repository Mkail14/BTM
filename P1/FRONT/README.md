# BTM — Bâtiment & Travaux Mayotte

Calculateur de matériaux de construction pour Mayotte : estimez en quelques
minutes les quantités de matériaux, la main-d'œuvre et le budget d'un projet
(mur, dalle, fondation, terrasse).

## Stack

- Vue 3 (Composition API, `<script setup>`)
- Vite
- Vue Router 4
- Aucune dépendance UI externe : design système CSS maison

## Démarrage

```bash
npm install
npm run dev
```

Puis ouvrez `http://localhost:5173`.

## Build de production

```bash
npm run build   # génère dist/
npm run preview # sert dist/ localement pour vérifier le build
```

## Structure du projet

```
src/
├── assets/                    Logo SVG
├── components/
│   ├── common/                 Header, footer, boutons, cartes, bandeaux…
│   ├── home/                   Sections de la page d'accueil
│   ├── calculator/              Sélecteur de type + 4 formulaires
│   ├── results/                 Liste matériaux, budget, main-d'œuvre
│   ├── suppliers/                Carte + filtres fournisseurs
│   ├── dashboard/                Carte projet sauvegardé
│   └── auth/                     Formulaires connexion / inscription
├── views/                       Les 7 pages (une par route)
├── router/                       Configuration Vue Router
├── data/                         Catalogues (types de projets, prix, fournisseurs)
├── services/
│   ├── calculations/             ⭐ Moteur de calcul (calculationEngine.js + formules)
│   ├── storage/                  Persistance localStorage/sessionStorage
│   ├── auth/                     Authentification mock (localStorage)
│   └── api/                      Client HTTP prêt pour un futur backend
├── composables/                  useCalculator, useProjects, useAuth
├── App.vue
├── main.js
└── style.css                     Design tokens & styles globaux
```

## Où modifier quoi

| Besoin | Fichier |
|---|---|
| Changer les couleurs / polices | `src/style.css` (bloc `:root` en haut du fichier) |
| Modifier les prix unitaires | `src/data/materials.js` |
| Ajuster une formule de calcul | `src/services/calculations/formulas/*.js` |
| Ajouter un type de projet | `src/data/projectTypes.js` + nouvelle formule + nouveau formulaire + l'enregistrer dans `calculationEngine.js` |
| Modifier l'annuaire fournisseurs | `src/data/suppliers.js` (données fictives à remplacer par une vraie API) |

## État actuel & prochaines étapes

- **Persistance** : localStorage pour les projets sauvegardés et les comptes,
  sessionStorage pour le résultat de calcul en cours. Pas de backend.
- **Authentification** : mock local (voir `src/services/auth/authService.js`),
  à remplacer par une vraie API avant toute mise en production.
- **Fournisseurs** : données fictives de démonstration.
- **Formules de calcul** : ratios BTP standards, à faire valider par un
  professionnel avant utilisation réelle — un bandeau d'avertissement est
  affiché sur les pages concernées.
- **Prochaine étape naturelle** : brancher `src/services/api/apiClient.js`
  sur un vrai backend et migrer `projectStorage.js` / `authService.js` /
  `data/suppliers.js` vers des appels API, sans changer les composants qui
  les consomment.

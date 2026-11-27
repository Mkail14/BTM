# BTM — Bâtiment & Travaux Mayotte

Estimation des matériaux d'un chantier (mur, dalle, fondation, terrasse, carrelage) et comparaison des prix des
fournisseurs de Mayotte. Le client ne paie rien : le fournisseur partenaire reverse une commission sur chaque vente
faite avec un code de retrait BTM.

Vue 3 + Vite (fichiers statiques, publiés sur GitHub Pages) ; back-end : l'API REST du dossier `../BACK`
(Node.js + Express + MariaDB, hébergée sur alwaysdata) — comptes, données, photos et pièces des dossiers.

## Démarrer

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests des calculs et des versements (vitest)
npm run build    # production → dist/
```

Créez un fichier `.env` à la racine (jamais commité) avec l'adresse de l'API :

```
VITE_API_URL=http://localhost:3001/api
```

Lancez l'API à côté (`cd ../BACK && npm run dev`). Sans cette variable, le site tourne en mode local avec les
données de `src/donnees/` (fournisseurs fictifs).

## Les trois versions du site

| Version | Où | Ce qui s'affiche |
|---|---|---|
| En ligne | btm.yt (branche `main`) | Page « Bientôt en ligne » tant qu'il y a moins de 2 fournisseurs partenaires réels (`demonstration = false`) |
| Develop | prévisualisation Vercel (branche `develop`) | Le site complet |
| Locale | `npm run dev` | Le site complet |

Pour publier `develop` sur btm.yt, fusionnez `develop` dans `main` sur GitHub. Vercel déploie ensuite `main`. L’onglet « Compte BTM → Mise en ligne » règle uniquement l’ouverture du site public ou son mode maintenance ; il ne publie pas de code.

## Organisation

- `src/services/calculs/` : formules (une par ouvrage) et moteur ; tests dans `__tests__/`.
- `src/donnees/` : types de projets, prix de référence, données de repli hors ligne.
- `src/vues/`, `src/composants/` : pages et composants (accueil, calculateur, résultats, espace fournisseur, admin).
- `src/services/api/` : un service par domaine (projets, espace fournisseur, admin…), qui appelle l'API ; `client.js`
  y joint le jeton de connexion (`Authorization: Bearer …`).
- La base de données et ses règles sont dans `../BACK/database/` (voir `../BACK/README.md`).

## Règles

- Côté client, on parle d'**estimation** (indicative, matériaux seuls), jamais de devis.
- Aucune entreprise réelle n'apparaît sur le site sans son accord : les fiches de démonstration sont fictives
  (« Fournisseur exemple A… »). Une fiche passe en `demonstration = false` seulement quand le fournisseur a signé
  et donné ses vrais prix.
- Pas de faux avis ni de fausses réalisations : seuls ceux de vrais clients sont publiés.
- Toute modification de la base passe par `../BACK/database/btm.sql`.

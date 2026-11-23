# BTM — Bâtiment & Travaux Mayotte

Estimation des matériaux d'un chantier (mur, dalle, fondation, terrasse, carrelage) et comparaison des prix des
fournisseurs de Mayotte. Le client ne paie rien : le fournisseur partenaire reverse une commission sur chaque vente
faite avec un code de retrait BTM.

Vue 3 + Vite, hébergé sur Vercel ; back-end Supabase (base Postgres, authentification, stockage des photos).

## Démarrer

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests des calculs et des versements (vitest)
npm run build    # production → dist/
```

Créez un fichier `.env.local` à la racine (jamais commité) :

```
VITE_SUPABASE_URL=https://<projet>.supabase.co
VITE_SUPABASE_ANON_KEY=<clé publique « anon »>
```

Sans ces variables, le site tourne en mode local avec les données de `src/donnees/` (fournisseurs fictifs).

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
- `supabase/` : la base de données, voir [supabase/README.md](supabase/README.md).

## Règles

- Côté client, on parle d'**estimation** (indicative, matériaux seuls), jamais de devis.
- Aucune entreprise réelle n'apparaît sur le site sans son accord : les fiches de démonstration sont fictives
  (« Fournisseur exemple A… »). Une fiche passe en `demonstration = false` seulement quand le fournisseur a signé
  et donné ses vrais prix.
- Pas de faux avis ni de fausses réalisations : seuls ceux de vrais clients sont publiés.
- Toute modification de la base passe par un fichier dans `supabase/migrations/`.

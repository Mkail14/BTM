# Base de données Supabase

- `schema.sql` : l'état complet de la base (tables, contraintes, index, fonctions, droits, RLS, déclencheurs,
  stockage, tâche planifiée). Il suffit à recréer le back-end sur un projet Supabase neuf : SQL Editor → coller → Run.
- `migrations/` : les changements datés, appliqués dans l'ordre. Un nouveau changement = un nouveau fichier
  `AAAAMMJJHHMMSS_nom.sql`, appliqué sur la base, puis reporté dans `schema.sql`.

## Recréer un projet (test ou secours)

1. Créer le projet Supabase, puis exécuter `schema.sql`.
2. Réglages hors SQL, dans le tableau de bord :
   - Authentication → Providers : e-mail (confirmation activée), Google, Apple ;
   - Authentication → URL Configuration : `https://www.btm.yt` et les adresses de prévisualisation ;
   - Authentication → Emails : modèle « mot de passe oublié » (`emails/mot-de-passe-oublie.html`) ;
   - Authentication → Settings : activer **Leaked password protection** ;
   - Vault : secrets `gemini_api_key_1`, `gemini_api_key_2`… (assistante Awa).
3. Créer le compte `contact@btm.yt` et lui donner `role = 'admin'` dans `profils`.

## Régénérer `schema.sql`

Le plus simple, avec la CLI Supabase (mot de passe de la base dans Project Settings → Database) :

```bash
npx supabase db dump --db-url "postgresql://postgres:<mot de passe>@db.<projet>.supabase.co:5432/postgres" -f supabase/schema.sql
```

## Tests de sécurité de la base

`npm run test:base` recrée la base en local (PGlite, sans connexion à Supabase) à partir de `schema.sql` et de
`migrations/`, puis joue des attaques en tant que visiteur, client, fournisseur et admin : lecture des données d'un
autre compte, élévation de rôle, faux statut pro, devinette des codes de retrait, encaissement à un faux prix,
photo externe, rafales de devis, de fichiers et de messages. Toute nouvelle migration doit garder ces tests au vert.
Ils ne remplacent pas un test sur la vraie base : Auth, Storage et les fonctions Edge y sont simulés.

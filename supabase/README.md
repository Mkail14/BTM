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
   - Edge Functions → Secrets : `AWA_SECRET` (son empreinte SHA-256 est dans la table `awa_partner_keys` de BTM AI ; `AWA_URL` facultatif, défaut `https://btm-ai.vercel.app/api/awa`) : l’assistante Tamilya est celle de BTM AI.
   - Devis faits dans Tamilya (BTM AI) : secret `TAMILYA_SECRET` (même valeur que `BTM_DEVIS_SECRET` de BTM AI), puis
     `npx supabase functions deploy devis-tamilya --no-verify-jwt`. Le devis rejoint « Mes projets » du compte btm.yt
     de même adresse e-mail et Tamilya affiche le code de retrait.
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

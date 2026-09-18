# BTM — Backend (Supabase)

Tout le backend de BTM repose sur **Supabase** : base PostgreSQL, authentification,
sécurité RLS et Edge Functions. Aucun serveur à maintenir.

## Structure

```
BACK/
├── supabase/
│   ├── config.toml                    # Config CLI Supabase (local + auth)
│   ├── migrations/
│   │   ├── 0001_schema_initial.sql    # Tables : fournisseurs, types_projets, materiaux, profils, projets
│   │   └── 0002_politiques_rls.sql    # RLS + fonction RPC rechercher_fournisseurs()
│   ├── seed.sql                       # Données de référence (3 fournisseurs, 4 types, 10 matériaux)
│   └── functions/
│       └── estimation/index.ts        # Edge Function : recalcul serveur d'une estimation
├── .env.example
├── package.json
└── README.md
```

## Modèle de données

| Table | Rôle | Accès |
|---|---|---|
| `categories_fournisseurs` | Catégories de l'annuaire | Lecture publique |
| `fournisseurs` | Annuaire BTP Mayotte (ETPC, IBS, Batimax…) + recherche plein texte | Lecture publique |
| `types_projets` | Mur, Dalle, Fondation, Terrasse + constantes de calcul (JSONB) | Lecture publique |
| `materiaux` | Prix unitaires provisoires | Lecture publique |
| `profils` | Profil lié à `auth.users` (créé par trigger) | Propriétaire |
| `projets` | Estimations sauvegardées (dimensions + résultat JSONB) | Propriétaire (CRUD) |

## Mise en route

### Option A — Dashboard Supabase (le plus simple)
1. Créer un projet sur <https://supabase.com>.
2. Ouvrir **SQL Editor** et exécuter dans l'ordre :
   `migrations/0001_schema_initial.sql` → `migrations/0002_politiques_rls.sql` → `seed.sql`.
3. **Project Settings → API** : copier `Project URL` et `anon public key` dans
   `FRONT/.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
4. **Authentication → URL Configuration** : ajouter l'URL Vercel du front dans *Redirect URLs*.

### Option B — CLI Supabase
```bash
cd BACK
npm install
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push            # applique les migrations
npx supabase db query --linked -f supabase/seed.sql
npx supabase functions deploy estimation
```

## Edge Function `estimation`
`POST https://<ref>.supabase.co/functions/v1/estimation`
```json
{ "type": "mur", "dimensions": { "longueur": 10, "hauteur": 2.5, "ouvertures": 3 } }
```
Renvoie matériaux, main-d'œuvre, livraison et total calculés avec les prix en base.

## Sécurité
- Seule la clé **anon** est exposée côté front ; la RLS protège les données.
- La clé `service_role` ne doit **jamais** quitter le dashboard / les secrets CI.

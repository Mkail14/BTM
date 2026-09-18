# Guide d’intégration Supabase + authentification BTM

Ce document complète la logique déjà présente dans [BACK/README.md](BACK/README.md), [BACK/supabase/migrations/0001_schema_initial.sql](BACK/supabase/migrations/0001_schema_initial.sql) et [BACK/supabase/migrations/0002_politiques_rls.sql](BACK/supabase/migrations/0002_politiques_rls.sql).

Le backend est déjà bien préparé pour Supabase, mais il manque encore l’étape d’administration des rôles et la configuration de l’authentification côté Supabase.

## 1) Préparer le projet Supabase

### 1.1. Créer le projet
1. Aller sur https://supabase.com
2. Créer un nouveau projet
3. Prendre les valeurs suivantes dans le dashboard :
   - Project URL
   - anon public key
   - service_role secret key (à garder uniquement côté serveur / secrets)

### 1.2. Variables d’environnement
Dans le dossier BACK, créer un fichier `.env` avec les valeurs du projet :

```bash
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SUPABASE_SERVICE_ROLE_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SUPABASE_PROJECT_REF=xxxxxxxxxxxxxxxxxxxx
SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> Le fichier `.env` ne doit jamais être commit.

### 1.3. Brancher le front
Dans le front, ajouter dans le fichier `.env` de Vite :

```bash
VITE_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Le client front existant est déjà prêt dans [FRONT/src/services/supabase/client.js](FRONT/src/services/supabase/client.js).

---

## 2) Appliquer le schéma existant

Dans le dashboard Supabase :

1. Ouvrir l’éditeur SQL
2. Exécuter dans l’ordre :
   - [BACK/supabase/migrations/0001_schema_initial.sql](BACK/supabase/migrations/0001_schema_initial.sql)
   - [BACK/supabase/migrations/0002_politiques_rls.sql](BACK/supabase/migrations/0002_politiques_rls.sql)
   - [BACK/supabase/seed.sql](BACK/supabase/seed.sql)

Ou via CLI :

```bash
cd BACK
npm install
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push
npx supabase db query --linked -f supabase/seed.sql
```

---

## 3) Configurer l’authentification Supabase

### 3.1. Activer l’email/password
Dans le dashboard Supabase :

- Authentication > Providers
- Activer Email
- Vérifier que l’option sign up avec email est active

### 3.2. Ajouter les URLs de redirection
Dans :

- Authentication > URL Configuration

Ajouter :

```text
http://localhost:5173
http://localhost:5173/auth
https://votre-domain.vercel.app
https://votre-domain.vercel.app/auth
```

### 3.3. Paramètres recommandés
- Email confirmation : facultative pour un MVP
- Password policy : au moins 8 caractères
- Session persistence : activée par défaut dans le client front

---

## 4) Rôles applicatifs : utilisateur, fournisseur, admin

Le schéma actuel contient déjà une table de profil avec un type :

```sql
type_profil text not null default 'particulier'
check (type_profil in ('particulier', 'professionnel', 'fournisseur'))
```

Cela couvre bien :
- particulier / professionnel = utilisateur classique
- fournisseur = fournisseur

Le point manquant est l’admin.

### 4.1. Ajouter le rôle admin proprement
Il est recommandé de ne pas seulement dépendre de `type_profil`, mais d’ajouter une colonne `role` dédiée pour sécuriser les permissions.

Exemple SQL :

```sql
alter table public.profils
  add column if not exists role text not null default 'user'
  check (role in ('user', 'fournisseur', 'admin'));
```

Ensuite, la logic de déduction peut être :
- `user` = client / particulier / professionnel
- `fournisseur` = fournisseur d’annuaire
- `admin` = gestion du back-office / validation / modération

### 4.2. Mettre à jour les profils existants

```sql
update public.profils
set role = case
  when type_profil = 'fournisseur' then 'fournisseur'
  when type_profil in ('particulier', 'professionnel') then 'user'
  else 'user'
end
where role is null or role = 'user';
```

### 4.3. Définir le rôle lors d’une inscription
Le plus propre est d’utiliser `raw_user_meta_data` ou `app_metadata` au moment de l’inscription.

Exemple côté front ou backend :

```js
const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    data: {
      role: 'user'
    }
  }
})
```

Ensuite, un trigger peut recopier ce rôle dans `public.profils` :

```sql
create or replace function public.set_role_from_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profils
  set role = coalesce(new.raw_user_meta_data->>'role', role)
  where id = new.id;
  return new;
end;
$$;

create trigger trg_set_role_from_metadata
after update on auth.users
for each row
execute function public.set_role_from_metadata();
```

---

## 5) RLS par rôle

Le fichier [BACK/supabase/migrations/0002_politiques_rls.sql](BACK/supabase/migrations/0002_politiques_rls.sql) protège déjà les projets et les profils de l’utilisateur propriétaire.

Il faut maintenant ajouter les règles pour l’admin.

### 5.1. Profil : un utilisateur voit son profil, l’admin voit tous les profils
```sql
create policy "profils : lecture admin"
on public.profils for select
to authenticated
using (
  exists (
    select 1 from public.profils p
    where p.id = auth.uid() and p.role = 'admin'
  )
  or auth.uid() = id
);
```

### 5.2. Projets : l’admin voit tous les projets
```sql
create policy "projets : lecture admin"
on public.projets for select
to authenticated
using (
  exists (
    select 1 from public.profils p
    where p.id = auth.uid() and p.role = 'admin'
  )
  or auth.uid() = utilisateur_id
);
```

### 5.3. Fournisseurs : lecture publique, écriture admin uniquement
```sql
create policy "fournisseurs : ecriture admin"
on public.fournisseurs for insert
to authenticated
with check (
  exists (
    select 1 from public.profils p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

create policy "fournisseurs : mise a jour admin"
on public.fournisseurs for update
to authenticated
using (
  exists (
    select 1 from public.profils p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profils p
    where p.id = auth.uid() and p.role = 'admin'
  )
);
```

---

## 6) Sécurité recommandée

### 6.1. Rôle utilisateur
- Peut s’inscrire
- Peut se connecter
- Peut gérer ses propres projets
- Peut modifier son propre profil

### 6.2. Rôle fournisseur
- Peut voir l’annuaire / les catalogues
- Peut se connecter à un espace fournisseur si nécessaire
- Peut modifier uniquement ses propres informations fournisseur

### 6.3. Rôle admin
- Peut gérer les fournisseurs
- Peut consulter tous les projets
- Peut modifier les données de référence
- Peut valider les comptes fournisseur

> Important : la clé `service_role` ne doit pas être exposée au front. Elle est uniquement pour le backend / Supabase Edge Functions / scripts d’administration.

---

## 7) Exemple de flux d’authentification côté front

Le code existant dans [FRONT/src/services/supabase/serviceAuth.js](FRONT/src/services/supabase/serviceAuth.js) contient déjà :
- `connexion(email, motDePasse)`
- `inscription(email, motDePasse)`
- `deconnexion()`
- `utilisateurCourant()`

Il faut compléter avec :

```js
const { data: { user }, error } = await supabase.auth.signUp({
  email,
  password,
  options: { data: { role: 'user' } }
})
```

Puis, côté app :

```js
const { data: { user } } = await supabase.auth.getUser()
const { data: profile } = await supabase
  .from('profils')
  .select('*')
  .eq('id', user.id)
  .single()
```

Et selon le rôle :

```js
if (profile.role === 'admin') {
  // accès admin
} else if (profile.role === 'fournisseur') {
  // accès fournisseur
} else {
  // accès utilisateur
}
```

---

## 8) Ce qu’il faut faire maintenant dans le projet

### Étape 1 — Supabase Dashboard
- Créer le projet
- Activer Email Auth
- Ajouter les redirections
- Appliquer les migrations SQL

### Étape 2 — Sécurité
- Ajouter la colonne `role` dans `public.profils`
- Ajouter les policies admin
- Vérifier que les fournisseurs et les projets sont correctement sécurisés

### Étape 3 — Front
- Vérifier les variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`
- Vérifier les appels de `supabase.auth` dans [FRONT/src/services/supabase/serviceAuth.js](FRONT/src/services/supabase/serviceAuth.js)
- Gérer le niveau d’accès par rôle dans le front

### Étape 4 — Admin
- Créer un compte d’admin dans Supabase Auth
- Mettre sa ligne dans `public.profils` avec `role = 'admin'`
- Tester les accès admin

### Étape 5 — Fournisseur
- Créer un compte fournisseur
- Mettre `role = 'fournisseur'`
- Vérifier qu’il a uniquement les permissions du fournisseur

---

## 9) Recommandation finale

Le backend actuel est déjà bien aligné avec une architecture Supabase moderne :
- base PostgreSQL
- Auth native
- RLS
- Edge Function
- profil utilisateur automatique

Le seul vrai point à compléter pour ton besoin métier est :
1. ajouter explicitement le rôle `admin`
2. sécuriser les politiques RLS par rôle
3. exposer les bonnes infos côté front selon le rôle connecté

Si tu veux, je peux maintenant te faire la suite en 2 parties :
1. la migration SQL exacte à copier dans Supabase pour ajouter `admin` proprement
2. le code front final pour rediriger automatiquement selon le rôle `user`, `fournisseur` et `admin`.

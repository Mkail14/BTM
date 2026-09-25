-- Script de réparation de la base distante : à coller dans Supabase > SQL Editor.
-- Généré à partir de 0001 + 0002 + seed + 0003 + 0004 (tout est idempotent, ré-exécutable sans risque).

-- >>> 0001_schema_initial.sql
-- =============================================================================
-- BTM — Bâtiment & Travaux Mayotte
-- Migration 0001 : schéma initial (Supabase / PostgreSQL)
-- =============================================================================
-- Tables :
--   categories_fournisseurs  : catégories de l'annuaire (Béton & granulats, ...)
--   fournisseurs             : annuaire BTP de Mayotte (F03 / F04)
--   types_projets            : Mur, Dalle, Fondation, Terrasse (BF01)
--   materiaux                : prix unitaires provisoires (section 9 du CDC)
--   profils                  : profil public lié à auth.users
--   projets                  : estimations sauvegardées par l'utilisateur (F05)
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Fonction utilitaire : mise à jour automatique de la colonne "mis_a_jour_le"
-- -----------------------------------------------------------------------------
create or replace function public.maj_horodatage()
returns trigger
language plpgsql
as $$
begin
  new.mis_a_jour_le = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Catégories de fournisseurs
-- -----------------------------------------------------------------------------
create table if not exists public.categories_fournisseurs (
  id          text primary key,                 -- ex: 'beton-granulats'
  libelle     text not null,                    -- ex: 'Béton & granulats'
  icone       text,                             -- classe Font Awesome
  ordre       int  not null default 0
);

-- -----------------------------------------------------------------------------
-- Fournisseurs (section 11 du CDC)
-- -----------------------------------------------------------------------------
create table if not exists public.fournisseurs (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  nom             text not null,
  categorie_id    text not null references public.categories_fournisseurs(id),
  commune         text not null,
  adresse         text,
  telephone       text not null,
  email           text,
  site_web        text,
  description     text,
  livraison       boolean not null default false,
  horaires        text,
  logo_url        text,
  latitude        numeric(9,6),
  longitude       numeric(9,6),
  actif           boolean not null default true,
  cree_le         timestamptz not null default now(),
  mis_a_jour_le   timestamptz not null default now()
);

create index if not exists idx_fournisseurs_categorie on public.fournisseurs(categorie_id);
create index if not exists idx_fournisseurs_commune   on public.fournisseurs(lower(commune));

-- Recherche plein texte (nom + commune + description) — BF18/19/20
alter table public.fournisseurs
  add column if not exists recherche tsvector
  generated always as (
    to_tsvector('french',
      coalesce(nom, '') || ' ' || coalesce(commune, '') || ' ' || coalesce(description, ''))
  ) stored;

create index if not exists idx_fournisseurs_recherche on public.fournisseurs using gin(recherche);

drop trigger if exists trg_fournisseurs_maj on public.fournisseurs;
create trigger trg_fournisseurs_maj
  before update on public.fournisseurs
  for each row execute function public.maj_horodatage();

-- -----------------------------------------------------------------------------
-- Types de projets (BF01)
-- -----------------------------------------------------------------------------
create table if not exists public.types_projets (
  id           text primary key,                -- 'mur' | 'dalle' | 'fondation' | 'terrasse'
  libelle      text not null,
  description  text,
  icone        text,
  ordre        int not null default 0,
  parametres   jsonb not null default '{}'::jsonb   -- constantes de calcul (section 9)
);

-- -----------------------------------------------------------------------------
-- Matériaux et prix unitaires provisoires (section 9)
-- -----------------------------------------------------------------------------
create table if not exists public.materiaux (
  id             text primary key,              -- 'parpaing', 'ciment', ...
  libelle        text not null,
  unite          text not null,                 -- 'u', 'sac', 'm³', 't', 'kg', 'm²'
  prix_unitaire  numeric(10,2) not null check (prix_unitaire >= 0),
  devise         text not null default 'EUR',
  source         text,                          -- provenance du prix
  mis_a_jour_le  timestamptz not null default now()
);

drop trigger if exists trg_materiaux_maj on public.materiaux;
create trigger trg_materiaux_maj
  before update on public.materiaux
  for each row execute function public.maj_horodatage();

-- -----------------------------------------------------------------------------
-- Profils utilisateurs (liés à auth.users)
-- -----------------------------------------------------------------------------
create table if not exists public.profils (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  nom_affiche   text,
  type_profil   text not null default 'particulier'
                check (type_profil in ('particulier', 'professionnel', 'fournisseur')),
  cree_le       timestamptz not null default now()
);

-- Création automatique du profil à l'inscription
create or replace function public.creer_profil_utilisateur()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profils (id, email, nom_affiche)
  values (new.id, new.email, split_part(coalesce(new.email, ''), '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_nouvel_utilisateur on auth.users;
create trigger trg_nouvel_utilisateur
  after insert on auth.users
  for each row execute function public.creer_profil_utilisateur();

-- -----------------------------------------------------------------------------
-- Projets sauvegardés (F05) — synchronisation cloud des estimations
-- -----------------------------------------------------------------------------
create table if not exists public.projets (
  id               uuid primary key default gen_random_uuid(),
  utilisateur_id   uuid not null references auth.users(id) on delete cascade,
  nom              text not null check (char_length(nom) between 1 and 120),
  type_projet_id   text not null references public.types_projets(id),
  dimensions       jsonb not null,               -- saisies utilisateur
  resultat         jsonb not null,               -- estimation complète (matériaux, MO, total)
  fournisseur_id   uuid references public.fournisseurs(id) on delete set null,
  cout_total       numeric(12,2) not null default 0,
  cree_le          timestamptz not null default now(),
  mis_a_jour_le    timestamptz not null default now()
);

create index if not exists idx_projets_utilisateur on public.projets(utilisateur_id, cree_le desc);

drop trigger if exists trg_projets_maj on public.projets;
create trigger trg_projets_maj
  before update on public.projets
  for each row execute function public.maj_horodatage();

-- >>> 0002_politiques_rls.sql
-- =============================================================================
-- BTM — Migration 0002 : sécurité Row Level Security (RLS)
-- =============================================================================
-- Principe :
--   * Données de référence (fournisseurs, catégories, types, matériaux)
--     => lecture publique (anon + authenticated), écriture réservée au service_role.
--   * Projets et profils => chaque utilisateur ne voit / modifie que ses propres lignes.
-- =============================================================================

alter table public.categories_fournisseurs enable row level security;
alter table public.fournisseurs            enable row level security;
alter table public.types_projets           enable row level security;
alter table public.materiaux               enable row level security;
alter table public.profils                 enable row level security;
alter table public.projets                 enable row level security;

-- ---------- Lecture publique des données de référence -------------------------
drop policy if exists "lecture publique categories" on public.categories_fournisseurs;
create policy "lecture publique categories"
  on public.categories_fournisseurs for select
  to anon, authenticated using (true);

drop policy if exists "lecture publique fournisseurs actifs" on public.fournisseurs;
create policy "lecture publique fournisseurs actifs"
  on public.fournisseurs for select
  to anon, authenticated using (actif = true);

drop policy if exists "lecture publique types projets" on public.types_projets;
create policy "lecture publique types projets"
  on public.types_projets for select
  to anon, authenticated using (true);

drop policy if exists "lecture publique materiaux" on public.materiaux;
create policy "lecture publique materiaux"
  on public.materiaux for select
  to anon, authenticated using (true);

-- ---------- Profils : chacun gère le sien --------------------------------------
drop policy if exists "profil : lecture proprietaire" on public.profils;
create policy "profil : lecture proprietaire"
  on public.profils for select
  to authenticated using (auth.uid() = id);

drop policy if exists "profil : mise a jour proprietaire" on public.profils;
create policy "profil : mise a jour proprietaire"
  on public.profils for update
  to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- ---------- Projets : CRUD limité au propriétaire ------------------------------
drop policy if exists "projets : lecture proprietaire" on public.projets;
create policy "projets : lecture proprietaire"
  on public.projets for select
  to authenticated using (auth.uid() = utilisateur_id);

drop policy if exists "projets : insertion proprietaire" on public.projets;
create policy "projets : insertion proprietaire"
  on public.projets for insert
  to authenticated with check (auth.uid() = utilisateur_id);

drop policy if exists "projets : mise a jour proprietaire" on public.projets;
create policy "projets : mise a jour proprietaire"
  on public.projets for update
  to authenticated using (auth.uid() = utilisateur_id) with check (auth.uid() = utilisateur_id);

drop policy if exists "projets : suppression proprietaire" on public.projets;
create policy "projets : suppression proprietaire"
  on public.projets for delete
  to authenticated using (auth.uid() = utilisateur_id);

-- ---------- Fonction RPC : recherche fournisseurs (BF18-BF21) ------------------
create or replace function public.rechercher_fournisseurs(
  terme      text default null,
  categorie  text default null
)
returns setof public.fournisseurs
language sql
stable
security invoker
as $$
  select f.*
  from public.fournisseurs f
  where f.actif
    and (categorie is null or categorie = '' or f.categorie_id = categorie)
    and (
      terme is null or terme = ''
      or f.recherche @@ plainto_tsquery('french', terme)
      or f.nom ilike '%' || terme || '%'
      or f.commune ilike '%' || terme || '%'
      or coalesce(f.description, '') ilike '%' || terme || '%'
    )
  order by f.nom;
$$;

grant execute on function public.rechercher_fournisseurs(text, text) to anon, authenticated;

-- >>> seed.sql
-- =============================================================================
-- BTM — Données de référence (seed)
-- Exécuter après les migrations : supabase db reset  OU  copier dans l'éditeur SQL
-- =============================================================================

-- ---------- Catégories --------------------------------------------------------
insert into public.categories_fournisseurs (id, libelle, icone, ordre) values
  ('beton-granulats',    'Béton & granulats',    'fa-solid fa-cubes',        1),
  ('materiaux-generaux', 'Matériaux généraux',   'fa-solid fa-warehouse',    2),
  ('fer-acier',          'Fer & acier',          'fa-solid fa-bars',         3),
  ('carrelage-finition', 'Carrelage & finitions','fa-solid fa-border-all',   4)
on conflict (id) do update set libelle = excluded.libelle, icone = excluded.icone, ordre = excluded.ordre;

-- ---------- Fournisseurs (section 11 du CDC) ----------------------------------
insert into public.fournisseurs
  (slug, nom, categorie_id, commune, adresse, telephone, site_web, description, livraison, horaires, latitude, longitude)
values
  ('etpc', 'ETPC', 'beton-granulats', 'Koungou',
   'ZI de Longoni, 97600 Koungou', '0269 62 04 82', 'https://etpc.yt',
   'Producteur de béton prêt à l''emploi, granulats et sables à Mayotte. Centrale à béton à Longoni, livraison sur toute l''île.',
   true, 'Lun–Ven 6h30–15h30, Sam 6h30–11h30', -12.7245, 45.1861),

  ('ibs', 'IBS', 'beton-granulats', 'Koungou',
   'Route nationale, Kawéni – Koungou, 97600', '0269 61 15 50', 'https://ibs-groupe.fr',
   'Béton, agrégats et matériaux de construction. Livraison par toupie et camion benne sur Grande-Terre.',
   true, 'Lun–Ven 7h00–16h00', -12.7580, 45.2200),

  ('batimax', 'Batimax', 'materiaux-generaux', 'Mamoudzou',
   'Kawéni, 97600 Mamoudzou', '0269 61 12 11', 'https://batimax-mayotte.com',
   'Négoce de matériaux généraux : parpaings, ciment, fer à béton, carrelage, outillage et quincaillerie du bâtiment.',
   true, 'Lun–Sam 7h30–17h00', -12.7729, 45.2296)
on conflict (slug) do update set
  nom = excluded.nom, categorie_id = excluded.categorie_id, commune = excluded.commune,
  adresse = excluded.adresse, telephone = excluded.telephone, site_web = excluded.site_web,
  description = excluded.description, livraison = excluded.livraison, horaires = excluded.horaires;

-- ---------- Types de projets (section 9) --------------------------------------
insert into public.types_projets (id, libelle, description, icone, ordre, parametres) values
  ('mur', 'Mur', 'Mur en parpaings 20×20×40 cm, avec ouvertures.', 'fa-solid fa-building', 1,
   '{"surfaceParpaing":0.08,"margeParpaing":1.05,"m2ParSacCiment":2.5,"m2ParM3Sable":10,"heuresPour10m2":8,"tauxHoraire":15,"livraisonFixe":50}'),
  ('dalle', 'Dalle', 'Dalle béton armée sur hérisson de gravier.', 'fa-solid fa-layer-group', 2,
   '{"densiteBeton":2.4,"kgFerParM2":5,"tonnesGravierParM3":0.8,"heuresPour10m2":4,"tauxHoraire":20,"livraisonFixe":50,"livraisonParTonne":20}'),
  ('fondation', 'Fondation', 'Semelles filantes en béton armé.', 'fa-solid fa-mountain', 3,
   '{"densiteBeton":2.4,"kgAcierParM3":50,"heuresParM3":6,"tauxHoraire":20,"livraisonFixe":100,"livraisonParTonne":20}'),
  ('terrasse', 'Terrasse', 'Dalle extérieure avec finition carrelage ou béton lissé.', 'fa-solid fa-umbrella-beach', 4,
   '{"densiteBeton":2.4,"kgFerParM2":5,"tonnesGravierParM3":0.8,"heuresPour10m2":4,"tauxHoraire":20,"livraisonFixe":50,"livraisonParTonne":20,"finitions":{"carrelage":50,"beton_lisse":15}}')
on conflict (id) do update set libelle = excluded.libelle, description = excluded.description,
  icone = excluded.icone, ordre = excluded.ordre, parametres = excluded.parametres;

-- ---------- Matériaux et prix unitaires provisoires ---------------------------
insert into public.materiaux (id, libelle, unite, prix_unitaire, source) values
  ('parpaing',    'Parpaing 20×20×40 cm',        'u',   1.90,   'Prix provisoire – à vérifier fournisseurs'),
  ('ciment',      'Ciment gris (sac 35 kg)',      'sac', 12.50,  'Prix provisoire – à vérifier fournisseurs'),
  ('sable',       'Sable de construction',        'm³',  95.00,  'Prix provisoire – à vérifier fournisseurs'),
  ('beton',       'Béton prêt à l''emploi',       't',   145.00, 'Prix provisoire – à vérifier fournisseurs'),
  ('beton_arme',  'Béton armé (fondations)',      't',   155.00, 'Prix provisoire – à vérifier fournisseurs'),
  ('ferraillage', 'Treillis soudé / ferraillage', 'kg',  2.20,   'Prix provisoire – à vérifier fournisseurs'),
  ('acier',       'Armatures acier HA',           'kg',  2.60,   'Prix provisoire – à vérifier fournisseurs'),
  ('gravier',     'Gravier concassé',             't',   85.00,  'Prix provisoire – à vérifier fournisseurs'),
  ('carrelage',   'Carrelage extérieur posé',     'm²',  50.00,  'Section 9.4 du CDC'),
  ('beton_lisse', 'Finition béton lissé',         'm²',  15.00,  'Section 9.4 du CDC')
on conflict (id) do update set libelle = excluded.libelle, unite = excluded.unite,
  prix_unitaire = excluded.prix_unitaire, source = excluded.source;

-- >>> 0003_droits_api.sql
-- =============================================================================
-- BTM — Migration 0003 : droits d'accès API et clés étrangères de projets
-- =============================================================================
-- Les projets Supabase récents n'exposent plus automatiquement les tables créées
-- en SQL aux rôles anon / authenticated : sans ces GRANT, l'API renvoie
-- « permission denied » même si les politiques RLS sont correctes.
-- =============================================================================

grant usage on schema public to anon, authenticated;

grant select on public.categories_fournisseurs, public.fournisseurs, public.types_projets, public.materiaux
  to anon, authenticated;
grant select, update on public.profils to authenticated;
grant select, insert, update, delete on public.projets to authenticated;

-- Si la table projets existait avant les tables de référence, ses clés étrangères manquent
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projets_type_projet_id_fkey') then
    alter table public.projets
      add constraint projets_type_projet_id_fkey foreign key (type_projet_id) references public.types_projets(id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projets_fournisseur_id_fkey') then
    alter table public.projets
      add constraint projets_fournisseur_id_fkey foreign key (fournisseur_id) references public.fournisseurs(id) on delete set null not valid;
  end if;
end $$;

-- Recharge le cache de schéma de l'API (tables nouvellement créées)
notify pgrst, 'reload schema';

-- >>> 0004_role_admin.sql
-- =============================================================================
-- BTM — Migration 0004 : rôle admin sans récursion RLS
-- =============================================================================
-- Une politique sur `profils` qui interroge `profils` (exists (select … from profils))
-- provoque « infinite recursion detected in policy for relation "profils" »,
-- et toute table dont la politique lit `profils` (projets, fournisseurs) échoue aussi.
-- Solution : la vérification passe par une fonction SECURITY DEFINER, qui lit
-- `profils` avec les droits du propriétaire, donc sans réappliquer la RLS.
-- =============================================================================

alter table public.profils
  add column if not exists role text not null default 'user'
  check (role in ('user', 'fournisseur', 'admin'));

create or replace function public.est_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profils where id = auth.uid() and role = 'admin');
$$;

revoke execute on function public.est_admin() from public, anon;
grant execute on function public.est_admin() to authenticated;

-- Supprime toutes les politiques qui lisent `profils` directement (quel que soit leur nom)
do $$
declare
  p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ilike '%profils%' or coalesce(with_check, '') ilike '%profils%')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- ---------- Profils et projets : l'admin voit tout -----------------------------
drop policy if exists "profils : lecture admin" on public.profils;
create policy "profils : lecture admin"
  on public.profils for select
  to authenticated using (public.est_admin());

drop policy if exists "projets : lecture admin" on public.projets;
create policy "projets : lecture admin"
  on public.projets for select
  to authenticated using (public.est_admin());

-- ---------- Fournisseurs : écriture réservée à l'admin -------------------------
grant insert, update, delete on public.fournisseurs to authenticated;

drop policy if exists "fournisseurs : ecriture admin" on public.fournisseurs;
create policy "fournisseurs : ecriture admin"
  on public.fournisseurs for insert
  to authenticated with check (public.est_admin());

drop policy if exists "fournisseurs : mise a jour admin" on public.fournisseurs;
create policy "fournisseurs : mise a jour admin"
  on public.fournisseurs for update
  to authenticated using (public.est_admin()) with check (public.est_admin());

drop policy if exists "fournisseurs : suppression admin" on public.fournisseurs;
create policy "fournisseurs : suppression admin"
  on public.fournisseurs for delete
  to authenticated using (public.est_admin());

-- Les politiques « propriétaire » de 0002 (auth.uid() = id / utilisateur_id) restent en place :
-- plusieurs politiques permissives se cumulent (OU logique).

notify pgrst, 'reload schema';

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

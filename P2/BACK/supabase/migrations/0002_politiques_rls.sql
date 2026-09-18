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

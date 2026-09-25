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

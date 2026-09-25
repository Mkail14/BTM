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

-- =============================================================================
-- BTM — Migration 0024 : avis Google + modification de son avis
-- =============================================================================
--   * source : 'site' (publié par un utilisateur connecté) ou 'google' (recopié par l'admin depuis la fiche Google,
--     avec le lien vers l'avis d'origine). La page d'accueil affiche les avis Google dans une colonne à part.
--   * Un utilisateur peut modifier son propre avis (note, ville, commentaire) ; la date de modification est gardée.
--     Un déclencheur empêche l'auteur de toucher au reste (visibilité décidée par l'admin, nom, source…).
-- =============================================================================

alter table public.avis add column if not exists source text not null default 'site' check (source in ('site', 'google'));
alter table public.avis add column if not exists lien text check (lien is null or (char_length(lien) <= 500 and lien ~* '^https://'));
alter table public.avis add column if not exists modifie_le timestamptz;

-- Les avis Google peuvent être plus longs que ceux du site
alter table public.avis drop constraint if exists avis_commentaire_check;
alter table public.avis add constraint avis_commentaire_check
  check (char_length(commentaire) <= case when source = 'google' then 1500 else 300 end);

-- ---------- Publication ----------------------------------------------------------
-- Un utilisateur ne publie que des avis « site », à son nom
drop policy if exists "avis : publication par le proprietaire" on public.avis;
create policy "avis : publication par le proprietaire"
  on public.avis for insert
  to authenticated with check (auth.uid() = utilisateur_id and demo = false and source = 'site');

-- L'admin ajoute les avis Google (sans compte associé)
drop policy if exists "avis google : ajout admin" on public.avis;
create policy "avis google : ajout admin"
  on public.avis for insert
  to authenticated with check (public.est_admin() and source = 'google' and utilisateur_id is null and demo = false);

-- ---------- Modification ---------------------------------------------------------
drop policy if exists "avis : modification proprietaire" on public.avis;
create policy "avis : modification proprietaire"
  on public.avis for update
  to authenticated using (auth.uid() = utilisateur_id) with check (auth.uid() = utilisateur_id);

grant update (visible, nom, ville, note, commentaire, lien, modifie_le, cree_le) on public.avis to authenticated;

-- L'auteur ne change que sa note, sa ville et son commentaire ; tout le reste est rétabli.
create or replace function public.avis_proteger_modification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.est_admin() then
    new.visible := old.visible;
    new.nom := old.nom;
    new.lien := old.lien;
    new.cree_le := old.cree_le;
  end if;
  new.source := old.source;
  new.utilisateur_id := old.utilisateur_id;
  new.demo := old.demo;
  if (new.note, new.ville, new.commentaire) is distinct from (old.note, old.ville, old.commentaire) then
    new.modifie_le := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_avis_proteger on public.avis;
create trigger trg_avis_proteger
  before update on public.avis
  for each row execute function public.avis_proteger_modification();

create index if not exists idx_avis_source on public.avis(source, cree_le desc);

notify pgrst, 'reload schema';

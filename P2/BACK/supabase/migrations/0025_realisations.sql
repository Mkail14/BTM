-- =============================================================================
-- BTM — Migration 0025 : réalisations (projets d'utilisateurs affichés sur l'accueil)
-- =============================================================================
--   Circuit : l'admin PROPOSE à un utilisateur de mettre en ligne l'un de ses projets
--             → l'utilisateur ajoute une photo et ses infos puis ENVOIE (ou décline)
--             → l'admin VALIDE : la réalisation s'affiche sur la page d'accueil.
--   L'admin peut aussi créer et modifier directement une réalisation (infos + photo).
--   10 réalisations en ligne au maximum : en publier une 11e supprime la plus ancienne
--   (publier_realisation renvoie les photos à effacer du stockage).
--   Photos : stockage Supabase, compartiment public « realisations » (dossier = id de l'utilisateur, ou « admin »).
-- =============================================================================

create table if not exists public.realisations (
  id              uuid primary key default gen_random_uuid(),
  utilisateur_id  uuid references auth.users(id) on delete cascade,      -- null : réalisation saisie par l'admin
  projet_id       uuid references public.projets(id) on delete set null,
  statut          text not null default 'proposee'
                  check (statut in ('proposee', 'soumise', 'publiee', 'refusee', 'declinee')),
  titre           text not null default '' check (char_length(titre) <= 80),
  type_projet     text check (type_projet is null or char_length(type_projet) <= 40),
  auteur          text not null default '' check (char_length(auteur) <= 60),   -- nom affiché : « Amina M. »
  commune         text not null default '' check (char_length(commune) <= 60),
  quartier        text check (quartier is null or char_length(quartier) <= 60),
  fournisseur_id  uuid references public.fournisseurs(id) on delete set null,
  fournisseur_nom text check (fournisseur_nom is null or char_length(fournisseur_nom) <= 80),
  detail          text check (detail is null or char_length(detail) <= 160),       -- « 68 m² de murs en parpaings »
  annee           int  check (annee is null or annee between 2000 and 2100),
  photo_url       text check (photo_url is null or char_length(photo_url) <= 600),
  photo_chemin    text check (photo_chemin is null or char_length(photo_chemin) <= 300), -- fichier dans le stockage
  message_admin   text check (message_admin is null or char_length(message_admin) <= 400), -- mot de l'admin / motif de refus
  consentement    boolean not null default false,  -- l'utilisateur accepte la diffusion publique (photo, prénom, lieu)
  cree_le         timestamptz not null default now(),
  soumise_le      timestamptz,
  publiee_le      timestamptz
);

create index if not exists idx_realisations_publiees on public.realisations(statut, publiee_le desc);
create index if not exists idx_realisations_utilisateur on public.realisations(utilisateur_id);

alter table public.realisations enable row level security;

-- ---------- Lecture ----------------------------------------------------------------
drop policy if exists "realisations : lecture publique" on public.realisations;
create policy "realisations : lecture publique"
  on public.realisations for select to anon, authenticated using (statut = 'publiee');

drop policy if exists "realisations : lecture proprietaire" on public.realisations;
create policy "realisations : lecture proprietaire"
  on public.realisations for select to authenticated using (auth.uid() = utilisateur_id);

drop policy if exists "realisations : lecture admin" on public.realisations;
create policy "realisations : lecture admin"
  on public.realisations for select to authenticated using (public.est_admin());

-- ---------- Écriture ---------------------------------------------------------------
-- Seul l'admin crée (proposition à un utilisateur, ou réalisation saisie directement) et supprime
drop policy if exists "realisations : ajout admin" on public.realisations;
create policy "realisations : ajout admin"
  on public.realisations for insert to authenticated with check (public.est_admin());

drop policy if exists "realisations : modification admin" on public.realisations;
create policy "realisations : modification admin"
  on public.realisations for update to authenticated using (public.est_admin()) with check (public.est_admin());

-- L'utilisateur répond à une proposition : il l'envoie (« soumise ») ou la décline, tant qu'elle n'est pas publiée
drop policy if exists "realisations : reponse proprietaire" on public.realisations;
create policy "realisations : reponse proprietaire"
  on public.realisations for update to authenticated
  using (auth.uid() = utilisateur_id and statut in ('proposee', 'soumise'))
  with check (auth.uid() = utilisateur_id and statut in ('soumise', 'declinee'));

drop policy if exists "realisations : suppression admin" on public.realisations;
create policy "realisations : suppression admin"
  on public.realisations for delete to authenticated using (public.est_admin());

grant select on public.realisations to anon, authenticated;
grant insert, update, delete on public.realisations to authenticated;

-- L'utilisateur ne touche qu'à ses infos et à sa photo ; une réalisation envoyée doit être complète.
create or replace function public.realisations_proteger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.est_admin() then return new; end if;
  new.projet_id := old.projet_id;
  new.message_admin := old.message_admin;
  new.publiee_le := old.publiee_le;
  new.cree_le := old.cree_le;
  new.fournisseur_id := old.fournisseur_id;
  new.fournisseur_nom := old.fournisseur_nom;
  if new.photo_chemin is distinct from old.photo_chemin and new.photo_chemin is not null
     and split_part(new.photo_chemin, '/', 1) <> auth.uid()::text then
    raise exception 'Photo non autorisée.' using errcode = '42501';
  end if;
  if new.statut = 'soumise' then
    if new.photo_url is null or btrim(new.titre) = '' or btrim(new.commune) = '' or btrim(new.auteur) = '' then
      raise exception 'Ajoutez une photo, un titre, la commune et votre nom avant d’envoyer.' using errcode = '23514';
    end if;
    if not new.consentement then
      raise exception 'Votre accord pour la diffusion est nécessaire.' using errcode = '23514';
    end if;
    new.soumise_le := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_realisations_proteger on public.realisations;
create trigger trg_realisations_proteger
  before update on public.realisations
  for each row execute function public.realisations_proteger();

-- ---------- Publication (admin) : 10 en ligne au maximum ---------------------------
-- Publie la réalisation puis supprime les plus anciennes au-delà de 10.
-- Renvoie les chemins des photos supprimées, que l'interface efface ensuite du stockage.
create or replace function public.publier_realisation(p_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  chemins text[];
begin
  if not public.est_admin() then raise exception 'Réservé aux administrateurs.' using errcode = '42501'; end if;
  update public.realisations
     set statut = 'publiee', publiee_le = coalesce(publiee_le, now()), message_admin = null
   where id = p_id;
  if not found then raise exception 'Réalisation introuvable.'; end if;

  with en_trop as (
    select id from public.realisations
     where statut = 'publiee'
     order by publiee_le desc nulls last, cree_le desc
    offset 10
  ), supprimees as (
    delete from public.realisations r using en_trop where r.id = en_trop.id
    returning r.photo_chemin
  )
  select coalesce(array_agg(photo_chemin) filter (where photo_chemin is not null), '{}') into chemins from supprimees;
  return chemins;
end;
$$;
revoke execute on function public.publier_realisation(uuid) from public, anon;
grant execute on function public.publier_realisation(uuid) to authenticated;

-- ---------- Stockage des photos ------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('realisations', 'realisations', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- dossier = id de l'utilisateur (ses propres photos) ; l'admin dépose et supprime partout
drop policy if exists "realisations : depot photo" on storage.objects;
create policy "realisations : depot photo"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'realisations' and ((storage.foldername(name))[1] = auth.uid()::text or public.est_admin()));

drop policy if exists "realisations : suppression photo" on storage.objects;
create policy "realisations : suppression photo"
  on storage.objects for delete to authenticated
  using (bucket_id = 'realisations' and ((storage.foldername(name))[1] = auth.uid()::text or public.est_admin()));

-- ---------- Exemples de départ (photos du site), modifiables ou supprimables par l'admin -----
insert into public.realisations (statut, titre, type_projet, auteur, commune, quartier, fournisseur_id, fournisseur_nom, detail, annee, photo_url, publiee_le, consentement)
select v.statut, v.titre, v.type_projet, v.auteur, v.commune, v.quartier,
       (select f.id from public.fournisseurs f where f.nom ilike v.fournisseur limit 1), v.fournisseur,
       v.detail, v.annee, v.photo_url, now() - (v.rang || ' minutes')::interval, true
from (values
  ('publiee', 'Maison familiale',       'mur',       'Amina M.',    'Mamoudzou', 'Kawéni',       'Batimax', '68 m² de murs en parpaings',  2026, '/realisations/maison-kaweni.jpg',      1),
  ('publiee', 'Dalle de garage',        'dalle',     'Youssouf B.', 'Koungou',   'Longoni',      'ETPC',    '32 m² de dalle béton armé',   2026, '/realisations/dalle-longoni.jpg',      2),
  ('publiee', 'Terrasse vue lagon',     'terrasse',  'Sarah A.',    'Dzaoudzi',  'Labattoir',    'Batimax', '24 m² carrelés',              2026, '/realisations/terrasse-labattoir.jpg', 3),
  ('publiee', 'Fondations d’extension', 'fondation', 'Nassim R.',   'Sada',      'Centre',       'IBS',     '18 m de semelles filantes',   2025, '/realisations/fondation-sada.jpg',     4),
  ('publiee', 'Mur de clôture',         'mur',       'Fatima S.',   'Chirongui', 'Mramadoudou',  'Batimax', '45 m linéaires',              2025, '/realisations/cloture-chirongui.jpg',  5),
  ('publiee', 'Dalle de terrasse',      'dalle',     'Ali H.',      'Pamandzi',  'Four à Chaux', 'IBS',     '40 m² de dalle',              2025, '/realisations/dalle-pamandzi.jpg',     6)
) as v(statut, titre, type_projet, auteur, commune, quartier, fournisseur, detail, annee, photo_url, rang)
where not exists (select 1 from public.realisations);

notify pgrst, 'reload schema';

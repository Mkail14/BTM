-- Inscription des fournisseurs : l'entreprise crée elle-même son compte (« Devenir partenaire »), avec toutes ses
-- informations. Sa demande attend la validation de BTM : l'admin la valide (la fiche de l'annuaire est créée et le
-- compte devient fournisseur), demande une rectification (message au fournisseur, qui corrige et renvoie) ou la refuse.
-- En attendant, le compte voit la page « Compte en cours de validation ».

create table if not exists public.demandes_fournisseur (
  id uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null unique references auth.users(id) on delete cascade,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'a_corriger', 'validee', 'refusee')),
  entreprise text not null check (char_length(entreprise) between 2 and 120),
  siret text check (siret is null or siret ~ '^[0-9]{14}$'),
  categorie_id text references public.categories_fournisseurs(id) on delete set null,
  commune text check (char_length(commune) <= 60),
  adresse text check (char_length(adresse) <= 160),
  telephone text check (char_length(telephone) <= 30),
  email text check (char_length(email) <= 254),
  contact_nom text check (char_length(contact_nom) <= 120),
  horaires text check (char_length(horaires) <= 120),
  description text check (char_length(description) <= 400),
  livraison boolean not null default false,
  message_admin text check (char_length(message_admin) <= 500), -- rectification demandée ou motif du refus
  fournisseur_id uuid references public.fournisseurs(id) on delete set null, -- fiche créée à la validation
  cree_le timestamptz not null default now(),
  mis_a_jour_le timestamptz not null default now(),
  traitee_le timestamptz
);
comment on table public.demandes_fournisseur is 'Comptes fournisseur créés par les entreprises, en attente de validation par BTM.';

alter table public.demandes_fournisseur enable row level security;
drop policy if exists "demandes fournisseur : lecture proprietaire" on public.demandes_fournisseur;
create policy "demandes fournisseur : lecture proprietaire" on public.demandes_fournisseur
  for select to authenticated using (utilisateur_id = (select auth.uid()));
drop policy if exists "demandes fournisseur : lecture admin" on public.demandes_fournisseur;
create policy "demandes fournisseur : lecture admin" on public.demandes_fournisseur
  for select to authenticated using (public.est_admin());
-- aucune écriture directe : uniquement par les fonctions ci-dessous

-- Champs d'une demande, lus dans un objet JSON (inscription ou correction), nettoyés et bornés
create or replace function public.champs_demande_fournisseur(d jsonb)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'entreprise', left(nullif(trim(d ->> 'entreprise'), ''), 120),
    'siret', nullif(regexp_replace(coalesce(d ->> 'siret', ''), '\D', '', 'g'), ''),
    'categorie_id', nullif(trim(d ->> 'categorie_id'), ''),
    'commune', left(nullif(trim(d ->> 'commune'), ''), 60),
    'adresse', left(nullif(trim(d ->> 'adresse'), ''), 160),
    'telephone', left(nullif(trim(d ->> 'telephone'), ''), 30),
    'email', left(nullif(trim(d ->> 'email'), ''), 254),
    'contact_nom', left(nullif(trim(d ->> 'contact_nom'), ''), 120),
    'horaires', left(nullif(trim(d ->> 'horaires'), ''), 120),
    'description', left(nullif(trim(d ->> 'description'), ''), 400),
    'livraison', coalesce((d ->> 'livraison')::boolean, false)
  )
$$;

-- Création du compte : la demande est enregistrée tout de suite (avant même la confirmation de l'e-mail),
-- l'admin la voit aussitôt. Ne bloque jamais la création du compte.
create or replace function public.enregistrer_demande_fournisseur_inscription()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  c jsonb;
begin
  if coalesce(new.raw_user_meta_data ->> 'type_profil', '') <> 'fournisseur' or not coalesce(new.raw_user_meta_data ? 'fournisseur', false) then return new; end if;
  c := public.champs_demande_fournisseur(new.raw_user_meta_data -> 'fournisseur');
  if c ->> 'entreprise' is null then return new; end if;
  insert into public.demandes_fournisseur (utilisateur_id, entreprise, siret, categorie_id, commune, adresse, telephone, email, contact_nom, horaires, description, livraison)
  values (new.id, c ->> 'entreprise', case when c ->> 'siret' ~ '^[0-9]{14}$' then c ->> 'siret' end,
          (select id from public.categories_fournisseurs where id = c ->> 'categorie_id'),
          c ->> 'commune', c ->> 'adresse', c ->> 'telephone', coalesce(c ->> 'email', new.email), c ->> 'contact_nom',
          c ->> 'horaires', c ->> 'description', (c ->> 'livraison')::boolean)
  on conflict (utilisateur_id) do nothing;
  update public.profils set type_profil = 'fournisseur' where id = new.id;
  return new;
exception when others then
  return new;
end
$$;
drop trigger if exists zz_demande_fournisseur_inscription on auth.users;
create trigger zz_demande_fournisseur_inscription after insert on auth.users
  for each row execute function public.enregistrer_demande_fournisseur_inscription();

-- Le fournisseur corrige sa demande (après une demande de rectification, ou tant qu'elle attend) : elle repart en attente
create or replace function public.corriger_demande_fournisseur(p_infos jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  c jsonb := public.champs_demande_fournisseur(p_infos);
begin
  if c ->> 'entreprise' is null then raise exception 'Indiquez le nom de l’entreprise.'; end if;
  update public.demandes_fournisseur set
    entreprise = c ->> 'entreprise',
    siret = case when c ->> 'siret' ~ '^[0-9]{14}$' then c ->> 'siret' end,
    categorie_id = (select id from public.categories_fournisseurs where id = c ->> 'categorie_id'),
    commune = c ->> 'commune', adresse = c ->> 'adresse', telephone = c ->> 'telephone', email = coalesce(c ->> 'email', email),
    contact_nom = c ->> 'contact_nom', horaires = c ->> 'horaires', description = c ->> 'description', livraison = (c ->> 'livraison')::boolean,
    statut = 'en_attente', mis_a_jour_le = now()
  where utilisateur_id = auth.uid() and statut in ('en_attente', 'a_corriger');
  if not found then raise exception 'Aucune demande à corriger pour ce compte.' using errcode = 'P0002'; end if;
end
$$;
revoke all on function public.corriger_demande_fournisseur(jsonb) from public, anon;
grant execute on function public.corriger_demande_fournisseur(jsonb) to authenticated;

-- Décision de l'admin : 'valider' (fiche créée, compte fournisseur), 'corriger' (message requis) ou 'refuser'
create or replace function public.statuer_demande_fournisseur(p_id uuid, p_decision text, p_message text default null, p_categorie text default null, p_visible boolean default true)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  d public.demandes_fournisseur;
  msg text := nullif(trim(coalesce(p_message, '')), '');
  base text;
  s text;
  n int := 1;
  fid uuid;
begin
  if not public.est_admin() then raise exception 'Réservé aux administrateurs' using errcode = '42501'; end if;
  select * into d from public.demandes_fournisseur where id = p_id for update;
  if not found then raise exception 'Demande introuvable.' using errcode = 'P0002'; end if;
  if d.statut = 'validee' then raise exception 'Cette demande est déjà validée.'; end if;

  if p_decision = 'corriger' or p_decision = 'refuser' then
    if p_decision = 'corriger' and msg is null then raise exception 'Indiquez ce que le fournisseur doit corriger.'; end if;
    update public.demandes_fournisseur
      set statut = case when p_decision = 'corriger' then 'a_corriger' else 'refusee' end,
          message_admin = left(msg, 500), traitee_le = now(), mis_a_jour_le = now()
      where id = p_id;
    return null;
  end if;
  if p_decision <> 'valider' then raise exception 'Décision inconnue.'; end if;

  -- catégorie : celle choisie par l'admin, sinon celle du fournisseur ; obligatoire pour l'annuaire
  p_categorie := coalesce(nullif(p_categorie, ''), d.categorie_id);
  if p_categorie is null or not exists (select 1 from public.categories_fournisseurs where id = p_categorie) then
    raise exception 'Choisissez la catégorie du fournisseur.';
  end if;
  if d.commune is null or d.telephone is null then raise exception 'Commune et téléphone sont nécessaires : demandez une rectification.'; end if;

  -- adresse de la fiche (slug) : le nom sans accents ni signes, rendu unique
  base := trim(both '-' from regexp_replace(lower(translate(d.entreprise,
    'àâäáãåçéèêëíìîïñóòôöõúùûüýÿÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ', 'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY')), '[^a-z0-9]+', '-', 'g'));
  if base = '' then base := 'fournisseur'; end if;
  s := base;
  while exists (select 1 from public.fournisseurs where slug = s) loop n := n + 1; s := base || '-' || n; end loop;

  insert into public.fournisseurs (slug, nom, categorie_id, commune, adresse, telephone, email, description, horaires, livraison, actif, demonstration)
  values (s, d.entreprise, p_categorie, d.commune, d.adresse, d.telephone, d.email, d.description, d.horaires, d.livraison, coalesce(p_visible, true), false)
  returning id into fid;

  update public.profils set role = 'fournisseur', fournisseur_id = fid, type_profil = 'fournisseur' where id = d.utilisateur_id;
  update public.demandes_fournisseur
    set statut = 'validee', fournisseur_id = fid, categorie_id = p_categorie, message_admin = null, traitee_le = now(), mis_a_jour_le = now()
    where id = p_id;
  return fid;
end
$$;
revoke all on function public.statuer_demande_fournisseur(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.statuer_demande_fournisseur(uuid, text, text, text, boolean) to authenticated;

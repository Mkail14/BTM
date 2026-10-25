-- Dossier de validation d'un compte fournisseur (demandes_fournisseur) : tant que le compte attend la validation,
-- l'entreprise et BTM échangent dans son dossier :
--  - messages : BTM dit ce qui manque, l'entreprise répond ;
--  - documents : BTM demande des pièces (Kbis, pièce d'identité, RIB, assurance…), l'entreprise les dépose
--    (stockage privé « dossiers-fournisseurs »), BTM les valide ou les refuse avec un motif ;
--  - contrat de partenariat : lu et signé dans le dossier (version, signataire, qualité, signature dessinée, date).

-- ---------- Messages ----------
create table if not exists public.messages_demande_fournisseur (
  id uuid primary key default gen_random_uuid(),
  demande_id uuid not null references public.demandes_fournisseur(id) on delete cascade,
  auteur text not null check (auteur in ('fournisseur', 'btm')),
  texte text not null check (char_length(texte) between 1 and 2000),
  cree_le timestamptz not null default now(),
  lu_le timestamptz
);
create index if not exists messages_demande_fournisseur_demande on public.messages_demande_fournisseur (demande_id, cree_le);
alter table public.messages_demande_fournisseur enable row level security;
drop policy if exists "messages demande : lecture" on public.messages_demande_fournisseur;
create policy "messages demande : lecture" on public.messages_demande_fournisseur for select to authenticated
  using (public.est_admin() or exists (select 1 from public.demandes_fournisseur d where d.id = demande_id and d.utilisateur_id = (select auth.uid())));

-- ---------- Documents ----------
create table if not exists public.documents_demande_fournisseur (
  id uuid primary key default gen_random_uuid(),
  demande_id uuid not null references public.demandes_fournisseur(id) on delete cascade,
  type text not null check (type in ('kbis', 'identite', 'rib', 'assurance', 'autre')),
  libelle text not null check (char_length(libelle) between 2 and 120),
  consigne text check (char_length(consigne) <= 300),
  statut text not null default 'a_fournir' check (statut in ('a_fournir', 'envoye', 'valide', 'refuse')),
  chemin text,               -- fichier dans le stockage « dossiers-fournisseurs » (dossier du compte)
  nom_fichier text check (char_length(nom_fichier) <= 200),
  motif text check (char_length(motif) <= 300), -- motif d'un refus
  demande_le timestamptz not null default now(),
  envoye_le timestamptz,
  traite_le timestamptz
);
create index if not exists documents_demande_fournisseur_demande on public.documents_demande_fournisseur (demande_id);
alter table public.documents_demande_fournisseur enable row level security;
drop policy if exists "documents demande : lecture" on public.documents_demande_fournisseur;
create policy "documents demande : lecture" on public.documents_demande_fournisseur for select to authenticated
  using (public.est_admin() or exists (select 1 from public.demandes_fournisseur d where d.id = demande_id and d.utilisateur_id = (select auth.uid())));

-- ---------- Contrat ----------
alter table public.demandes_fournisseur
  add column if not exists contrat_version text,
  add column if not exists contrat_signe_le timestamptz,
  add column if not exists contrat_signataire text check (char_length(contrat_signataire) <= 120),
  add column if not exists contrat_qualite text check (char_length(contrat_qualite) <= 80),
  add column if not exists contrat_signature text check (char_length(contrat_signature) <= 30000); -- tracé SVG

-- ---------- Stockage privé des pièces ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dossiers-fournisseurs', 'dossiers-fournisseurs', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "dossiers fournisseurs : depot" on storage.objects;
create policy "dossiers fournisseurs : depot" on storage.objects for insert to authenticated
  with check (bucket_id = 'dossiers-fournisseurs' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "dossiers fournisseurs : lecture" on storage.objects;
create policy "dossiers fournisseurs : lecture" on storage.objects for select to authenticated
  using (bucket_id = 'dossiers-fournisseurs' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.est_admin()));

-- ---------- Fonctions ----------
-- Demande dont l'appelant peut suivre le dossier : l'admin (toutes), l'entreprise (la sienne)
create or replace function public.dossier_autorise(p_demande uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.est_admin() or exists (select 1 from public.demandes_fournisseur where id = p_demande and utilisateur_id = auth.uid())
$$;

create or replace function public.envoyer_message_dossier(p_demande uuid, p_texte text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  t text := left(trim(coalesce(p_texte, '')), 2000);
  mid uuid;
begin
  if not public.dossier_autorise(p_demande) then raise exception 'Action non autorisée.' using errcode = '42501'; end if;
  if t = '' then raise exception 'Écrivez votre message.'; end if;
  insert into public.messages_demande_fournisseur (demande_id, auteur, texte)
  values (p_demande, case when public.est_admin() then 'btm' else 'fournisseur' end, t)
  returning id into mid;
  update public.demandes_fournisseur set mis_a_jour_le = now() where id = p_demande;
  return mid;
end
$$;

-- Les messages de l'autre partie sont marqués lus quand on ouvre la discussion
create or replace function public.lire_messages_dossier(p_demande uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.dossier_autorise(p_demande) then raise exception 'Action non autorisée.' using errcode = '42501'; end if;
  update public.messages_demande_fournisseur set lu_le = now()
  where demande_id = p_demande and lu_le is null and auteur = case when public.est_admin() then 'fournisseur' else 'btm' end;
end
$$;

-- Admin : demande des pièces (une ligne par document : type, libellé, consigne)
create or replace function public.demander_documents_dossier(p_demande uuid, p_documents jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  doc jsonb;
begin
  if not public.est_admin() then raise exception 'Réservé aux administrateurs' using errcode = '42501'; end if;
  for doc in select * from jsonb_array_elements(coalesce(p_documents, '[]'::jsonb)) loop
    insert into public.documents_demande_fournisseur (demande_id, type, libelle, consigne)
    values (p_demande, doc ->> 'type', left(doc ->> 'libelle', 120), left(nullif(trim(doc ->> 'consigne'), ''), 300));
  end loop;
  update public.demandes_fournisseur set mis_a_jour_le = now() where id = p_demande;
end
$$;

-- Entreprise : dépose (ou redépose après un refus) le fichier d'une pièce demandée
create or replace function public.deposer_document_dossier(p_document uuid, p_chemin text, p_nom text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  doc public.documents_demande_fournisseur;
begin
  select * into doc from public.documents_demande_fournisseur where id = p_document;
  if not found or not exists (select 1 from public.demandes_fournisseur where id = doc.demande_id and utilisateur_id = auth.uid()) then
    raise exception 'Action non autorisée.' using errcode = '42501';
  end if;
  if doc.statut = 'valide' then raise exception 'Ce document est déjà validé.'; end if;
  if split_part(coalesce(p_chemin, ''), '/', 1) <> auth.uid()::text then raise exception 'Fichier invalide.'; end if;
  update public.documents_demande_fournisseur
    set chemin = p_chemin, nom_fichier = left(p_nom, 200), statut = 'envoye', motif = null, envoye_le = now()
    where id = p_document;
end
$$;

-- Admin : valide ou refuse une pièce (motif affiché à l'entreprise), ou la retire de la liste
create or replace function public.statuer_document_dossier(p_document uuid, p_decision text, p_motif text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.est_admin() then raise exception 'Réservé aux administrateurs' using errcode = '42501'; end if;
  if p_decision = 'retirer' then delete from public.documents_demande_fournisseur where id = p_document; return; end if;
  if p_decision = 'refuser' and nullif(trim(coalesce(p_motif, '')), '') is null then raise exception 'Indiquez pourquoi le document est refusé.'; end if;
  update public.documents_demande_fournisseur
    set statut = case p_decision when 'valider' then 'valide' when 'refuser' then 'refuse' else statut end,
        motif = case when p_decision = 'refuser' then left(trim(p_motif), 300) end, traite_le = now()
    where id = p_document;
  if not found then raise exception 'Document introuvable.' using errcode = 'P0002'; end if;
end
$$;

-- Entreprise : signe le contrat de partenariat (version lue, nom et qualité du signataire, signature dessinée)
create or replace function public.signer_contrat_dossier(p_version text, p_signataire text, p_qualite text, p_signature text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if char_length(trim(coalesce(p_signataire, ''))) < 3 then raise exception 'Indiquez le nom du signataire.'; end if;
  if char_length(coalesce(p_signature, '')) < 20 then raise exception 'Signez dans le cadre prévu.'; end if;
  update public.demandes_fournisseur
    set contrat_version = left(p_version, 40), contrat_signataire = left(trim(p_signataire), 120), contrat_qualite = left(trim(coalesce(p_qualite, '')), 80),
        contrat_signature = left(p_signature, 30000), contrat_signe_le = now(), mis_a_jour_le = now()
    where utilisateur_id = auth.uid() and statut in ('en_attente', 'a_corriger');
  if not found then raise exception 'Aucune demande en cours pour ce compte.' using errcode = 'P0002'; end if;
end
$$;

do $$
declare f text;
begin
  foreach f in array array['dossier_autorise(uuid)', 'envoyer_message_dossier(uuid, text)', 'lire_messages_dossier(uuid)',
    'demander_documents_dossier(uuid, jsonb)', 'deposer_document_dossier(uuid, text, text)', 'statuer_document_dossier(uuid, text, text)',
    'signer_contrat_dossier(text, text, text, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end
$$;

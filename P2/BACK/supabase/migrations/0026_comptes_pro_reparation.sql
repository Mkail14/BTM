-- =============================================================================
-- BTM — Migration 0026 : comptes professionnels (rattrapage de 0011 + réparation)
-- =============================================================================
-- Constat : sur la base en ligne, la partie « comptes professionnels » de 0011 n'avait jamais été appliquée
-- (colonnes pro_statut, pro_siret… absentes). Le correctif enregistrer_demande_pro_inscription écrivait dans
-- ces colonnes, échouait sans bruit, et tout compte créé « professionnel » restait particulier.
-- Cette migration reprend UNIQUEMENT la partie pro de 0011 (pas ses fonctions de paiement, remplacées depuis),
-- puis répare les comptes inscrits en pro à partir de ce qu'ils avaient saisi (métadonnées de l'inscription).
-- =============================================================================

alter table public.profils add column if not exists pro_statut text check (pro_statut in ('en_attente', 'verifie', 'refuse'));
alter table public.profils add column if not exists pro_raison_sociale text check (char_length(pro_raison_sociale) <= 120);
alter table public.profils add column if not exists pro_siret text check (pro_siret ~ '^[0-9]{14}$');
alter table public.profils add column if not exists pro_demande_le timestamptz;
alter table public.profils add column if not exists pro_statue_le timestamptz;
alter table public.profils add column if not exists pro_motif_refus text check (char_length(pro_motif_refus) <= 300);

-- ---------- Création du profil à l'inscription : type choisi + demande pro ----------
create or replace function public.creer_profil_utilisateur()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  est_pro boolean := meta ->> 'type_profil' = 'professionnel';
  siret text := regexp_replace(coalesce(meta ->> 'pro_siret', ''), '\D', '', 'g');
begin
  insert into public.profils (id, email, nom_affiche, type_profil, pro_statut, pro_raison_sociale, pro_siret, pro_demande_le)
  values (
    new.id, new.email, split_part(coalesce(new.email, ''), '@', 1),
    case when est_pro then 'professionnel' else 'particulier' end,
    case when est_pro then 'en_attente' end,
    case when est_pro then left(nullif(trim(meta ->> 'pro_raison_sociale'), ''), 120) end,
    case when est_pro and siret ~ '^[0-9]{14}$' then siret end,
    case when est_pro then now() end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------- L'utilisateur demande (ou redemande) la vérification professionnelle ----------
create or replace function public.demander_verification_pro(p_raison_sociale text, p_siret text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  siret text := regexp_replace(coalesce(p_siret, ''), '\D', '', 'g');
begin
  if auth.uid() is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  if siret !~ '^[0-9]{14}$' then raise exception 'Le SIRET doit comporter 14 chiffres' using errcode = '22023'; end if;
  if coalesce(trim(p_raison_sociale), '') = '' then raise exception 'Indiquez la raison sociale' using errcode = '22023'; end if;
  if exists (select 1 from public.profils where id = auth.uid() and pro_statut = 'verifie') then
    raise exception 'Votre compte professionnel est déjà vérifié' using errcode = '22023';
  end if;
  update public.profils
  set type_profil = 'professionnel', pro_statut = 'en_attente', pro_raison_sociale = left(trim(p_raison_sociale), 120),
      pro_siret = siret, pro_demande_le = now(), pro_statue_le = null, pro_motif_refus = null
  where id = auth.uid();
end;
$$;
revoke execute on function public.demander_verification_pro(text, text) from public, anon;
grant execute on function public.demander_verification_pro(text, text) to authenticated;

-- ---------- L'utilisateur repasse en particulier (abandon de la demande) ----------
create or replace function public.passer_particulier()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profils
  set type_profil = 'particulier', pro_statut = null, pro_raison_sociale = null, pro_siret = null,
      pro_demande_le = null, pro_statue_le = null, pro_motif_refus = null
  where id = auth.uid() and type_profil = 'professionnel';
$$;
revoke execute on function public.passer_particulier() from public, anon;
grant execute on function public.passer_particulier() to authenticated;

-- ---------- L'admin valide ou refuse ----------
create or replace function public.statuer_verification_pro(p_profil uuid, p_decision text, p_motif text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.est_admin() then raise exception 'Réservé aux administrateurs' using errcode = '42501'; end if;
  if p_decision not in ('verifie', 'refuse') then raise exception 'Décision invalide' using errcode = '22023'; end if;
  if p_decision = 'refuse' and coalesce(trim(p_motif), '') = '' then
    raise exception 'Indiquez le motif du refus : il est affiché à l’utilisateur' using errcode = '22023';
  end if;
  update public.profils
  set pro_statut = p_decision, pro_statue_le = now(),
      pro_motif_refus = case when p_decision = 'refuse' then left(trim(p_motif), 300) end
  where id = p_profil and type_profil = 'professionnel';
  if not found then raise exception 'Aucune demande professionnelle pour ce compte' using errcode = 'P0002'; end if;
end;
$$;
revoke execute on function public.statuer_verification_pro(uuid, text, text) from public, anon;
grant execute on function public.statuer_verification_pro(uuid, text, text) to authenticated;

-- ---------- Réparation : comptes inscrits « professionnel » restés particuliers ----------
update public.profils p
set type_profil = 'professionnel',
    pro_statut = 'en_attente',
    pro_raison_sociale = left(nullif(trim(u.raw_user_meta_data ->> 'pro_raison_sociale'), ''), 120),
    pro_siret = case when regexp_replace(coalesce(u.raw_user_meta_data ->> 'pro_siret', ''), '\D', '', 'g') ~ '^[0-9]{14}$'
                     then regexp_replace(u.raw_user_meta_data ->> 'pro_siret', '\D', '', 'g') end,
    pro_demande_le = coalesce(p.pro_demande_le, u.created_at)
from auth.users u
where u.id = p.id
  and u.raw_user_meta_data ->> 'type_profil' = 'professionnel'
  and p.pro_statut is null
  and p.role is distinct from 'admin'
  and p.fournisseur_id is null;

-- comptes déjà marqués « professionnel » sans statut : à vérifier aussi
update public.profils set pro_statut = 'en_attente', pro_demande_le = coalesce(pro_demande_le, now())
where type_profil = 'professionnel' and pro_statut is null;

notify pgrst, 'reload schema';

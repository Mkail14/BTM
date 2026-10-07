-- Compte administrateur principal : contact@btm.yt
-- À exécuter une fois dans Supabase → SQL Editor.
--
-- 1. donne le rôle administrateur à ce compte ;
-- 2. interdit, dans la base elle-même, de le supprimer, de le bannir, de lui retirer son rôle ou de changer son adresse.
-- L'interface de l'admin retire déjà ces actions (serviceAdmin.js : ADMIN_PRINCIPAL) ; ces déclencheurs les refusent aussi
-- à toute autre voie (fonction serveur, tableau de bord Supabase, SQL).
-- Pour changer de compte principal : remplacer l'adresse ici ET dans src/services/supabase/serviceAdmin.js.

update public.profils set role = 'admin' where lower(email) = 'contact@btm.yt';

-- ---------- Profil : rôle, adresse, bannissement, suppression ----------
create or replace function public.proteger_admin_principal()
returns trigger
language plpgsql
as $$
begin
  if lower(old.email) = 'contact@btm.yt' then
    if tg_op = 'DELETE' then
      raise exception 'Le compte administrateur principal ne peut pas être supprimé.';
    end if;
    if new.role is distinct from 'admin' then
      raise exception 'Le compte administrateur principal garde le rôle administrateur.';
    end if;
    if lower(new.email) is distinct from 'contact@btm.yt' then
      raise exception 'L''adresse du compte administrateur principal ne peut pas être modifiée.';
    end if;
    if new.banni_le is not null and (new.banni_jusqua is null or new.banni_jusqua > now()) then
      raise exception 'Le compte administrateur principal ne peut pas être banni.';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

drop trigger if exists proteger_admin_principal on public.profils;
create trigger proteger_admin_principal
  before update or delete on public.profils
  for each row execute function public.proteger_admin_principal();

-- ---------- Compte de connexion : suppression, bannissement, adresse ----------
create or replace function public.proteger_admin_principal_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(old.email) = 'contact@btm.yt' then
    if tg_op = 'DELETE' then
      raise exception 'Le compte administrateur principal ne peut pas être supprimé.';
    end if;
    if new.banned_until is not null and new.banned_until > now() then
      raise exception 'Le compte administrateur principal ne peut pas être banni.';
    end if;
    if lower(new.email) is distinct from 'contact@btm.yt' then
      raise exception 'L''adresse du compte administrateur principal ne peut pas être modifiée.';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

drop trigger if exists proteger_admin_principal_auth on auth.users;
create trigger proteger_admin_principal_auth
  before update or delete on auth.users
  for each row execute function public.proteger_admin_principal_auth();

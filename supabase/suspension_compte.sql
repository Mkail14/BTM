-- Page « Compte suspendu » : fin et motif du bannissement, pour un compte dont la connexion vient d'être refusée.
-- À exécuter une fois dans Supabase → SQL Editor.
--
-- Un compte banni n'a plus de session : il ne peut donc pas lire son profil. Cette fonction lui rend la date de fin
-- et le motif saisi par l'administrateur, à condition de fournir l'e-mail ET le mot de passe du compte : connaître
-- l'adresse de quelqu'un ne suffit pas pour apprendre qu'il est banni, ni pourquoi.
-- Sans cette fonction, la page s'affiche quand même, sans date ni motif après une connexion refusée.

create or replace function public.suspension_compte(p_email text, p_mot_de_passe text)
returns table (jusqua timestamptz, motif text)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select p.banni_jusqua, p.banni_motif
  from auth.users u
  join public.profils p on p.id = u.id
  where lower(u.email) = lower(trim(p_email))
    and u.encrypted_password = crypt(p_mot_de_passe, u.encrypted_password)
    and p.banni_le is not null
    and (p.banni_jusqua is null or p.banni_jusqua > now())
$$;

revoke all on function public.suspension_compte(text, text) from public;
grant execute on function public.suspension_compte(text, text) to anon, authenticated;

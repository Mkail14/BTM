-- =============================================================================
-- BTM — Migration 0022 : bannissement des comptes (à vie ou pour une durée)
-- =============================================================================
-- Le blocage réel est fait par Supabase Auth (ban_duration, posé par la fonction admin-utilisateurs) :
-- un compte banni ne peut plus se connecter ni prolonger sa session ; un ban temporaire se lève tout seul.
-- Ces colonnes servent à l'affichage (section « Bannis » de l'admin, déconnexion du site) :
--   banni_le     : date du bannissement (null = jamais banni ou ban levé)
--   banni_jusqua : fin du ban ; null avec banni_le renseigné = banni à vie
-- Écriture réservée aux administrateurs et à la clé service (déclencheur proteger_profil).
-- À exécuter APRÈS 0021.
-- =============================================================================

alter table public.profils
  add column if not exists banni_le     timestamptz,
  add column if not exists banni_jusqua timestamptz,
  add column if not exists banni_motif  text check (char_length(banni_motif) <= 300),
  add column if not exists banni_par    uuid references auth.users(id) on delete set null;

create or replace function public.proteger_profil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- rôle, fiche fournisseur et bannissement : uniquement par un admin ou par la clé service (fonctions serveur)
  if (new.role is distinct from old.role or new.fournisseur_id is distinct from old.fournisseur_id
      or new.banni_le is distinct from old.banni_le or new.banni_jusqua is distinct from old.banni_jusqua
      or new.banni_motif is distinct from old.banni_motif or new.banni_par is distinct from old.banni_par)
     and not (public.est_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Modification réservée aux administrateurs' using errcode = '42501';
  end if;
  return new;
end;
$$;

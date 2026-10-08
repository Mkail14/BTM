-- =============================================================================
-- BTM — Migration 0010 : revenus prévisionnels / encaissés, espace fournisseur, versements
-- =============================================================================
--   0. SÉCURITÉ : la migration 0003 accordait UPDATE sur toute la table profils ; avec la
--      politique « propriétaire », n'importe quel utilisateur pouvait passer son propre rôle
--      à 'admin'. Le front ne modifie jamais profils directement (la fonction serveur
--      admin-utilisateurs utilise la clé service) : on retire ce droit et on verrouille
--      role / fournisseur_id par un déclencheur.
--   1. Compte fournisseur : profils.fournisseur_id relie un compte à sa fiche de l'annuaire.
--   2. paiements : un devis devient un revenu ENCAISSÉ quand le fournisseur choisi (ou l'admin)
--      confirme que le client a payé. Montants figés à la confirmation ; conservés même si le
--      client supprime ensuite son projet.
--   3. parametres_versement (RIB + calendrier) et versements (historique) : admin uniquement.
-- =============================================================================

-- ---------- 0. Profils : plus de modification directe par l'utilisateur --------------
revoke update on public.profils from authenticated;

create or replace function public.proteger_profil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- rôle et fiche fournisseur : uniquement par un admin ou par la clé service (fonctions serveur)
  if (new.role is distinct from old.role or new.fournisseur_id is distinct from old.fournisseur_id)
     and not (public.est_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Modification du rôle réservée aux administrateurs' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------- 1. Compte fournisseur ---------------------------------------------------
alter table public.profils add column if not exists fournisseur_id uuid references public.fournisseurs(id) on delete set null;

drop trigger if exists trg_proteger_profil on public.profils;
create trigger trg_proteger_profil before update on public.profils
  for each row execute function public.proteger_profil();

-- Fiche fournisseur du compte connecté (null si ce n'est pas un compte fournisseur)
create or replace function public.mon_fournisseur()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select fournisseur_id from public.profils where id = auth.uid() and role = 'fournisseur';
$$;
revoke execute on function public.mon_fournisseur() from public, anon;
grant execute on function public.mon_fournisseur() to authenticated;

-- L'admin relie (ou délie) un compte à une fiche fournisseur ; le rôle suit automatiquement
create or replace function public.lier_compte_fournisseur(p_profil uuid, p_fournisseur uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.est_admin() then raise exception 'Réservé aux administrateurs' using errcode = '42501'; end if;
  if p_profil = auth.uid() then raise exception 'Vous ne pouvez pas modifier votre propre compte' using errcode = '42501'; end if;
  update public.profils
  set fournisseur_id = p_fournisseur,
      role = case when p_fournisseur is not null then 'fournisseur'
                  when role = 'fournisseur' then 'user'
                  else role end
  where id = p_profil;
end;
$$;
revoke execute on function public.lier_compte_fournisseur(uuid, uuid) from public, anon;
grant execute on function public.lier_compte_fournisseur(uuid, uuid) to authenticated;

-- Le fournisseur voit les devis qui l'ont choisi (pour confirmer les paiements)
drop policy if exists "projets : lecture fournisseur choisi" on public.projets;
create policy "projets : lecture fournisseur choisi"
  on public.projets for select to authenticated
  using (fournisseur_id is not null and fournisseur_id = public.mon_fournisseur());

-- ---------- 2. Paiements (revenus encaissés) ---------------------------------------
create table if not exists public.paiements (
  id              uuid primary key default gen_random_uuid(),
  projet_id       uuid unique references public.projets(id) on delete set null,
  projet_nom      text not null,
  fournisseur_id  uuid references public.fournisseurs(id) on delete set null,
  montant_devis   numeric(12,2) not null default 0,   -- total payé par le client
  revenu_btm      numeric(12,2) not null default 0,   -- frais de service − réduction éventuelle
  paye_le         timestamptz not null default now(),
  confirme_par    uuid references auth.users(id) on delete set null,
  cree_le         timestamptz not null default now()
);
create index if not exists idx_paiements_paye_le on public.paiements(paye_le desc);

alter table public.paiements enable row level security;

drop policy if exists "paiements : lecture admin" on public.paiements;
create policy "paiements : lecture admin" on public.paiements for select to authenticated using (public.est_admin());

drop policy if exists "paiements : lecture fournisseur" on public.paiements;
create policy "paiements : lecture fournisseur" on public.paiements for select to authenticated
  using (fournisseur_id is not null and fournisseur_id = public.mon_fournisseur());

drop policy if exists "paiements : lecture client" on public.paiements;
create policy "paiements : lecture client" on public.paiements for select to authenticated
  using (exists (select 1 from public.projets p where p.id = paiements.projet_id and p.utilisateur_id = auth.uid()));

grant select on public.paiements to authenticated;   -- écritures : uniquement via les fonctions ci-dessous

-- Confirme qu'un devis a été payé : par le fournisseur choisi dans le devis, ou par l'admin
create or replace function public.confirmer_paiement(p_projet uuid)
returns public.paiements
language plpgsql
security definer
set search_path = public
as $$
declare
  pr public.projets;
  res public.paiements;
begin
  select * into pr from public.projets where id = p_projet;
  if not found then raise exception 'Devis introuvable' using errcode = 'P0002'; end if;
  if not (public.est_admin() or (pr.fournisseur_id is not null and pr.fournisseur_id = public.mon_fournisseur())) then
    raise exception 'Seul le fournisseur choisi dans ce devis peut confirmer son paiement' using errcode = '42501';
  end if;
  insert into public.paiements (projet_id, projet_nom, fournisseur_id, montant_devis, revenu_btm, confirme_par)
  values (
    pr.id, pr.nom, pr.fournisseur_id, pr.cout_total,
    greatest(0, coalesce((pr.resultat -> 'fraisService' ->> 'montant')::numeric, 0)
              - coalesce((pr.resultat -> 'remise' ->> 'montant')::numeric, 0)),
    auth.uid()
  )
  on conflict (projet_id) do nothing;
  select * into res from public.paiements where projet_id = pr.id;
  return res;
end;
$$;
revoke execute on function public.confirmer_paiement(uuid) from public, anon;
grant execute on function public.confirmer_paiement(uuid) to authenticated;

-- Annule une confirmation faite par erreur (même droits que la confirmation)
create or replace function public.annuler_paiement(p_projet uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pa public.paiements;
begin
  select * into pa from public.paiements where projet_id = p_projet;
  if not found then return; end if;
  if not (public.est_admin() or (pa.fournisseur_id is not null and pa.fournisseur_id = public.mon_fournisseur())) then
    raise exception 'Action non autorisée' using errcode = '42501';
  end if;
  delete from public.paiements where id = pa.id;
end;
$$;
revoke execute on function public.annuler_paiement(uuid) from public, anon;
grant execute on function public.annuler_paiement(uuid) to authenticated;

-- ---------- 3. Versements vers le compte de l'entreprise (admin) -----------------------
create table if not exists public.parametres_versement (
  id              int primary key default 1 check (id = 1),     -- une seule ligne
  titulaire       text,
  iban            text check (iban is null or iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$'),
  bic             text check (bic is null or bic ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$'),
  banque          text,
  frequence       text not null default 'mensuelle' check (frequence in ('mensuelle', 'trimestrielle')),
  jour            int  not null default 5 check (jour between 1 and 28),
  seuil_minimum   numeric(10,2) not null default 0 check (seuil_minimum >= 0),
  mis_a_jour_le   timestamptz not null default now(),
  mis_a_jour_par  uuid references auth.users(id) on delete set null
);

drop trigger if exists trg_parametres_versement_maj on public.parametres_versement;
create trigger trg_parametres_versement_maj before update on public.parametres_versement
  for each row execute function public.maj_horodatage();

create table if not exists public.versements (
  id            uuid primary key default gen_random_uuid(),
  montant       numeric(12,2) not null check (montant > 0),
  verse_le      date not null default current_date,
  iban_masque   text,
  note          text check (char_length(note) <= 200),
  cree_par      uuid references auth.users(id) on delete set null,
  cree_le       timestamptz not null default now()
);

alter table public.parametres_versement enable row level security;
alter table public.versements enable row level security;

drop policy if exists "versement : admin" on public.parametres_versement;
create policy "versement : admin" on public.parametres_versement for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

drop policy if exists "versements : admin" on public.versements;
create policy "versements : admin" on public.versements for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

grant select, insert, update, delete on public.parametres_versement, public.versements to authenticated;

notify pgrst, 'reload schema';

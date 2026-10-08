-- BTM : mise a jour complete de la base (migrations 0007 a 0011). Peut etre relancee sans risque.

-- >>>>>>>>>> 0007_admin_contenus.sql <<<<<<<<<<
-- =============================================================================
-- BTM — Migration 0007 : site entièrement pilotable depuis /admin
-- =============================================================================
--   * contenus_site : textes éditables du site (accueil, pied de page, contact,
--     bandeau d'annonce). Une ligne par section, valeur JSONB.
--     Le front garde des valeurs par défaut : une section absente n'est jamais vide.
--   * types_projets : l'admin modifie libellés, textes et constantes de calcul.
--   * materiaux     : l'admin modifie les prix (les identifiants restent fixes,
--     car les formules de calcul les référencent).
--   * categories_fournisseurs : création / modification / suppression par l'admin.
--   * avis : colonne « visible » pour masquer un avis sans le supprimer.
-- Toutes les écritures passent par public.est_admin() (0004) : pas de récursion RLS.
-- Les GRANT par colonne limitent ce qu'un admin peut changer via l'API.
-- =============================================================================

-- ---------- Contenus du site ---------------------------------------------------
create table if not exists public.contenus_site (
  cle             text primary key check (cle ~ '^[a-z0-9_-]{2,40}$'),
  valeur          jsonb not null default '{}'::jsonb,
  mis_a_jour_le   timestamptz not null default now(),
  mis_a_jour_par  uuid references auth.users(id) on delete set null
);

drop trigger if exists trg_contenus_site_maj on public.contenus_site;
create trigger trg_contenus_site_maj
  before update on public.contenus_site
  for each row execute function public.maj_horodatage();

alter table public.contenus_site enable row level security;

drop policy if exists "contenus : lecture publique" on public.contenus_site;
create policy "contenus : lecture publique"
  on public.contenus_site for select
  to anon, authenticated using (true);

drop policy if exists "contenus : insertion admin" on public.contenus_site;
create policy "contenus : insertion admin"
  on public.contenus_site for insert
  to authenticated with check (public.est_admin());

drop policy if exists "contenus : mise a jour admin" on public.contenus_site;
create policy "contenus : mise a jour admin"
  on public.contenus_site for update
  to authenticated using (public.est_admin()) with check (public.est_admin());

drop policy if exists "contenus : suppression admin" on public.contenus_site;
create policy "contenus : suppression admin"
  on public.contenus_site for delete
  to authenticated using (public.est_admin());

grant select on public.contenus_site to anon, authenticated;
grant insert, update, delete on public.contenus_site to authenticated;

-- Frais de service BTM ajoutés à chaque devis : 1,25 % du coût des travaux (modifiable dans /admin)
insert into public.contenus_site (cle, valeur) values ('frais', '{"taux": 1.25}'::jsonb)
on conflict (cle) do nothing;

-- ---------- Types de projets : textes + constantes de calcul -------------------
alter table public.types_projets add column if not exists accroche   text;
alter table public.types_projets add column if not exists hypotheses text;

drop policy if exists "types projets : mise a jour admin" on public.types_projets;
create policy "types projets : mise a jour admin"
  on public.types_projets for update
  to authenticated using (public.est_admin()) with check (public.est_admin());

grant update (libelle, description, accroche, hypotheses, parametres) on public.types_projets to authenticated;

-- La description est désormais affichée dans le choix de l'ouvrage du calculateur :
-- on remplace les textes techniques du seed, seulement s'ils n'ont jamais été modifiés.
update public.types_projets set description = 'Un mur en parpaings, avec ou sans porte et fenêtre'
  where id = 'mur' and description = 'Mur en parpaings 20×20×40 cm, avec ouvertures.';
update public.types_projets set description = 'Le sol en béton d’une maison, d’un garage ou d’un abri'
  where id = 'dalle' and description = 'Dalle béton armée sur hérisson de gravier.';
update public.types_projets set description = 'Les tranchées en béton qui portent la maison'
  where id = 'fondation' and description = 'Semelles filantes en béton armé.';
update public.types_projets set description = 'Un sol extérieur carrelé ou en béton lissé'
  where id = 'terrasse' and description = 'Dalle extérieure avec finition carrelage ou béton lissé.';

-- ---------- Matériaux : prix unitaires -----------------------------------------
drop policy if exists "materiaux : mise a jour admin" on public.materiaux;
create policy "materiaux : mise a jour admin"
  on public.materiaux for update
  to authenticated using (public.est_admin()) with check (public.est_admin());

grant update (libelle, unite, prix_unitaire, source) on public.materiaux to authenticated;

-- ---------- Catégories de fournisseurs ------------------------------------------
drop policy if exists "categories : insertion admin" on public.categories_fournisseurs;
create policy "categories : insertion admin"
  on public.categories_fournisseurs for insert
  to authenticated with check (public.est_admin());

drop policy if exists "categories : mise a jour admin" on public.categories_fournisseurs;
create policy "categories : mise a jour admin"
  on public.categories_fournisseurs for update
  to authenticated using (public.est_admin()) with check (public.est_admin());

drop policy if exists "categories : suppression admin" on public.categories_fournisseurs;
create policy "categories : suppression admin"
  on public.categories_fournisseurs for delete
  to authenticated using (public.est_admin());

grant insert, update, delete on public.categories_fournisseurs to authenticated;

-- ---------- Avis : masquer sans supprimer ---------------------------------------
alter table public.avis add column if not exists visible boolean not null default true;

-- Le public ne voit plus que les avis visibles ; l'auteur et l'admin voient tout.
drop policy if exists "avis : lecture publique" on public.avis;
create policy "avis : lecture publique"
  on public.avis for select
  to anon, authenticated using (visible);

drop policy if exists "avis : lecture proprietaire" on public.avis;
create policy "avis : lecture proprietaire"
  on public.avis for select
  to authenticated using (auth.uid() = utilisateur_id);

drop policy if exists "avis : lecture admin" on public.avis;
create policy "avis : lecture admin"
  on public.avis for select
  to authenticated using (public.est_admin());

drop policy if exists "avis : moderation admin" on public.avis;
create policy "avis : moderation admin"
  on public.avis for update
  to authenticated using (public.est_admin()) with check (public.est_admin());

grant update (visible) on public.avis to authenticated;

notify pgrst, 'reload schema';


-- >>>>>>>>>> 0008_materiaux_uniquement.sql <<<<<<<<<<
-- =============================================================================
-- BTM — Migration 0008 : devis « matériaux uniquement »
-- =============================================================================
-- La main-d'œuvre et la livraison étaient des estimations fictives : elles sont
-- retirées du calcul. Un devis = matériaux + frais de service BTM (calculés sur
-- les matériaux).
--   * types_projets : suppression des constantes d'heures, de taux horaire et de livraison ;
--   * materiaux     : « Carrelage extérieur posé » devient « Carrelage extérieur » (hors pose) ;
--   * projets       : les estimations déjà enregistrées perdent leur main-d'œuvre et leur
--                     livraison ; total et frais BTM sont recalculés sur les matériaux.
-- Le script peut être relancé sans effet de bord (il ne touche qu'aux anciennes données).
-- NB : la colonne fournisseurs.livraison (le fournisseur livre-t-il ?) est une vraie
--      information de l'annuaire : elle est conservée.
-- =============================================================================

-- ---------- Constantes de calcul ---------------------------------------------
update public.types_projets
set parametres = parametres - 'heuresPour10m2' - 'heuresParM3' - 'tauxHoraire'
                            - 'livraisonFixe' - 'livraisonParTonne' - 'finitions'
where parametres ?| array['heuresPour10m2', 'heuresParM3', 'tauxHoraire', 'livraisonFixe', 'livraisonParTonne', 'finitions'];

update public.types_projets set hypotheses = null
where hypotheses ilike '%main-d%' or hypotheses ilike '%livraison%';

-- ---------- Matériaux --------------------------------------------------------
update public.materiaux set libelle = 'Carrelage extérieur'
where id = 'carrelage' and libelle = 'Carrelage extérieur posé';

-- ---------- Estimations déjà enregistrées ------------------------------------
-- total = matériaux (+ frais BTM au même taux, recalculés sur les matériaux, si le devis en avait)
update public.projets p
set resultat = (p.resultat - 'mainOeuvre' - 'livraison' - 'sousTotal' - 'fraisService' - 'total')
      || case when p.resultat ? 'fraisService'
           then jsonb_build_object(
             'sousTotal', m.materiaux,
             'fraisService', jsonb_build_object('taux', m.taux, 'montant', round(m.materiaux * m.taux / 100, 2)),
             'total', round(m.materiaux + round(m.materiaux * m.taux / 100, 2), 2))
           else jsonb_build_object('total', round(m.materiaux, 2))
         end,
    cout_total = case when p.resultat ? 'fraisService'
                   then round(m.materiaux + round(m.materiaux * m.taux / 100, 2), 2)
                   else round(m.materiaux, 2)
                 end
from (
  select id,
         coalesce((resultat ->> 'totalMateriaux')::numeric, 0)         as materiaux,
         coalesce((resultat -> 'fraisService' ->> 'taux')::numeric, 0) as taux
  from public.projets
) m
where m.id = p.id
  and (p.resultat ? 'mainOeuvre' or p.resultat ? 'livraison');

notify pgrst, 'reload schema';


-- >>>>>>>>>> 0009_codes_promo.sql <<<<<<<<<<
-- =============================================================================
-- BTM — Migration 0009 : codes promo (réductions sur les devis)
-- =============================================================================
--   * codes_promo : créés et gérés uniquement par l'admin (/admin → Codes promo).
--       type    : 'pourcentage' (ex. 10 %) ou 'montant' (ex. 20 €)
--       portee  : 'total' (réduction sur tout le devis) ou 'frais' (sur les frais de service BTM seulement)
--       expire_le : dernier jour de validité (inclus, heure de Mayotte) ; null = sans limite
--   * Le public ne peut PAS lister les codes : il vérifie un code précis via la fonction
--     verifier_code_promo(), qui ne renvoie que la réduction d'un code actif et non expiré.
-- =============================================================================

create table if not exists public.codes_promo (
  id          uuid primary key default gen_random_uuid(),
  code        text not null check (code ~ '^[A-Z0-9_-]{3,30}$'),
  type        text not null check (type in ('pourcentage', 'montant')),
  valeur      numeric(10,2) not null check (valeur > 0),
  portee      text not null default 'total' check (portee in ('total', 'frais')),
  expire_le   date,
  actif       boolean not null default true,
  note        text check (char_length(note) <= 200),
  cree_le     timestamptz not null default now(),
  constraint codes_promo_pourcentage_max check (type <> 'pourcentage' or valeur <= 100)
);

create unique index if not exists uniq_codes_promo_code on public.codes_promo (upper(code));

alter table public.codes_promo enable row level security;

drop policy if exists "codes promo : lecture admin" on public.codes_promo;
create policy "codes promo : lecture admin"
  on public.codes_promo for select to authenticated using (public.est_admin());

drop policy if exists "codes promo : insertion admin" on public.codes_promo;
create policy "codes promo : insertion admin"
  on public.codes_promo for insert to authenticated with check (public.est_admin());

drop policy if exists "codes promo : mise a jour admin" on public.codes_promo;
create policy "codes promo : mise a jour admin"
  on public.codes_promo for update to authenticated using (public.est_admin()) with check (public.est_admin());

drop policy if exists "codes promo : suppression admin" on public.codes_promo;
create policy "codes promo : suppression admin"
  on public.codes_promo for delete to authenticated using (public.est_admin());

grant select, insert, update, delete on public.codes_promo to authenticated;

-- ---------- Vérification publique d'un code ------------------------------------
-- SECURITY DEFINER : lit la table malgré la RLS, mais ne renvoie que la ligne du code demandé,
-- s'il est actif et pas expiré. Impossible d'obtenir la liste des codes par ce biais.
create or replace function public.verifier_code_promo(p_code text)
returns table (code text, type text, valeur numeric, portee text, expire_le date)
language sql
stable
security definer
set search_path = public
as $$
  select c.code, c.type, c.valeur, c.portee, c.expire_le
  from public.codes_promo c
  where upper(c.code) = upper(trim(p_code))
    and c.actif
    and (c.expire_le is null or c.expire_le >= (now() at time zone 'Indian/Mayotte')::date)
  limit 1;
$$;

revoke execute on function public.verifier_code_promo(text) from public;
grant execute on function public.verifier_code_promo(text) to anon, authenticated;

notify pgrst, 'reload schema';


-- >>>>>>>>>> 0010_paiements_versements.sql <<<<<<<<<<
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


-- >>>>>>>>>> 0011_comptes_professionnels.sql <<<<<<<<<<
-- =============================================================================
-- BTM — Migration 0011 : comptes professionnels vérifiés
-- =============================================================================
-- À l'inscription, l'utilisateur choisit « particulier » ou « professionnel ».
-- Un professionnel fournit son SIRET et sa raison sociale ; son compte fonctionne
-- aussitôt, mais il n'est reconnu comme professionnel qu'après vérification par l'admin.
--   pro_statut : null (particulier) | 'en_attente' | 'verifie' | 'refuse'
-- Toutes les modifications passent par des fonctions : depuis 0010, l'utilisateur ne peut
-- plus écrire directement dans profils.
-- Retire aussi à l'admin le droit de confirmer un paiement (seul le fournisseur le peut).
-- À exécuter APRÈS 0010.
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

-- Comptes déjà marqués « professionnel » avant cette migration : à vérifier aussi
update public.profils set pro_statut = 'en_attente', pro_demande_le = coalesce(pro_demande_le, now())
where type_profil = 'professionnel' and pro_statut is null;

-- =============================================================================
-- Paiements : SEUL le fournisseur choisi dans le devis confirme (ou annule) un paiement.
-- L'admin ne sait pas si le client a payé : il n'a plus ce droit (remplace les fonctions de 0010).
-- Un devis sans fournisseur reste donc prévisionnel.
-- =============================================================================
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
  if pr.fournisseur_id is null or pr.fournisseur_id is distinct from public.mon_fournisseur() then
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
  if pa.fournisseur_id is null or pa.fournisseur_id is distinct from public.mon_fournisseur() then
    raise exception 'Seul le fournisseur concerné peut annuler cette confirmation' using errcode = '42501';
  end if;
  delete from public.paiements where id = pa.id;
end;
$$;

notify pgrst, 'reload schema';

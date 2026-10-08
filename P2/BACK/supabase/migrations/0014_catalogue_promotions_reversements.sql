-- =============================================================================
-- BTM — Migration 0014 : catalogue du fournisseur, promotions, reversements à BTM
-- =============================================================================
-- 1. Catalogue : chaque fournisseur fixe SON prix et SON stock pour les matériaux BTM.
--    À l'encaissement, son prix remplace le prix de référence du devis, et le stock est décompté.
-- 2. Promotions : remises du fournisseur (% ou €, sur la commande ou un matériau, code facultatif).
-- 3. Encaissement v2 : quantités remises ligne par ligne (0 = non fourni), prix du catalogue,
--    promotion éventuelle. L'annulation restitue le stock.
-- 4. Reversements : le fournisseur encaisse tout et reverse à BTM ses frais de service
--    (revenu_btm des paiements), sur le RIB saisi par l'admin. Il déclare son virement ;
--    l'admin en valide la réception. BTM ne déclenche aucun virement.
-- À exécuter APRÈS 0013.
-- =============================================================================

-- ---------- 1. Catalogue du fournisseur ------------------------------------------------
create table if not exists public.catalogue_fournisseur (
  fournisseur_id  uuid not null references public.fournisseurs(id) on delete cascade,
  materiau_id     text not null references public.materiaux(id) on delete cascade,
  vendu           boolean not null default true,
  prix_unitaire   numeric(12,2) check (prix_unitaire is null or prix_unitaire >= 0),   -- null : prix de référence BTM
  stock           numeric(12,3) check (stock is null or stock >= 0),                   -- null : stock non suivi
  mis_a_jour_le   timestamptz not null default now(),
  primary key (fournisseur_id, materiau_id)
);
alter table public.catalogue_fournisseur enable row level security;
drop policy if exists "catalogue : lecture" on public.catalogue_fournisseur;
create policy "catalogue : lecture" on public.catalogue_fournisseur for select to authenticated
  using (fournisseur_id = public.mon_fournisseur() or public.est_admin());
drop policy if exists "catalogue : ecriture fournisseur" on public.catalogue_fournisseur;
create policy "catalogue : ecriture fournisseur" on public.catalogue_fournisseur for all to authenticated
  using (fournisseur_id = public.mon_fournisseur()) with check (fournisseur_id = public.mon_fournisseur());
grant select, insert, update, delete on public.catalogue_fournisseur to authenticated;

-- ---------- 2. Promotions du fournisseur -----------------------------------------------
create table if not exists public.promotions_fournisseur (
  id              uuid primary key default gen_random_uuid(),
  fournisseur_id  uuid not null references public.fournisseurs(id) on delete cascade,
  libelle         text not null check (char_length(btrim(libelle)) between 2 and 60),
  code            text check (code ~ '^[A-Z0-9-]{3,20}$'),
  type            text not null check (type in ('pourcentage', 'montant')),
  valeur          numeric(12,2) not null check (valeur > 0),
  materiau_id     text references public.materiaux(id) on delete cascade,   -- null : toute la commande
  debut           date not null default current_date,
  fin             date,
  actif           boolean not null default true,
  utilisations    integer not null default 0,
  cree_le         timestamptz not null default now(),
  check (type <> 'pourcentage' or valeur <= 100),
  check (fin is null or fin >= debut)
);
create unique index if not exists idx_promotions_code on public.promotions_fournisseur(fournisseur_id, code) where code is not null;
alter table public.promotions_fournisseur enable row level security;
drop policy if exists "promotions : lecture" on public.promotions_fournisseur;
create policy "promotions : lecture" on public.promotions_fournisseur for select to authenticated
  using (fournisseur_id = public.mon_fournisseur() or public.est_admin());
drop policy if exists "promotions : ecriture fournisseur" on public.promotions_fournisseur;
create policy "promotions : ecriture fournisseur" on public.promotions_fournisseur for all to authenticated
  using (fournisseur_id = public.mon_fournisseur()) with check (fournisseur_id = public.mon_fournisseur());
-- « utilisations » n'est jamais écrit par le navigateur : il est compté par l'encaissement
grant select, delete on public.promotions_fournisseur to authenticated;
grant insert (fournisseur_id, libelle, code, type, valeur, materiau_id, debut, fin, actif) on public.promotions_fournisseur to authenticated;
grant update (libelle, code, type, valeur, materiau_id, debut, fin, actif) on public.promotions_fournisseur to authenticated;

-- ---------- 3. Encaissement v2 ---------------------------------------------------------
alter table public.paiements add column if not exists remise_fournisseur numeric(12,2) not null default 0;
alter table public.paiements add column if not exists promotion jsonb;

drop function if exists public.encaisser_devis(uuid, text[], text, text, numeric);

create or replace function public.encaisser_devis(
  p_projet uuid,
  p_lignes jsonb,          -- [{ "id": "ciment", "quantite": 12 }] : quantité remise (0 = non fourni)
  p_moyen text,
  p_reference text,
  p_montant_recu numeric,
  p_promotion uuid
)
returns public.paiements
language plpgsql
security definer
set search_path = public
as $$
declare
  fid uuid := public.mon_fournisseur();
  pr public.projets;
  res public.paiements;
  ligne jsonb;
  cat public.catalogue_fournisseur;
  promo public.promotions_fournisseur;
  qte numeric;
  qte_devis numeric;
  prix numeric;
  st numeric;
  fournies jsonb := '[]'::jsonb;
  manquantes jsonb := '[]'::jsonb;
  materiaux numeric := 0;
  base_promo numeric := 0;
  remise_f numeric := 0;
  net numeric;
  taux numeric;
  frais numeric;
  total numeric;
  r jsonb;
  base numeric;
  brut numeric;
  reduction numeric := 0;
  montant numeric;
  ref text := nullif(btrim(coalesce(p_reference, '')), '');
  recu numeric;
  numero text;
begin
  if fid is null then raise exception 'Réservé aux comptes fournisseur.' using errcode = '42501'; end if;

  select * into pr from public.projets where id = p_projet for update;
  if not found then raise exception 'Devis introuvable.' using errcode = 'P0002'; end if;
  if pr.fournisseur_id is not null and pr.fournisseur_id <> fid then
    raise exception 'Ce devis a été établi pour un autre fournisseur.' using errcode = '42501';
  end if;
  select * into res from public.paiements where projet_id = pr.id;
  if found then raise exception 'Ce devis a déjà été encaissé (reçu %).', coalesce(res.numero_recu, 'sans numéro'); end if;

  if p_promotion is not null then
    select * into promo from public.promotions_fournisseur
      where id = p_promotion and fournisseur_id = fid and actif and debut <= current_date and (fin is null or fin >= current_date);
    if not found then raise exception 'Cette promotion n’est pas valable aujourd’hui.'; end if;
  end if;

  -- Lignes : quantité remise (bornée à celle du devis), prix du catalogue, contrôle et décompte du stock
  for ligne in select * from jsonb_array_elements(coalesce(pr.resultat -> 'lignes', '[]'::jsonb)) loop
    qte_devis := coalesce((ligne ->> 'quantite')::numeric, 0);
    select round(coalesce((l ->> 'quantite')::numeric, 0), 3) into qte
      from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb)) l where l ->> 'id' = ligne ->> 'id' limit 1;
    qte := coalesce(qte, qte_devis);
    if qte < 0 then raise exception 'Quantité négative pour %.', ligne ->> 'libelle'; end if;
    if qte > qte_devis then raise exception 'Quantité supérieure au devis pour % (% au maximum).', ligne ->> 'libelle', qte_devis; end if;

    select * into cat from public.catalogue_fournisseur where fournisseur_id = fid and materiau_id = ligne ->> 'id' for update;
    if qte = 0 or (found and not cat.vendu) then
      manquantes := manquantes || jsonb_build_array(ligne);
      continue;
    end if;
    prix := coalesce(cat.prix_unitaire, (ligne ->> 'prixUnitaire')::numeric, 0);
    if cat.stock is not null then
      if qte > cat.stock then raise exception 'Stock insuffisant pour % : il reste %.', ligne ->> 'libelle', cat.stock; end if;
      update public.catalogue_fournisseur set stock = stock - qte, mis_a_jour_le = now() where fournisseur_id = fid and materiau_id = ligne ->> 'id';
    end if;
    st := round(qte * prix, 2);
    materiaux := materiaux + st;
    if promo.id is not null and (promo.materiau_id is null or promo.materiau_id = ligne ->> 'id') then base_promo := base_promo + st; end if;
    fournies := fournies || jsonb_build_array(ligne || jsonb_build_object('quantite', qte, 'quantiteDevis', qte_devis, 'prixUnitaire', prix, 'sousTotal', st));
    if qte < qte_devis then
      manquantes := manquantes || jsonb_build_array(ligne || jsonb_build_object('quantite', qte_devis - qte, 'partiel', true));
    end if;
  end loop;
  materiaux := round(materiaux, 2);
  if jsonb_array_length(fournies) = 0 or materiaux <= 0 then raise exception 'Aucun matériau fourni : rien à encaisser.'; end if;

  -- Promotion du fournisseur (sur ses matériaux), puis frais BTM et code promo BTM du client
  if promo.id is not null then
    if base_promo <= 0 then raise exception 'La promotion « % » ne porte sur aucun matériau remis.', promo.libelle; end if;
    remise_f := round(least(base_promo, case when promo.type = 'montant' then promo.valeur else base_promo * promo.valeur / 100 end), 2);
  end if;
  net := materiaux - remise_f;
  taux := coalesce((pr.resultat -> 'fraisService' ->> 'taux')::numeric, 0);
  frais := round(net * taux / 100, 2);
  total := net + frais;
  r := pr.resultat -> 'remise';
  if r is not null and jsonb_typeof(r) = 'object' and coalesce((r ->> 'valeur')::numeric, 0) > 0 then
    base := case when r ->> 'portee' = 'frais' then frais else total end;
    brut := case when r ->> 'type' = 'montant' then (r ->> 'valeur')::numeric else base * (r ->> 'valeur')::numeric / 100 end;
    reduction := round(least(base, greatest(0, brut)), 2);
  end if;
  montant := round(total - reduction, 2);

  if p_moyen not in ('carte', 'especes', 'virement', 'cheque') then raise exception 'Moyen de paiement inconnu.'; end if;
  if p_moyen = 'especes' then
    recu := round(coalesce(p_montant_recu, 0), 2);
    if recu < montant then raise exception 'Montant reçu insuffisant : % € à encaisser.', montant; end if;
    ref := null;
  else
    recu := null;
    if ref is null then
      raise exception '%', case p_moyen
        when 'carte' then 'Indiquez le n° de transaction du ticket TPE.'
        when 'cheque' then 'Indiquez le n° du chèque.'
        else 'Indiquez la référence du virement.' end;
    end if;
    if char_length(ref) > 60 then raise exception 'Référence trop longue (60 caractères maximum).'; end if;
  end if;

  numero := 'R' || to_char(now() at time zone 'Indian/Mayotte', 'YYYY') || '-' || lpad(nextval('public.numero_recu_seq')::text, 6, '0');
  if pr.fournisseur_id is null then update public.projets set fournisseur_id = fid where id = pr.id; end if;
  if promo.id is not null then update public.promotions_fournisseur set utilisations = utilisations + 1 where id = promo.id; end if;

  insert into public.paiements (
    projet_id, projet_nom, fournisseur_id, montant_devis, revenu_btm, confirme_par,
    numero_recu, code_retrait, moyen, reference, montant_recu, rendu, montant_materiaux, lignes_fournies, lignes_manquantes,
    remise_fournisseur, promotion
  ) values (
    pr.id, pr.nom, fid, montant, greatest(0, frais - reduction), auth.uid(),
    numero, pr.code_retrait, p_moyen, ref, recu, case when recu is null then null else recu - montant end, materiaux, fournies, manquantes,
    remise_f, case when promo.id is null then null else jsonb_build_object('id', promo.id, 'libelle', promo.libelle, 'code', promo.code, 'type', promo.type, 'valeur', promo.valeur, 'montant', remise_f) end
  ) returning * into res;

  insert into public.journal_operations (fournisseur_id, projet_id, projet_nom, code_retrait, numero_recu, type, montant, moyen, details, par, par_email)
  values (fid, pr.id, pr.nom, pr.code_retrait, numero, 'encaissement', montant, p_moyen, to_jsonb(res), auth.uid(), (select email from auth.users where id = auth.uid()));
  return res;
end;
$$;
revoke execute on function public.encaisser_devis(uuid, jsonb, text, text, numeric, uuid) from public, anon;
grant execute on function public.encaisser_devis(uuid, jsonb, text, text, numeric, uuid) to authenticated;

-- Annulation : restitue le stock des matériaux remis (catalogue suivi)
create or replace function public.annuler_encaissement(p_projet uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fid uuid := public.mon_fournisseur();
  pa public.paiements;
  motif text := btrim(coalesce(p_motif, ''));
  ligne jsonb;
begin
  select * into pa from public.paiements where projet_id = p_projet for update;
  if not found then raise exception 'Aucun encaissement à annuler pour ce devis.' using errcode = 'P0002'; end if;
  if not (public.est_admin() or (fid is not null and pa.fournisseur_id = fid)) then
    raise exception 'Action non autorisée.' using errcode = '42501';
  end if;
  if char_length(motif) < 5 then raise exception 'Indiquez le motif de l’annulation (5 caractères minimum).'; end if;
  if char_length(motif) > 300 then raise exception 'Motif trop long (300 caractères maximum).'; end if;

  for ligne in select * from jsonb_array_elements(coalesce(pa.lignes_fournies, '[]'::jsonb)) loop
    update public.catalogue_fournisseur set stock = stock + coalesce((ligne ->> 'quantite')::numeric, 0), mis_a_jour_le = now()
      where fournisseur_id = pa.fournisseur_id and materiau_id = ligne ->> 'id' and stock is not null;
  end loop;
  if pa.promotion ? 'id' then
    update public.promotions_fournisseur set utilisations = greatest(0, utilisations - 1) where id = (pa.promotion ->> 'id')::uuid;
  end if;

  insert into public.journal_operations (fournisseur_id, projet_id, projet_nom, code_retrait, numero_recu, type, montant, moyen, motif, details, par, par_email)
  values (pa.fournisseur_id, pa.projet_id, pa.projet_nom, pa.code_retrait, pa.numero_recu, 'annulation', pa.montant_devis, pa.moyen, motif, to_jsonb(pa), auth.uid(), (select email from auth.users where id = auth.uid()));
  delete from public.paiements where id = pa.id;
end;
$$;

-- ---------- 4. Reversements des fournisseurs à BTM ------------------------------------
create table if not exists public.reversements (
  id              uuid primary key default gen_random_uuid(),
  fournisseur_id  uuid not null references public.fournisseurs(id) on delete cascade,
  montant         numeric(12,2) not null check (montant > 0),
  reference       text not null check (char_length(reference) between 3 and 60),
  declare_le      timestamptz not null default now(),
  declare_par     uuid references auth.users(id) on delete set null,
  statut          text not null default 'declare' check (statut in ('declare', 'valide', 'refuse')),
  statue_le       timestamptz,
  statue_par      uuid references auth.users(id) on delete set null,
  motif_refus     text check (char_length(motif_refus) <= 300)
);
create index if not exists idx_reversements_fournisseur on public.reversements(fournisseur_id, declare_le desc);
alter table public.reversements enable row level security;
drop policy if exists "reversements : lecture" on public.reversements;
create policy "reversements : lecture" on public.reversements for select to authenticated
  using (fournisseur_id = public.mon_fournisseur() or public.est_admin());
grant select on public.reversements to authenticated;   -- écritures : fonctions ci-dessous

-- RIB de BTM, communiqué aux fournisseurs pour leurs reversements
create or replace function public.rib_btm()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare p public.parametres_versement;
begin
  if public.mon_fournisseur() is null and not public.est_admin() then raise exception 'Action non autorisée.' using errcode = '42501'; end if;
  select * into p from public.parametres_versement where id = 1;
  if p.iban is null then return null; end if;
  return jsonb_build_object('titulaire', p.titulaire, 'iban', p.iban, 'bic', p.bic, 'banque', p.banque);
end;
$$;
revoke execute on function public.rib_btm() from public, anon;
grant execute on function public.rib_btm() to authenticated;

-- Le fournisseur déclare un virement fait à BTM (au plus ce qu'il doit encore)
create or replace function public.declarer_reversement(p_montant numeric, p_reference text)
returns public.reversements
language plpgsql
security definer
set search_path = public
as $$
declare
  fid uuid := public.mon_fournisseur();
  du numeric;
  ref text := btrim(coalesce(p_reference, ''));
  res public.reversements;
begin
  if fid is null then raise exception 'Réservé aux comptes fournisseur.' using errcode = '42501'; end if;
  if coalesce(p_montant, 0) <= 0 then raise exception 'Le montant doit être supérieur à 0.'; end if;
  if char_length(ref) < 3 then raise exception 'Indiquez la référence de votre virement.'; end if;
  select coalesce((select sum(revenu_btm) from public.paiements where fournisseur_id = fid), 0)
       - coalesce((select sum(montant) from public.reversements where fournisseur_id = fid and statut in ('declare', 'valide')), 0)
    into du;
  if round(p_montant, 2) > round(du, 2) then raise exception 'Montant supérieur à ce que vous devez à BTM (% €).', round(greatest(du, 0), 2); end if;
  insert into public.reversements (fournisseur_id, montant, reference, declare_par)
  values (fid, round(p_montant, 2), left(ref, 60), auth.uid()) returning * into res;
  return res;
end;
$$;
revoke execute on function public.declarer_reversement(numeric, text) from public, anon;
grant execute on function public.declarer_reversement(numeric, text) to authenticated;

-- L'admin confirme (ou non) avoir reçu le virement sur le compte BTM
create or replace function public.statuer_reversement(p_id uuid, p_valide boolean, p_motif text)
returns public.reversements
language plpgsql
security definer
set search_path = public
as $$
declare res public.reversements;
begin
  if not public.est_admin() then raise exception 'Réservé aux administrateurs.' using errcode = '42501'; end if;
  if not p_valide and char_length(btrim(coalesce(p_motif, ''))) < 5 then raise exception 'Indiquez pourquoi le virement n’est pas reçu (5 caractères minimum).'; end if;
  update public.reversements set statut = case when p_valide then 'valide' else 'refuse' end, statue_le = now(), statue_par = auth.uid(),
         motif_refus = case when p_valide then null else left(btrim(p_motif), 300) end
   where id = p_id and statut = 'declare' returning * into res;
  if not found then raise exception 'Reversement introuvable ou déjà traité.'; end if;
  return res;
end;
$$;
revoke execute on function public.statuer_reversement(uuid, boolean, text) from public, anon;
grant execute on function public.statuer_reversement(uuid, boolean, text) to authenticated;

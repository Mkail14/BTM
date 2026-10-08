-- =============================================================================
-- BTM — Migration 0016 : ruptures, articles du fournisseur, promotions à usage unique, projet pro
-- =============================================================================
-- 1. Rupture de stock : le fournisseur signale un matériau indisponible (il n'est plus vendu en caisse).
-- 2. Articles du fournisseur : ses propres produits (hors matériaux BTM), vendus en caisse en plus du devis.
-- 3. Usage unique par client :
--    - une promotion du fournisseur ne sert qu'une fois par client ;
--    - un code promo BTM ne sert qu'une fois par compte (vérifié à l'application et à l'encaissement).
-- 4. Type « ensemble » : projet professionnel regroupant plusieurs ouvrages (maisons, dalles, murs…).
-- À exécuter APRÈS 0015.
-- =============================================================================

-- ---------- 1. Rupture ------------------------------------------------------------------
alter table public.catalogue_fournisseur add column if not exists rupture boolean not null default false;

-- ---------- 2. Articles du fournisseur -------------------------------------------------
create table if not exists public.articles_fournisseur (
  id              uuid primary key default gen_random_uuid(),
  fournisseur_id  uuid not null references public.fournisseurs(id) on delete cascade,
  libelle         text not null check (char_length(btrim(libelle)) between 2 and 80),
  unite           text not null check (char_length(btrim(unite)) between 1 and 12),
  prix_unitaire   numeric(12,2) not null check (prix_unitaire >= 0),
  stock           numeric(12,3) check (stock is null or stock >= 0),
  rupture         boolean not null default false,
  vendu           boolean not null default true,
  cree_le         timestamptz not null default now(),
  mis_a_jour_le   timestamptz not null default now()
);
alter table public.articles_fournisseur enable row level security;
drop policy if exists "articles : lecture" on public.articles_fournisseur;
create policy "articles : lecture" on public.articles_fournisseur for select to authenticated
  using (fournisseur_id = public.mon_fournisseur() or public.est_admin());
drop policy if exists "articles : ecriture fournisseur" on public.articles_fournisseur;
create policy "articles : ecriture fournisseur" on public.articles_fournisseur for all to authenticated
  using (fournisseur_id = public.mon_fournisseur()) with check (fournisseur_id = public.mon_fournisseur());
grant select, insert, update, delete on public.articles_fournisseur to authenticated;

-- ---------- 3. Usage unique -------------------------------------------------------------
alter table public.paiements add column if not exists remise_btm_ignoree boolean not null default false;

/** Code promo BTM déjà utilisé par ce compte (sur un devis encaissé) ? */
create or replace function public.code_promo_deja_utilise(p_code text, p_utilisateur uuid default auth.uid(), p_sauf uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.paiements pa join public.projets p on p.id = pa.projet_id
    where p.utilisateur_id = p_utilisateur
      and (p_sauf is null or p.id <> p_sauf)
      and not pa.remise_btm_ignoree
      and upper(p.resultat -> 'remise' ->> 'code') = upper(btrim(p_code))
  );
$$;
revoke execute on function public.code_promo_deja_utilise(text, uuid, uuid) from public, anon;
grant execute on function public.code_promo_deja_utilise(text, uuid, uuid) to authenticated;

-- Recherche au comptoir : on indique aussi ce que ce client a déjà utilisé
create or replace function public.trouver_devis_par_code(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  fid uuid := public.mon_fournisseur();
  code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  pr public.projets;
  pa public.paiements;
begin
  if fid is null then raise exception 'Réservé aux comptes fournisseur.' using errcode = '42501'; end if;
  if char_length(code) <> 8 then raise exception 'Le code comporte 8 caractères (ex. K7QM-4XPA).' using errcode = '22023'; end if;
  code := substr(code, 1, 4) || '-' || substr(code, 5, 4);

  select * into pr from public.projets where code_retrait = code;
  if not found then raise exception 'Aucun devis ne correspond à ce code.' using errcode = 'P0002'; end if;
  if pr.fournisseur_id is not null and pr.fournisseur_id <> fid then
    raise exception 'Ce devis a été établi pour un autre fournisseur.' using errcode = '42501';
  end if;

  select * into pa from public.paiements where projet_id = pr.id;
  return jsonb_build_object(
    'id', pr.id, 'nom', pr.nom, 'type_projet_id', pr.type_projet_id, 'resultat', pr.resultat,
    'cout_total', pr.cout_total, 'cree_le', pr.cree_le, 'code_retrait', pr.code_retrait,
    'fournisseur_choisi', pr.fournisseur_id is not null,
    'paiement', case when pa.id is null then null else to_jsonb(pa) end,
    'promotions_utilisees', coalesce((
      select jsonb_agg(distinct x.promotion ->> 'id') from public.paiements x join public.projets p on p.id = x.projet_id
      where p.utilisateur_id = pr.utilisateur_id and x.fournisseur_id = fid and x.promotion ? 'id'), '[]'::jsonb),
    'code_btm_deja_utilise', case when pr.resultat -> 'remise' ->> 'code' is null then false
      else public.code_promo_deja_utilise(pr.resultat -> 'remise' ->> 'code', pr.utilisateur_id, pr.id) end
  );
end;
$$;

-- ---------- Encaissement v3 : articles en plus, ruptures, usage unique -----------------
drop function if exists public.encaisser_devis(uuid, jsonb, text, text, numeric, uuid);

create or replace function public.encaisser_devis(
  p_projet uuid,
  p_lignes jsonb,          -- [{ "id": "ciment", "quantite": 12 }] : quantité remise (0 = non fourni)
  p_moyen text,
  p_reference text,
  p_montant_recu numeric,
  p_promotion uuid,
  p_articles jsonb default '[]'::jsonb   -- [{ "id": "<uuid article>", "quantite": 2 }] : articles vendus en plus
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
  art public.articles_fournisseur;
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
  btm_ignoree boolean := false;
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
    if exists (select 1 from public.paiements x join public.projets p on p.id = x.projet_id
               where p.utilisateur_id = pr.utilisateur_id and x.promotion ->> 'id' = promo.id::text) then
      raise exception 'Ce client a déjà profité de la promotion « % » : elle ne sert qu’une fois par client.', promo.libelle;
    end if;
  end if;

  -- Matériaux du devis : quantité remise (bornée à celle du devis), prix du catalogue, rupture, stock
  for ligne in select * from jsonb_array_elements(coalesce(pr.resultat -> 'lignes', '[]'::jsonb)) loop
    qte_devis := coalesce((ligne ->> 'quantite')::numeric, 0);
    select round(coalesce((l ->> 'quantite')::numeric, 0), 3) into qte
      from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb)) l where l ->> 'id' = ligne ->> 'id' limit 1;
    qte := coalesce(qte, qte_devis);
    if qte < 0 then raise exception 'Quantité négative pour %.', ligne ->> 'libelle'; end if;
    if qte > qte_devis then raise exception 'Quantité supérieure au devis pour % (% au maximum).', ligne ->> 'libelle', qte_devis; end if;

    select * into cat from public.catalogue_fournisseur where fournisseur_id = fid and materiau_id = ligne ->> 'id' for update;
    if qte = 0 or (found and (not cat.vendu or cat.rupture)) then
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

  -- Articles du fournisseur vendus en plus
  for ligne in select * from jsonb_array_elements(coalesce(p_articles, '[]'::jsonb)) loop
    qte := round(coalesce((ligne ->> 'quantite')::numeric, 0), 3);
    continue when qte <= 0;
    select * into art from public.articles_fournisseur where id = (ligne ->> 'id')::uuid and fournisseur_id = fid for update;
    if not found then raise exception 'Article introuvable dans votre catalogue.'; end if;
    if not art.vendu or art.rupture then raise exception '« % » est en rupture ou n’est plus vendu.', art.libelle; end if;
    if art.stock is not null then
      if qte > art.stock then raise exception 'Stock insuffisant pour % : il reste %.', art.libelle, art.stock; end if;
      update public.articles_fournisseur set stock = stock - qte, mis_a_jour_le = now() where id = art.id;
    end if;
    st := round(qte * art.prix_unitaire, 2);
    materiaux := materiaux + st;
    if promo.id is not null and promo.materiau_id is null then base_promo := base_promo + st; end if;
    fournies := fournies || jsonb_build_array(jsonb_build_object('id', 'article:' || art.id, 'libelle', art.libelle, 'unite', art.unite,
      'quantite', qte, 'prixUnitaire', art.prix_unitaire, 'sousTotal', st, 'article', true));
  end loop;

  materiaux := round(materiaux, 2);
  if jsonb_array_length(fournies) = 0 or materiaux <= 0 then raise exception 'Aucun matériau fourni : rien à encaisser.'; end if;

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
    if public.code_promo_deja_utilise(r ->> 'code', pr.utilisateur_id, pr.id) then
      btm_ignoree := true;   -- code BTM déjà utilisé par ce client : pas de seconde réduction
    else
      base := case when r ->> 'portee' = 'frais' then frais else total end;
      brut := case when r ->> 'type' = 'montant' then (r ->> 'valeur')::numeric else base * (r ->> 'valeur')::numeric / 100 end;
      reduction := round(least(base, greatest(0, brut)), 2);
    end if;
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
    remise_fournisseur, promotion, remise_btm_ignoree
  ) values (
    pr.id, pr.nom, fid, montant, greatest(0, frais - reduction), auth.uid(),
    numero, pr.code_retrait, p_moyen, ref, recu, case when recu is null then null else recu - montant end, materiaux, fournies, manquantes,
    remise_f, case when promo.id is null then null else jsonb_build_object('id', promo.id, 'libelle', promo.libelle, 'code', promo.code, 'type', promo.type, 'valeur', promo.valeur, 'montant', remise_f) end,
    btm_ignoree
  ) returning * into res;

  insert into public.journal_operations (fournisseur_id, projet_id, projet_nom, code_retrait, numero_recu, type, montant, moyen, details, par, par_email)
  values (fid, pr.id, pr.nom, pr.code_retrait, numero, 'encaissement', montant, p_moyen, to_jsonb(res), auth.uid(), (select email from auth.users where id = auth.uid()));
  return res;
end;
$$;
revoke execute on function public.encaisser_devis(uuid, jsonb, text, text, numeric, uuid, jsonb) from public, anon;
grant execute on function public.encaisser_devis(uuid, jsonb, text, text, numeric, uuid, jsonb) to authenticated;

-- Annulation : restitue aussi le stock des articles du fournisseur
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
    if (ligne ->> 'id') like 'article:%' then
      update public.articles_fournisseur set stock = stock + coalesce((ligne ->> 'quantite')::numeric, 0), mis_a_jour_le = now()
        where id = substr(ligne ->> 'id', 9)::uuid and fournisseur_id = pa.fournisseur_id and stock is not null;
    else
      update public.catalogue_fournisseur set stock = stock + coalesce((ligne ->> 'quantite')::numeric, 0), mis_a_jour_le = now()
        where fournisseur_id = pa.fournisseur_id and materiau_id = ligne ->> 'id' and stock is not null;
    end if;
  end loop;
  if pa.promotion ? 'id' then
    update public.promotions_fournisseur set utilisations = greatest(0, utilisations - 1) where id = (pa.promotion ->> 'id')::uuid;
  end if;

  insert into public.journal_operations (fournisseur_id, projet_id, projet_nom, code_retrait, numero_recu, type, montant, moyen, motif, details, par, par_email)
  values (pa.fournisseur_id, pa.projet_id, pa.projet_nom, pa.code_retrait, pa.numero_recu, 'annulation', pa.montant_devis, pa.moyen, motif, to_jsonb(pa), auth.uid(), (select email from auth.users where id = auth.uid()));
  delete from public.paiements where id = pa.id;
end;
$$;

-- ---------- 4. Projet professionnel multi-ouvrages -------------------------------------
insert into public.types_projets (id, libelle, description, icone, ordre, parametres, accroche, hypotheses)
values ('ensemble', 'Projet professionnel', 'Plusieurs ouvrages réunis : maisons, dalles, murs, fondations, terrasses', 'fa-solid fa-city', 99, '{}'::jsonb,
        'Maisons et ouvrages combinés', 'Chaque ouvrage est calculé avec les mêmes règles que le calculateur ; les matériaux sont additionnés.')
on conflict (id) do nothing;

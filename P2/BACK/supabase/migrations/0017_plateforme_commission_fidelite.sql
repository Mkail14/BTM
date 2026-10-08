-- =============================================================================
-- BTM — Migration 0017 : modèle plateforme (commission fournisseur, prix BTM, fidélité)
-- =============================================================================
-- BTM ne vend rien : il met en relation le client et le fournisseur.
-- 1. Le client ne paie aucun frais : il paie ses matériaux au prix BTM du fournisseur
--    (plus bas que le prix comptoir, réservé aux achats avec un code de retrait).
-- 2. Le fournisseur reverse une commission à BTM (taux réglé par l'admin : contenus_site « frais »).
-- 3. Fidélité : une part de la commission revient au client en crédit, utilisable au comptoir.
-- 4. Offres publiques : ce que chaque fournisseur propose (prix BTM, prix comptoir, disponibilité).
-- 5. Type « achat » : achat direct de matériaux, sans mesures.
-- À exécuter APRÈS 0016.
-- =============================================================================

-- ---------- 1. Prix comptoir ------------------------------------------------------------
alter table public.catalogue_fournisseur add column if not exists prix_comptoir numeric(12,2) check (prix_comptoir is null or prix_comptoir >= 0);
alter table public.articles_fournisseur add column if not exists prix_comptoir numeric(12,2) check (prix_comptoir is null or prix_comptoir >= 0);

-- ---------- 2. Réglages : commission et fidélité ------------------------------------------
-- frais.taux = commission BTM (% des matériaux, payée par le fournisseur)
-- frais.fidelite = part de la commission rendue au client en crédit (%)
update public.contenus_site set valeur = valeur || jsonb_build_object('fidelite', coalesce((valeur ->> 'fidelite')::numeric, 25))
 where cle = 'frais';

create or replace function public.reglages_commission()
returns table (taux numeric, fidelite numeric)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((valeur ->> 'taux')::numeric, 1.25), coalesce((valeur ->> 'fidelite')::numeric, 25)
  from public.contenus_site where cle = 'frais'
  union all select 1.25, 25 where not exists (select 1 from public.contenus_site where cle = 'frais')
  limit 1;
$$;

-- ---------- 3. Offres publiques -----------------------------------------------------------
-- Ce que proposent les fournisseurs visibles : prix BTM (avec code), prix comptoir, disponibilité.
-- Le stock exact n'est pas publié : seulement disponible / en rupture.
create or replace function public.offres_publiques()
returns table (
  fournisseur_id uuid, fournisseur_nom text, commune text, livraison boolean,
  materiau_id text, article_id uuid, libelle text, unite text,
  prix numeric, prix_comptoir numeric, disponible boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.nom, f.commune, f.livraison, m.id, null::uuid, m.libelle, m.unite,
         coalesce(c.prix_unitaire, m.prix_unitaire), coalesce(c.prix_comptoir, c.prix_unitaire, m.prix_unitaire),
         not coalesce(c.rupture, false) and coalesce(c.stock, 1) > 0
  from public.fournisseurs f
  join public.catalogue_fournisseur c on c.fournisseur_id = f.id and c.vendu
  join public.materiaux m on m.id = c.materiau_id
  where f.actif
  union all
  select f.id, f.nom, f.commune, f.livraison, null, a.id, a.libelle, a.unite,
         a.prix_unitaire, coalesce(a.prix_comptoir, a.prix_unitaire), not a.rupture and coalesce(a.stock, 1) > 0
  from public.fournisseurs f
  join public.articles_fournisseur a on a.fournisseur_id = f.id and a.vendu
  where f.actif;
$$;
grant execute on function public.offres_publiques() to anon, authenticated;

-- ---------- 4. Crédit fidélité ------------------------------------------------------------
create table if not exists public.credits_fidelite (
  id              bigint generated always as identity primary key,
  utilisateur_id  uuid not null references auth.users(id) on delete cascade,
  paiement_id     uuid references public.paiements(id) on delete cascade,   -- annulation : écritures retirées
  montant         numeric(12,2) not null,                                   -- + gagné, − utilisé
  libelle         text not null,
  cree_le         timestamptz not null default now()
);
create index if not exists idx_credits_utilisateur on public.credits_fidelite(utilisateur_id);
alter table public.credits_fidelite enable row level security;
drop policy if exists "credits : lecture" on public.credits_fidelite;
create policy "credits : lecture" on public.credits_fidelite for select to authenticated
  using (utilisateur_id = auth.uid() or public.est_admin());
grant select on public.credits_fidelite to authenticated;   -- écritures : uniquement par l'encaissement

create or replace function public.solde_credit(p_utilisateur uuid default auth.uid())
returns numeric
language sql
stable
security definer
set search_path = public
as $$ select coalesce(round(sum(montant), 2), 0) from public.credits_fidelite where utilisateur_id = p_utilisateur; $$;
revoke execute on function public.solde_credit(uuid) from public, anon;
grant execute on function public.solde_credit(uuid) to authenticated;

alter table public.paiements add column if not exists commission numeric(12,2) not null default 0;
alter table public.paiements add column if not exists credit_utilise numeric(12,2) not null default 0;
alter table public.paiements add column if not exists credit_gagne numeric(12,2) not null default 0;

-- Recherche au comptoir : crédit du client en plus
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
      else public.code_promo_deja_utilise(pr.resultat -> 'remise' ->> 'code', pr.utilisateur_id, pr.id) end,
    'credit_disponible', public.solde_credit(pr.utilisateur_id),
    'commission', (select taux from public.reglages_commission())
  );
end;
$$;

-- ---------- 5. Encaissement v4 : le client paie ses matériaux, le fournisseur la commission --
drop function if exists public.encaisser_devis(uuid, jsonb, text, text, numeric, uuid, jsonb);

create or replace function public.encaisser_devis(
  p_projet uuid,
  p_lignes jsonb,
  p_moyen text,
  p_reference text,
  p_montant_recu numeric,
  p_promotion uuid,
  p_articles jsonb default '[]'::jsonb,
  p_credit numeric default 0            -- crédit fidélité du client utilisé
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
  part_fidelite numeric;
  commission numeric;
  r jsonb;
  brut numeric;
  reduction numeric := 0;
  btm_ignoree boolean := false;
  credit numeric := round(greatest(coalesce(p_credit, 0), 0), 2);
  gain numeric := 0;
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

  -- Promotion du fournisseur (à sa charge)
  if promo.id is not null then
    if base_promo <= 0 then raise exception 'La promotion « % » ne porte sur aucun matériau remis.', promo.libelle; end if;
    remise_f := round(least(base_promo, case when promo.type = 'montant' then promo.valeur else base_promo * promo.valeur / 100 end), 2);
  end if;
  net := materiaux - remise_f;

  -- Commission BTM (payée par le fournisseur, jamais par le client), au taux fixé par l'admin
  select rc.taux, rc.fidelite into taux, part_fidelite from public.reglages_commission() rc;
  commission := round(net * taux / 100, 2);

  -- Code promo BTM du client (à la charge de BTM : déduit de sa commission), une fois par compte
  r := pr.resultat -> 'remise';
  if r is not null and jsonb_typeof(r) = 'object' and coalesce((r ->> 'valeur')::numeric, 0) > 0 then
    if public.code_promo_deja_utilise(r ->> 'code', pr.utilisateur_id, pr.id) then
      btm_ignoree := true;
    else
      brut := case when r ->> 'type' = 'montant' then (r ->> 'valeur')::numeric else net * (r ->> 'valeur')::numeric / 100 end;
      reduction := round(least(net, greatest(0, brut)), 2);
    end if;
  end if;

  -- Crédit fidélité du client (à la charge de BTM)
  if credit > 0 then
    if credit > public.solde_credit(pr.utilisateur_id) then raise exception 'Crédit insuffisant : le client dispose de % €.', public.solde_credit(pr.utilisateur_id); end if;
    credit := least(credit, net - reduction);
  end if;
  montant := round(net - reduction - credit, 2);

  if p_moyen not in ('carte', 'especes', 'virement', 'cheque') then raise exception 'Moyen de paiement inconnu.'; end if;
  if montant > 0 or p_moyen <> 'especes' then
    if p_moyen = 'especes' then
      recu := round(coalesce(p_montant_recu, 0), 2);
      if recu < montant then raise exception 'Montant reçu insuffisant : % € à encaisser.', montant; end if;
      ref := null;
    else
      recu := null;
      if ref is null and montant > 0 then
        raise exception '%', case p_moyen
          when 'carte' then 'Indiquez le n° de transaction du ticket TPE.'
          when 'cheque' then 'Indiquez le n° du chèque.'
          else 'Indiquez la référence du virement.' end;
      end if;
      if char_length(coalesce(ref, '')) > 60 then raise exception 'Référence trop longue (60 caractères maximum).'; end if;
    end if;
  end if;

  numero := 'R' || to_char(now() at time zone 'Indian/Mayotte', 'YYYY') || '-' || lpad(nextval('public.numero_recu_seq')::text, 6, '0');
  if pr.fournisseur_id is null then update public.projets set fournisseur_id = fid where id = pr.id; end if;
  if promo.id is not null then update public.promotions_fournisseur set utilisations = utilisations + 1 where id = promo.id; end if;
  gain := round(commission * part_fidelite / 100, 2);

  -- revenu BTM = commission − ce que BTM offre (code promo, crédit utilisé)
  insert into public.paiements (
    projet_id, projet_nom, fournisseur_id, montant_devis, revenu_btm, confirme_par,
    numero_recu, code_retrait, moyen, reference, montant_recu, rendu, montant_materiaux, lignes_fournies, lignes_manquantes,
    remise_fournisseur, promotion, remise_btm_ignoree, commission, credit_utilise, credit_gagne
  ) values (
    pr.id, pr.nom, fid, montant, commission - reduction - credit, auth.uid(),
    numero, pr.code_retrait, p_moyen, ref, recu, case when recu is null then null else recu - montant end, materiaux, fournies, manquantes,
    remise_f, case when promo.id is null then null else jsonb_build_object('id', promo.id, 'libelle', promo.libelle, 'code', promo.code, 'type', promo.type, 'valeur', promo.valeur, 'montant', remise_f) end,
    btm_ignoree, commission, credit, gain
  ) returning * into res;

  if credit > 0 then
    insert into public.credits_fidelite (utilisateur_id, paiement_id, montant, libelle)
    values (pr.utilisateur_id, res.id, -credit, 'Utilisé chez le fournisseur · reçu ' || numero);
  end if;
  if gain > 0 then
    insert into public.credits_fidelite (utilisateur_id, paiement_id, montant, libelle)
    values (pr.utilisateur_id, res.id, gain, 'Gagné avec « ' || pr.nom || ' » · reçu ' || numero);
  end if;

  insert into public.journal_operations (fournisseur_id, projet_id, projet_nom, code_retrait, numero_recu, type, montant, moyen, details, par, par_email)
  values (fid, pr.id, pr.nom, pr.code_retrait, numero, 'encaissement', montant, p_moyen, to_jsonb(res), auth.uid(), (select email from auth.users where id = auth.uid()));
  return res;
end;
$$;
revoke execute on function public.encaisser_devis(uuid, jsonb, text, text, numeric, uuid, jsonb, numeric) from public, anon;
grant execute on function public.encaisser_devis(uuid, jsonb, text, text, numeric, uuid, jsonb, numeric) to authenticated;

-- ---------- 6. Achat direct -------------------------------------------------------------
insert into public.types_projets (id, libelle, description, icone, ordre, parametres, accroche, hypotheses)
values ('achat', 'Achat direct', 'Des matériaux choisis directement, sans mesures', 'fa-solid fa-cart-shopping', 98, '{}'::jsonb,
        'Je sais ce qu’il me faut', 'Quantités choisies par le client ; prix du fournisseur choisi.')
on conflict (id) do nothing;

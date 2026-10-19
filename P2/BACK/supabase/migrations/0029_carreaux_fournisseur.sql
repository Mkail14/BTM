-- =============================================================================================
-- 0029 — Carreaux des fournisseurs
--   0. Type de projet « carrelage » et ses matériaux (colle, joint, carrelage de sol).
--   1. Table carreaux_fournisseur : les modèles de carreaux qu'un fournisseur propose (nom, format,
--      finition, couleur, photo, prix à l'unité). Lecture publique des modèles actifs, écriture par
--      le fournisseur propriétaire.
--   2. encaisser_devis : une ligne « carreau:<id> » du devis est encaissée au prix du modèle, chez le
--      fournisseur qui le vend (les autres fournisseurs la voient comme manquante).
-- =============================================================================================

-- ---------- 0. Type de projet « Carrelage » et ses matériaux -------------------------------
-- projets.type_projet_id référence types_projets : sans cette ligne, un devis carrelage ne s'enregistre pas.
-- Les matériaux permettent aux fournisseurs de fixer leurs prix (catalogue) et à la caisse d'encaisser colle et joint.
insert into public.types_projets (id, libelle, description, accroche, hypotheses, icone, ordre, parametres) values
  ('carrelage', 'Carrelage', 'La pose de carreaux sur le sol d''une pièce', 'Carreaux, colle, joints',
   'Carreaux +10 % pour les coupes et la casse, colle 5 kg/m² (sacs de 25 kg), joint 0,5 kg/m².',
   'fa-solid fa-table-cells', 5, '{"margeCarreaux":1.1,"kgColleParM2":5,"kgParSacColle":25,"kgJointParM2":0.5}')
on conflict (id) do nothing;

insert into public.materiaux (id, libelle, unite, prix_unitaire, source) values
  ('carrelage_sol',   'Carrelage de sol intérieur',    'm²',  30.00, 'Prix provisoire – à vérifier fournisseurs'),
  ('colle_carrelage', 'Colle à carrelage (sac 25 kg)', 'sac', 16.00, 'Prix provisoire – à vérifier fournisseurs'),
  ('joint_carrelage', 'Mortier joint carrelage',       'kg',   3.50, 'Prix provisoire – à vérifier fournisseurs')
on conflict (id) do nothing;

-- ---------- 1. Modèles de carreaux -----------------------------------------------------------
create table if not exists public.carreaux_fournisseur (
  id              uuid primary key default gen_random_uuid(),
  fournisseur_id  uuid not null references public.fournisseurs(id) on delete cascade,
  nom             text not null check (char_length(btrim(nom)) between 2 and 60),
  format          text not null check (format in ('30x30', '45x45', '60x60')),
  finition        text check (finition is null or char_length(finition) <= 40),
  couleur         text not null default '#e9e5de' check (couleur ~ '^#[0-9a-fA-F]{6}$'),
  photo_url       text check (photo_url is null or photo_url ~ '^https://'),
  prix_unitaire   numeric(12,2) not null check (prix_unitaire > 0),               -- prix BTM d'un carreau
  prix_comptoir   numeric(12,2) check (prix_comptoir is null or prix_comptoir >= prix_unitaire),
  rupture         boolean not null default false,
  actif           boolean not null default true,
  cree_le         timestamptz not null default now(),
  mis_a_jour_le   timestamptz not null default now()
);
create index if not exists idx_carreaux_fournisseur_fournisseur on public.carreaux_fournisseur (fournisseur_id);
alter table public.carreaux_fournisseur enable row level security;

-- tout le monde voit les modèles actifs des fournisseurs actifs (choix dans le calculateur) ;
-- le fournisseur voit aussi ses modèles masqués, l'admin voit tout
drop policy if exists "carreaux : lecture" on public.carreaux_fournisseur;
create policy "carreaux : lecture" on public.carreaux_fournisseur for select to anon, authenticated
  using (
    (actif and exists (select 1 from public.fournisseurs f where f.id = fournisseur_id and f.actif))
    or fournisseur_id = public.mon_fournisseur()
    or public.est_admin()
  );
drop policy if exists "carreaux : ecriture fournisseur" on public.carreaux_fournisseur;
create policy "carreaux : ecriture fournisseur" on public.carreaux_fournisseur for all to authenticated
  using (fournisseur_id = public.mon_fournisseur() or public.est_admin())
  with check (fournisseur_id = public.mon_fournisseur() or public.est_admin());   -- l'admin peut masquer ou retirer un modèle
grant select on public.carreaux_fournisseur to anon;
grant select, insert, update, delete on public.carreaux_fournisseur to authenticated;

-- ---------- 2. Encaissement : lignes de carreaux ---------------------------------------------
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
  car public.carreaux_fournisseur;
  promo public.promotions_fournisseur;
  code_btm public.codes_promo;
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

    -- modèle de carreau (migration 0029) : vendu uniquement par le fournisseur qui l'a mis en ligne, à son prix
    if (ligne ->> 'id') like 'carreau:%' then
      select * into car from public.carreaux_fournisseur
        where id::text = substr(ligne ->> 'id', 9) and fournisseur_id = fid;
      if qte = 0 or not found or not car.actif or car.rupture then
        manquantes := manquantes || jsonb_build_array(ligne);
        continue;
      end if;
      st := round(qte * car.prix_unitaire, 2);
      materiaux := materiaux + st;
      if promo.id is not null and promo.materiau_id is null then base_promo := base_promo + st; end if;
      fournies := fournies || jsonb_build_array(ligne || jsonb_build_object('quantite', qte, 'quantiteDevis', qte_devis, 'prixUnitaire', car.prix_unitaire, 'sousTotal', st));
      if qte < qte_devis then
        manquantes := manquantes || jsonb_build_array(ligne || jsonb_build_object('quantite', qte_devis - qte, 'partiel', true));
      end if;
      continue;
    end if;

    select * into cat from public.catalogue_fournisseur where fournisseur_id = fid and materiau_id = ligne ->> 'id' for update;
    if qte = 0 or (found and (not cat.vendu or cat.rupture)) then
      manquantes := manquantes || jsonb_build_array(ligne);
      continue;
    end if;
    -- prix du fournisseur, sinon prix de référence BTM : jamais le prix écrit dans le devis (modifiable par le client)
    prix := coalesce(cat.prix_unitaire, (select m.prix_unitaire from public.materiaux m where m.id = ligne ->> 'id'));
    if prix is null then
      raise exception 'Aucun prix pour « % » : indiquez votre prix dans votre catalogue avant d’encaisser.', ligne ->> 'libelle';
    end if;
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

  -- Code promo BTM du client (à la charge de BTM), une fois par compte. Seul le NOM du code vient du devis :
  -- type et valeur sont relus dans la table (code actif, valable le jour du devis, hors anciens codes « frais »).
  if jsonb_typeof(pr.resultat -> 'remise') = 'object' and nullif(btrim(pr.resultat -> 'remise' ->> 'code'), '') is not null then
    select * into code_btm from public.codes_promo c
      where upper(c.code) = upper(btrim(pr.resultat -> 'remise' ->> 'code'))
        and c.actif and c.portee = 'total'
        and (c.expire_le is null or c.expire_le >= (pr.cree_le at time zone 'Indian/Mayotte')::date);
    if not found then
      btm_ignoree := true;
    elsif public.code_promo_deja_utilise(code_btm.code, pr.utilisateur_id, pr.id) then
      btm_ignoree := true;
    else
      brut := case when code_btm.type = 'montant' then code_btm.valeur else net * code_btm.valeur / 100 end;
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
  gain := public.credit_fidelite_gagne(montant, commission);

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


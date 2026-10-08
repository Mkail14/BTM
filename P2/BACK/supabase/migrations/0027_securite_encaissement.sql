-- =====================================================================================================
-- 0027 — Sécurité (diagnostic du 8 octobre 2026)
--   1. Encaissement : la remise BTM est relue dans la table des codes promo (jamais dans le devis du client),
--      et un matériau sans prix chez le fournisseur prend le prix de référence BTM (jamais celui du devis).
--   2. Un devis encaissé ne peut plus être modifié par son propriétaire (prix, quantités, fournisseur).
--   3. Limites d'essais : vérification des codes promo (10 codes faux par heure et par compte),
--      fonction « compte suspendu » (5 essais par quart d'heure et par adresse), assistante Awa (fonction serveur).
--   4. Ménage : fonctions de déclencheur non appelables par l'API, search_path fixé, codes promo réservés aux comptes.
--   5. Performances : index des clés étrangères, règles RLS qui ne relisent plus auth.uid() à chaque ligne.
-- =====================================================================================================

-- ---------- 3. Compteur d'essais générique (lu et écrit uniquement par les fonctions serveur) ----------
create table if not exists public.limites_essais (
  id   bigserial primary key,
  cle  text not null,
  le   timestamptz not null default now()
);
create index if not exists idx_limites_essais_cle_le on public.limites_essais (cle, le);
alter table public.limites_essais enable row level security; -- aucune règle : invisible depuis l'API

/** Compte un essai pour `p_cle` ; vrai si la limite `p_max` est déjà atteinte sur la fenêtre (l'essai n'est alors pas compté) */
create or replace function public.limite_atteinte(p_cle text, p_max integer, p_fenetre interval)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare n integer;
begin
  delete from public.limites_essais where cle = p_cle and le < now() - p_fenetre;
  select count(*) into n from public.limites_essais where cle = p_cle;
  if n >= p_max then return true; end if;
  insert into public.limites_essais (cle) values (p_cle);
  return false;
end;
$$;
revoke execute on function public.limite_atteinte(text, integer, interval) from public, anon, authenticated;
grant execute on function public.limite_atteinte(text, integer, interval) to service_role;

-- ---------- 3a. Codes promo : réservés aux comptes, 10 codes faux par heure ----------
create or replace function public.verifier_code_promo(p_code text)
returns table(code text, type text, valeur numeric, portee text, expire_le date)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_cle text := 'promo:' || coalesce(auth.uid()::text, 'anonyme');
begin
  if (select count(*) from public.limites_essais l where l.cle = v_cle and l.le > now() - interval '1 hour') >= 10 then
    raise exception 'Trop de codes essayés : réessayez dans une heure.' using errcode = '54000';
  end if;
  return query
    select c.code, c.type, c.valeur, c.portee, c.expire_le
    from public.codes_promo c
    where upper(c.code) = upper(trim(p_code))
      and c.actif
      and (c.expire_le is null or c.expire_le >= (now() at time zone 'Indian/Mayotte')::date)
    limit 1;
  if not found then -- seuls les codes faux comptent
    delete from public.limites_essais l where l.cle = v_cle and l.le < now() - interval '1 hour';
    insert into public.limites_essais (cle) values (v_cle);
  end if;
end;
$$;
revoke execute on function public.verifier_code_promo(text) from public, anon;
grant execute on function public.verifier_code_promo(text) to authenticated;

-- ---------- 3b. « Compte suspendu » : 5 essais par quart d'heure et par adresse ----------
create or replace function public.suspension_compte(p_email text, p_mot_de_passe text)
returns table(jusqua timestamptz, motif text)
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
begin
  if public.limite_atteinte('suspension:' || lower(trim(coalesce(p_email, ''))), 5, interval '15 minutes') then return; end if;
  return query
    select p.banni_jusqua, p.banni_motif
    from auth.users u
    join public.profils p on p.id = u.id
    where lower(u.email) = lower(trim(p_email))
      and u.encrypted_password = crypt(p_mot_de_passe, u.encrypted_password)
      and p.banni_le is not null
      and (p.banni_jusqua is null or p.banni_jusqua > now());
end;
$$;
grant execute on function public.suspension_compte(text, text) to anon, authenticated;

-- ---------- 1. Encaissement ----------
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

-- ---------- 2. Devis encaissé : figé pour son propriétaire ----------
create or replace function public.projets_figer_encaisse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.resultat is distinct from old.resultat or new.cout_total is distinct from old.cout_total
      or new.dimensions is distinct from old.dimensions or new.type_projet_id is distinct from old.type_projet_id
      or new.fournisseur_id is distinct from old.fournisseur_id)
     and exists (select 1 from public.paiements where projet_id = old.id)
     and not (public.est_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Ce devis a été encaissé : il ne peut plus être modifié.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists projets_figer_encaisse on public.projets;
create trigger projets_figer_encaisse before update on public.projets
  for each row execute function public.projets_figer_encaisse();

-- ---------- 4. Ménage ----------
-- Les fonctions de déclencheur ne s'appellent pas par l'API (le déclencheur, lui, fonctionne toujours)
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prorettype = 'trigger'::regtype loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
alter function public.proteger_admin_principal() set search_path = public;

-- ---------- 5. Performances : index des clés étrangères ----------
create index if not exists idx_articles_fournisseur_fournisseur on public.articles_fournisseur (fournisseur_id);
create index if not exists idx_catalogue_fournisseur_materiau on public.catalogue_fournisseur (materiau_id);
create index if not exists idx_contenus_site_mis_a_jour_par on public.contenus_site (mis_a_jour_par);
create index if not exists idx_credits_fidelite_paiement on public.credits_fidelite (paiement_id);
create index if not exists idx_journal_operations_par on public.journal_operations (par);
create index if not exists idx_journal_operations_projet on public.journal_operations (projet_id);
create index if not exists idx_paiements_confirme_par on public.paiements (confirme_par);
create index if not exists idx_paiements_fournisseur on public.paiements (fournisseur_id);
create index if not exists idx_parametres_versement_mis_a_jour_par on public.parametres_versement (mis_a_jour_par);
create index if not exists idx_profils_banni_par on public.profils (banni_par);
create index if not exists idx_profils_fournisseur on public.profils (fournisseur_id);
create index if not exists idx_promotions_fournisseur_materiau on public.promotions_fournisseur (materiau_id);
create index if not exists idx_realisations_fournisseur on public.realisations (fournisseur_id);
create index if not exists idx_realisations_projet on public.realisations (projet_id);
create index if not exists idx_reversements_declare_par on public.reversements (declare_par);
create index if not exists idx_reversements_statue_par on public.reversements (statue_par);
create index if not exists idx_support_conversations_utilisateur on public.support_conversations (utilisateur_id);
create index if not exists idx_versements_cree_par on public.versements (cree_par);

-- ---------- 5. Performances : auth.uid() lu une fois par requête, pas à chaque ligne ----------
alter policy "profil : lecture proprietaire" on public.profils using ((select auth.uid()) = id);
alter policy "profil : mise a jour proprietaire" on public.profils using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
alter policy "projets : lecture proprietaire" on public.projets using ((select auth.uid()) = utilisateur_id);
alter policy "projets : insertion proprietaire" on public.projets with check ((select auth.uid()) = utilisateur_id);
alter policy "projets : mise a jour proprietaire" on public.projets using ((select auth.uid()) = utilisateur_id) with check ((select auth.uid()) = utilisateur_id);
alter policy "projets : suppression proprietaire" on public.projets using ((select auth.uid()) = utilisateur_id);
alter policy "avis : suppression par le proprietaire" on public.avis using ((select auth.uid()) = utilisateur_id);
alter policy "avis : lecture proprietaire" on public.avis using ((select auth.uid()) = utilisateur_id);
alter policy "avis : publication par le proprietaire" on public.avis
  with check ((select auth.uid()) = utilisateur_id and demo = false and source = 'site');
alter policy "avis : modification proprietaire" on public.avis using ((select auth.uid()) = utilisateur_id) with check ((select auth.uid()) = utilisateur_id);
alter policy "paiements : lecture client" on public.paiements
  using (exists (select 1 from public.projets p where p.id = paiements.projet_id and p.utilisateur_id = (select auth.uid())));
alter policy "credits : lecture" on public.credits_fidelite using (utilisateur_id = (select auth.uid()) or public.est_admin());
alter policy "realisations : lecture proprietaire" on public.realisations using ((select auth.uid()) = utilisateur_id);
alter policy "realisations : reponse proprietaire" on public.realisations
  using ((select auth.uid()) = utilisateur_id and statut in ('proposee', 'soumise'))
  with check ((select auth.uid()) = utilisateur_id and statut in ('soumise', 'declinee'));

-- Un devis, plusieurs fournisseurs (gros chantiers, devis pro) :
--  - le client coche plusieurs fournisseurs : projets.fournisseurs (fournisseur_id reste le premier, pour l'existant) ;
--  - le même code BTM marche chez chacun d'eux ;
--  - chaque fournisseur encaisse ce qu'il a, à SES prix, sur ce qui reste à fournir : une ligne déjà remise par
--    un autre fournisseur n'est plus proposée (quantité restante = devis − déjà fourni ailleurs) ;
--  - un encaissement par fournisseur et par devis (au lieu d'un seul par devis) ;
--  - code promo BTM « montant » : partagé entre les encaissements (jamais plus que sa valeur au total) ;
--    code en % : appliqué à chaque encaissement.

-- ---------- Schéma ----------
alter table public.projets add column if not exists fournisseurs uuid[] not null default '{}';
update public.projets set fournisseurs = array[fournisseur_id] where fournisseur_id is not null and fournisseurs = '{}';
create index if not exists idx_projets_fournisseurs on public.projets using gin (fournisseurs);

alter table public.paiements drop constraint if exists paiements_projet_id_key;
create unique index if not exists paiements_projet_fournisseur_key on public.paiements (projet_id, fournisseur_id) where projet_id is not null;
create index if not exists idx_paiements_projet on public.paiements (projet_id);

-- ancienne confirmation (avant l'encaissement au comptoir) : elle supposait un seul paiement par devis
drop function if exists public.confirmer_paiement(uuid);

-- ---------- Accès des fournisseurs choisis ----------
/** Le fournisseur connecté fait-il partie de ceux choisis par le client ? (aucun choix : tous) */
create or replace function public.fournisseur_autorise(pr public.projets, fid uuid)
 returns boolean
 language sql
 immutable
as $function$
  select (pr.fournisseur_id is null and coalesce(cardinality(pr.fournisseurs), 0) = 0)
      or pr.fournisseur_id = fid or fid = any(pr.fournisseurs);
$function$;

drop policy if exists "projets : lecture fournisseur choisi" on public.projets;
create policy "projets : lecture fournisseur choisi" on public.projets as PERMISSIVE for SELECT to authenticated
  using (mon_fournisseur() is not null and (fournisseur_id = mon_fournisseur() or mon_fournisseur() = any(fournisseurs)));

create or replace function public.projets_figer_encaisse()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if (new.resultat is distinct from old.resultat or new.cout_total is distinct from old.cout_total
      or new.dimensions is distinct from old.dimensions or new.type_projet_id is distinct from old.type_projet_id
      or new.fournisseur_id is distinct from old.fournisseur_id or new.fournisseurs is distinct from old.fournisseurs)
     and exists (select 1 from public.paiements where projet_id = old.id)
     and not (public.est_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Ce devis a été encaissé : il ne peut plus être modifié.' using errcode = '42501';
  end if;
  return new;
end;
$function$;

/** Quantités déjà remises par les AUTRES fournisseurs sur ce devis : { id de ligne: quantité } */
create or replace function public.deja_fourni_ailleurs(p_projet uuid, p_fournisseur uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(jsonb_object_agg(id, qte), '{}'::jsonb) from (
    select l ->> 'id' as id, sum(coalesce((l ->> 'quantite')::numeric, 0)) as qte
    from public.paiements pa, jsonb_array_elements(coalesce(pa.lignes_fournies, '[]'::jsonb)) l
    where pa.projet_id = p_projet and pa.fournisseur_id is distinct from p_fournisseur
      and coalesce((l ->> 'article')::boolean, false) = false
    group by 1
  ) t;
$function$;
revoke all on function public.deja_fourni_ailleurs(uuid, uuid) from public, anon, authenticated;

/** Le devis avec, pour chaque ligne, la quantité qui reste à fournir (lignes épuisées retirées) */
create or replace function public.devis_reste_a_fournir(pr public.projets, fid uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select jsonb_set(pr.resultat, '{lignes}', coalesce((
    select jsonb_agg(l || jsonb_build_object('quantite', round(coalesce((l ->> 'quantite')::numeric, 0) - coalesce((x.d ->> (l ->> 'id'))::numeric, 0), 3)))
    from jsonb_array_elements(coalesce(pr.resultat -> 'lignes', '[]'::jsonb)) l, (select public.deja_fourni_ailleurs(pr.id, fid) as d) x
    where coalesce((l ->> 'quantite')::numeric, 0) - coalesce((x.d ->> (l ->> 'id'))::numeric, 0) > 0
  ), '[]'::jsonb));
$function$;
revoke all on function public.devis_reste_a_fournir(public.projets, uuid) from public, anon, authenticated;

-- ---------- Recherche par code ----------
create or replace function public.trouver_devis_par_code(p_code text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  fid uuid := public.mon_fournisseur();
  code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  pr public.projets;
  pa public.paiements;
  ailleurs jsonb;
begin
  if fid is null then raise exception 'Réservé aux comptes fournisseur.' using errcode = '42501'; end if;
  if char_length(code) <> 8 then raise exception 'Le code comporte 8 caractères (ex. K7QM-4XPA).' using errcode = '22023'; end if;
  code := substr(code, 1, 4) || '-' || substr(code, 5, 4);

  select * into pr from public.projets where code_retrait = code;
  if not found then raise exception 'Aucun devis ne correspond à ce code.' using errcode = 'P0002'; end if;
  if not public.fournisseur_autorise(pr, fid) then
    raise exception 'Ce devis a été établi pour d’autres fournisseurs.' using errcode = '42501';
  end if;

  select * into pa from public.paiements where projet_id = pr.id and fournisseur_id = fid;
  -- déjà encaissé ici : on montre le devis tel quel ; sinon seulement ce qui reste à fournir
  ailleurs := (select coalesce(jsonb_agg(jsonb_build_object('fournisseur', f.nom, 'numero_recu', x.numero_recu, 'lignes', x.lignes_fournies)), '[]'::jsonb)
               from public.paiements x left join public.fournisseurs f on f.id = x.fournisseur_id
               where x.projet_id = pr.id and x.fournisseur_id is distinct from fid);
  return jsonb_build_object(
    'id', pr.id, 'nom', pr.nom, 'type_projet_id', pr.type_projet_id,
    'resultat', case when pa.id is null then public.devis_reste_a_fournir(pr, fid) else pr.resultat end,
    'cout_total', pr.cout_total, 'cree_le', pr.cree_le, 'code_retrait', pr.code_retrait,
    'fournisseur_choisi', fid = pr.fournisseur_id or fid = any(pr.fournisseurs),
    'plusieurs_fournisseurs', coalesce(cardinality(pr.fournisseurs), 0) > 1,
    'encaissements_ailleurs', ailleurs,
    'paiement', case when pa.id is null then null else to_jsonb(pa) end,
    'promotions_utilisees', coalesce((
      select jsonb_agg(distinct x.promotion ->> 'id') from public.paiements x join public.projets p on p.id = x.projet_id
      where p.utilisateur_id = pr.utilisateur_id and x.fournisseur_id = fid and x.promotion ? 'id'), '[]'::jsonb),
    'code_btm_deja_utilise', case when pr.resultat -> 'remise' ->> 'code' is null then false
      else public.code_promo_deja_utilise(pr.resultat -> 'remise' ->> 'code', pr.utilisateur_id, pr.id) end,
    'remise_btm_deja_appliquee', coalesce((select sum(greatest(0, x.commission - x.credit_utilise - x.revenu_btm)) from public.paiements x
      where x.projet_id = pr.id and x.fournisseur_id is distinct from fid), 0),
    'credit_disponible', public.solde_credit(pr.utilisateur_id),
    'utiliser_credit', pr.utiliser_credit,
    'commission', (select taux from public.reglages_commission())
  );
end;
$function$;

-- ---------- Encaissement ----------
create or replace function public.encaisser_devis(p_projet uuid, p_lignes jsonb, p_moyen text, p_reference text, p_montant_recu numeric, p_promotion uuid, p_articles jsonb DEFAULT '[]'::jsonb, p_credit numeric DEFAULT 0)
 returns paiements
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  ailleurs jsonb;
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
  deja_offert numeric := 0;
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
  if not public.fournisseur_autorise(pr, fid) then
    raise exception 'Ce devis a été établi pour d’autres fournisseurs.' using errcode = '42501';
  end if;
  select * into res from public.paiements where projet_id = pr.id and fournisseur_id = fid;
  if found then raise exception 'Vous avez déjà encaissé ce devis (reçu %).', coalesce(res.numero_recu, 'sans numéro'); end if;
  ailleurs := public.deja_fourni_ailleurs(pr.id, fid);

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
    -- ce qui reste à fournir : le devis moins ce que les autres fournisseurs ont déjà remis
    qte_devis := round(coalesce((ligne ->> 'quantite')::numeric, 0) - coalesce((ailleurs ->> (ligne ->> 'id'))::numeric, 0), 3);
    continue when qte_devis <= 0;
    ligne := ligne || jsonb_build_object('quantite', qte_devis);
    select round(coalesce((l ->> 'quantite')::numeric, 0), 3) into qte
      from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb)) l where l ->> 'id' = ligne ->> 'id' limit 1;
    qte := coalesce(qte, qte_devis);
    if qte < 0 then raise exception 'Quantité négative pour %.', ligne ->> 'libelle'; end if;
    if qte > qte_devis then raise exception 'Quantité supérieure à ce qui reste à fournir pour % (% au maximum).', ligne ->> 'libelle', qte_devis; end if;

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

  if promo.id is not null then
    if base_promo <= 0 then raise exception 'La promotion « % » ne porte sur aucun matériau remis.', promo.libelle; end if;
    remise_f := round(least(base_promo, case when promo.type = 'montant' then promo.valeur else base_promo * promo.valeur / 100 end), 2);
  end if;
  net := materiaux - remise_f;

  select rc.taux, rc.fidelite into taux, part_fidelite from public.reglages_commission() rc;
  commission := round(net * taux / 100, 2);

  -- Code promo BTM (à la charge de BTM) : en % sur chaque encaissement ; en € partagé entre les fournisseurs du devis
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
      select coalesce(sum(greatest(0, x.commission - x.credit_utilise - x.revenu_btm)), 0) into deja_offert
        from public.paiements x where x.projet_id = pr.id;
      brut := case when code_btm.type = 'montant' then code_btm.valeur - deja_offert else net * code_btm.valeur / 100 end;
      reduction := round(least(net, greatest(0, brut)), 2);
    end if;
  end if;

  if credit > 0 and not pr.utiliser_credit then raise exception 'Le client a choisi de garder son crédit fidélité pour un autre achat.'; end if;
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
$function$;

-- ---------- Annulation : l'encaissement du fournisseur connecté (l'admin : le plus récent) ----------
create or replace function public.annuler_encaissement(p_projet uuid, p_motif text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  fid uuid := public.mon_fournisseur();
  pa public.paiements;
  motif text := btrim(coalesce(p_motif, ''));
  ligne jsonb;
begin
  select * into pa from public.paiements where projet_id = p_projet and (fid is null or fournisseur_id = fid)
    order by paye_le desc limit 1 for update;
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
$function$;

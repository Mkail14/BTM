-- =============================================================================
-- BTM — Migration 0013 : code de retrait, encaissement en caisse et traçabilité
-- =============================================================================
-- Parcours au comptoir du fournisseur :
--   1. le client présente son devis PDF, qui porte un code de retrait (ex. K7QM-4XPA) ;
--   2. le fournisseur tape le code (trouver_devis_par_code) et coche ce qu'il a en stock ;
--   3. il encaisse (encaisser_devis) : carte sur TPE, espèces, virement ou chèque.
--      Le montant est recalculé ici à partir des seuls matériaux fournis ;
--   4. un reçu numéroté est émis (R2026-000001…), et l'opération est inscrite au journal.
-- Une annulation exige un motif ; le journal garde tout (il n'est jamais modifié ni vidé).
-- Les anciennes fonctions confirmer_paiement / annuler_paiement ne sont plus accessibles :
-- tout encaissement passe par ce circuit tracé.
-- À exécuter APRÈS 0012.
-- =============================================================================

-- ---------- 1. Code de retrait des projets ---------------------------------------------
-- 8 caractères sans ambiguïté (ni 0/O, ni 1/I/L) : ~850 milliards de combinaisons
create or replace function public.generer_code_retrait()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  octets bytea;
  code text;
begin
  loop
    octets := uuid_send(gen_random_uuid());
    code := '';
    for i in 0..7 loop
      code := code || substr(alphabet, 1 + (get_byte(octets, i) % length(alphabet)), 1);
    end loop;
    code := substr(code, 1, 4) || '-' || substr(code, 5, 4);
    exit when not exists (select 1 from public.projets where code_retrait = code);
  end loop;
  return code;
end;
$$;

alter table public.projets add column if not exists code_retrait text;
update public.projets set code_retrait = public.generer_code_retrait() where code_retrait is null;
alter table public.projets alter column code_retrait set not null;
create unique index if not exists idx_projets_code_retrait on public.projets(code_retrait);

-- Le code est attribué par la base et ne change jamais (le client ne peut ni le choisir ni le modifier)
create or replace function public.proteger_code_retrait()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.code_retrait := public.generer_code_retrait();
  else
    new.code_retrait := old.code_retrait;
  end if;
  return new;
end;
$$;
drop trigger if exists projets_code_retrait on public.projets;
create trigger projets_code_retrait before insert or update on public.projets
  for each row execute function public.proteger_code_retrait();

-- ---------- 2. Détail des encaissements ------------------------------------------------
create sequence if not exists public.numero_recu_seq;

alter table public.paiements add column if not exists numero_recu text;
alter table public.paiements add column if not exists code_retrait text;
alter table public.paiements add column if not exists moyen text check (moyen in ('carte', 'especes', 'virement', 'cheque'));
alter table public.paiements add column if not exists reference text check (char_length(reference) <= 60);
alter table public.paiements add column if not exists montant_recu numeric(12,2);   -- espèces : somme remise par le client
alter table public.paiements add column if not exists rendu numeric(12,2);          -- espèces : monnaie rendue
alter table public.paiements add column if not exists montant_materiaux numeric(12,2);
alter table public.paiements add column if not exists lignes_fournies jsonb not null default '[]'::jsonb;
alter table public.paiements add column if not exists lignes_manquantes jsonb not null default '[]'::jsonb;
create unique index if not exists idx_paiements_numero_recu on public.paiements(numero_recu) where numero_recu is not null;

-- ---------- 3. Journal des opérations (ajout seul) ------------------------------------
create table if not exists public.journal_operations (
  id              bigint generated always as identity primary key,
  fournisseur_id  uuid references public.fournisseurs(id) on delete set null,
  projet_id       uuid references public.projets(id) on delete set null,
  projet_nom      text,
  code_retrait    text,
  numero_recu     text,
  type            text not null check (type in ('encaissement', 'annulation')),
  montant         numeric(12,2),
  moyen           text,
  motif           text,
  details         jsonb not null default '{}'::jsonb,   -- copie complète de l'encaissement
  par             uuid references auth.users(id) on delete set null,
  par_email       text,
  le              timestamptz not null default now()
);
create index if not exists idx_journal_fournisseur_le on public.journal_operations(fournisseur_id, le desc);

alter table public.journal_operations enable row level security;
drop policy if exists "journal : lecture fournisseur" on public.journal_operations;
create policy "journal : lecture fournisseur" on public.journal_operations for select to authenticated
  using (fournisseur_id is not null and fournisseur_id = public.mon_fournisseur());
drop policy if exists "journal : lecture admin" on public.journal_operations;
create policy "journal : lecture admin" on public.journal_operations for select to authenticated
  using (public.est_admin());
grant select on public.journal_operations to authenticated;   -- aucune écriture directe

-- ---------- 4. Retrouver un devis par son code ----------------------------------------
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
    'paiement', case when pa.id is null then null else to_jsonb(pa) end
  );
end;
$$;
revoke execute on function public.trouver_devis_par_code(text) from public, anon;
grant execute on function public.trouver_devis_par_code(text) to authenticated;

-- ---------- 5. Encaisser (matériaux fournis uniquement) --------------------------------
create or replace function public.encaisser_devis(
  p_projet uuid,
  p_indisponibles text[],
  p_moyen text,
  p_reference text,
  p_montant_recu numeric
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
  fournies jsonb := '[]'::jsonb;
  manquantes jsonb := '[]'::jsonb;
  materiaux numeric := 0;
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

  -- Matériaux fournis / manquants
  for ligne in select * from jsonb_array_elements(coalesce(pr.resultat -> 'lignes', '[]'::jsonb)) loop
    if (ligne ->> 'id') = any(coalesce(p_indisponibles, '{}')) then
      manquantes := manquantes || jsonb_build_array(ligne);
    else
      fournies := fournies || jsonb_build_array(ligne);
      materiaux := materiaux + coalesce((ligne ->> 'sousTotal')::numeric, 0);
    end if;
  end loop;
  materiaux := round(materiaux, 2);
  if jsonb_array_length(fournies) = 0 or materiaux <= 0 then
    raise exception 'Aucun matériau fourni : rien à encaisser.';
  end if;

  -- Mêmes règles que le calculateur : frais BTM en % des matériaux, puis code promo éventuel
  taux := coalesce((pr.resultat -> 'fraisService' ->> 'taux')::numeric, 0);
  frais := round(materiaux * taux / 100, 2);
  total := materiaux + frais;
  r := pr.resultat -> 'remise';
  if r is not null and jsonb_typeof(r) = 'object' and coalesce((r ->> 'valeur')::numeric, 0) > 0 then
    base := case when r ->> 'portee' = 'frais' then frais else total end;
    brut := case when r ->> 'type' = 'montant' then (r ->> 'valeur')::numeric else base * (r ->> 'valeur')::numeric / 100 end;
    reduction := round(least(base, greatest(0, brut)), 2);
  end if;
  montant := round(total - reduction, 2);

  -- Moyen de paiement
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

  -- Un devis sans fournisseur choisi est rattaché à celui qui l'encaisse
  if pr.fournisseur_id is null then
    update public.projets set fournisseur_id = fid where id = pr.id;
  end if;

  insert into public.paiements (
    projet_id, projet_nom, fournisseur_id, montant_devis, revenu_btm, confirme_par,
    numero_recu, code_retrait, moyen, reference, montant_recu, rendu, montant_materiaux, lignes_fournies, lignes_manquantes
  ) values (
    -- revenu BTM : même règle que 0010 (frais de service moins la réduction accordée)
    pr.id, pr.nom, fid, montant, greatest(0, frais - reduction), auth.uid(),
    numero, pr.code_retrait, p_moyen, ref, recu, case when recu is null then null else recu - montant end, materiaux, fournies, manquantes
  ) returning * into res;

  insert into public.journal_operations (fournisseur_id, projet_id, projet_nom, code_retrait, numero_recu, type, montant, moyen, details, par, par_email)
  values (fid, pr.id, pr.nom, pr.code_retrait, numero, 'encaissement', montant, p_moyen, to_jsonb(res), auth.uid(), (select email from auth.users where id = auth.uid()));

  return res;
end;
$$;
revoke execute on function public.encaisser_devis(uuid, text[], text, text, numeric) from public, anon;
grant execute on function public.encaisser_devis(uuid, text[], text, text, numeric) to authenticated;

-- ---------- 6. Annuler un encaissement (motif obligatoire, tracé au journal) -----------
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
begin
  select * into pa from public.paiements where projet_id = p_projet for update;
  if not found then raise exception 'Aucun encaissement à annuler pour ce devis.' using errcode = 'P0002'; end if;
  if not (public.est_admin() or (fid is not null and pa.fournisseur_id = fid)) then
    raise exception 'Action non autorisée.' using errcode = '42501';
  end if;
  if char_length(motif) < 5 then raise exception 'Indiquez le motif de l’annulation (5 caractères minimum).'; end if;
  if char_length(motif) > 300 then raise exception 'Motif trop long (300 caractères maximum).'; end if;

  insert into public.journal_operations (fournisseur_id, projet_id, projet_nom, code_retrait, numero_recu, type, montant, moyen, motif, details, par, par_email)
  values (pa.fournisseur_id, pa.projet_id, pa.projet_nom, pa.code_retrait, pa.numero_recu, 'annulation', pa.montant_devis, pa.moyen, motif, to_jsonb(pa), auth.uid(), (select email from auth.users where id = auth.uid()));

  delete from public.paiements where id = pa.id;
end;
$$;
revoke execute on function public.annuler_encaissement(uuid, text) from public, anon;
grant execute on function public.annuler_encaissement(uuid, text) to authenticated;

-- ---------- 7. Anciennes fonctions : plus d'encaissement hors circuit ------------------
revoke execute on function public.confirmer_paiement(uuid) from authenticated;
revoke execute on function public.annuler_paiement(uuid) from authenticated;

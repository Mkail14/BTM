-- Code promo BTM = cadeau payé par BTM, jamais par le fournisseur.
-- Le client paie le prix réduit ; le fournisseur doit toucher le prix complet. La remise est donc déduite de la
-- commission qu'il doit à BTM, et si elle la dépasse, c'est BTM qui lui doit la différence (revenu BTM négatif).
--  1. On retire le plafond « remise ≤ commission » ajouté par 20261022140000_registre_fonds.
--  2. reversements.sens : 'vers_btm' (le fournisseur paie BTM, comme avant) ou 'vers_fournisseur'
--     (BTM rembourse au fournisseur les remises qu'il a avancées). Solde = Σ revenu_btm − Σ vers_btm + Σ vers_fournisseur.
--  3. verser_au_fournisseur : l'admin enregistre le virement de BTM vers le fournisseur.

-- ---------- 1. Plus de plafond ----------
do $$
declare
  def text;
  neuf text;
begin
  def := pg_get_functiondef('public.encaisser_devis(uuid, jsonb, text, text, numeric, uuid, jsonb, numeric)'::regprocedure);
  if position('least(net, commission, greatest(0, brut))' in def) > 0 then
    neuf := replace(def, 'reduction := round(least(net, commission, greatest(0, brut)), 2);', 'reduction := round(least(net, greatest(0, brut)), 2);');
    execute neuf;
  end if;
end $$;

-- ---------- 2. Sens du virement ----------
alter table public.reversements add column if not exists sens text not null default 'vers_btm';
alter table public.reversements drop constraint if exists reversements_sens_check;
alter table public.reversements add constraint reversements_sens_check CHECK (sens = ANY (ARRAY['vers_btm'::text, 'vers_fournisseur'::text]));

/** Ce que le fournisseur doit à BTM (négatif : BTM lui doit), virements en vérification compris */
create or replace function public.solde_fournisseur(p_fournisseur uuid)
 returns numeric
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select round(
    coalesce((select sum(revenu_btm) from public.paiements where fournisseur_id = p_fournisseur), 0)
    - coalesce((select sum(case when sens = 'vers_fournisseur' then -montant else montant end) from public.reversements
                where fournisseur_id = p_fournisseur and statut in ('valide', 'declare')), 0), 2);
$function$;
revoke all on function public.solde_fournisseur(uuid) from public, anon, authenticated;

create or replace function public.declarer_reversement(p_montant numeric, p_reference text)
 returns reversements
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  fid uuid := public.mon_fournisseur();
  du numeric;
  ref text := btrim(coalesce(p_reference, ''));
  res public.reversements;
begin
  if fid is null then raise exception 'Réservé aux comptes fournisseur.' using errcode = '42501'; end if;
  if coalesce(p_montant, 0) <= 0 then raise exception 'Le montant doit être supérieur à 0.'; end if;
  if char_length(ref) < 3 then raise exception 'Indiquez la référence de votre virement.'; end if;
  du := public.solde_fournisseur(fid);
  if round(p_montant, 2) > round(du, 2) then
    raise exception 'Montant supérieur à ce que vous devez à BTM (% €, virements en vérification déduits).', round(greatest(du, 0), 2);
  end if;
  insert into public.reversements (fournisseur_id, montant, reference, declare_par, statut, sens)
  values (fid, round(p_montant, 2), left(ref, 60), auth.uid(), 'declare', 'vers_btm') returning * into res;
  return res;
end;
$function$;
revoke all on function public.declarer_reversement(numeric, text) from public, anon, authenticated;
grant execute on function public.declarer_reversement(numeric, text) to authenticated;

-- ---------- 3. Virement de BTM vers un fournisseur ----------
create or replace function public.verser_au_fournisseur(p_fournisseur uuid, p_montant numeric, p_reference text)
 returns reversements
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  du numeric;
  ref text := btrim(coalesce(p_reference, ''));
  res public.reversements;
begin
  if not public.est_admin() then raise exception 'Réservé aux administrateurs.' using errcode = '42501'; end if;
  if coalesce(p_montant, 0) <= 0 then raise exception 'Le montant doit être supérieur à 0.'; end if;
  if char_length(ref) < 3 then raise exception 'Indiquez la référence de votre virement.'; end if;
  du := -public.solde_fournisseur(p_fournisseur);
  if round(p_montant, 2) > round(du, 2) then
    raise exception 'Montant supérieur à ce que BTM doit à ce fournisseur (% €).', round(greatest(du, 0), 2);
  end if;
  insert into public.reversements (fournisseur_id, montant, reference, declare_par, statut, statue_le, statue_par, sens)
  values (p_fournisseur, round(p_montant, 2), left(ref, 60), auth.uid(), 'valide', now(), auth.uid(), 'vers_fournisseur') returning * into res;
  return res;
end;
$function$;
revoke all on function public.verser_au_fournisseur(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.verser_au_fournisseur(uuid, numeric, text) to authenticated;

-- un virement de BTM n'est pas « à vérifier » par l'admin
create or replace function public.statuer_reversement(p_id uuid, p_decision text, p_motif text default null)
 returns reversements
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  res public.reversements;
  motif text := nullif(btrim(coalesce(p_motif, '')), '');
begin
  if not public.est_admin() then raise exception 'Réservé aux administrateurs.' using errcode = '42501'; end if;
  if p_decision not in ('valide', 'refuse') then raise exception 'Décision invalide.' using errcode = '22023'; end if;
  if p_decision = 'refuse' and motif is null then
    raise exception 'Indiquez le motif du refus : il est affiché au fournisseur.' using errcode = '22023';
  end if;
  update public.reversements
     set statut = p_decision, statue_le = now(), statue_par = auth.uid(),
         motif_refus = case when p_decision = 'refuse' then left(motif, 300) end
   where id = p_id and statut = 'declare' and sens = 'vers_btm'
  returning * into res;
  if res.id is null then raise exception 'Ce reversement n’est plus en attente de vérification.' using errcode = 'P0002'; end if;
  return res;
end;
$function$;

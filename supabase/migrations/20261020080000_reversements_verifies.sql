-- Reversements des fournisseurs à BTM : vérifiés par l'admin avant d'être comptés.
-- Avant : « J'ai effectué le virement » validait tout de suite, et la dette du fournisseur tombait à zéro sans que
-- personne ait vu l'argent arriver. Désormais :
--  - la déclaration est enregistrée « declare » (en vérification) et ne diminue pas encore ce qui est dû ;
--  - l'admin la passe à « valide » quand le virement apparaît sur le compte de BTM, ou à « refuse » avec un motif ;
--  - un fournisseur ne peut pas déclarer plus que ce qu'il doit, déclarations en attente comprises.
-- Les reversements déjà validés le restent.

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
  select coalesce((select sum(revenu_btm) from public.paiements where fournisseur_id = fid), 0)
       - coalesce((select sum(montant) from public.reversements where fournisseur_id = fid and statut in ('valide', 'declare')), 0)
    into du;
  if round(p_montant, 2) > round(du, 2) then
    raise exception 'Montant supérieur à ce que vous devez à BTM (% €, virements en vérification déduits).', round(greatest(du, 0), 2);
  end if;
  insert into public.reversements (fournisseur_id, montant, reference, declare_par, statut)
  values (fid, round(p_montant, 2), left(ref, 60), auth.uid(), 'declare') returning * into res;
  return res;
end;
$function$;

revoke all on function public.declarer_reversement(numeric, text) from public, anon, authenticated;
grant execute on function public.declarer_reversement(numeric, text) to authenticated;

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
   where id = p_id and statut = 'declare'
  returning * into res;
  if res.id is null then raise exception 'Ce reversement n’est plus en attente de vérification.' using errcode = 'P0002'; end if;
  return res;
end;
$function$;

revoke all on function public.statuer_reversement(uuid, text, text) from public, anon, authenticated;
grant execute on function public.statuer_reversement(uuid, text, text) to authenticated;

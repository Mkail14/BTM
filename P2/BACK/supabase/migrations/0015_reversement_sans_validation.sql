-- =============================================================================
-- BTM — Migration 0015 : reversement sans validation par l'admin
-- =============================================================================
-- Le virement déclaré par le fournisseur est pris en compte tout de suite (statut « valide ») :
-- l'admin n'a plus à confirmer sa réception. Il garde l'historique des reversements reçus.
-- À exécuter APRÈS 0014.
-- =============================================================================

update public.reversements set statut = 'valide', statue_le = coalesce(statue_le, declare_le) where statut = 'declare';

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
       - coalesce((select sum(montant) from public.reversements where fournisseur_id = fid and statut = 'valide'), 0)
    into du;
  if round(p_montant, 2) > round(du, 2) then raise exception 'Montant supérieur à ce que vous devez à BTM (% €).', round(greatest(du, 0), 2); end if;
  insert into public.reversements (fournisseur_id, montant, reference, declare_par, statut, statue_le)
  values (fid, round(p_montant, 2), left(ref, 60), auth.uid(), 'valide', now()) returning * into res;
  return res;
end;
$$;

drop function if exists public.statuer_reversement(uuid, boolean, text);

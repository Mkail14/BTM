-- Virements entre BTM et les fournisseurs, sans étape de vérification :
--  - celui qui fait le virement clique « Virement fait » : il compte tout de suite (statut 'valide'),
--    l'autre partie le voit dans son historique. Plus de « Reçu / Pas reçu ».
--  - RIB des fournisseurs (ribs_fournisseurs) : saisi par le fournisseur, lu par l'admin pour rembourser
--    les codes promo BTM qui dépassent la commission.

-- ---------- RIB des fournisseurs ----------
create table if not exists public.ribs_fournisseurs (
  fournisseur_id uuid primary key references public.fournisseurs(id) on delete cascade,
  titulaire text not null check (char_length(titulaire) between 2 and 120),
  iban text not null check (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$'),
  bic text check (bic is null or bic ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$'),
  banque text check (char_length(coalesce(banque, '')) <= 80),
  mis_a_jour_le timestamp with time zone default now() not null,
  mis_a_jour_par uuid
);
alter table public.ribs_fournisseurs enable row level security;
drop policy if exists "ribs fournisseurs : lecture" on public.ribs_fournisseurs;
create policy "ribs fournisseurs : lecture" on public.ribs_fournisseurs as PERMISSIVE for SELECT to authenticated
  using (est_admin() or fournisseur_id = mon_fournisseur());
revoke insert, update, delete on public.ribs_fournisseurs from anon, authenticated;

/** Le fournisseur enregistre (ou retire, iban vide) le RIB sur lequel BTM le rembourse */
create or replace function public.enregistrer_mon_rib(p_titulaire text, p_iban text, p_bic text, p_banque text)
 returns ribs_fournisseurs
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  fid uuid := public.mon_fournisseur();
  iban text := upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g'));
  bic text := nullif(upper(regexp_replace(coalesce(p_bic, ''), '\s', '', 'g')), '');
  res public.ribs_fournisseurs;
begin
  if fid is null then raise exception 'Réservé aux comptes fournisseur.' using errcode = '42501'; end if;
  if iban = '' then
    delete from public.ribs_fournisseurs where fournisseur_id = fid;
    return null;
  end if;
  if iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$' then raise exception 'IBAN invalide.'; end if;
  if bic is not null and bic !~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$' then raise exception 'BIC invalide (8 ou 11 caractères).'; end if;
  if char_length(btrim(coalesce(p_titulaire, ''))) < 2 then raise exception 'Indiquez le titulaire du compte.'; end if;
  insert into public.ribs_fournisseurs (fournisseur_id, titulaire, iban, bic, banque, mis_a_jour_le, mis_a_jour_par)
  values (fid, left(btrim(p_titulaire), 120), iban, bic, nullif(left(btrim(coalesce(p_banque, '')), 80), ''), now(), auth.uid())
  on conflict (fournisseur_id) do update set titulaire = excluded.titulaire, iban = excluded.iban, bic = excluded.bic,
    banque = excluded.banque, mis_a_jour_le = now(), mis_a_jour_par = auth.uid()
  returning * into res;
  return res;
end;
$function$;
revoke all on function public.enregistrer_mon_rib(text, text, text, text) from public, anon, authenticated;
grant execute on function public.enregistrer_mon_rib(text, text, text, text) to authenticated;

-- ---------- Virement du fournisseur vers BTM : compté dès la déclaration ----------
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
    raise exception 'Montant supérieur à ce que vous devez à BTM (% €).', round(greatest(du, 0), 2);
  end if;
  insert into public.reversements (fournisseur_id, montant, reference, declare_par, statut, statue_le, statue_par, sens)
  values (fid, round(p_montant, 2), left(ref, 60), auth.uid(), 'valide', now(), auth.uid(), 'vers_btm') returning * into res;
  return res;
end;
$function$;
revoke all on function public.declarer_reversement(numeric, text) from public, anon, authenticated;
grant execute on function public.declarer_reversement(numeric, text) to authenticated;

-- virements encore « en vérification » : comptés tels quels
update public.reversements set statut = 'valide', statue_le = coalesce(statue_le, now()) where statut = 'declare';

-- plus de validation par l'admin
drop function if exists public.statuer_reversement(uuid, text, text);

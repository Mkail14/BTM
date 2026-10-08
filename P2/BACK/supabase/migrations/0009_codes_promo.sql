-- =============================================================================
-- BTM — Migration 0009 : codes promo (réductions sur les devis)
-- =============================================================================
--   * codes_promo : créés et gérés uniquement par l'admin (/admin → Codes promo).
--       type    : 'pourcentage' (ex. 10 %) ou 'montant' (ex. 20 €)
--       portee  : 'total' (réduction sur tout le devis) ou 'frais' (sur les frais de service BTM seulement)
--       expire_le : dernier jour de validité (inclus, heure de Mayotte) ; null = sans limite
--   * Le public ne peut PAS lister les codes : il vérifie un code précis via la fonction
--     verifier_code_promo(), qui ne renvoie que la réduction d'un code actif et non expiré.
-- =============================================================================

create table if not exists public.codes_promo (
  id          uuid primary key default gen_random_uuid(),
  code        text not null check (code ~ '^[A-Z0-9_-]{3,30}$'),
  type        text not null check (type in ('pourcentage', 'montant')),
  valeur      numeric(10,2) not null check (valeur > 0),
  portee      text not null default 'total' check (portee in ('total', 'frais')),
  expire_le   date,
  actif       boolean not null default true,
  note        text check (char_length(note) <= 200),
  cree_le     timestamptz not null default now(),
  constraint codes_promo_pourcentage_max check (type <> 'pourcentage' or valeur <= 100)
);

create unique index if not exists uniq_codes_promo_code on public.codes_promo (upper(code));

alter table public.codes_promo enable row level security;

drop policy if exists "codes promo : lecture admin" on public.codes_promo;
create policy "codes promo : lecture admin"
  on public.codes_promo for select to authenticated using (public.est_admin());

drop policy if exists "codes promo : insertion admin" on public.codes_promo;
create policy "codes promo : insertion admin"
  on public.codes_promo for insert to authenticated with check (public.est_admin());

drop policy if exists "codes promo : mise a jour admin" on public.codes_promo;
create policy "codes promo : mise a jour admin"
  on public.codes_promo for update to authenticated using (public.est_admin()) with check (public.est_admin());

drop policy if exists "codes promo : suppression admin" on public.codes_promo;
create policy "codes promo : suppression admin"
  on public.codes_promo for delete to authenticated using (public.est_admin());

grant select, insert, update, delete on public.codes_promo to authenticated;

-- ---------- Vérification publique d'un code ------------------------------------
-- SECURITY DEFINER : lit la table malgré la RLS, mais ne renvoie que la ligne du code demandé,
-- s'il est actif et pas expiré. Impossible d'obtenir la liste des codes par ce biais.
create or replace function public.verifier_code_promo(p_code text)
returns table (code text, type text, valeur numeric, portee text, expire_le date)
language sql
stable
security definer
set search_path = public
as $$
  select c.code, c.type, c.valeur, c.portee, c.expire_le
  from public.codes_promo c
  where upper(c.code) = upper(trim(p_code))
    and c.actif
    and (c.expire_le is null or c.expire_le >= (now() at time zone 'Indian/Mayotte')::date)
  limit 1;
$$;

revoke execute on function public.verifier_code_promo(text) from public;
grant execute on function public.verifier_code_promo(text) to anon, authenticated;

notify pgrst, 'reload schema';

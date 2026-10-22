-- Cohérence des fonds BTM
--  1. Un code promo BTM ne peut plus dépasser la commission : le revenu BTM d'un paiement n'est jamais négatif à cause d'un code.
--  2. credits_annules : preuve du crédit fidélité d'un compte supprimé (montant, motif, historique des mouvements, auteur).
--     Avant, ce crédit devenait du crédit fidélité dépensable sur le compte de contact BTM, sans trace côté fonds.

-- ---------- 1. Plafond des codes promo BTM ----------
do $$
declare
  def text;
  neuf text;
begin
  def := pg_get_functiondef('public.encaisser_devis(uuid, jsonb, text, text, numeric, uuid, jsonb, numeric)'::regprocedure);
  if position('least(net, commission, greatest(0, brut))' in def) = 0 then
    neuf := replace(def, 'reduction := round(least(net, greatest(0, brut)), 2);', 'reduction := round(least(net, commission, greatest(0, brut)), 2);');
    if neuf = def then raise exception 'encaisser_devis : calcul de la réduction introuvable'; end if;
    execute neuf;
  end if;
end $$;

-- ---------- 2. Crédits annulés (comptes supprimés) ----------
create table if not exists public.credits_annules (
  id bigint generated always as identity primary key,
  ancien_utilisateur_id uuid not null,      -- le compte n'existe plus : pas de clé étrangère
  ancien_email text,
  montant numeric(12,2) not null,
  motif text not null,
  mouvements jsonb default '[]'::jsonb not null, -- copie des lignes credits_fidelite effacées avec le compte
  par uuid,
  par_email text,
  cree_le timestamp with time zone default now() not null
);
alter table public.credits_annules enable row level security;
drop policy if exists "credits annules : lecture admin" on public.credits_annules;
create policy "credits annules : lecture admin" on public.credits_annules as PERMISSIVE for SELECT to authenticated
  using (est_admin());
-- écriture : uniquement la fonction serveur admin-utilisateurs (clé service)
revoke insert, update, delete on public.credits_annules from anon, authenticated;

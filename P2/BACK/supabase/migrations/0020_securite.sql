-- =============================================================================
-- BTM — Migration 0020 : durcissement de sécurité (audit Supabase du 2026-10-02)
-- =============================================================================
-- Aucune donnée modifiée, aucun usage normal changé :
--   * solde_credit / code_promo_deja_utilise : un compte connecté pouvait interroger le crédit fidélité
--     ou l'usage d'un code promo d'un AUTRE utilisateur en passant son identifiant. Désormais seuls
--     l'intéressé, un administrateur ou un fournisseur (encaissement au comptoir) obtiennent la réponse ;
--     les autres reçoivent 0 / faux. Les appels internes (encaisser_devis, trouver_devis_par_code)
--     sont faits par un fournisseur connecté : ils fonctionnent comme avant.
--   * fonctions de déclencheur : elles n'ont rien à faire dans l'API publique (/rest/v1/rpc/…).
--     Un déclencheur s'exécute même sans ce droit : retirer EXECUTE ne change rien au fonctionnement.
-- À exécuter APRÈS 0019.
-- =============================================================================

create or replace function public.solde_credit(p_utilisateur uuid default auth.uid())
returns numeric
language sql
stable
security definer set search_path = public
as $$
  select coalesce(round(sum(montant), 2), 0)
  from public.credits_fidelite
  where utilisateur_id = p_utilisateur
    and (p_utilisateur = auth.uid() or public.est_admin() or public.mon_fournisseur() is not null);
$$;

create or replace function public.code_promo_deja_utilise(p_code text, p_utilisateur uuid default auth.uid(), p_sauf uuid default null)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.paiements pa join public.projets p on p.id = pa.projet_id
    where p.utilisateur_id = p_utilisateur
      and (p_utilisateur = auth.uid() or public.est_admin() or public.mon_fournisseur() is not null)
      and (p_sauf is null or p.id <> p_sauf)
      and not pa.remise_btm_ignoree
      and upper(p.resultat -> 'remise' ->> 'code') = upper(btrim(p_code))
  );
$$;

revoke execute on function public.solde_credit(uuid) from public, anon;
grant execute on function public.solde_credit(uuid) to authenticated;
revoke execute on function public.code_promo_deja_utilise(text, uuid, uuid) from public, anon;
grant execute on function public.code_promo_deja_utilise(text, uuid, uuid) to authenticated;

-- Fonctions de déclencheur : hors de l'API
revoke execute on function public.maj_horodatage() from public, anon, authenticated;
revoke execute on function public.proteger_code_retrait() from public, anon, authenticated;
revoke execute on function public.proteger_profil() from public, anon, authenticated;
revoke execute on function public.refuser_email_jetable() from public, anon, authenticated;

notify pgrst, 'reload schema';

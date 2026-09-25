-- =============================================================================
-- BTM — Migration 0006 : outils d'administration
-- =============================================================================
-- Complète 0004 (rôle admin, fonction est_admin()) pour la page /admin :
--   * l'admin voit tous les fournisseurs (y compris désactivés) ;
--   * l'admin peut supprimer n'importe quel avis (modération) ;
--   * l'admin peut supprimer un projet.
-- Aucune de ces règles ne lit `profils` directement (fonction SECURITY DEFINER) : pas de récursion RLS.
-- =============================================================================

drop policy if exists "fournisseurs : lecture admin" on public.fournisseurs;
create policy "fournisseurs : lecture admin"
  on public.fournisseurs for select
  to authenticated using (public.est_admin());

drop policy if exists "avis : suppression admin" on public.avis;
create policy "avis : suppression admin"
  on public.avis for delete
  to authenticated using (public.est_admin());

drop policy if exists "projets : suppression admin" on public.projets;
create policy "projets : suppression admin"
  on public.projets for delete
  to authenticated using (public.est_admin());

notify pgrst, 'reload schema';

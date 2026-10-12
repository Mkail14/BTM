-- =============================================================================
-- BTM — Migration 0028 : les avis Google sont remplacés par les avis Trustpilot
-- =============================================================================
--   * La fiche Google de BTM n'a pas pu être validée : les avis recopiés depuis Google sont supprimés.
--   * source : 'site' (publié par un utilisateur connecté) ou 'trustpilot' (recopié par l'admin depuis la page
--     Trustpilot de BTM, avec le lien vers l'avis d'origine). Colonne centrale du mur d'avis de l'accueil.
--   * Le reste de la migration 0024 (modification de son avis, déclencheur de protection) ne change pas.
-- =============================================================================

delete from public.avis where source = 'google';

alter table public.avis drop constraint if exists avis_source_check;
alter table public.avis add constraint avis_source_check check (source in ('site', 'trustpilot'));

-- Les avis Trustpilot peuvent être plus longs que ceux du site
alter table public.avis drop constraint if exists avis_commentaire_check;
alter table public.avis add constraint avis_commentaire_check
  check (char_length(commentaire) <= case when source = 'trustpilot' then 1500 else 300 end);

-- L'admin ajoute les avis Trustpilot (sans compte associé)
drop policy if exists "avis google : ajout admin" on public.avis;
drop policy if exists "avis trustpilot : ajout admin" on public.avis;
create policy "avis trustpilot : ajout admin"
  on public.avis for insert
  to authenticated with check (public.est_admin() and source = 'trustpilot' and utilisateur_id is null and demo = false);

-- Le lien « laisser un avis » de la section avis devient celui de Trustpilot
update public.contenus_site set valeur = valeur - 'lienGoogle' where cle = 'avis';

notify pgrst, 'reload schema';

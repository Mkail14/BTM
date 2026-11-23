-- Appliquée le 19/10/2026 : correction de la lecture des carreaux par les visiteurs.
--
-- Problème : la règle « carreaux : lecture » appelle mon_fournisseur() et est_admin(), que le rôle anon n'a pas le droit
-- d'exécuter. Pour un visiteur non connecté, toute la requête échoue (401 « permission denied for function
-- mon_fournisseur ») et le calculateur affiche « Aucun modèle n'est encore proposé » quel que soit le format.
--
-- Correction : lecture séparée en deux règles. Les visiteurs ne voient que les modèles actifs des fournisseurs actifs ;
-- le fournisseur (ses modèles masqués) et l'admin gardent leur lecture complète. Les droits d'écriture ne changent pas.
drop policy if exists "carreaux : lecture" on public.carreaux_fournisseur;

create policy "carreaux : lecture publique" on public.carreaux_fournisseur
  for select to anon, authenticated
  using (actif and exists (select 1 from public.fournisseurs f where f.id = carreaux_fournisseur.fournisseur_id and f.actif));

create policy "carreaux : lecture fournisseur et admin" on public.carreaux_fournisseur
  for select to authenticated
  using (fournisseur_id = public.mon_fournisseur() or public.est_admin());

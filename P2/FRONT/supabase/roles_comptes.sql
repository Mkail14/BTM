-- Rôle « professionnel » donné par un administrateur, sans demande de vérification de l'utilisateur.
-- À exécuter une fois dans Supabase → SQL Editor.
--
-- Dans l'admin, le choix « Professionnel » (fiche d'un utilisateur, ou profil → Rôles) passe le compte en professionnel
-- vérifié ; « Particulier » lui retire ce statut. Sans cette fonction, l'admin passe par la vérification des demandes
-- pro : le passage en professionnel fonctionne si la base l'accepte sans demande, et le retour en particulier laisse
-- une demande « refusée » visible dans le profil de l'utilisateur.

create or replace function public.admin_definir_pro(p_profil uuid, p_pro boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profils where id = auth.uid() and role = 'admin') then
    raise exception 'Réservé aux administrateurs.';
  end if;
  if p_pro then
    update public.profils
       set type_profil = 'professionnel', pro_statut = 'verifie', pro_statue_le = now(), pro_motif_refus = null
     where id = p_profil;
  else
    update public.profils
       set type_profil = 'particulier', pro_statut = null, pro_motif_refus = null
     where id = p_profil;
  end if;
end
$$;

revoke all on function public.admin_definir_pro(uuid, boolean) from public;
grant execute on function public.admin_definir_pro(uuid, boolean) to authenticated;

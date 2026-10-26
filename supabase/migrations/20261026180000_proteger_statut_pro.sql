-- Statut professionnel : seul un administrateur (ou la clé service) le déclare vérifié ou refusé.
-- Avant : la politique « profil : mise a jour proprietaire » laissait un compte écrire lui-même
-- pro_statut = 'verifie' sur son profil (appel direct à l'API), et obtenir le devis pro sans contrôle du SIRET.
-- Le compte garde ce qu'il peut faire de lui-même : demander la vérification (en_attente) ou y renoncer (null),
-- comme le font demander_verification_pro() et passer_particulier().
create or replace function public.proteger_profil()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  privilegie boolean := public.est_admin() or coalesce(auth.role(), '') = 'service_role';
begin
  -- rôle, fiche fournisseur et bannissement : uniquement par un admin ou par la clé service (fonctions serveur)
  if (new.role is distinct from old.role or new.fournisseur_id is distinct from old.fournisseur_id
      or new.banni_le is distinct from old.banni_le or new.banni_jusqua is distinct from old.banni_jusqua
      or new.banni_motif is distinct from old.banni_motif or new.banni_par is distinct from old.banni_par)
     and not privilegie then
    raise exception 'Modification réservée aux administrateurs' using errcode = '42501';
  end if;

  if not privilegie then
    -- décision de BTM : vérifié ou refusé, date et motif
    if new.pro_statut is distinct from old.pro_statut and new.pro_statut is not null and new.pro_statut <> 'en_attente' then
      raise exception 'La vérification du compte professionnel est faite par BTM' using errcode = '42501';
    end if;
    if (new.pro_statue_le is not null and new.pro_statue_le is distinct from old.pro_statue_le)
       or (new.pro_motif_refus is not null and new.pro_motif_refus is distinct from old.pro_motif_refus) then
      raise exception 'La vérification du compte professionnel est faite par BTM' using errcode = '42501';
    end if;
    -- compte vérifié : raison sociale et SIRET figés (une nouvelle demande repasse par BTM)
    if old.pro_statut = 'verifie' and new.pro_statut = 'verifie'
       and (new.pro_raison_sociale is distinct from old.pro_raison_sociale or new.pro_siret is distinct from old.pro_siret) then
      raise exception 'Raison sociale et SIRET vérifiés : contactez BTM pour les modifier' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function public.proteger_profil() from public, anon, authenticated;

-- Inscription « professionnel » : la demande de vérification est enregistrée dès la création du compte.
-- À exécuter une fois dans Supabase → SQL Editor.
--
-- Le formulaire d'inscription envoie, avec le compte, le profil choisi (type_profil), le SIRET (pro_siret) et la raison
-- sociale (pro_raison_sociale). Ce déclencheur les reporte sur le profil : le compte apparaît tout de suite dans
-- l'admin, onglet « Pros à vérifier », au lieu de rester « particulier ».
-- Sans lui, le site dépose quand même la demande, mais seulement à la première connexion du compte (useAuth.js).
-- Il s'exécute après la création du profil (son nom le place en dernier) et n'interrompt jamais une inscription.

create or replace function public.enregistrer_demande_pro_inscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_siret text := regexp_replace(coalesce(new.raw_user_meta_data->>'pro_siret', ''), '\D', '', 'g');
  v_raison text := nullif(trim(coalesce(new.raw_user_meta_data->>'pro_raison_sociale', '')), '');
begin
  if new.raw_user_meta_data->>'type_profil' = 'professionnel' and length(v_siret) = 14 and v_raison is not null then
    update public.profils
       set type_profil = 'professionnel',
           pro_siret = v_siret,
           pro_raison_sociale = v_raison,
           pro_statut = 'en_attente',
           pro_demande_le = now()
     where id = new.id
       and pro_statut is null;
  end if;
  return new;
exception when others then
  return new; -- une erreur ici ne doit jamais empêcher la création du compte
end
$$;

drop trigger if exists zz_demande_pro_inscription on auth.users;
create trigger zz_demande_pro_inscription
  after insert on auth.users
  for each row execute function public.enregistrer_demande_pro_inscription();

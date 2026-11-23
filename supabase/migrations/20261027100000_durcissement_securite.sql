-- Sécurité : e-mail du profil verrouillé et limites anti-abus.
-- À exécuter après 20261026180000_proteger_statut_pro.sql. Aucune donnée supprimée.

-- 1. Profil : e-mail, rôle et statut pro protégés
create or replace function public.proteger_profil()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  -- admin, clé service ou éditeur SQL
  privilegie boolean := public.est_admin() or coalesce(auth.role(), 'service_role') = 'service_role';
begin
  -- rôle, fiche fournisseur, bannissement
  if (new.role is distinct from old.role or new.fournisseur_id is distinct from old.fournisseur_id
      or new.banni_le is distinct from old.banni_le or new.banni_jusqua is distinct from old.banni_jusqua
      or new.banni_motif is distinct from old.banni_motif or new.banni_par is distinct from old.banni_par)
     and not privilegie then
    raise exception 'Modification réservée aux administrateurs' using errcode = '42501';
  end if;

  -- e-mail : copie de celui de la connexion
  if new.email is distinct from old.email and not privilegie
     and coalesce(current_setting('btm.synchro_email', true), '') <> 'on' then
    raise exception 'L’adresse e-mail se change depuis les réglages de connexion' using errcode = '42501';
  end if;

  if not privilegie then
    -- statut pro : décidé par BTM
    if new.pro_statut is distinct from old.pro_statut and new.pro_statut is not null and new.pro_statut <> 'en_attente' then
      raise exception 'La vérification du compte professionnel est faite par BTM' using errcode = '42501';
    end if;
    if (new.pro_statue_le is not null and new.pro_statue_le is distinct from old.pro_statue_le)
       or (new.pro_motif_refus is not null and new.pro_motif_refus is distinct from old.pro_motif_refus) then
      raise exception 'La vérification du compte professionnel est faite par BTM' using errcode = '42501';
    end if;
    -- compte vérifié : SIRET figé
    if old.pro_statut = 'verifie' and new.pro_statut = 'verifie'
       and (new.pro_raison_sociale is distinct from old.pro_raison_sociale or new.pro_siret is distinct from old.pro_siret) then
      raise exception 'Raison sociale et SIRET vérifiés : contactez BTM pour les modifier' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;
revoke all on function public.proteger_profil() from public, anon, authenticated;

-- L'e-mail du profil suit celui de la connexion
create or replace function public.synchroniser_email_profil()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform set_config('btm.synchro_email', 'on', true);
  update public.profils set email = new.email where id = new.id and email is distinct from new.email;
  perform set_config('btm.synchro_email', '', true);
  return new;
end;
$function$;
revoke all on function public.synchroniser_email_profil() from public, anon, authenticated;
drop trigger if exists trg_synchroniser_email_profil on auth.users;
create trigger trg_synchroniser_email_profil after update of email on auth.users
  for each row execute function public.synchroniser_email_profil();

-- Remise à niveau des profils existants
do $$
begin
  perform set_config('btm.synchro_email', 'on', true);
  update public.profils p set email = u.email from auth.users u
   where u.id = p.id and p.email is distinct from u.email;
  perform set_config('btm.synchro_email', '', true);
end
$$;

alter table public.profils drop constraint if exists profils_nom_affiche_check;
alter table public.profils add constraint profils_nom_affiche_check check (char_length(nom_affiche) <= 80) not valid;

-- 2. Code de retrait : 30 essais faux max par 10 min (code inconnu : renvoie null)
create or replace function public.trouver_devis_par_code(p_code text)
 returns jsonb
 language plpgsql
 volatile security definer
 set search_path to 'public'
as $function$
declare
  fid uuid := public.mon_fournisseur();
  code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_cle text;
  pr public.projets;
  pa public.paiements;
  ailleurs jsonb;
begin
  if fid is null then raise exception 'Réservé aux comptes fournisseur.' using errcode = '42501'; end if;
  if char_length(code) <> 8 then raise exception 'Le code comporte 8 caractères (ex. K7QM-4XPA).' using errcode = '22023'; end if;
  code := substr(code, 1, 4) || '-' || substr(code, 5, 4);

  v_cle := 'devis:' || fid::text;
  if (select count(*) from public.limites_essais l where l.cle = v_cle and l.le > now() - interval '10 minutes') >= 30 then
    raise exception 'Trop de codes faux : réessayez dans 10 minutes.' using errcode = '54000';
  end if;

  select * into pr from public.projets where code_retrait = code;
  if not found then
    insert into public.limites_essais (cle) values (v_cle);
    return null;
  end if;
  if not public.fournisseur_autorise(pr, fid) then
    raise exception 'Ce devis a été établi pour d’autres fournisseurs.' using errcode = '42501';
  end if;

  select * into pa from public.paiements where projet_id = pr.id and fournisseur_id = fid;
  ailleurs := (select coalesce(jsonb_agg(jsonb_build_object('fournisseur', f.nom, 'numero_recu', x.numero_recu, 'lignes', x.lignes_fournies)), '[]'::jsonb)
               from public.paiements x left join public.fournisseurs f on f.id = x.fournisseur_id
               where x.projet_id = pr.id and x.fournisseur_id is distinct from fid);
  return jsonb_build_object(
    'id', pr.id, 'nom', pr.nom, 'type_projet_id', pr.type_projet_id,
    'resultat', case when pa.id is null then public.devis_reste_a_fournir(pr, fid) else pr.resultat end,
    'cout_total', pr.cout_total, 'cree_le', pr.cree_le, 'code_retrait', pr.code_retrait,
    'fournisseur_choisi', fid = pr.fournisseur_id or fid = any(pr.fournisseurs),
    'plusieurs_fournisseurs', coalesce(cardinality(pr.fournisseurs), 0) > 1,
    'encaissements_ailleurs', ailleurs,
    'paiement', case when pa.id is null then null else to_jsonb(pa) end,
    'promotions_utilisees', coalesce((
      select jsonb_agg(distinct x.promotion ->> 'id') from public.paiements x join public.projets p on p.id = x.projet_id
      where p.utilisateur_id = pr.utilisateur_id and x.fournisseur_id = fid and x.promotion ? 'id'), '[]'::jsonb),
    'code_btm_deja_utilise', case when pr.resultat -> 'remise' ->> 'code' is null then false
      else public.code_promo_deja_utilise(pr.resultat -> 'remise' ->> 'code', pr.utilisateur_id, pr.id) end,
    'remise_btm_deja_appliquee', coalesce((select sum(greatest(0, x.commission - x.credit_utilise - x.revenu_btm)) from public.paiements x
      where x.projet_id = pr.id and x.fournisseur_id is distinct from fid), 0),
    'credit_disponible', public.solde_credit(pr.utilisateur_id),
    'utiliser_credit', pr.utiliser_credit,
    'commission', (select taux from public.reglages_commission())
  );
end;
$function$;
revoke all on function public.trouver_devis_par_code(text) from public, anon, authenticated;
grant execute on function public.trouver_devis_par_code(text) to authenticated;

-- 3. Dossier fournisseur : 30 messages max par heure
create or replace function public.envoyer_message_dossier(p_demande uuid, p_texte text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  t text := left(trim(coalesce(p_texte, '')), 2000);
  mid uuid;
begin
  if not public.dossier_autorise(p_demande) then raise exception 'Action non autorisée.' using errcode = '42501'; end if;
  if t = '' then raise exception 'Écrivez votre message.'; end if;
  if not public.est_admin() and public.limite_atteinte('dossier:' || auth.uid()::text, 30, interval '1 hour') then
    raise exception 'Trop de messages envoyés : réessayez dans une heure.' using errcode = '54000';
  end if;
  insert into public.messages_demande_fournisseur (demande_id, auteur, texte)
  values (p_demande, case when public.est_admin() then 'btm' else 'fournisseur' end, t)
  returning id into mid;
  update public.demandes_fournisseur set mis_a_jour_le = now() where id = p_demande;
  return mid;
end
$$;
revoke all on function public.envoyer_message_dossier(uuid, text) from public, anon;
grant execute on function public.envoyer_message_dossier(uuid, text) to authenticated;

-- 4. Réalisations : photo uniquement depuis le stockage du compte
create or replace function public.realisations_proteger()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if public.est_admin() then return new; end if;
  new.projet_id := old.projet_id;
  new.message_admin := old.message_admin;
  new.publiee_le := old.publiee_le;
  new.cree_le := old.cree_le;
  new.fournisseur_id := old.fournisseur_id;
  new.fournisseur_nom := old.fournisseur_nom;
  if new.photo_chemin is distinct from old.photo_chemin and new.photo_chemin is not null
     and split_part(new.photo_chemin, '/', 1) <> auth.uid()::text then
    raise exception 'Photo non autorisée.' using errcode = '42501';
  end if;
  if new.photo_url is distinct from old.photo_url and new.photo_url is not null
     and (new.photo_chemin is null or new.photo_url not like '%/storage/v1/object/public/realisations/' || new.photo_chemin) then
    raise exception 'Photo non autorisée.' using errcode = '42501';
  end if;
  if new.statut = 'soumise' then
    if new.photo_url is null or btrim(new.titre) = '' or btrim(new.commune) = '' or btrim(new.auteur) = '' then
      raise exception 'Ajoutez une photo, un titre, la commune et votre nom avant d’envoyer.' using errcode = '23514';
    end if;
    if not new.consentement then
      raise exception 'Votre accord pour la diffusion est nécessaire.' using errcode = '23514';
    end if;
    new.soumise_le := now();
  end if;
  return new;
end;
$function$;
revoke all on function public.realisations_proteger() from public, anon, authenticated;

-- 5. Projets : 60 créations max par heure, taille limitée
create or replace function public.projets_limiter_creation()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not (public.est_admin() or coalesce(auth.role(), '') = 'service_role')
     and public.limite_atteinte('projet:' || coalesce(auth.uid()::text, 'anonyme'), 60, interval '1 hour') then
    raise exception 'Trop de devis enregistrés en peu de temps : réessayez dans une heure.' using errcode = '54000';
  end if;
  return new;
end;
$function$;
revoke all on function public.projets_limiter_creation() from public, anon, authenticated;
drop trigger if exists projets_limiter_creation on public.projets;
create trigger projets_limiter_creation before insert on public.projets
  for each row execute function public.projets_limiter_creation();

alter table public.projets drop constraint if exists projets_taille_check;
alter table public.projets add constraint projets_taille_check
  check (pg_column_size(resultat) <= 262144 and pg_column_size(dimensions) <= 65536) not valid;

-- 6. Stockage : 20 photos et 30 pièces max par compte
create or replace function public.nb_fichiers_compte(p_bucket text)
 returns integer
 language sql
 stable security definer
 set search_path to ''
as $function$
  select count(*)::integer from storage.objects
   where bucket_id = p_bucket and (storage.foldername(name))[1] = auth.uid()::text;
$function$;
revoke all on function public.nb_fichiers_compte(text) from public, anon, authenticated;
grant execute on function public.nb_fichiers_compte(text) to authenticated;

drop policy if exists "realisations : depot photo" on storage.objects;
create policy "realisations : depot photo" on storage.objects as permissive for insert to authenticated
  with check (bucket_id = 'realisations' and (public.est_admin()
    or ((storage.foldername(name))[1] = (select auth.uid())::text and public.nb_fichiers_compte('realisations') < 20)));

drop policy if exists "dossiers fournisseurs : depot" on storage.objects;
create policy "dossiers fournisseurs : depot" on storage.objects for insert to authenticated
  with check (bucket_id = 'dossiers-fournisseurs' and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.nb_fichiers_compte('dossiers-fournisseurs') < 30);

-- 7. Nettoyage horaire des compteurs
select cron.unschedule('nettoyer-limites-essais') where exists (select 1 from cron.job where jobname = 'nettoyer-limites-essais');
select cron.schedule('nettoyer-limites-essais', '7 * * * *', $$delete from public.limites_essais where le < now() - interval '2 days'$$);

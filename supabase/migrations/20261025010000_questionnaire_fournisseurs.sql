-- Inscription des fournisseurs : réponses au questionnaire (catégories vendues, taille de l'équipe, logiciel de caisse
-- ou de stock), posées en plus des coordonnées. Lues par l'admin pour valider le compte et préparer l'ouverture
-- (import du catalogue).

alter table public.demandes_fournisseur
  add column if not exists questionnaire jsonb not null default '{}'::jsonb
  check (jsonb_typeof(questionnaire) = 'object' and char_length(questionnaire::text) <= 2000);

-- Champs d'une demande : mêmes champs qu'avant, plus le questionnaire (un objet JSON borné, sinon vide)
create or replace function public.champs_demande_fournisseur(d jsonb)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'entreprise', left(nullif(trim(d ->> 'entreprise'), ''), 120),
    'siret', nullif(regexp_replace(coalesce(d ->> 'siret', ''), '\D', '', 'g'), ''),
    'categorie_id', nullif(trim(d ->> 'categorie_id'), ''),
    'commune', left(nullif(trim(d ->> 'commune'), ''), 60),
    'adresse', left(nullif(trim(d ->> 'adresse'), ''), 160),
    'telephone', left(nullif(trim(d ->> 'telephone'), ''), 30),
    'email', left(nullif(trim(d ->> 'email'), ''), 254),
    'contact_nom', left(nullif(trim(d ->> 'contact_nom'), ''), 120),
    'horaires', left(nullif(trim(d ->> 'horaires'), ''), 120),
    'description', left(nullif(trim(d ->> 'description'), ''), 400),
    'livraison', coalesce((d ->> 'livraison')::boolean, false),
    'questionnaire', case when jsonb_typeof(d -> 'questionnaire') = 'object' and char_length((d -> 'questionnaire')::text) <= 2000
                          then d -> 'questionnaire' else '{}'::jsonb end
  )
$$;

create or replace function public.enregistrer_demande_fournisseur_inscription()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  c jsonb;
begin
  if coalesce(new.raw_user_meta_data ->> 'type_profil', '') <> 'fournisseur' or not coalesce(new.raw_user_meta_data ? 'fournisseur', false) then return new; end if;
  c := public.champs_demande_fournisseur(new.raw_user_meta_data -> 'fournisseur');
  if c ->> 'entreprise' is null then return new; end if;
  insert into public.demandes_fournisseur (utilisateur_id, entreprise, siret, categorie_id, commune, adresse, telephone, email, contact_nom, horaires, description, livraison, questionnaire)
  values (new.id, c ->> 'entreprise', case when c ->> 'siret' ~ '^[0-9]{14}$' then c ->> 'siret' end,
          (select id from public.categories_fournisseurs where id = c ->> 'categorie_id'),
          c ->> 'commune', c ->> 'adresse', c ->> 'telephone', coalesce(c ->> 'email', new.email), c ->> 'contact_nom',
          c ->> 'horaires', c ->> 'description', (c ->> 'livraison')::boolean, c -> 'questionnaire')
  on conflict (utilisateur_id) do nothing;
  update public.profils set type_profil = 'fournisseur' where id = new.id;
  return new;
exception when others then
  return new;
end
$$;

create or replace function public.corriger_demande_fournisseur(p_infos jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  c jsonb := public.champs_demande_fournisseur(p_infos);
begin
  if c ->> 'entreprise' is null then raise exception 'Indiquez le nom de l’entreprise.'; end if;
  update public.demandes_fournisseur set
    entreprise = c ->> 'entreprise',
    siret = case when c ->> 'siret' ~ '^[0-9]{14}$' then c ->> 'siret' end,
    categorie_id = (select id from public.categories_fournisseurs where id = c ->> 'categorie_id'),
    commune = c ->> 'commune', adresse = c ->> 'adresse', telephone = c ->> 'telephone', email = coalesce(c ->> 'email', email),
    contact_nom = c ->> 'contact_nom', horaires = c ->> 'horaires', description = c ->> 'description', livraison = (c ->> 'livraison')::boolean,
    questionnaire = c -> 'questionnaire', statut = 'en_attente', mis_a_jour_le = now()
  where utilisateur_id = auth.uid() and statut in ('en_attente', 'a_corriger');
  if not found then raise exception 'Aucune demande à corriger pour ce compte.' using errcode = 'P0002'; end if;
end
$$;
revoke all on function public.corriger_demande_fournisseur(jsonb) from public, anon;
grant execute on function public.corriger_demande_fournisseur(jsonb) to authenticated;

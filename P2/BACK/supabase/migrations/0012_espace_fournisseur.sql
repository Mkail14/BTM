-- =============================================================================
-- BTM — Migration 0012 : le fournisseur gère sa fiche de l'annuaire
-- =============================================================================
-- Un compte fournisseur (profils.role = 'fournisseur', fournisseur_id renseigné) peut :
--   - lire sa fiche, même masquée de l'annuaire (actif = false) ;
--   - modifier ses coordonnées et sa présentation via modifier_ma_fiche().
-- Le nom, la catégorie, le slug et la visibilité (actif) restent réservés à l'admin :
-- aucune écriture directe dans la table, tout passe par la fonction.
-- À exécuter APRÈS 0010.
-- =============================================================================

drop policy if exists "fournisseurs : lecture fournisseur lie" on public.fournisseurs;
create policy "fournisseurs : lecture fournisseur lie" on public.fournisseurs
  for select to authenticated
  using (id = public.mon_fournisseur());

create or replace function public.modifier_ma_fiche(
  p_telephone text,
  p_email text,
  p_adresse text,
  p_commune text,
  p_site_web text,
  p_description text,
  p_horaires text,
  p_logo_url text,
  p_livraison boolean
)
returns public.fournisseurs
language plpgsql
security definer set search_path = public
as $$
declare
  fid uuid := public.mon_fournisseur();
  fiche public.fournisseurs;
  vide text := '';
begin
  if fid is null then
    raise exception 'Réservé aux comptes fournisseur.';
  end if;

  p_telephone   := nullif(btrim(coalesce(p_telephone, vide)), vide);
  p_email       := nullif(lower(btrim(coalesce(p_email, vide))), vide);
  p_adresse     := nullif(btrim(coalesce(p_adresse, vide)), vide);
  p_commune     := nullif(btrim(coalesce(p_commune, vide)), vide);
  p_site_web    := nullif(btrim(coalesce(p_site_web, vide)), vide);
  p_description := nullif(btrim(coalesce(p_description, vide)), vide);
  p_horaires    := nullif(btrim(coalesce(p_horaires, vide)), vide);
  p_logo_url    := nullif(btrim(coalesce(p_logo_url, vide)), vide);

  if p_telephone is null then raise exception 'Le téléphone est obligatoire : c’est lui que les clients appellent.'; end if;
  if p_commune is null then raise exception 'Indiquez la commune.'; end if;
  if char_length(p_telephone) > 25 then raise exception 'Téléphone trop long.'; end if;
  if p_email is not null and (char_length(p_email) > 254 or p_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$') then raise exception 'Adresse e-mail invalide.'; end if;
  if char_length(coalesce(p_adresse, vide)) > 200 then raise exception 'Adresse trop longue (200 caractères maximum).'; end if;
  if char_length(p_commune) > 80 then raise exception 'Commune trop longue.'; end if;
  if p_site_web is not null and (char_length(p_site_web) > 200 or p_site_web !~ '^https?://') then raise exception 'Le site web doit commencer par https://'; end if;
  if char_length(coalesce(p_description, vide)) > 600 then raise exception 'Présentation trop longue (600 caractères maximum).'; end if;
  if char_length(coalesce(p_horaires, vide)) > 120 then raise exception 'Horaires trop longs (120 caractères maximum).'; end if;
  if p_logo_url is not null and (char_length(p_logo_url) > 500 or p_logo_url !~ '^https://') then raise exception 'Le logo doit être une adresse https://'; end if;

  update public.fournisseurs set
    telephone = p_telephone,
    email = p_email,
    adresse = p_adresse,
    commune = p_commune,
    site_web = p_site_web,
    description = p_description,
    horaires = p_horaires,
    logo_url = p_logo_url,
    livraison = coalesce(p_livraison, false),
    mis_a_jour_le = now()
  where id = fid
  returning * into fiche;

  return fiche;
end;
$$;

revoke execute on function public.modifier_ma_fiche(text, text, text, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.modifier_ma_fiche(text, text, text, text, text, text, text, text, boolean) to authenticated;

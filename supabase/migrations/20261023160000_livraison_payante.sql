-- Livraison payante : le fournisseur indique si sa livraison sur chantier est payante, et son tarif en clair
-- (« 30 € sur Mamoudzou, gratuite dès 500 € »). Affiché dans sa fiche de l'annuaire.

alter table public.fournisseurs
  add column if not exists livraison_payante boolean not null default false,
  add column if not exists livraison_tarif text check (livraison_tarif is null or char_length(livraison_tarif) <= 120);

-- modifier_ma_fiche reçoit deux paramètres de plus : l'ancienne signature est remplacée
drop function if exists public.modifier_ma_fiche(text, text, text, text, text, text, text, text, boolean);

create or replace function public.modifier_ma_fiche(
  p_telephone text, p_email text, p_adresse text, p_commune text, p_site_web text, p_description text,
  p_horaires text, p_logo_url text, p_livraison boolean, p_livraison_payante boolean default false, p_livraison_tarif text default null
)
 returns fournisseurs
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  fid uuid := public.mon_fournisseur();
  fiche public.fournisseurs;
  vide text := '';
begin
  if fid is null then
    raise exception 'Réservé aux comptes fournisseur.';
  end if;

  p_telephone       := nullif(btrim(coalesce(p_telephone, vide)), vide);
  p_email           := nullif(lower(btrim(coalesce(p_email, vide))), vide);
  p_adresse         := nullif(btrim(coalesce(p_adresse, vide)), vide);
  p_commune         := nullif(btrim(coalesce(p_commune, vide)), vide);
  p_site_web        := nullif(btrim(coalesce(p_site_web, vide)), vide);
  p_description     := nullif(btrim(coalesce(p_description, vide)), vide);
  p_horaires        := nullif(btrim(coalesce(p_horaires, vide)), vide);
  p_logo_url        := nullif(btrim(coalesce(p_logo_url, vide)), vide);
  p_livraison_tarif := nullif(btrim(coalesce(p_livraison_tarif, vide)), vide);

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
  if char_length(coalesce(p_livraison_tarif, vide)) > 120 then raise exception 'Tarif de livraison trop long (120 caractères maximum).'; end if;

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
    -- sans livraison, ni payante ni tarif
    livraison_payante = coalesce(p_livraison, false) and coalesce(p_livraison_payante, false),
    livraison_tarif = case when coalesce(p_livraison, false) and coalesce(p_livraison_payante, false) then p_livraison_tarif end,
    mis_a_jour_le = now()
  where id = fid
  returning * into fiche;

  return fiche;
end;
$function$;

revoke all on function public.modifier_ma_fiche(text, text, text, text, text, text, text, text, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.modifier_ma_fiche(text, text, text, text, text, text, text, text, boolean, boolean, text) to authenticated;

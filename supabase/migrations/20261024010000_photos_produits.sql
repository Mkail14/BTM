-- Photos et descriptions des produits des fournisseurs (« Je sais ce qu'il me faut ») : chaque fournisseur peut
-- montrer SON produit (photo, quelques mots) pour un matériau BTM ou pour ses propres articles. Le client compare les
-- offres d'un même matériau en faisant défiler une photo par fournisseur, avec son prix.

alter table public.catalogue_fournisseur
  add column if not exists photo_url text,
  add column if not exists description text check (description is null or char_length(description) <= 300);
alter table public.articles_fournisseur
  add column if not exists photo_url text,
  add column if not exists description text check (description is null or char_length(description) <= 300);

-- Lecture publique des offres : mêmes lignes qu'avant, plus la photo et la description (le type de retour change)
drop function if exists public.offres_publiques();
create function public.offres_publiques()
returns table(fournisseur_id uuid, fournisseur_nom text, commune text, livraison boolean, materiau_id text, article_id uuid,
              libelle text, unite text, prix numeric, prix_comptoir numeric, disponible boolean, photo_url text, description text)
language sql stable security definer set search_path to 'public'
as $function$
  select f.id, f.nom, f.commune, f.livraison, m.id, null::uuid, m.libelle, m.unite,
         coalesce(c.prix_unitaire, m.prix_unitaire), coalesce(c.prix_comptoir, c.prix_unitaire, m.prix_unitaire),
         not coalesce(c.rupture, false) and coalesce(c.stock, 1) > 0, c.photo_url, c.description
  from public.fournisseurs f
  join public.catalogue_fournisseur c on c.fournisseur_id = f.id and c.vendu
  join public.materiaux m on m.id = c.materiau_id
  where f.actif
  union all
  select f.id, f.nom, f.commune, f.livraison, null, a.id, a.libelle, a.unite,
         a.prix_unitaire, coalesce(a.prix_comptoir, a.prix_unitaire), not a.rupture and coalesce(a.stock, 1) > 0, a.photo_url, a.description
  from public.fournisseurs f
  join public.articles_fournisseur a on a.fournisseur_id = f.id and a.vendu
  where f.actif;
$function$;
grant execute on function public.offres_publiques() to anon, authenticated;

-- Carreaux vendus au carton : chaque modèle est vendu soit au carreau (carreaux_par_carton vide), soit au carton
-- de N carreaux. prix_unitaire est alors le prix d'un carton, et le devis compte des cartons entiers (unité « carton »).

alter table public.carreaux_fournisseur
  add column if not exists carreaux_par_carton integer
  check (carreaux_par_carton is null or carreaux_par_carton between 2 and 200);
comment on column public.carreaux_fournisseur.carreaux_par_carton is
  'Vide : vendu au carreau. Sinon nombre de carreaux par carton, prix_unitaire étant le prix du carton.';

-- Encaissement : une ligne de devis comptée dans une autre unité que celle du modèle aujourd'hui (le fournisseur
-- est passé du carreau au carton, ou l'inverse) n'est pas encaissée à ce prix : elle reste à fournir.
-- Seule la condition des carreaux de encaisser_devis change ; le reste de la fonction est repris tel quel.
do $migration$
declare
  avant constant text := 'if qte = 0 or not found or not car.actif or car.rupture then';
  apres constant text := 'if qte = 0 or not found or not car.actif or car.rupture
        or coalesce(ligne ->> ''unite'', ''carreau'') <> (case when car.carreaux_par_carton is null then ''carreau'' else ''carton'' end) then';
  def text := pg_get_functiondef('public.encaisser_devis(uuid, jsonb, text, text, numeric, uuid, jsonb, numeric)'::regprocedure);
begin
  if position('carreaux_par_carton' in def) > 0 then return; end if;
  if (length(def) - length(replace(def, avant, ''))) / length(avant) <> 1 then
    raise exception 'encaisser_devis : condition des carreaux introuvable, migration à adapter.';
  end if;
  execute replace(def, avant, apres);
end
$migration$;

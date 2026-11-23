-- Stock des carreaux, comme celui des matériaux et des articles : vide = non suivi, sinon la quantité disponible
-- dans l'unité de vente du modèle (carreaux, ou cartons s'il est vendu au carton).
-- À l'encaissement le stock est vérifié puis décompté ; l'annulation d'un encaissement le remet.

alter table public.carreaux_fournisseur
  add column if not exists stock numeric check (stock is null or stock >= 0);
comment on column public.carreaux_fournisseur.stock is
  'Vide : non suivi. Sinon quantité disponible, en carreaux ou en cartons selon carreaux_par_carton.';

-- Seuls les passages des carreaux changent dans encaisser_devis et annuler_encaissement ; le reste est repris tel quel.
do $migration$
declare
  def text;
  avant text;
  apres text;
begin
  -- encaisser_devis : ligne verrouillée, stock vérifié puis décompté avant le calcul du prix
  def := pg_get_functiondef('public.encaisser_devis(uuid, jsonb, text, text, numeric, uuid, jsonb, numeric)'::regprocedure);
  if position('carreaux_fournisseur set stock' in def) = 0 then
    avant := 'where id::text = substr(ligne ->> ''id'', 9) and fournisseur_id = fid;';
    apres := 'where id::text = substr(ligne ->> ''id'', 9) and fournisseur_id = fid for update;';
    if (length(def) - length(replace(def, avant, ''))) / length(avant) <> 1 then
      raise exception 'encaisser_devis : lecture du carreau introuvable, migration à adapter.';
    end if;
    def := replace(def, avant, apres);
    avant := 'st := round(qte * car.prix_unitaire, 2);';
    apres := 'if car.stock is not null then
        if qte > car.stock then raise exception ''Stock insuffisant pour % : il reste %.'', ligne ->> ''libelle'', car.stock; end if;
        update public.carreaux_fournisseur set stock = stock - qte, mis_a_jour_le = now() where id = car.id;
      end if;
      ' || avant;
    if (length(def) - length(replace(def, avant, ''))) / length(avant) <> 1 then
      raise exception 'encaisser_devis : prix du carreau introuvable, migration à adapter.';
    end if;
    execute replace(def, avant, apres);
  end if;

  -- annuler_encaissement : les carreaux fournis retournent en stock
  def := pg_get_functiondef('public.annuler_encaissement(uuid, text)'::regprocedure);
  if position('carreaux_fournisseur' in def) = 0 then
    avant := 'if (ligne ->> ''id'') like ''article:%'' then';
    apres := 'if (ligne ->> ''id'') like ''carreau:%'' then
      update public.carreaux_fournisseur set stock = stock + coalesce((ligne ->> ''quantite'')::numeric, 0), mis_a_jour_le = now()
        where id::text = substr(ligne ->> ''id'', 9) and fournisseur_id = pa.fournisseur_id and stock is not null;
    elsif (ligne ->> ''id'') like ''article:%'' then';
    if (length(def) - length(replace(def, avant, ''))) / length(avant) <> 1 then
      raise exception 'annuler_encaissement : boucle des lignes introuvable, migration à adapter.';
    end if;
    execute replace(def, avant, apres);
  end if;
end
$migration$;

-- Crédit fidélité : c'est le client qui choisit, sur son estimation, s'il l'utilise pour ce devis.
-- Avant : le fournisseur cochait « Utiliser le crédit du client » à l'encaissement, sans demander.
-- Désormais :
--  - projets.utiliser_credit (faux par défaut) : modifié par le client sur la page d'estimation ;
--  - trouver_devis_par_code renvoie ce choix au fournisseur (crédit appliqué d'office s'il est coché) ;
--  - encaisser_devis refuse tout crédit si le client a choisi de le garder.

alter table public.projets add column if not exists utiliser_credit boolean not null default false;

-- Les deux fonctions sont longues : on ne réécrit que la ligne concernée.
do $$
declare
  def text;
  neuf text;
begin
  def := pg_get_functiondef('public.trouver_devis_par_code(text)'::regprocedure);
  if position('''utiliser_credit''' in def) = 0 then
    neuf := replace(def, '''credit_disponible'', public.solde_credit(pr.utilisateur_id),',
      '''credit_disponible'', public.solde_credit(pr.utilisateur_id),' || E'\n    ' || '''utiliser_credit'', pr.utiliser_credit,');
    if neuf = def then raise exception 'trouver_devis_par_code : ligne credit_disponible introuvable'; end if;
    execute neuf;
  end if;

  def := pg_get_functiondef('public.encaisser_devis(uuid, jsonb, text, text, numeric, uuid, jsonb, numeric)'::regprocedure);
  if position('pr.utiliser_credit' in def) = 0 then
    neuf := replace(def, '-- Crédit fidélité du client (à la charge de BTM)',
      '-- Crédit fidélité du client (à la charge de BTM), seulement si le client l''a choisi sur son estimation' || E'\n  ' ||
      'if credit > 0 and not pr.utiliser_credit then raise exception ''Le client a choisi de garder son crédit fidélité pour un autre achat.''; end if;');
    if neuf = def then raise exception 'encaisser_devis : bloc crédit fidélité introuvable'; end if;
    execute neuf;
  end if;
end $$;

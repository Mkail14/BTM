-- Côté client, BTM produit une ESTIMATION indicative des matériaux, pas un devis (qui engage celui qui vend).
-- Textes modifiables depuis l'admin : pied de page et type « ensemble » (estimation pro).
update public.contenus_site
   set valeur = valeur
     || jsonb_build_object('note', 'Plateforme BTM — Estimations et accompagnement des travaux à Mayotte')
     || jsonb_build_object('description', 'Bâtiment & Travaux Mayotte — estimation de matériaux BTP et annuaire des fournisseurs de matériaux à Mayotte.')
 where cle = 'pied';

update public.types_projets set libelle = 'Estimation pro' where id = 'ensemble' and libelle = 'Devis pro';

-- Avant l'ouverture publique : plus aucune entreprise réelle, aucun faux chantier ni faux avis sur le site.
--  - les 4 fiches de démonstration (ETPC, IBS, Batimax, CAZ Déco) deviennent des fournisseurs FICTIFS anonymes :
--    pas de nom, logo, téléphone, adresse, site ou e-mail réels (droit des marques, et un fournisseur ne doit pas
--    découvrir sa fiche et des prix inventés avant d'avoir signé). Les identifiants ne changent pas : comptes de test,
--    catalogues, carreaux et devis de test restent liés ;
--  - les réalisations d'exemple ne sont plus publiées (statut « refusee », message admin explicatif) : réversible
--    depuis Admin → Réalisations ;
--  - les avis rédigés par l'équipe et ses proches sont masqués (visible = false) : réversible depuis Admin → Avis.

-- les déclencheurs de protection remettent les anciennes valeurs hors session admin : suspendus le temps de la migration
alter table public.realisations disable trigger trg_realisations_proteger;
alter table public.avis disable trigger trg_avis_proteger;

update public.fournisseurs set
  nom = v.nom, slug = v.slug, description = v.description,
  telephone = '', email = null, adresse = null, site_web = null, logo_url = null, horaires = null,
  latitude = null, longitude = null, demonstration = true
from (values
  ('2c3aa6b6-5042-4828-8b89-242c2db9d10a'::uuid, 'Fournisseur exemple A', 'exemple-a', 'Fiche fictive : centrale à béton et granulats, pour montrer le fonctionnement du site.'),
  ('9f2986d6-a9a6-4643-a004-bb51074606b9'::uuid, 'Fournisseur exemple B', 'exemple-b', 'Fiche fictive : béton et agrégats, pour montrer le fonctionnement du site.'),
  ('96a51b83-232a-408a-93a8-0c956b38f4ae'::uuid, 'Fournisseur exemple C', 'exemple-c', 'Fiche fictive : négoce de matériaux généraux, pour montrer le fonctionnement du site.'),
  ('9b34c29b-0de1-405b-af58-c651e3effe3f'::uuid, 'Fournisseur exemple D', 'exemple-d', 'Fiche fictive : vente de carreaux, pour montrer le fonctionnement du site.')
) as v(id, nom, slug, description)
where fournisseurs.id = v.id;

-- les noms réels recopiés dans les réalisations
update public.realisations r set fournisseur_nom = f.nom
from public.fournisseurs f where r.fournisseur_id = f.id and r.fournisseur_nom is not null;
update public.realisations set fournisseur_nom = case fournisseur_nom
  when 'ETPC' then 'Fournisseur exemple A' when 'IBS' then 'Fournisseur exemple B' when 'Batimax' then 'Fournisseur exemple C'
  else fournisseur_nom end
where fournisseur_nom in ('ETPC', 'IBS', 'Batimax');

update public.realisations
   set statut = 'refusee',
       message_admin = 'Exemple illustratif retiré avant l’ouverture (19/10/2026) : seules les réalisations de vrais clients sont publiées.'
 where statut = 'publiee' and utilisateur_id is null;

update public.avis set visible = false where visible;

alter table public.realisations enable trigger trg_realisations_proteger;
alter table public.avis enable trigger trg_avis_proteger;

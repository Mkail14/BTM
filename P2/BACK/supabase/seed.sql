-- =============================================================================
-- BTM — Données de référence (seed)
-- Exécuter après les migrations : supabase db reset  OU  copier dans l'éditeur SQL
-- =============================================================================

-- ---------- Catégories --------------------------------------------------------
insert into public.categories_fournisseurs (id, libelle, icone, ordre) values
  ('beton-granulats',    'Béton & granulats',    'fa-solid fa-cubes',        1),
  ('materiaux-generaux', 'Matériaux généraux',   'fa-solid fa-warehouse',    2),
  ('fer-acier',          'Fer & acier',          'fa-solid fa-bars',         3),
  ('carrelage-finition', 'Carrelage & finitions','fa-solid fa-border-all',   4)
on conflict (id) do update set libelle = excluded.libelle, icone = excluded.icone, ordre = excluded.ordre;

-- ---------- Fournisseurs (section 11 du CDC) ----------------------------------
insert into public.fournisseurs
  (slug, nom, categorie_id, commune, adresse, telephone, site_web, description, livraison, horaires, latitude, longitude)
values
  ('etpc', 'ETPC', 'beton-granulats', 'Koungou',
   'ZI de Longoni, 97600 Koungou', '0269 62 04 82', 'https://etpc.yt',
   'Producteur de béton prêt à l''emploi, granulats et sables à Mayotte. Centrale à béton à Longoni, livraison sur toute l''île.',
   true, 'Lun–Ven 6h30–15h30, Sam 6h30–11h30', -12.7245, 45.1861),

  ('ibs', 'IBS', 'beton-granulats', 'Koungou',
   'Route nationale, Kawéni – Koungou, 97600', '0269 61 15 50', 'https://ibs-groupe.fr',
   'Béton, agrégats et matériaux de construction. Livraison par toupie et camion benne sur Grande-Terre.',
   true, 'Lun–Ven 7h00–16h00', -12.7580, 45.2200),

  ('batimax', 'Batimax', 'materiaux-generaux', 'Mamoudzou',
   'Kawéni, 97600 Mamoudzou', '0269 61 12 11', 'https://batimax-mayotte.com',
   'Négoce de matériaux généraux : parpaings, ciment, fer à béton, carrelage, outillage et quincaillerie du bâtiment.',
   true, 'Lun–Sam 7h30–17h00', -12.7729, 45.2296)
on conflict (slug) do update set
  nom = excluded.nom, categorie_id = excluded.categorie_id, commune = excluded.commune,
  adresse = excluded.adresse, telephone = excluded.telephone, site_web = excluded.site_web,
  description = excluded.description, livraison = excluded.livraison, horaires = excluded.horaires;

-- ---------- Types de projets (section 9) --------------------------------------
insert into public.types_projets (id, libelle, description, icone, ordre, parametres) values
  ('mur', 'Mur', 'Mur en parpaings 20×20×40 cm, avec ouvertures.', 'fa-solid fa-building', 1,
   '{"surfaceParpaing":0.08,"margeParpaing":1.05,"m2ParSacCiment":2.5,"m2ParM3Sable":10}'),
  ('dalle', 'Dalle', 'Dalle béton armée sur hérisson de gravier.', 'fa-solid fa-layer-group', 2,
   '{"densiteBeton":2.4,"kgFerParM2":5,"tonnesGravierParM3":0.8}'),
  ('fondation', 'Fondation', 'Semelles filantes en béton armé.', 'fa-solid fa-mountain', 3,
   '{"densiteBeton":2.4,"kgAcierParM3":50}'),
  ('terrasse', 'Terrasse', 'Dalle extérieure avec finition carrelage ou béton lissé.', 'fa-solid fa-umbrella-beach', 4,
   '{"densiteBeton":2.4,"kgFerParM2":5,"tonnesGravierParM3":0.8}'),
  ('carrelage', 'Carrelage', 'La pose de carreaux sur le sol d''une pièce', 'fa-solid fa-table-cells', 5,
   '{"margeCarreaux":1.1,"kgColleParM2":5,"kgParSacColle":25,"kgJointParM2":0.5}')
on conflict (id) do update set libelle = excluded.libelle, description = excluded.description,
  icone = excluded.icone, ordre = excluded.ordre, parametres = excluded.parametres;

-- ---------- Matériaux et prix unitaires provisoires ---------------------------
insert into public.materiaux (id, libelle, unite, prix_unitaire, source) values
  ('parpaing',    'Parpaing 20×20×40 cm',        'u',   1.90,   'Prix provisoire – à vérifier fournisseurs'),
  ('ciment',      'Ciment gris (sac 35 kg)',      'sac', 12.50,  'Prix provisoire – à vérifier fournisseurs'),
  ('sable',       'Sable de construction',        'm³',  95.00,  'Prix provisoire – à vérifier fournisseurs'),
  ('beton',       'Béton prêt à l''emploi',       't',   145.00, 'Prix provisoire – à vérifier fournisseurs'),
  ('beton_arme',  'Béton armé (fondations)',      't',   155.00, 'Prix provisoire – à vérifier fournisseurs'),
  ('ferraillage', 'Treillis soudé / ferraillage', 'kg',  2.20,   'Prix provisoire – à vérifier fournisseurs'),
  ('acier',       'Armatures acier HA',           'kg',  2.60,   'Prix provisoire – à vérifier fournisseurs'),
  ('gravier',     'Gravier concassé',             't',   85.00,  'Prix provisoire – à vérifier fournisseurs'),
  ('carrelage',   'Carrelage extérieur',          'm²',  50.00,  'Section 9.4 du CDC'),
  ('beton_lisse', 'Finition béton lissé',         'm²',  15.00,  'Section 9.4 du CDC'),
  ('carrelage_sol',   'Carrelage de sol intérieur',    'm²',  30.00, 'Prix provisoire – à vérifier fournisseurs'),
  ('colle_carrelage', 'Colle à carrelage (sac 25 kg)', 'sac', 16.00, 'Prix provisoire – à vérifier fournisseurs'),
  ('joint_carrelage', 'Mortier joint carrelage',       'kg',   3.50, 'Prix provisoire – à vérifier fournisseurs')
on conflict (id) do update set libelle = excluded.libelle, unite = excluded.unite,
  prix_unitaire = excluded.prix_unitaire, source = excluded.source;

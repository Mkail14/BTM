-- =====================================================================================================================
-- BTM — schéma complet de la base Supabase (projet yywcviknnlegvwonkqcj), relevé le 19/10/2026, mis à jour le 20/10/2026.
--
-- Pourquoi ce fichier : les premières migrations (0001 à 0011) ont été passées dans l'éditeur SQL de Supabase et ne
-- figurent nulle part ; celles qui suivent ne sont que dans l'historique de Supabase. Ce fichier est l'état RÉEL de la
-- base : il permet de recréer le back-end sur un projet neuf (test, secours) en un seul passage dans le SQL Editor.
--
-- Règle désormais : toute modification de la base passe par un fichier dans supabase/migrations/ (daté, versionné),
-- puis ce fichier est régénéré (voir supabase/README.md).
--
-- Non couvert ici (réglages du tableau de bord Supabase) : Auth (fournisseurs Google/Apple, modèles d'e-mails,
-- adresses de redirection, protection des mots de passe compromis), secrets du coffre (vault : gemini_api_key_*),
-- fonctions Edge, et le déclencheur d'événement rls_auto_enable (fourni par Supabase).
-- =====================================================================================================================

set check_function_bodies = off;

-- ---------------------------------------------------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------------------------------------------------
create extension if not exists http with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_stat_statements with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;
create extension if not exists "uuid-ossp" with schema extensions;

-- ---------------------------------------------------------------------------------------------------------------------
-- Séquences
-- ---------------------------------------------------------------------------------------------------------------------
create sequence if not exists public.limites_essais_id_seq;
create sequence if not exists public.numero_recu_seq;

-- ---------------------------------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.articles_fournisseur (
  id uuid default gen_random_uuid() not null,
  fournisseur_id uuid not null,
  libelle text not null,
  unite text not null,
  prix_unitaire numeric(12,2) not null,
  stock numeric(12,3),
  rupture boolean default false not null,
  vendu boolean default true not null,
  cree_le timestamp with time zone default now() not null,
  mis_a_jour_le timestamp with time zone default now() not null,
  prix_comptoir numeric(12,2)
);

create table if not exists public.avis (
  id uuid default gen_random_uuid() not null,
  utilisateur_id uuid,
  nom text not null,
  ville text default 'Mayotte'::text not null,
  note integer not null,
  commentaire text default ''::text not null,
  demo boolean default false not null,
  cree_le timestamp with time zone default now() not null,
  visible boolean default true not null,
  source text default 'site'::text not null,
  lien text,
  modifie_le timestamp with time zone
);

create table if not exists public.carreaux_fournisseur (
  id uuid default gen_random_uuid() not null,
  fournisseur_id uuid not null,
  nom text not null,
  format text not null,
  finition text,
  couleur text default '#e9e5de'::text not null,
  photo_url text,
  prix_unitaire numeric(12,2) not null,
  prix_comptoir numeric(12,2),
  rupture boolean default false not null,
  actif boolean default true not null,
  cree_le timestamp with time zone default now() not null,
  mis_a_jour_le timestamp with time zone default now() not null
);

create table if not exists public.catalogue_fournisseur (
  fournisseur_id uuid not null,
  materiau_id text not null,
  vendu boolean default true not null,
  prix_unitaire numeric(12,2),
  stock numeric(12,3),
  mis_a_jour_le timestamp with time zone default now() not null,
  rupture boolean default false not null,
  prix_comptoir numeric(12,2)
);

create table if not exists public.categories_fournisseurs (
  id text not null,
  libelle text not null,
  icone text,
  ordre integer default 0 not null
);

create table if not exists public.codes_promo (
  id uuid default gen_random_uuid() not null,
  code text not null,
  type text not null,
  valeur numeric(10,2) not null,
  portee text default 'total'::text not null,
  expire_le date,
  actif boolean default true not null,
  note text,
  cree_le timestamp with time zone default now() not null
);

create table if not exists public.contenus_site (
  cle text not null,
  valeur jsonb default '{}'::jsonb not null,
  mis_a_jour_le timestamp with time zone default now() not null,
  mis_a_jour_par uuid
);

create table if not exists public.credits_fidelite (
  id bigint generated always as identity not null,
  utilisateur_id uuid not null,
  paiement_id uuid,
  montant numeric(12,2) not null,
  libelle text not null,
  cree_le timestamp with time zone default now() not null
);

create table if not exists public.domaines_jetables (
  domaine text not null
);

create table if not exists public.fournisseurs (
  id uuid default gen_random_uuid() not null,
  slug text not null,
  nom text not null,
  categorie_id text not null,
  commune text not null,
  adresse text,
  telephone text not null,
  email text,
  site_web text,
  description text,
  livraison boolean default false not null,
  horaires text,
  logo_url text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  actif boolean default true not null,
  cree_le timestamp with time zone default now() not null,
  mis_a_jour_le timestamp with time zone default now() not null,
  recherche tsvector generated always as (to_tsvector('french'::regconfig, ((((COALESCE(nom, ''::text) || ' '::text) || COALESCE(commune, ''::text)) || ' '::text) || COALESCE(description, ''::text)))) stored,
  demonstration boolean default false not null
);

create table if not exists public.journal_operations (
  id bigint generated always as identity not null,
  fournisseur_id uuid,
  projet_id uuid,
  projet_nom text,
  code_retrait text,
  numero_recu text,
  type text not null,
  montant numeric(12,2),
  moyen text,
  motif text,
  details jsonb default '{}'::jsonb not null,
  par uuid,
  par_email text,
  le timestamp with time zone default now() not null
);

create table if not exists public.limites_essais (
  id bigint default nextval('limites_essais_id_seq'::regclass) not null,
  cle text not null,
  le timestamp with time zone default now() not null
);
alter sequence public.limites_essais_id_seq owned by public.limites_essais.id;

create table if not exists public.materiaux (
  id text not null,
  libelle text not null,
  unite text not null,
  prix_unitaire numeric(10,2) not null,
  devise text default 'EUR'::text not null,
  source text,
  mis_a_jour_le timestamp with time zone default now() not null
);

create table if not exists public.paiements (
  id uuid default gen_random_uuid() not null,
  projet_id uuid,
  projet_nom text not null,
  fournisseur_id uuid,
  montant_devis numeric(12,2) default 0 not null,
  revenu_btm numeric(12,2) default 0 not null,
  paye_le timestamp with time zone default now() not null,
  confirme_par uuid,
  cree_le timestamp with time zone default now() not null,
  numero_recu text,
  code_retrait text,
  moyen text,
  reference text,
  montant_recu numeric(12,2),
  rendu numeric(12,2),
  montant_materiaux numeric(12,2),
  lignes_fournies jsonb default '[]'::jsonb not null,
  lignes_manquantes jsonb default '[]'::jsonb not null,
  remise_fournisseur numeric(12,2) default 0 not null,
  promotion jsonb,
  remise_btm_ignoree boolean default false not null,
  commission numeric(12,2) default 0 not null,
  credit_utilise numeric(12,2) default 0 not null,
  credit_gagne numeric(12,2) default 0 not null
);

create table if not exists public.parametres_versement (
  id integer default 1 not null,
  titulaire text,
  iban text,
  bic text,
  banque text,
  frequence text default 'mensuelle'::text not null,
  jour integer default 5 not null,
  seuil_minimum numeric(10,2) default 0 not null,
  mis_a_jour_le timestamp with time zone default now() not null,
  mis_a_jour_par uuid
);

create table if not exists public.profils (
  id uuid not null,
  email text,
  nom_affiche text,
  type_profil text default 'particulier'::text not null,
  cree_le timestamp with time zone default now() not null,
  role text default 'user'::text not null,
  fournisseur_id uuid,
  banni_le timestamp with time zone,
  banni_jusqua timestamp with time zone,
  banni_motif text,
  banni_par uuid,
  pro_statut text,
  pro_raison_sociale text,
  pro_siret text,
  pro_demande_le timestamp with time zone,
  pro_statue_le timestamp with time zone,
  pro_motif_refus text
);

create table if not exists public.projets (
  id uuid default gen_random_uuid() not null,
  utilisateur_id uuid not null,
  nom text not null,
  type_projet_id text not null,
  dimensions jsonb not null,
  resultat jsonb not null,
  fournisseur_id uuid,
  cout_total numeric(12,2) default 0 not null,
  cree_le timestamp with time zone default now() not null,
  mis_a_jour_le timestamp with time zone default now() not null,
  code_retrait text not null
);

create table if not exists public.promotions_fournisseur (
  id uuid default gen_random_uuid() not null,
  fournisseur_id uuid not null,
  libelle text not null,
  code text,
  type text not null,
  valeur numeric(12,2) not null,
  materiau_id text,
  debut date default CURRENT_DATE not null,
  fin date,
  actif boolean default true not null,
  utilisations integer default 0 not null,
  cree_le timestamp with time zone default now() not null
);

create table if not exists public.realisations (
  id uuid default gen_random_uuid() not null,
  utilisateur_id uuid,
  projet_id uuid,
  statut text default 'proposee'::text not null,
  titre text default ''::text not null,
  type_projet text,
  auteur text default ''::text not null,
  commune text default ''::text not null,
  quartier text,
  fournisseur_id uuid,
  fournisseur_nom text,
  detail text,
  annee integer,
  photo_url text,
  photo_chemin text,
  message_admin text,
  consentement boolean default false not null,
  cree_le timestamp with time zone default now() not null,
  soumise_le timestamp with time zone,
  publiee_le timestamp with time zone
);

create table if not exists public.reversements (
  id uuid default gen_random_uuid() not null,
  fournisseur_id uuid not null,
  montant numeric(12,2) not null,
  reference text not null,
  declare_le timestamp with time zone default now() not null,
  declare_par uuid,
  statut text default 'declare'::text not null,
  statue_le timestamp with time zone,
  statue_par uuid,
  motif_refus text
);

create table if not exists public.support_conversations (
  id uuid default gen_random_uuid() not null,
  jeton uuid default gen_random_uuid() not null,
  utilisateur_id uuid,
  nom text,
  email text,
  statut text default 'ia'::text not null,
  raison text,
  page text,
  reponses_ia integer default 0 not null,
  non_lu boolean default false not null,
  cree_le timestamp with time zone default now() not null,
  mis_a_jour_le timestamp with time zone default now() not null,
  vu_client_id bigint default 0 not null,
  vu_conseiller_id bigint default 0 not null,
  ecrit_client_le timestamp with time zone,
  ecrit_conseiller_le timestamp with time zone
);

create table if not exists public.support_messages (
  id bigint generated always as identity not null,
  conversation_id uuid not null,
  auteur text not null,
  texte text not null,
  cree_le timestamp with time zone default now() not null
);

create table if not exists public.types_projets (
  id text not null,
  libelle text not null,
  description text,
  icone text,
  ordre integer default 0 not null,
  parametres jsonb default '{}'::jsonb not null,
  accroche text,
  hypotheses text
);

create table if not exists public.versements (
  id uuid default gen_random_uuid() not null,
  montant numeric(12,2) not null,
  verse_le date default CURRENT_DATE not null,
  iban_masque text,
  note text,
  cree_par uuid,
  cree_le timestamp with time zone default now() not null
);

-- ---------------------------------------------------------------------------------------------------------------------
-- Contraintes : clés primaires, unicité, contrôles
-- ---------------------------------------------------------------------------------------------------------------------
alter table public.articles_fournisseur add constraint articles_fournisseur_pkey PRIMARY KEY (id);
alter table public.avis add constraint avis_pkey PRIMARY KEY (id);
alter table public.carreaux_fournisseur add constraint carreaux_fournisseur_pkey PRIMARY KEY (id);
alter table public.catalogue_fournisseur add constraint catalogue_fournisseur_pkey PRIMARY KEY (fournisseur_id, materiau_id);
alter table public.categories_fournisseurs add constraint categories_fournisseurs_pkey PRIMARY KEY (id);
alter table public.codes_promo add constraint codes_promo_pkey PRIMARY KEY (id);
alter table public.contenus_site add constraint contenus_site_pkey PRIMARY KEY (cle);
alter table public.credits_fidelite add constraint credits_fidelite_pkey PRIMARY KEY (id);
alter table public.domaines_jetables add constraint domaines_jetables_pkey PRIMARY KEY (domaine);
alter table public.fournisseurs add constraint fournisseurs_pkey PRIMARY KEY (id);
alter table public.journal_operations add constraint journal_operations_pkey PRIMARY KEY (id);
alter table public.limites_essais add constraint limites_essais_pkey PRIMARY KEY (id);
alter table public.materiaux add constraint materiaux_pkey PRIMARY KEY (id);
alter table public.paiements add constraint paiements_pkey PRIMARY KEY (id);
alter table public.parametres_versement add constraint parametres_versement_pkey PRIMARY KEY (id);
alter table public.profils add constraint profils_pkey PRIMARY KEY (id);
alter table public.projets add constraint projets_pkey PRIMARY KEY (id);
alter table public.promotions_fournisseur add constraint promotions_fournisseur_pkey PRIMARY KEY (id);
alter table public.realisations add constraint realisations_pkey PRIMARY KEY (id);
alter table public.reversements add constraint reversements_pkey PRIMARY KEY (id);
alter table public.support_conversations add constraint support_conversations_pkey PRIMARY KEY (id);
alter table public.support_messages add constraint support_messages_pkey PRIMARY KEY (id);
alter table public.types_projets add constraint types_projets_pkey PRIMARY KEY (id);
alter table public.versements add constraint versements_pkey PRIMARY KEY (id);
alter table public.fournisseurs add constraint fournisseurs_slug_key UNIQUE (slug);
alter table public.paiements add constraint paiements_projet_id_key UNIQUE (projet_id);
alter table public.articles_fournisseur add constraint articles_fournisseur_libelle_check CHECK (((char_length(btrim(libelle)) >= 2) AND (char_length(btrim(libelle)) <= 80)));
alter table public.articles_fournisseur add constraint articles_fournisseur_prix_comptoir_check CHECK (((prix_comptoir IS NULL) OR (prix_comptoir >= (0)::numeric)));
alter table public.articles_fournisseur add constraint articles_fournisseur_prix_unitaire_check CHECK ((prix_unitaire >= (0)::numeric));
alter table public.articles_fournisseur add constraint articles_fournisseur_stock_check CHECK (((stock IS NULL) OR (stock >= (0)::numeric)));
alter table public.articles_fournisseur add constraint articles_fournisseur_unite_check CHECK (((char_length(btrim(unite)) >= 1) AND (char_length(btrim(unite)) <= 12)));
alter table public.avis add constraint avis_commentaire_check CHECK ((char_length(commentaire) <=
CASE
    WHEN (source = 'trustpilot'::text) THEN 1500
    ELSE 300
END));
alter table public.avis add constraint avis_lien_check CHECK (((lien IS NULL) OR ((char_length(lien) <= 500) AND (lien ~* '^https://'::text))));
alter table public.avis add constraint avis_nom_check CHECK (((char_length(nom) >= 2) AND (char_length(nom) <= 60)));
alter table public.avis add constraint avis_note_check CHECK (((note >= 1) AND (note <= 5)));
alter table public.avis add constraint avis_source_check CHECK ((source = ANY (ARRAY['site'::text, 'trustpilot'::text])));
alter table public.avis add constraint avis_ville_check CHECK ((char_length(ville) <= 60));
alter table public.carreaux_fournisseur add constraint carreaux_fournisseur_check CHECK (((prix_comptoir IS NULL) OR (prix_comptoir >= prix_unitaire)));
alter table public.carreaux_fournisseur add constraint carreaux_fournisseur_couleur_check CHECK ((couleur ~ '^#[0-9a-fA-F]{6}$'::text));
alter table public.carreaux_fournisseur add constraint carreaux_fournisseur_finition_check CHECK (((finition IS NULL) OR (char_length(finition) <= 40)));
alter table public.carreaux_fournisseur add constraint carreaux_fournisseur_format_check CHECK ((format = ANY (ARRAY['30x30'::text, '45x45'::text, '60x60'::text])));
alter table public.carreaux_fournisseur add constraint carreaux_fournisseur_nom_check CHECK (((char_length(btrim(nom)) >= 2) AND (char_length(btrim(nom)) <= 60)));
alter table public.carreaux_fournisseur add constraint carreaux_fournisseur_photo_url_check CHECK (((photo_url IS NULL) OR (photo_url ~ '^https://'::text)));
alter table public.carreaux_fournisseur add constraint carreaux_fournisseur_prix_unitaire_check CHECK ((prix_unitaire > (0)::numeric));
alter table public.catalogue_fournisseur add constraint catalogue_fournisseur_prix_comptoir_check CHECK (((prix_comptoir IS NULL) OR (prix_comptoir >= (0)::numeric)));
alter table public.catalogue_fournisseur add constraint catalogue_fournisseur_prix_unitaire_check CHECK (((prix_unitaire IS NULL) OR (prix_unitaire >= (0)::numeric)));
alter table public.catalogue_fournisseur add constraint catalogue_fournisseur_stock_check CHECK (((stock IS NULL) OR (stock >= (0)::numeric)));
alter table public.codes_promo add constraint codes_promo_code_check CHECK ((code ~ '^[A-Z0-9_-]{3,30}$'::text));
alter table public.codes_promo add constraint codes_promo_note_check CHECK ((char_length(note) <= 200));
alter table public.codes_promo add constraint codes_promo_portee_check CHECK ((portee = ANY (ARRAY['total'::text, 'frais'::text])));
alter table public.codes_promo add constraint codes_promo_pourcentage_max CHECK (((type <> 'pourcentage'::text) OR (valeur <= (100)::numeric)));
alter table public.codes_promo add constraint codes_promo_type_check CHECK ((type = ANY (ARRAY['pourcentage'::text, 'montant'::text])));
alter table public.codes_promo add constraint codes_promo_valeur_check CHECK ((valeur > (0)::numeric));
alter table public.contenus_site add constraint contenus_site_cle_check CHECK ((cle ~ '^[a-z0-9_-]{2,40}$'::text));
alter table public.domaines_jetables add constraint domaines_jetables_domaine_check CHECK ((domaine = lower(domaine)));
alter table public.journal_operations add constraint journal_operations_type_check CHECK ((type = ANY (ARRAY['encaissement'::text, 'annulation'::text])));
alter table public.materiaux add constraint materiaux_prix_unitaire_check CHECK ((prix_unitaire >= (0)::numeric));
alter table public.paiements add constraint paiements_moyen_check CHECK ((moyen = ANY (ARRAY['carte'::text, 'especes'::text, 'virement'::text, 'cheque'::text])));
alter table public.paiements add constraint paiements_reference_check CHECK ((char_length(reference) <= 60));
alter table public.parametres_versement add constraint parametres_versement_bic_check CHECK (((bic IS NULL) OR (bic ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$'::text)));
alter table public.parametres_versement add constraint parametres_versement_frequence_check CHECK ((frequence = ANY (ARRAY['mensuelle'::text, 'trimestrielle'::text])));
alter table public.parametres_versement add constraint parametres_versement_iban_check CHECK (((iban IS NULL) OR (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$'::text)));
alter table public.parametres_versement add constraint parametres_versement_id_check CHECK ((id = 1));
alter table public.parametres_versement add constraint parametres_versement_jour_check CHECK (((jour >= 1) AND (jour <= 28)));
alter table public.parametres_versement add constraint parametres_versement_seuil_minimum_check CHECK ((seuil_minimum >= (0)::numeric));
alter table public.profils add constraint profils_banni_motif_check CHECK ((char_length(banni_motif) <= 300));
alter table public.profils add constraint profils_pro_motif_refus_check CHECK ((char_length(pro_motif_refus) <= 300));
alter table public.profils add constraint profils_pro_raison_sociale_check CHECK ((char_length(pro_raison_sociale) <= 120));
alter table public.profils add constraint profils_pro_siret_check CHECK ((pro_siret ~ '^[0-9]{14}$'::text));
alter table public.profils add constraint profils_pro_statut_check CHECK ((pro_statut = ANY (ARRAY['en_attente'::text, 'verifie'::text, 'refuse'::text])));
alter table public.profils add constraint profils_role_check CHECK ((role = ANY (ARRAY['user'::text, 'fournisseur'::text, 'admin'::text])));
alter table public.profils add constraint profils_type_profil_check CHECK ((type_profil = ANY (ARRAY['particulier'::text, 'professionnel'::text, 'fournisseur'::text])));
alter table public.projets add constraint projets_nom_check CHECK (((char_length(nom) >= 1) AND (char_length(nom) <= 120)));
alter table public.promotions_fournisseur add constraint promotions_fournisseur_check CHECK (((type <> 'pourcentage'::text) OR (valeur <= (100)::numeric)));
alter table public.promotions_fournisseur add constraint promotions_fournisseur_check1 CHECK (((fin IS NULL) OR (fin >= debut)));
alter table public.promotions_fournisseur add constraint promotions_fournisseur_code_check CHECK ((code ~ '^[A-Z0-9-]{3,20}$'::text));
alter table public.promotions_fournisseur add constraint promotions_fournisseur_libelle_check CHECK (((char_length(btrim(libelle)) >= 2) AND (char_length(btrim(libelle)) <= 60)));
alter table public.promotions_fournisseur add constraint promotions_fournisseur_type_check CHECK ((type = ANY (ARRAY['pourcentage'::text, 'montant'::text])));
alter table public.promotions_fournisseur add constraint promotions_fournisseur_valeur_check CHECK ((valeur > (0)::numeric));
alter table public.realisations add constraint realisations_annee_check CHECK (((annee IS NULL) OR ((annee >= 2000) AND (annee <= 2100))));
alter table public.realisations add constraint realisations_auteur_check CHECK ((char_length(auteur) <= 60));
alter table public.realisations add constraint realisations_commune_check CHECK ((char_length(commune) <= 60));
alter table public.realisations add constraint realisations_detail_check CHECK (((detail IS NULL) OR (char_length(detail) <= 160)));
alter table public.realisations add constraint realisations_fournisseur_nom_check CHECK (((fournisseur_nom IS NULL) OR (char_length(fournisseur_nom) <= 80)));
alter table public.realisations add constraint realisations_message_admin_check CHECK (((message_admin IS NULL) OR (char_length(message_admin) <= 400)));
alter table public.realisations add constraint realisations_photo_chemin_check CHECK (((photo_chemin IS NULL) OR (char_length(photo_chemin) <= 300)));
alter table public.realisations add constraint realisations_photo_url_check CHECK (((photo_url IS NULL) OR (char_length(photo_url) <= 600)));
alter table public.realisations add constraint realisations_quartier_check CHECK (((quartier IS NULL) OR (char_length(quartier) <= 60)));
alter table public.realisations add constraint realisations_statut_check CHECK ((statut = ANY (ARRAY['proposee'::text, 'soumise'::text, 'publiee'::text, 'refusee'::text, 'declinee'::text])));
alter table public.realisations add constraint realisations_titre_check CHECK ((char_length(titre) <= 80));
alter table public.realisations add constraint realisations_type_projet_check CHECK (((type_projet IS NULL) OR (char_length(type_projet) <= 40)));
alter table public.reversements add constraint reversements_montant_check CHECK ((montant > (0)::numeric));
alter table public.reversements add constraint reversements_motif_refus_check CHECK ((char_length(motif_refus) <= 300));
alter table public.reversements add constraint reversements_reference_check CHECK (((char_length(reference) >= 3) AND (char_length(reference) <= 60)));
alter table public.reversements add constraint reversements_statut_check CHECK ((statut = ANY (ARRAY['declare'::text, 'valide'::text, 'refuse'::text])));
alter table public.support_conversations add constraint support_conversations_email_check CHECK ((char_length(email) <= 254));
alter table public.support_conversations add constraint support_conversations_nom_check CHECK ((char_length(nom) <= 80));
alter table public.support_conversations add constraint support_conversations_page_check CHECK ((char_length(page) <= 200));
alter table public.support_conversations add constraint support_conversations_raison_check CHECK ((char_length(raison) <= 300));
alter table public.support_conversations add constraint support_conversations_statut_check CHECK ((statut = ANY (ARRAY['ia'::text, 'attente'::text, 'humain'::text, 'fermee'::text])));
alter table public.support_messages add constraint support_messages_auteur_check CHECK ((auteur = ANY (ARRAY['client'::text, 'ia'::text, 'conseiller'::text, 'systeme'::text])));
alter table public.support_messages add constraint support_messages_texte_check CHECK (((char_length(texte) >= 1) AND (char_length(texte) <= 4000)));
alter table public.versements add constraint versements_montant_check CHECK ((montant > (0)::numeric));
alter table public.versements add constraint versements_note_check CHECK ((char_length(note) <= 200));

-- ---------------------------------------------------------------------------------------------------------------------
-- Clés étrangères
-- ---------------------------------------------------------------------------------------------------------------------
alter table public.articles_fournisseur add constraint articles_fournisseur_fournisseur_id_fkey FOREIGN KEY (fournisseur_id) REFERENCES public.fournisseurs(id) ON DELETE CASCADE;
alter table public.avis add constraint avis_utilisateur_id_fkey FOREIGN KEY (utilisateur_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.carreaux_fournisseur add constraint carreaux_fournisseur_fournisseur_id_fkey FOREIGN KEY (fournisseur_id) REFERENCES public.fournisseurs(id) ON DELETE CASCADE;
alter table public.catalogue_fournisseur add constraint catalogue_fournisseur_fournisseur_id_fkey FOREIGN KEY (fournisseur_id) REFERENCES public.fournisseurs(id) ON DELETE CASCADE;
alter table public.catalogue_fournisseur add constraint catalogue_fournisseur_materiau_id_fkey FOREIGN KEY (materiau_id) REFERENCES public.materiaux(id) ON DELETE CASCADE;
alter table public.contenus_site add constraint contenus_site_mis_a_jour_par_fkey FOREIGN KEY (mis_a_jour_par) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.credits_fidelite add constraint credits_fidelite_paiement_id_fkey FOREIGN KEY (paiement_id) REFERENCES public.paiements(id) ON DELETE CASCADE;
alter table public.credits_fidelite add constraint credits_fidelite_utilisateur_id_fkey FOREIGN KEY (utilisateur_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.fournisseurs add constraint fournisseurs_categorie_id_fkey FOREIGN KEY (categorie_id) REFERENCES public.categories_fournisseurs(id);
alter table public.journal_operations add constraint journal_operations_fournisseur_id_fkey FOREIGN KEY (fournisseur_id) REFERENCES public.fournisseurs(id) ON DELETE SET NULL;
alter table public.journal_operations add constraint journal_operations_par_fkey FOREIGN KEY (par) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.journal_operations add constraint journal_operations_projet_id_fkey FOREIGN KEY (projet_id) REFERENCES public.projets(id) ON DELETE SET NULL;
alter table public.paiements add constraint paiements_confirme_par_fkey FOREIGN KEY (confirme_par) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.paiements add constraint paiements_fournisseur_id_fkey FOREIGN KEY (fournisseur_id) REFERENCES public.fournisseurs(id) ON DELETE SET NULL;
alter table public.paiements add constraint paiements_projet_id_fkey FOREIGN KEY (projet_id) REFERENCES public.projets(id) ON DELETE SET NULL;
alter table public.parametres_versement add constraint parametres_versement_mis_a_jour_par_fkey FOREIGN KEY (mis_a_jour_par) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.profils add constraint profils_banni_par_fkey FOREIGN KEY (banni_par) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.profils add constraint profils_fournisseur_id_fkey FOREIGN KEY (fournisseur_id) REFERENCES public.fournisseurs(id) ON DELETE SET NULL;
alter table public.profils add constraint profils_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.projets add constraint projets_fournisseur_id_fkey FOREIGN KEY (fournisseur_id) REFERENCES public.fournisseurs(id) ON DELETE SET NULL;
alter table public.projets add constraint projets_type_projet_id_fkey FOREIGN KEY (type_projet_id) REFERENCES public.types_projets(id);
alter table public.projets add constraint projets_utilisateur_id_fkey FOREIGN KEY (utilisateur_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.promotions_fournisseur add constraint promotions_fournisseur_fournisseur_id_fkey FOREIGN KEY (fournisseur_id) REFERENCES public.fournisseurs(id) ON DELETE CASCADE;
alter table public.promotions_fournisseur add constraint promotions_fournisseur_materiau_id_fkey FOREIGN KEY (materiau_id) REFERENCES public.materiaux(id) ON DELETE CASCADE;
alter table public.realisations add constraint realisations_fournisseur_id_fkey FOREIGN KEY (fournisseur_id) REFERENCES public.fournisseurs(id) ON DELETE SET NULL;
alter table public.realisations add constraint realisations_projet_id_fkey FOREIGN KEY (projet_id) REFERENCES public.projets(id) ON DELETE SET NULL;
alter table public.realisations add constraint realisations_utilisateur_id_fkey FOREIGN KEY (utilisateur_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.reversements add constraint reversements_declare_par_fkey FOREIGN KEY (declare_par) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.reversements add constraint reversements_fournisseur_id_fkey FOREIGN KEY (fournisseur_id) REFERENCES public.fournisseurs(id) ON DELETE CASCADE;
alter table public.reversements add constraint reversements_statue_par_fkey FOREIGN KEY (statue_par) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.support_conversations add constraint support_conversations_utilisateur_id_fkey FOREIGN KEY (utilisateur_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.support_messages add constraint support_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.support_conversations(id) ON DELETE CASCADE;
alter table public.versements add constraint versements_cree_par_fkey FOREIGN KEY (cree_par) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------------------------------------------------
-- Index
-- ---------------------------------------------------------------------------------------------------------------------
CREATE INDEX idx_articles_fournisseur_fournisseur ON public.articles_fournisseur USING btree (fournisseur_id);
CREATE INDEX idx_avis_cree_le ON public.avis USING btree (cree_le DESC);
CREATE INDEX idx_avis_source ON public.avis USING btree (source, cree_le DESC);
CREATE UNIQUE INDEX uniq_avis_utilisateur ON public.avis USING btree (utilisateur_id) WHERE (utilisateur_id IS NOT NULL);
CREATE INDEX idx_carreaux_fournisseur_fournisseur ON public.carreaux_fournisseur USING btree (fournisseur_id);
CREATE INDEX idx_catalogue_fournisseur_materiau ON public.catalogue_fournisseur USING btree (materiau_id);
CREATE UNIQUE INDEX uniq_codes_promo_code ON public.codes_promo USING btree (upper(code));
CREATE INDEX idx_contenus_site_mis_a_jour_par ON public.contenus_site USING btree (mis_a_jour_par);
CREATE INDEX idx_credits_fidelite_paiement ON public.credits_fidelite USING btree (paiement_id);
CREATE INDEX idx_credits_utilisateur ON public.credits_fidelite USING btree (utilisateur_id);
CREATE INDEX idx_fournisseurs_categorie ON public.fournisseurs USING btree (categorie_id);
CREATE INDEX idx_fournisseurs_commune ON public.fournisseurs USING btree (lower(commune));
CREATE INDEX idx_fournisseurs_recherche ON public.fournisseurs USING gin (recherche);
CREATE INDEX idx_journal_fournisseur_le ON public.journal_operations USING btree (fournisseur_id, le DESC);
CREATE INDEX idx_journal_operations_par ON public.journal_operations USING btree (par);
CREATE INDEX idx_journal_operations_projet ON public.journal_operations USING btree (projet_id);
CREATE INDEX idx_limites_essais_cle_le ON public.limites_essais USING btree (cle, le);
CREATE INDEX idx_paiements_confirme_par ON public.paiements USING btree (confirme_par);
CREATE INDEX idx_paiements_fournisseur ON public.paiements USING btree (fournisseur_id);
CREATE UNIQUE INDEX idx_paiements_numero_recu ON public.paiements USING btree (numero_recu) WHERE (numero_recu IS NOT NULL);
CREATE INDEX idx_paiements_paye_le ON public.paiements USING btree (paye_le DESC);
CREATE INDEX idx_parametres_versement_mis_a_jour_par ON public.parametres_versement USING btree (mis_a_jour_par);
CREATE INDEX idx_profils_banni_par ON public.profils USING btree (banni_par);
CREATE INDEX idx_profils_fournisseur ON public.profils USING btree (fournisseur_id);
CREATE UNIQUE INDEX idx_projets_code_retrait ON public.projets USING btree (code_retrait);
CREATE INDEX idx_projets_fournisseur ON public.projets USING btree (fournisseur_id);
CREATE INDEX idx_projets_type ON public.projets USING btree (type_projet_id);
CREATE INDEX idx_projets_utilisateur ON public.projets USING btree (utilisateur_id, cree_le DESC);
CREATE UNIQUE INDEX idx_promotions_code ON public.promotions_fournisseur USING btree (fournisseur_id, code) WHERE (code IS NOT NULL);
CREATE INDEX idx_promotions_fournisseur_materiau ON public.promotions_fournisseur USING btree (materiau_id);
CREATE INDEX idx_realisations_fournisseur ON public.realisations USING btree (fournisseur_id);
CREATE INDEX idx_realisations_projet ON public.realisations USING btree (projet_id);
CREATE INDEX idx_realisations_publiees ON public.realisations USING btree (statut, publiee_le DESC);
CREATE INDEX idx_realisations_utilisateur ON public.realisations USING btree (utilisateur_id);
CREATE INDEX idx_reversements_declare_par ON public.reversements USING btree (declare_par);
CREATE INDEX idx_reversements_fournisseur ON public.reversements USING btree (fournisseur_id, declare_le DESC);
CREATE INDEX idx_reversements_statue_par ON public.reversements USING btree (statue_par);
CREATE INDEX idx_support_conv_statut ON public.support_conversations USING btree (statut, mis_a_jour_le DESC);
CREATE INDEX idx_support_conversations_utilisateur ON public.support_conversations USING btree (utilisateur_id);
CREATE INDEX idx_support_msg_conv ON public.support_messages USING btree (conversation_id, id);
CREATE INDEX idx_versements_cree_par ON public.versements USING btree (cree_par);

-- ---------------------------------------------------------------------------------------------------------------------
-- Fonctions (et droits d'exécution : tout est retiré, puis rendu explicitement)
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.est_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.profils where id = auth.uid() and role = 'admin');
$function$
;
revoke all on function public.est_admin() from public, anon, authenticated;
grant execute on function public.est_admin() to authenticated;

CREATE OR REPLACE FUNCTION public.mon_fournisseur()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select fournisseur_id from public.profils where id = auth.uid() and role = 'fournisseur';
$function$
;
revoke all on function public.mon_fournisseur() from public, anon, authenticated;
grant execute on function public.mon_fournisseur() to authenticated;

CREATE OR REPLACE FUNCTION public.annuler_encaissement(p_projet uuid, p_motif text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  fid uuid := public.mon_fournisseur();
  pa public.paiements;
  motif text := btrim(coalesce(p_motif, ''));
  ligne jsonb;
begin
  select * into pa from public.paiements where projet_id = p_projet for update;
  if not found then raise exception 'Aucun encaissement à annuler pour ce devis.' using errcode = 'P0002'; end if;
  if not (public.est_admin() or (fid is not null and pa.fournisseur_id = fid)) then
    raise exception 'Action non autorisée.' using errcode = '42501';
  end if;
  if char_length(motif) < 5 then raise exception 'Indiquez le motif de l’annulation (5 caractères minimum).'; end if;
  if char_length(motif) > 300 then raise exception 'Motif trop long (300 caractères maximum).'; end if;

  for ligne in select * from jsonb_array_elements(coalesce(pa.lignes_fournies, '[]'::jsonb)) loop
    if (ligne ->> 'id') like 'article:%' then
      update public.articles_fournisseur set stock = stock + coalesce((ligne ->> 'quantite')::numeric, 0), mis_a_jour_le = now()
        where id = substr(ligne ->> 'id', 9)::uuid and fournisseur_id = pa.fournisseur_id and stock is not null;
    else
      update public.catalogue_fournisseur set stock = stock + coalesce((ligne ->> 'quantite')::numeric, 0), mis_a_jour_le = now()
        where fournisseur_id = pa.fournisseur_id and materiau_id = ligne ->> 'id' and stock is not null;
    end if;
  end loop;
  if pa.promotion ? 'id' then
    update public.promotions_fournisseur set utilisations = greatest(0, utilisations - 1) where id = (pa.promotion ->> 'id')::uuid;
  end if;

  insert into public.journal_operations (fournisseur_id, projet_id, projet_nom, code_retrait, numero_recu, type, montant, moyen, motif, details, par, par_email)
  values (pa.fournisseur_id, pa.projet_id, pa.projet_nom, pa.code_retrait, pa.numero_recu, 'annulation', pa.montant_devis, pa.moyen, motif, to_jsonb(pa), auth.uid(), (select email from auth.users where id = auth.uid()));
  delete from public.paiements where id = pa.id;
end;
$function$
;
revoke all on function public.annuler_encaissement(p_projet uuid, p_motif text) from public, anon, authenticated;
grant execute on function public.annuler_encaissement(p_projet uuid, p_motif text) to authenticated;

CREATE OR REPLACE FUNCTION public.annuler_paiement(p_projet uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  pa public.paiements;
begin
  select * into pa from public.paiements where projet_id = p_projet;
  if not found then return; end if;
  if not (public.est_admin() or (pa.fournisseur_id is not null and pa.fournisseur_id = public.mon_fournisseur())) then
    raise exception 'Action non autorisée' using errcode = '42501';
  end if;
  delete from public.paiements where id = pa.id;
end;
$function$
;
revoke all on function public.annuler_paiement(p_projet uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.avis_proteger_modification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.est_admin() then
    new.visible := old.visible;
    new.nom := old.nom;
    new.lien := old.lien;
    new.cree_le := old.cree_le;
  end if;
  new.source := old.source;
  new.utilisateur_id := old.utilisateur_id;
  new.demo := old.demo;
  if (new.note, new.ville, new.commentaire) is distinct from (old.note, old.ville, old.commentaire) then
    new.modifie_le := now();
  end if;
  return new;
end;
$function$
;
revoke all on function public.avis_proteger_modification() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cles_assistant()
 RETURNS TABLE(nom text, valeur text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select s.name::text, s.decrypted_secret::text
  from vault.decrypted_secrets s
  where s.name like 'gemini\_api\_key\_%'
  order by s.name;
$function$
;
revoke all on function public.cles_assistant() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.code_promo_deja_utilise(p_code text, p_utilisateur uuid DEFAULT auth.uid(), p_sauf uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.paiements pa join public.projets p on p.id = pa.projet_id
    where p.utilisateur_id = p_utilisateur
      and (p_utilisateur = auth.uid() or public.est_admin() or public.mon_fournisseur() is not null)
      and (p_sauf is null or p.id <> p_sauf)
      and not pa.remise_btm_ignoree
      and upper(p.resultat -> 'remise' ->> 'code') = upper(btrim(p_code))
  );
$function$
;
revoke all on function public.code_promo_deja_utilise(p_code text, p_utilisateur uuid, p_sauf uuid) from public, anon, authenticated;
grant execute on function public.code_promo_deja_utilise(p_code text, p_utilisateur uuid, p_sauf uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.confirmer_paiement(p_projet uuid)
 RETURNS paiements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  pr public.projets;
  res public.paiements;
begin
  select * into pr from public.projets where id = p_projet;
  if not found then raise exception 'Devis introuvable' using errcode = 'P0002'; end if;
  if not (public.est_admin() or (pr.fournisseur_id is not null and pr.fournisseur_id = public.mon_fournisseur())) then
    raise exception 'Seul le fournisseur choisi dans ce devis peut confirmer son paiement' using errcode = '42501';
  end if;
  insert into public.paiements (projet_id, projet_nom, fournisseur_id, montant_devis, revenu_btm, confirme_par)
  values (
    pr.id, pr.nom, pr.fournisseur_id, pr.cout_total,
    greatest(0, coalesce((pr.resultat -> 'fraisService' ->> 'montant')::numeric, 0)
              - coalesce((pr.resultat -> 'remise' ->> 'montant')::numeric, 0)),
    auth.uid()
  )
  on conflict (projet_id) do nothing;
  select * into res from public.paiements where projet_id = pr.id;
  return res;
end;
$function$
;
revoke all on function public.confirmer_paiement(p_projet uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.credit_fidelite_gagne(p_montant numeric, p_commission numeric)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select round(greatest(0, case
    when f.valeur ->> 'fidelite_type' = 'montant'
      then least(coalesce((f.valeur ->> 'fidelite_valeur')::numeric, 0), greatest(coalesce(p_montant, 0), 0))
    when f.valeur ->> 'fidelite_type' = 'pourcentage'
      then greatest(coalesce(p_montant, 0), 0) * least(coalesce((f.valeur ->> 'fidelite_valeur')::numeric, 0), 100) / 100
    else coalesce(p_commission, 0) * coalesce((f.valeur ->> 'fidelite')::numeric, 25) / 100
  end), 2)
  from (select coalesce((select valeur from public.contenus_site where cle = 'frais'), '{}'::jsonb) as valeur) f;
$function$
;
revoke all on function public.credit_fidelite_gagne(p_montant numeric, p_commission numeric) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.creer_profil_utilisateur()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  est_pro boolean := meta ->> 'type_profil' = 'professionnel';
  siret text := regexp_replace(coalesce(meta ->> 'pro_siret', ''), '\D', '', 'g');
begin
  insert into public.profils (id, email, nom_affiche, type_profil, pro_statut, pro_raison_sociale, pro_siret, pro_demande_le)
  values (
    new.id, new.email, split_part(coalesce(new.email, ''), '@', 1),
    case when est_pro then 'professionnel' else 'particulier' end,
    case when est_pro then 'en_attente' end,
    case when est_pro then left(nullif(trim(meta ->> 'pro_raison_sociale'), ''), 120) end,
    case when est_pro and siret ~ '^[0-9]{14}$' then siret end,
    case when est_pro then now() end
  )
  on conflict (id) do nothing;
  return new;
end;
$function$
;
revoke all on function public.creer_profil_utilisateur() from public, anon, authenticated;

create or replace function public.declarer_reversement(p_montant numeric, p_reference text)
 returns reversements
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  fid uuid := public.mon_fournisseur();
  du numeric;
  ref text := btrim(coalesce(p_reference, ''));
  res public.reversements;
begin
  if fid is null then raise exception 'Réservé aux comptes fournisseur.' using errcode = '42501'; end if;
  if coalesce(p_montant, 0) <= 0 then raise exception 'Le montant doit être supérieur à 0.'; end if;
  if char_length(ref) < 3 then raise exception 'Indiquez la référence de votre virement.'; end if;
  select coalesce((select sum(revenu_btm) from public.paiements where fournisseur_id = fid), 0)
       - coalesce((select sum(montant) from public.reversements where fournisseur_id = fid and statut in ('valide', 'declare')), 0)
    into du;
  if round(p_montant, 2) > round(du, 2) then
    raise exception 'Montant supérieur à ce que vous devez à BTM (% €, virements en vérification déduits).', round(greatest(du, 0), 2);
  end if;
  insert into public.reversements (fournisseur_id, montant, reference, declare_par, statut)
  values (fid, round(p_montant, 2), left(ref, 60), auth.uid(), 'declare') returning * into res;
  return res;
end;
$function$;

revoke all on function public.declarer_reversement(numeric, text) from public, anon, authenticated;
grant execute on function public.declarer_reversement(numeric, text) to authenticated;

create or replace function public.statuer_reversement(p_id uuid, p_decision text, p_motif text default null)
 returns reversements
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  res public.reversements;
  motif text := nullif(btrim(coalesce(p_motif, '')), '');
begin
  if not public.est_admin() then raise exception 'Réservé aux administrateurs.' using errcode = '42501'; end if;
  if p_decision not in ('valide', 'refuse') then raise exception 'Décision invalide.' using errcode = '22023'; end if;
  if p_decision = 'refuse' and motif is null then
    raise exception 'Indiquez le motif du refus : il est affiché au fournisseur.' using errcode = '22023';
  end if;
  update public.reversements
     set statut = p_decision, statue_le = now(), statue_par = auth.uid(),
         motif_refus = case when p_decision = 'refuse' then left(motif, 300) end
   where id = p_id and statut = 'declare'
  returning * into res;
  if res.id is null then raise exception 'Ce reversement n’est plus en attente de vérification.' using errcode = 'P0002'; end if;
  return res;
end;
$function$;

revoke all on function public.statuer_reversement(uuid, text, text) from public, anon, authenticated;
grant execute on function public.statuer_reversement(uuid, text, text) to authenticated;

CREATE OR REPLACE FUNCTION public.demander_verification_pro(p_raison_sociale text, p_siret text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  siret text := regexp_replace(coalesce(p_siret, ''), '\D', '', 'g');
begin
  if auth.uid() is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  if siret !~ '^[0-9]{14}$' then raise exception 'Le SIRET doit comporter 14 chiffres' using errcode = '22023'; end if;
  if coalesce(trim(p_raison_sociale), '') = '' then raise exception 'Indiquez la raison sociale' using errcode = '22023'; end if;
  if exists (select 1 from public.profils where id = auth.uid() and pro_statut = 'verifie') then
    raise exception 'Votre compte professionnel est déjà vérifié' using errcode = '22023';
  end if;
  update public.profils
  set type_profil = 'professionnel', pro_statut = 'en_attente', pro_raison_sociale = left(trim(p_raison_sociale), 120),
      pro_siret = siret, pro_demande_le = now(), pro_statue_le = null, pro_motif_refus = null
  where id = auth.uid();
end;
$function$
;
revoke all on function public.demander_verification_pro(p_raison_sociale text, p_siret text) from public, anon, authenticated;
grant execute on function public.demander_verification_pro(p_raison_sociale text, p_siret text) to authenticated;

CREATE OR REPLACE FUNCTION public.encaisser_devis(p_projet uuid, p_lignes jsonb, p_moyen text, p_reference text, p_montant_recu numeric, p_promotion uuid, p_articles jsonb DEFAULT '[]'::jsonb, p_credit numeric DEFAULT 0)
 RETURNS paiements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  fid uuid := public.mon_fournisseur();
  pr public.projets;
  res public.paiements;
  ligne jsonb;
  cat public.catalogue_fournisseur;
  art public.articles_fournisseur;
  car public.carreaux_fournisseur;
  promo public.promotions_fournisseur;
  code_btm public.codes_promo;
  qte numeric;
  qte_devis numeric;
  prix numeric;
  st numeric;
  fournies jsonb := '[]'::jsonb;
  manquantes jsonb := '[]'::jsonb;
  materiaux numeric := 0;
  base_promo numeric := 0;
  remise_f numeric := 0;
  net numeric;
  taux numeric;
  part_fidelite numeric;
  commission numeric;
  brut numeric;
  reduction numeric := 0;
  btm_ignoree boolean := false;
  credit numeric := round(greatest(coalesce(p_credit, 0), 0), 2);
  gain numeric := 0;
  montant numeric;
  ref text := nullif(btrim(coalesce(p_reference, '')), '');
  recu numeric;
  numero text;
begin
  if fid is null then raise exception 'Réservé aux comptes fournisseur.' using errcode = '42501'; end if;

  select * into pr from public.projets where id = p_projet for update;
  if not found then raise exception 'Devis introuvable.' using errcode = 'P0002'; end if;
  if pr.fournisseur_id is not null and pr.fournisseur_id <> fid then
    raise exception 'Ce devis a été établi pour un autre fournisseur.' using errcode = '42501';
  end if;
  select * into res from public.paiements where projet_id = pr.id;
  if found then raise exception 'Ce devis a déjà été encaissé (reçu %).', coalesce(res.numero_recu, 'sans numéro'); end if;

  if p_promotion is not null then
    select * into promo from public.promotions_fournisseur
      where id = p_promotion and fournisseur_id = fid and actif and debut <= current_date and (fin is null or fin >= current_date);
    if not found then raise exception 'Cette promotion n’est pas valable aujourd’hui.'; end if;
    if exists (select 1 from public.paiements x join public.projets p on p.id = x.projet_id
               where p.utilisateur_id = pr.utilisateur_id and x.promotion ->> 'id' = promo.id::text) then
      raise exception 'Ce client a déjà profité de la promotion « % » : elle ne sert qu’une fois par client.', promo.libelle;
    end if;
  end if;

  for ligne in select * from jsonb_array_elements(coalesce(pr.resultat -> 'lignes', '[]'::jsonb)) loop
    qte_devis := coalesce((ligne ->> 'quantite')::numeric, 0);
    select round(coalesce((l ->> 'quantite')::numeric, 0), 3) into qte
      from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb)) l where l ->> 'id' = ligne ->> 'id' limit 1;
    qte := coalesce(qte, qte_devis);
    if qte < 0 then raise exception 'Quantité négative pour %.', ligne ->> 'libelle'; end if;
    if qte > qte_devis then raise exception 'Quantité supérieure au devis pour % (% au maximum).', ligne ->> 'libelle', qte_devis; end if;

    -- modèle de carreau (migration 0029) : vendu uniquement par le fournisseur qui l'a mis en ligne, à son prix
    if (ligne ->> 'id') like 'carreau:%' then
      select * into car from public.carreaux_fournisseur
        where id::text = substr(ligne ->> 'id', 9) and fournisseur_id = fid;
      if qte = 0 or not found or not car.actif or car.rupture then
        manquantes := manquantes || jsonb_build_array(ligne);
        continue;
      end if;
      st := round(qte * car.prix_unitaire, 2);
      materiaux := materiaux + st;
      if promo.id is not null and promo.materiau_id is null then base_promo := base_promo + st; end if;
      fournies := fournies || jsonb_build_array(ligne || jsonb_build_object('quantite', qte, 'quantiteDevis', qte_devis, 'prixUnitaire', car.prix_unitaire, 'sousTotal', st));
      if qte < qte_devis then
        manquantes := manquantes || jsonb_build_array(ligne || jsonb_build_object('quantite', qte_devis - qte, 'partiel', true));
      end if;
      continue;
    end if;

    select * into cat from public.catalogue_fournisseur where fournisseur_id = fid and materiau_id = ligne ->> 'id' for update;
    if qte = 0 or (found and (not cat.vendu or cat.rupture)) then
      manquantes := manquantes || jsonb_build_array(ligne);
      continue;
    end if;
    -- prix du fournisseur, sinon prix de référence BTM : jamais le prix écrit dans le devis (modifiable par le client)
    prix := coalesce(cat.prix_unitaire, (select m.prix_unitaire from public.materiaux m where m.id = ligne ->> 'id'));
    if prix is null then
      raise exception 'Aucun prix pour « % » : indiquez votre prix dans votre catalogue avant d’encaisser.', ligne ->> 'libelle';
    end if;
    if cat.stock is not null then
      if qte > cat.stock then raise exception 'Stock insuffisant pour % : il reste %.', ligne ->> 'libelle', cat.stock; end if;
      update public.catalogue_fournisseur set stock = stock - qte, mis_a_jour_le = now() where fournisseur_id = fid and materiau_id = ligne ->> 'id';
    end if;
    st := round(qte * prix, 2);
    materiaux := materiaux + st;
    if promo.id is not null and (promo.materiau_id is null or promo.materiau_id = ligne ->> 'id') then base_promo := base_promo + st; end if;
    fournies := fournies || jsonb_build_array(ligne || jsonb_build_object('quantite', qte, 'quantiteDevis', qte_devis, 'prixUnitaire', prix, 'sousTotal', st));
    if qte < qte_devis then
      manquantes := manquantes || jsonb_build_array(ligne || jsonb_build_object('quantite', qte_devis - qte, 'partiel', true));
    end if;
  end loop;

  for ligne in select * from jsonb_array_elements(coalesce(p_articles, '[]'::jsonb)) loop
    qte := round(coalesce((ligne ->> 'quantite')::numeric, 0), 3);
    continue when qte <= 0;
    select * into art from public.articles_fournisseur where id = (ligne ->> 'id')::uuid and fournisseur_id = fid for update;
    if not found then raise exception 'Article introuvable dans votre catalogue.'; end if;
    if not art.vendu or art.rupture then raise exception '« % » est en rupture ou n’est plus vendu.', art.libelle; end if;
    if art.stock is not null then
      if qte > art.stock then raise exception 'Stock insuffisant pour % : il reste %.', art.libelle, art.stock; end if;
      update public.articles_fournisseur set stock = stock - qte, mis_a_jour_le = now() where id = art.id;
    end if;
    st := round(qte * art.prix_unitaire, 2);
    materiaux := materiaux + st;
    if promo.id is not null and promo.materiau_id is null then base_promo := base_promo + st; end if;
    fournies := fournies || jsonb_build_array(jsonb_build_object('id', 'article:' || art.id, 'libelle', art.libelle, 'unite', art.unite,
      'quantite', qte, 'prixUnitaire', art.prix_unitaire, 'sousTotal', st, 'article', true));
  end loop;

  materiaux := round(materiaux, 2);
  if jsonb_array_length(fournies) = 0 or materiaux <= 0 then raise exception 'Aucun matériau fourni : rien à encaisser.'; end if;

  -- Promotion du fournisseur (à sa charge)
  if promo.id is not null then
    if base_promo <= 0 then raise exception 'La promotion « % » ne porte sur aucun matériau remis.', promo.libelle; end if;
    remise_f := round(least(base_promo, case when promo.type = 'montant' then promo.valeur else base_promo * promo.valeur / 100 end), 2);
  end if;
  net := materiaux - remise_f;

  -- Commission BTM (payée par le fournisseur, jamais par le client), au taux fixé par l'admin
  select rc.taux, rc.fidelite into taux, part_fidelite from public.reglages_commission() rc;
  commission := round(net * taux / 100, 2);

  -- Code promo BTM du client (à la charge de BTM), une fois par compte. Seul le NOM du code vient du devis :
  -- type et valeur sont relus dans la table (code actif, valable le jour du devis, hors anciens codes « frais »).
  if jsonb_typeof(pr.resultat -> 'remise') = 'object' and nullif(btrim(pr.resultat -> 'remise' ->> 'code'), '') is not null then
    select * into code_btm from public.codes_promo c
      where upper(c.code) = upper(btrim(pr.resultat -> 'remise' ->> 'code'))
        and c.actif and c.portee = 'total'
        and (c.expire_le is null or c.expire_le >= (pr.cree_le at time zone 'Indian/Mayotte')::date);
    if not found then
      btm_ignoree := true;
    elsif public.code_promo_deja_utilise(code_btm.code, pr.utilisateur_id, pr.id) then
      btm_ignoree := true;
    else
      brut := case when code_btm.type = 'montant' then code_btm.valeur else net * code_btm.valeur / 100 end;
      reduction := round(least(net, greatest(0, brut)), 2);
    end if;
  end if;

  -- Crédit fidélité du client (à la charge de BTM)
  if credit > 0 then
    if credit > public.solde_credit(pr.utilisateur_id) then raise exception 'Crédit insuffisant : le client dispose de % €.', public.solde_credit(pr.utilisateur_id); end if;
    credit := least(credit, net - reduction);
  end if;
  montant := round(net - reduction - credit, 2);

  if p_moyen not in ('carte', 'especes', 'virement', 'cheque') then raise exception 'Moyen de paiement inconnu.'; end if;
  if montant > 0 or p_moyen <> 'especes' then
    if p_moyen = 'especes' then
      recu := round(coalesce(p_montant_recu, 0), 2);
      if recu < montant then raise exception 'Montant reçu insuffisant : % € à encaisser.', montant; end if;
      ref := null;
    else
      recu := null;
      if ref is null and montant > 0 then
        raise exception '%', case p_moyen
          when 'carte' then 'Indiquez le n° de transaction du ticket TPE.'
          when 'cheque' then 'Indiquez le n° du chèque.'
          else 'Indiquez la référence du virement.' end;
      end if;
      if char_length(coalesce(ref, '')) > 60 then raise exception 'Référence trop longue (60 caractères maximum).'; end if;
    end if;
  end if;

  numero := 'R' || to_char(now() at time zone 'Indian/Mayotte', 'YYYY') || '-' || lpad(nextval('public.numero_recu_seq')::text, 6, '0');
  if pr.fournisseur_id is null then update public.projets set fournisseur_id = fid where id = pr.id; end if;
  if promo.id is not null then update public.promotions_fournisseur set utilisations = utilisations + 1 where id = promo.id; end if;
  gain := public.credit_fidelite_gagne(montant, commission);

  -- revenu BTM = commission − ce que BTM offre (code promo, crédit utilisé)
  insert into public.paiements (
    projet_id, projet_nom, fournisseur_id, montant_devis, revenu_btm, confirme_par,
    numero_recu, code_retrait, moyen, reference, montant_recu, rendu, montant_materiaux, lignes_fournies, lignes_manquantes,
    remise_fournisseur, promotion, remise_btm_ignoree, commission, credit_utilise, credit_gagne
  ) values (
    pr.id, pr.nom, fid, montant, commission - reduction - credit, auth.uid(),
    numero, pr.code_retrait, p_moyen, ref, recu, case when recu is null then null else recu - montant end, materiaux, fournies, manquantes,
    remise_f, case when promo.id is null then null else jsonb_build_object('id', promo.id, 'libelle', promo.libelle, 'code', promo.code, 'type', promo.type, 'valeur', promo.valeur, 'montant', remise_f) end,
    btm_ignoree, commission, credit, gain
  ) returning * into res;

  if credit > 0 then
    insert into public.credits_fidelite (utilisateur_id, paiement_id, montant, libelle)
    values (pr.utilisateur_id, res.id, -credit, 'Utilisé chez le fournisseur · reçu ' || numero);
  end if;
  if gain > 0 then
    insert into public.credits_fidelite (utilisateur_id, paiement_id, montant, libelle)
    values (pr.utilisateur_id, res.id, gain, 'Gagné avec « ' || pr.nom || ' » · reçu ' || numero);
  end if;

  insert into public.journal_operations (fournisseur_id, projet_id, projet_nom, code_retrait, numero_recu, type, montant, moyen, details, par, par_email)
  values (fid, pr.id, pr.nom, pr.code_retrait, numero, 'encaissement', montant, p_moyen, to_jsonb(res), auth.uid(), (select email from auth.users where id = auth.uid()));
  return res;
end;
$function$
;
revoke all on function public.encaisser_devis(p_projet uuid, p_lignes jsonb, p_moyen text, p_reference text, p_montant_recu numeric, p_promotion uuid, p_articles jsonb, p_credit numeric) from public, anon, authenticated;
grant execute on function public.encaisser_devis(p_projet uuid, p_lignes jsonb, p_moyen text, p_reference text, p_montant_recu numeric, p_promotion uuid, p_articles jsonb, p_credit numeric) to authenticated;

CREATE OR REPLACE FUNCTION public.enregistrer_demande_pro_inscription()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_siret text := regexp_replace(coalesce(new.raw_user_meta_data->>'pro_siret', ''), '\D', '', 'g');
  v_raison text := nullif(trim(coalesce(new.raw_user_meta_data->>'pro_raison_sociale', '')), '');
begin
  if new.raw_user_meta_data->>'type_profil' = 'professionnel' and length(v_siret) = 14 and v_raison is not null then
    update public.profils
       set type_profil = 'professionnel',
           pro_siret = v_siret,
           pro_raison_sociale = v_raison,
           pro_statut = 'en_attente',
           pro_demande_le = now()
     where id = new.id
       and pro_statut is null;
  end if;
  return new;
exception when others then
  return new; -- une erreur ici ne doit jamais empêcher la création du compte
end
$function$
;
revoke all on function public.enregistrer_demande_pro_inscription() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.est_email_jetable(p_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_domaine text := lower(split_part(trim(coalesce(p_email, '')), '@', 2));
  v_labels  text[] := string_to_array(v_domaine, '.');
  v_suffixes text[] := '{}';
begin
  if v_domaine = '' then return false; end if;
  -- noms caractéristiques des services jetables : attrape les variantes absentes des listes
  if v_domaine ~ '(yopmail|mailinator|guerrill?amail|10minute|minutemail|minuteinbox|temp-?e?mail|tmp-?e?mail|tempinbox|throwaway|trash-?mail|trashinbox|disposable|discardmail|fake-?e?mail|fakeinbox|burnermail|spambox|spamgourmet|wegwerf|jetable|mail-?temporaire|emailtemporaire)' then
    return true;
  end if;
  -- « a.b.yopmail.com » → { a.b.yopmail.com, b.yopmail.com, yopmail.com }
  for i in 1 .. coalesce(array_length(v_labels, 1), 1) - 1 loop
    v_suffixes := v_suffixes || array_to_string(v_labels[i:], '.');
  end loop;
  return exists (select 1 from public.domaines_jetables where domaine = any(v_suffixes));
end;
$function$
;
revoke all on function public.est_email_jetable(p_email text) from public, anon, authenticated;
grant execute on function public.est_email_jetable(p_email text) to anon;
grant execute on function public.est_email_jetable(p_email text) to authenticated;

CREATE OR REPLACE FUNCTION public.generer_code_retrait()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  octets bytea;
  code text;
begin
  loop
    octets := uuid_send(gen_random_uuid());
    code := '';
    for i in 0..7 loop
      code := code || substr(alphabet, 1 + (get_byte(octets, i) % length(alphabet)), 1);
    end loop;
    code := substr(code, 1, 4) || '-' || substr(code, 5, 4);
    exit when not exists (select 1 from public.projets where code_retrait = code);
  end loop;
  return code;
end;
$function$
;
revoke all on function public.generer_code_retrait() from public, anon, authenticated;
grant execute on function public.generer_code_retrait() to anon;
grant execute on function public.generer_code_retrait() to authenticated;

CREATE OR REPLACE FUNCTION public.lier_compte_fournisseur(p_profil uuid, p_fournisseur uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.est_admin() then raise exception 'Réservé aux administrateurs' using errcode = '42501'; end if;
  if p_profil = auth.uid() then raise exception 'Vous ne pouvez pas modifier votre propre compte' using errcode = '42501'; end if;
  update public.profils
  set fournisseur_id = p_fournisseur,
      role = case when p_fournisseur is not null then 'fournisseur'
                  when role = 'fournisseur' then 'user'
                  else role end
  where id = p_profil;
end;
$function$
;
revoke all on function public.lier_compte_fournisseur(p_profil uuid, p_fournisseur uuid) from public, anon, authenticated;
grant execute on function public.lier_compte_fournisseur(p_profil uuid, p_fournisseur uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.limite_atteinte(p_cle text, p_max integer, p_fenetre interval)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n integer;
begin
  delete from public.limites_essais where cle = p_cle and le < now() - p_fenetre;
  select count(*) into n from public.limites_essais where cle = p_cle;
  if n >= p_max then return true; end if;
  insert into public.limites_essais (cle) values (p_cle);
  return false;
end;
$function$
;
revoke all on function public.limite_atteinte(p_cle text, p_max integer, p_fenetre interval) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.maj_domaines_jetables()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_url text;
  v_rep extensions.http_response;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '60');
  foreach v_url in array array[
    'https://raw.githubusercontent.com/disposable/disposable-email-domains/master/domains.txt',
    'https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf'
  ] loop
    begin
      v_rep := extensions.http_get(v_url);
      if v_rep.status = 200 then
        insert into public.domaines_jetables (domaine)
        select distinct lower(trim(l))
        from regexp_split_to_table(v_rep.content, E'\n') as l
        where lower(trim(l)) ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'
        on conflict (domaine) do nothing;
      else
        raise warning 'maj_domaines_jetables : % a répondu %', v_url, v_rep.status;
      end if;
    exception when others then
      raise warning 'maj_domaines_jetables : échec pour % (%)', v_url, sqlerrm;
    end;
  end loop;
  return (select count(*) from public.domaines_jetables);
end;
$function$
;
revoke all on function public.maj_domaines_jetables() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.maj_horodatage()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.mis_a_jour_le = now();
  return new;
end;
$function$
;
revoke all on function public.maj_horodatage() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.modifier_ma_fiche(p_telephone text, p_email text, p_adresse text, p_commune text, p_site_web text, p_description text, p_horaires text, p_logo_url text, p_livraison boolean)
 RETURNS fournisseurs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
revoke all on function public.modifier_ma_fiche(p_telephone text, p_email text, p_adresse text, p_commune text, p_site_web text, p_description text, p_horaires text, p_logo_url text, p_livraison boolean) from public, anon, authenticated;
grant execute on function public.modifier_ma_fiche(p_telephone text, p_email text, p_adresse text, p_commune text, p_site_web text, p_description text, p_horaires text, p_logo_url text, p_livraison boolean) to authenticated;

CREATE OR REPLACE FUNCTION public.offres_publiques()
 RETURNS TABLE(fournisseur_id uuid, fournisseur_nom text, commune text, livraison boolean, materiau_id text, article_id uuid, libelle text, unite text, prix numeric, prix_comptoir numeric, disponible boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select f.id, f.nom, f.commune, f.livraison, m.id, null::uuid, m.libelle, m.unite,
         coalesce(c.prix_unitaire, m.prix_unitaire), coalesce(c.prix_comptoir, c.prix_unitaire, m.prix_unitaire),
         not coalesce(c.rupture, false) and coalesce(c.stock, 1) > 0
  from public.fournisseurs f
  join public.catalogue_fournisseur c on c.fournisseur_id = f.id and c.vendu
  join public.materiaux m on m.id = c.materiau_id
  where f.actif
  union all
  select f.id, f.nom, f.commune, f.livraison, null, a.id, a.libelle, a.unite,
         a.prix_unitaire, coalesce(a.prix_comptoir, a.prix_unitaire), not a.rupture and coalesce(a.stock, 1) > 0
  from public.fournisseurs f
  join public.articles_fournisseur a on a.fournisseur_id = f.id and a.vendu
  where f.actif;
$function$
;
revoke all on function public.offres_publiques() from public, anon, authenticated;
grant execute on function public.offres_publiques() to anon;
grant execute on function public.offres_publiques() to authenticated;

CREATE OR REPLACE FUNCTION public.passer_particulier()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.profils
  set type_profil = 'particulier', pro_statut = null, pro_raison_sociale = null, pro_siret = null,
      pro_demande_le = null, pro_statue_le = null, pro_motif_refus = null
  where id = auth.uid() and type_profil = 'professionnel';
$function$
;
revoke all on function public.passer_particulier() from public, anon, authenticated;
grant execute on function public.passer_particulier() to authenticated;

CREATE OR REPLACE FUNCTION public.popularite_carreaux()
 RETURNS TABLE(carreau_id uuid, devis integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (p.dimensions->'carreau'->>'id')::uuid, count(*)::integer
    from public.projets p
   where jsonb_typeof(p.dimensions->'carreau') = 'object'
     and p.dimensions->'carreau'->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   group by 1
$function$
;
revoke all on function public.popularite_carreaux() from public, anon, authenticated;
grant execute on function public.popularite_carreaux() to anon;
grant execute on function public.popularite_carreaux() to authenticated;

CREATE OR REPLACE FUNCTION public.projets_figer_encaisse()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (new.resultat is distinct from old.resultat or new.cout_total is distinct from old.cout_total
      or new.dimensions is distinct from old.dimensions or new.type_projet_id is distinct from old.type_projet_id
      or new.fournisseur_id is distinct from old.fournisseur_id)
     and exists (select 1 from public.paiements where projet_id = old.id)
     and not (public.est_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Ce devis a été encaissé : il ne peut plus être modifié.' using errcode = '42501';
  end if;
  return new;
end;
$function$
;
revoke all on function public.projets_figer_encaisse() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.proteger_admin_principal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if lower(old.email) = 'contact@btm.yt' then
    if tg_op = 'DELETE' then
      raise exception 'Le compte administrateur principal ne peut pas être supprimé.';
    end if;
    if new.role is distinct from 'admin' then
      raise exception 'Le compte administrateur principal garde le rôle administrateur.';
    end if;
    if lower(new.email) is distinct from 'contact@btm.yt' then
      raise exception 'L''adresse du compte administrateur principal ne peut pas être modifiée.';
    end if;
    if new.banni_le is not null and (new.banni_jusqua is null or new.banni_jusqua > now()) then
      raise exception 'Le compte administrateur principal ne peut pas être banni.';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$
;
revoke all on function public.proteger_admin_principal() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.proteger_admin_principal_auth()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if lower(old.email) = 'contact@btm.yt' then
    if tg_op = 'DELETE' then
      raise exception 'Le compte administrateur principal ne peut pas être supprimé.';
    end if;
    if new.banned_until is not null and new.banned_until > now() then
      raise exception 'Le compte administrateur principal ne peut pas être banni.';
    end if;
    if lower(new.email) is distinct from 'contact@btm.yt' then
      raise exception 'L''adresse du compte administrateur principal ne peut pas être modifiée.';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$
;
revoke all on function public.proteger_admin_principal_auth() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.proteger_code_retrait()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    new.code_retrait := public.generer_code_retrait();
  else
    new.code_retrait := old.code_retrait;
  end if;
  return new;
end;
$function$
;
revoke all on function public.proteger_code_retrait() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.proteger_profil()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- rôle, fiche fournisseur et bannissement : uniquement par un admin ou par la clé service (fonctions serveur)
  if (new.role is distinct from old.role or new.fournisseur_id is distinct from old.fournisseur_id
      or new.banni_le is distinct from old.banni_le or new.banni_jusqua is distinct from old.banni_jusqua
      or new.banni_motif is distinct from old.banni_motif or new.banni_par is distinct from old.banni_par)
     and not (public.est_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Modification réservée aux administrateurs' using errcode = '42501';
  end if;
  return new;
end;
$function$
;
revoke all on function public.proteger_profil() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.publier_realisation(p_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  chemins text[];
begin
  if not public.est_admin() then raise exception 'Réservé aux administrateurs.' using errcode = '42501'; end if;
  update public.realisations
     set statut = 'publiee', publiee_le = coalesce(publiee_le, now()), message_admin = null
   where id = p_id;
  if not found then raise exception 'Réalisation introuvable.'; end if;

  with en_trop as (
    select id from public.realisations
     where statut = 'publiee'
     order by publiee_le desc nulls last, cree_le desc
    offset 10
  ), supprimees as (
    delete from public.realisations r using en_trop where r.id = en_trop.id
    returning r.photo_chemin
  )
  select coalesce(array_agg(photo_chemin) filter (where photo_chemin is not null), '{}') into chemins from supprimees;
  return chemins;
end;
$function$
;
revoke all on function public.publier_realisation(p_id uuid) from public, anon, authenticated;
grant execute on function public.publier_realisation(p_id uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.realisations_proteger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.est_admin() then return new; end if;
  new.projet_id := old.projet_id;
  new.message_admin := old.message_admin;
  new.publiee_le := old.publiee_le;
  new.cree_le := old.cree_le;
  new.fournisseur_id := old.fournisseur_id;
  new.fournisseur_nom := old.fournisseur_nom;
  if new.photo_chemin is distinct from old.photo_chemin and new.photo_chemin is not null
     and split_part(new.photo_chemin, '/', 1) <> auth.uid()::text then
    raise exception 'Photo non autorisée.' using errcode = '42501';
  end if;
  if new.statut = 'soumise' then
    if new.photo_url is null or btrim(new.titre) = '' or btrim(new.commune) = '' or btrim(new.auteur) = '' then
      raise exception 'Ajoutez une photo, un titre, la commune et votre nom avant d’envoyer.' using errcode = '23514';
    end if;
    if not new.consentement then
      raise exception 'Votre accord pour la diffusion est nécessaire.' using errcode = '23514';
    end if;
    new.soumise_le := now();
  end if;
  return new;
end;
$function$
;
revoke all on function public.realisations_proteger() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rechercher_fournisseurs(terme text DEFAULT NULL::text, categorie text DEFAULT NULL::text)
 RETURNS SETOF fournisseurs
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select f.*
  from public.fournisseurs f
  where f.actif
    and (categorie is null or categorie = '' or f.categorie_id = categorie)
    and (
      terme is null or terme = ''
      or f.recherche @@ plainto_tsquery('french', terme)
      or f.nom ilike '%' || terme || '%'
      or f.commune ilike '%' || terme || '%'
      or coalesce(f.description, '') ilike '%' || terme || '%'
    )
  order by f.nom;
$function$
;
revoke all on function public.rechercher_fournisseurs(terme text, categorie text) from public, anon, authenticated;
grant execute on function public.rechercher_fournisseurs(terme text, categorie text) to anon;
grant execute on function public.rechercher_fournisseurs(terme text, categorie text) to authenticated;

CREATE OR REPLACE FUNCTION public.refuser_email_jetable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (tg_op = 'INSERT' or new.email is distinct from old.email) and public.est_email_jetable(new.email) then
    raise exception 'EMAIL_JETABLE : les adresses e-mail jetables ne sont pas acceptées' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and coalesce(new.email_change, '') <> '' and new.email_change is distinct from old.email_change
     and public.est_email_jetable(new.email_change) then
    raise exception 'EMAIL_JETABLE : les adresses e-mail jetables ne sont pas acceptées' using errcode = 'check_violation';
  end if;
  return new;
end;
$function$
;
revoke all on function public.refuser_email_jetable() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reglages_commission()
 RETURNS TABLE(taux numeric, fidelite numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((valeur ->> 'taux')::numeric, 1.25), coalesce((valeur ->> 'fidelite')::numeric, 25)
  from public.contenus_site where cle = 'frais'
  union all select 1.25, 25 where not exists (select 1 from public.contenus_site where cle = 'frais')
  limit 1;
$function$
;
revoke all on function public.reglages_commission() from public, anon, authenticated;
grant execute on function public.reglages_commission() to anon;
grant execute on function public.reglages_commission() to authenticated;

CREATE OR REPLACE FUNCTION public.rib_btm()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p public.parametres_versement;
begin
  if public.mon_fournisseur() is null and not public.est_admin() then raise exception 'Action non autorisée.' using errcode = '42501'; end if;
  select * into p from public.parametres_versement where id = 1;
  if p.iban is null then return null; end if;
  return jsonb_build_object('titulaire', p.titulaire, 'iban', p.iban, 'bic', p.bic, 'banque', p.banque);
end;
$function$
;
revoke all on function public.rib_btm() from public, anon, authenticated;
grant execute on function public.rib_btm() to authenticated;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.solde_credit(p_utilisateur uuid DEFAULT auth.uid())
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(round(sum(montant), 2), 0)
  from public.credits_fidelite
  where utilisateur_id = p_utilisateur
    and (p_utilisateur = auth.uid() or public.est_admin() or public.mon_fournisseur() is not null);
$function$
;
revoke all on function public.solde_credit(p_utilisateur uuid) from public, anon, authenticated;
grant execute on function public.solde_credit(p_utilisateur uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.statuer_verification_pro(p_profil uuid, p_decision text, p_motif text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.est_admin() then raise exception 'Réservé aux administrateurs' using errcode = '42501'; end if;
  if p_decision not in ('verifie', 'refuse') then raise exception 'Décision invalide' using errcode = '22023'; end if;
  if p_decision = 'refuse' and coalesce(trim(p_motif), '') = '' then
    raise exception 'Indiquez le motif du refus : il est affiché à l’utilisateur' using errcode = '22023';
  end if;
  update public.profils
  set pro_statut = p_decision, pro_statue_le = now(),
      pro_motif_refus = case when p_decision = 'refuse' then left(trim(p_motif), 300) end
  where id = p_profil and type_profil = 'professionnel';
  if not found then raise exception 'Aucune demande professionnelle pour ce compte' using errcode = 'P0002'; end if;
end;
$function$
;
revoke all on function public.statuer_verification_pro(p_profil uuid, p_decision text, p_motif text) from public, anon, authenticated;
grant execute on function public.statuer_verification_pro(p_profil uuid, p_decision text, p_motif text) to authenticated;

CREATE OR REPLACE FUNCTION public.support_presence(p_conversation uuid, p_vu bigint DEFAULT NULL::bigint, p_ecrit boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c public.support_conversations;
begin
  if not public.est_admin() then raise exception 'Réservé aux conseillers BTM.' using errcode = '42501'; end if;
  update public.support_conversations set
    vu_conseiller_id = greatest(vu_conseiller_id, coalesce(p_vu, 0)),
    ecrit_conseiller_le = case when p_ecrit then now() else ecrit_conseiller_le end
  where id = p_conversation
  returning * into c;
  if c.id is null then raise exception 'Conversation introuvable.'; end if;
  return json_build_object(
    'vu_client_id', c.vu_client_id,
    'client_ecrit', c.ecrit_client_le is not null and c.ecrit_client_le > now() - interval '7 seconds'
  );
end;
$function$
;
revoke all on function public.support_presence(p_conversation uuid, p_vu bigint, p_ecrit boolean) from public, anon, authenticated;
grant execute on function public.support_presence(p_conversation uuid, p_vu bigint, p_ecrit boolean) to authenticated;

CREATE OR REPLACE FUNCTION public.support_repondre(p_conversation uuid, p_texte text)
 RETURNS support_messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  texte text := btrim(coalesce(p_texte, ''));
  res public.support_messages;
begin
  if not public.est_admin() then raise exception 'Réservé aux conseillers BTM.' using errcode = '42501'; end if;
  if texte = '' then raise exception 'Message vide.'; end if;
  insert into public.support_messages (conversation_id, auteur, texte) values (p_conversation, 'conseiller', left(texte, 4000)) returning * into res;
  update public.support_conversations
     set statut = 'humain', non_lu = false, mis_a_jour_le = now(), vu_conseiller_id = res.id, ecrit_conseiller_le = null
   where id = p_conversation;
  return res;
end;
$function$
;
revoke all on function public.support_repondre(p_conversation uuid, p_texte text) from public, anon, authenticated;
grant execute on function public.support_repondre(p_conversation uuid, p_texte text) to authenticated;

CREATE OR REPLACE FUNCTION public.support_statut(p_conversation uuid, p_statut text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.est_admin() then raise exception 'Réservé aux conseillers BTM.' using errcode = '42501'; end if;
  if p_statut = 'lu' then
    update public.support_conversations set non_lu = false where id = p_conversation;
    return;
  end if;
  if p_statut not in ('ia', 'humain', 'fermee') then raise exception 'Statut inconnu.'; end if;
  update public.support_conversations set statut = p_statut, non_lu = false, mis_a_jour_le = now() where id = p_conversation;
  insert into public.support_messages (conversation_id, auteur, texte)
  values (p_conversation, 'systeme', case p_statut
    when 'ia' then 'Le conseiller vous a remis en relation avec l’assistante BTM.'
    when 'fermee' then 'La conversation a été clôturée par le conseiller. Vous pouvez écrire à nouveau à tout moment.'
    else 'Un conseiller BTM a rejoint la conversation.' end);
end;
$function$
;
revoke all on function public.support_statut(p_conversation uuid, p_statut text) from public, anon, authenticated;
grant execute on function public.support_statut(p_conversation uuid, p_statut text) to authenticated;

CREATE OR REPLACE FUNCTION public.suspension_compte(p_email text, p_mot_de_passe text)
 RETURNS TABLE(jusqua timestamp with time zone, motif text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if public.limite_atteinte('suspension:' || lower(trim(coalesce(p_email, ''))), 5, interval '15 minutes') then return; end if;
  return query
    select p.banni_jusqua, p.banni_motif
    from auth.users u
    join public.profils p on p.id = u.id
    where lower(u.email) = lower(trim(p_email))
      and u.encrypted_password = crypt(p_mot_de_passe, u.encrypted_password)
      and p.banni_le is not null
      and (p.banni_jusqua is null or p.banni_jusqua > now());
end;
$function$
;
revoke all on function public.suspension_compte(p_email text, p_mot_de_passe text) from public, anon, authenticated;
grant execute on function public.suspension_compte(p_email text, p_mot_de_passe text) to anon;
grant execute on function public.suspension_compte(p_email text, p_mot_de_passe text) to authenticated;

CREATE OR REPLACE FUNCTION public.trouver_devis_par_code(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  fid uuid := public.mon_fournisseur();
  code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  pr public.projets;
  pa public.paiements;
begin
  if fid is null then raise exception 'Réservé aux comptes fournisseur.' using errcode = '42501'; end if;
  if char_length(code) <> 8 then raise exception 'Le code comporte 8 caractères (ex. K7QM-4XPA).' using errcode = '22023'; end if;
  code := substr(code, 1, 4) || '-' || substr(code, 5, 4);

  select * into pr from public.projets where code_retrait = code;
  if not found then raise exception 'Aucun devis ne correspond à ce code.' using errcode = 'P0002'; end if;
  if pr.fournisseur_id is not null and pr.fournisseur_id <> fid then
    raise exception 'Ce devis a été établi pour un autre fournisseur.' using errcode = '42501';
  end if;

  select * into pa from public.paiements where projet_id = pr.id;
  return jsonb_build_object(
    'id', pr.id, 'nom', pr.nom, 'type_projet_id', pr.type_projet_id, 'resultat', pr.resultat,
    'cout_total', pr.cout_total, 'cree_le', pr.cree_le, 'code_retrait', pr.code_retrait,
    'fournisseur_choisi', pr.fournisseur_id is not null,
    'paiement', case when pa.id is null then null else to_jsonb(pa) end,
    'promotions_utilisees', coalesce((
      select jsonb_agg(distinct x.promotion ->> 'id') from public.paiements x join public.projets p on p.id = x.projet_id
      where p.utilisateur_id = pr.utilisateur_id and x.fournisseur_id = fid and x.promotion ? 'id'), '[]'::jsonb),
    'code_btm_deja_utilise', case when pr.resultat -> 'remise' ->> 'code' is null then false
      else public.code_promo_deja_utilise(pr.resultat -> 'remise' ->> 'code', pr.utilisateur_id, pr.id) end,
    'credit_disponible', public.solde_credit(pr.utilisateur_id),
    'commission', (select taux from public.reglages_commission())
  );
end;
$function$
;
revoke all on function public.trouver_devis_par_code(p_code text) from public, anon, authenticated;
grant execute on function public.trouver_devis_par_code(p_code text) to authenticated;

CREATE OR REPLACE FUNCTION public.verifier_code_promo(p_code text)
 RETURNS TABLE(code text, type text, valeur numeric, portee text, expire_le date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cle text := 'promo:' || coalesce(auth.uid()::text, 'anonyme');
begin
  if (select count(*) from public.limites_essais l where l.cle = v_cle and l.le > now() - interval '1 hour') >= 10 then
    raise exception 'Trop de codes essayés : réessayez dans une heure.' using errcode = '54000';
  end if;
  return query
    select c.code, c.type, c.valeur, c.portee, c.expire_le
    from public.codes_promo c
    where upper(c.code) = upper(trim(p_code))
      and c.actif
      and (c.expire_le is null or c.expire_le >= (now() at time zone 'Indian/Mayotte')::date)
    limit 1;
  if not found then -- seuls les codes faux comptent
    delete from public.limites_essais l where l.cle = v_cle and l.le < now() - interval '1 hour';
    insert into public.limites_essais (cle) values (v_cle);
  end if;
end;
$function$
;
revoke all on function public.verifier_code_promo(p_code text) from public, anon, authenticated;
grant execute on function public.verifier_code_promo(p_code text) to authenticated;

CREATE OR REPLACE FUNCTION public.admin_definir_pro(p_profil uuid, p_pro boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from public.profils where id = auth.uid() and role = 'admin') then
    raise exception 'Réservé aux administrateurs.';
  end if;
  if p_pro then
    update public.profils
       set type_profil = 'professionnel', pro_statut = 'verifie', pro_statue_le = now(), pro_motif_refus = null
     where id = p_profil;
  else
    update public.profils
       set type_profil = 'particulier', pro_statut = null, pro_motif_refus = null
     where id = p_profil;
  end if;
end
$function$
;
revoke all on function public.admin_definir_pro(p_profil uuid, p_pro boolean) from public, anon, authenticated;
grant execute on function public.admin_definir_pro(p_profil uuid, p_pro boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- Sécurité par ligne (RLS)
-- ---------------------------------------------------------------------------------------------------------------------
alter table public.articles_fournisseur enable row level security;
alter table public.avis enable row level security;
alter table public.carreaux_fournisseur enable row level security;
alter table public.catalogue_fournisseur enable row level security;
alter table public.categories_fournisseurs enable row level security;
alter table public.codes_promo enable row level security;
alter table public.contenus_site enable row level security;
alter table public.credits_fidelite enable row level security;
alter table public.domaines_jetables enable row level security;   -- aucune politique : lue seulement par les fonctions
alter table public.fournisseurs enable row level security;
alter table public.journal_operations enable row level security;
alter table public.limites_essais enable row level security;      -- aucune politique : lue seulement par les fonctions
alter table public.materiaux enable row level security;
alter table public.paiements enable row level security;
alter table public.parametres_versement enable row level security;
alter table public.profils enable row level security;
alter table public.projets enable row level security;
alter table public.promotions_fournisseur enable row level security;
alter table public.realisations enable row level security;
alter table public.reversements enable row level security;
alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;
alter table public.types_projets enable row level security;
alter table public.versements enable row level security;

create policy "articles : ecriture fournisseur" on public.articles_fournisseur as PERMISSIVE for ALL to authenticated
  using ((fournisseur_id = mon_fournisseur()))
  with check ((fournisseur_id = mon_fournisseur()));
create policy "articles : lecture" on public.articles_fournisseur as PERMISSIVE for SELECT to authenticated
  using (((fournisseur_id = mon_fournisseur()) OR est_admin()));
create policy "avis : lecture admin" on public.avis as PERMISSIVE for SELECT to authenticated
  using (est_admin());
create policy "avis : lecture proprietaire" on public.avis as PERMISSIVE for SELECT to authenticated
  using ((( SELECT auth.uid() AS uid) = utilisateur_id));
create policy "avis : lecture publique" on public.avis as PERMISSIVE for SELECT to anon, authenticated
  using (visible);
create policy "avis : moderation admin" on public.avis as PERMISSIVE for UPDATE to authenticated
  using (est_admin())
  with check (est_admin());
create policy "avis : modification proprietaire" on public.avis as PERMISSIVE for UPDATE to authenticated
  using ((( SELECT auth.uid() AS uid) = utilisateur_id))
  with check ((( SELECT auth.uid() AS uid) = utilisateur_id));
create policy "avis : publication par le proprietaire" on public.avis as PERMISSIVE for INSERT to authenticated
  with check (((( SELECT auth.uid() AS uid) = utilisateur_id) AND (demo = false) AND (source = 'site'::text)));
create policy "avis : suppression admin" on public.avis as PERMISSIVE for DELETE to authenticated
  using (est_admin());
create policy "avis : suppression par le proprietaire" on public.avis as PERMISSIVE for DELETE to authenticated
  using ((( SELECT auth.uid() AS uid) = utilisateur_id));
create policy "avis trustpilot : ajout admin" on public.avis as PERMISSIVE for INSERT to authenticated
  with check ((est_admin() AND (source = 'trustpilot'::text) AND (utilisateur_id IS NULL) AND (demo = false)));
create policy "carreaux : ecriture fournisseur" on public.carreaux_fournisseur as PERMISSIVE for ALL to authenticated
  using (((fournisseur_id = mon_fournisseur()) OR est_admin()))
  with check (((fournisseur_id = mon_fournisseur()) OR est_admin()));
create policy "carreaux : lecture publique" on public.carreaux_fournisseur as PERMISSIVE for SELECT to anon, authenticated
  using (actif and exists (select 1 from public.fournisseurs f where f.id = carreaux_fournisseur.fournisseur_id and f.actif));
create policy "carreaux : lecture fournisseur et admin" on public.carreaux_fournisseur as PERMISSIVE for SELECT to authenticated
  using (fournisseur_id = public.mon_fournisseur() or public.est_admin());
create policy "catalogue : ecriture fournisseur" on public.catalogue_fournisseur as PERMISSIVE for ALL to authenticated
  using ((fournisseur_id = mon_fournisseur()))
  with check ((fournisseur_id = mon_fournisseur()));
create policy "catalogue : lecture" on public.catalogue_fournisseur as PERMISSIVE for SELECT to authenticated
  using (((fournisseur_id = mon_fournisseur()) OR est_admin()));
create policy "categories : insertion admin" on public.categories_fournisseurs as PERMISSIVE for INSERT to authenticated
  with check (est_admin());
create policy "categories : mise a jour admin" on public.categories_fournisseurs as PERMISSIVE for UPDATE to authenticated
  using (est_admin())
  with check (est_admin());
create policy "categories : suppression admin" on public.categories_fournisseurs as PERMISSIVE for DELETE to authenticated
  using (est_admin());
create policy "lecture publique categories" on public.categories_fournisseurs as PERMISSIVE for SELECT to anon, authenticated
  using (true);
create policy "codes promo : insertion admin" on public.codes_promo as PERMISSIVE for INSERT to authenticated
  with check (est_admin());
create policy "codes promo : lecture admin" on public.codes_promo as PERMISSIVE for SELECT to authenticated
  using (est_admin());
create policy "codes promo : mise a jour admin" on public.codes_promo as PERMISSIVE for UPDATE to authenticated
  using (est_admin())
  with check (est_admin());
create policy "codes promo : suppression admin" on public.codes_promo as PERMISSIVE for DELETE to authenticated
  using (est_admin());
create policy "contenus : insertion admin" on public.contenus_site as PERMISSIVE for INSERT to authenticated
  with check (est_admin());
create policy "contenus : lecture publique" on public.contenus_site as PERMISSIVE for SELECT to anon, authenticated
  using (true);
create policy "contenus : mise a jour admin" on public.contenus_site as PERMISSIVE for UPDATE to authenticated
  using (est_admin())
  with check (est_admin());
create policy "contenus : suppression admin" on public.contenus_site as PERMISSIVE for DELETE to authenticated
  using (est_admin());
create policy "credits : lecture" on public.credits_fidelite as PERMISSIVE for SELECT to authenticated
  using (((utilisateur_id = ( SELECT auth.uid() AS uid)) OR est_admin()));
create policy "fournisseurs : ecriture admin" on public.fournisseurs as PERMISSIVE for INSERT to authenticated
  with check (est_admin());
create policy "fournisseurs : lecture admin" on public.fournisseurs as PERMISSIVE for SELECT to authenticated
  using (est_admin());
create policy "fournisseurs : lecture fournisseur lie" on public.fournisseurs as PERMISSIVE for SELECT to authenticated
  using ((id = mon_fournisseur()));
create policy "fournisseurs : mise a jour admin" on public.fournisseurs as PERMISSIVE for UPDATE to authenticated
  using (est_admin())
  with check (est_admin());
create policy "fournisseurs : suppression admin" on public.fournisseurs as PERMISSIVE for DELETE to authenticated
  using (est_admin());
create policy "lecture publique fournisseurs actifs" on public.fournisseurs as PERMISSIVE for SELECT to anon, authenticated
  using ((actif = true));
create policy "journal : lecture admin" on public.journal_operations as PERMISSIVE for SELECT to authenticated
  using (est_admin());
create policy "journal : lecture fournisseur" on public.journal_operations as PERMISSIVE for SELECT to authenticated
  using (((fournisseur_id IS NOT NULL) AND (fournisseur_id = mon_fournisseur())));
create policy "lecture publique materiaux" on public.materiaux as PERMISSIVE for SELECT to anon, authenticated
  using (true);
create policy "materiaux : mise a jour admin" on public.materiaux as PERMISSIVE for UPDATE to authenticated
  using (est_admin())
  with check (est_admin());
create policy "paiements : lecture admin" on public.paiements as PERMISSIVE for SELECT to authenticated
  using (est_admin());
create policy "paiements : lecture client" on public.paiements as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM projets p
  WHERE ((p.id = paiements.projet_id) AND (p.utilisateur_id = ( SELECT auth.uid() AS uid))))));
create policy "paiements : lecture fournisseur" on public.paiements as PERMISSIVE for SELECT to authenticated
  using (((fournisseur_id IS NOT NULL) AND (fournisseur_id = mon_fournisseur())));
create policy "versement : admin" on public.parametres_versement as PERMISSIVE for ALL to authenticated
  using (est_admin())
  with check (est_admin());
create policy "profil : lecture proprietaire" on public.profils as PERMISSIVE for SELECT to authenticated
  using ((( SELECT auth.uid() AS uid) = id));
create policy "profil : mise a jour proprietaire" on public.profils as PERMISSIVE for UPDATE to authenticated
  using ((( SELECT auth.uid() AS uid) = id))
  with check ((( SELECT auth.uid() AS uid) = id));
create policy "profils : lecture admin" on public.profils as PERMISSIVE for SELECT to authenticated
  using (est_admin());
create policy "projets : insertion proprietaire" on public.projets as PERMISSIVE for INSERT to authenticated
  with check ((( SELECT auth.uid() AS uid) = utilisateur_id));
create policy "projets : lecture admin" on public.projets as PERMISSIVE for SELECT to authenticated
  using (est_admin());
create policy "projets : lecture fournisseur choisi" on public.projets as PERMISSIVE for SELECT to authenticated
  using (((fournisseur_id IS NOT NULL) AND (fournisseur_id = mon_fournisseur())));
create policy "projets : lecture proprietaire" on public.projets as PERMISSIVE for SELECT to authenticated
  using ((( SELECT auth.uid() AS uid) = utilisateur_id));
create policy "projets : mise a jour proprietaire" on public.projets as PERMISSIVE for UPDATE to authenticated
  using ((( SELECT auth.uid() AS uid) = utilisateur_id))
  with check ((( SELECT auth.uid() AS uid) = utilisateur_id));
create policy "projets : suppression admin" on public.projets as PERMISSIVE for DELETE to authenticated
  using (est_admin());
create policy "projets : suppression proprietaire" on public.projets as PERMISSIVE for DELETE to authenticated
  using ((( SELECT auth.uid() AS uid) = utilisateur_id));
create policy "promotions : ecriture fournisseur" on public.promotions_fournisseur as PERMISSIVE for ALL to authenticated
  using ((fournisseur_id = mon_fournisseur()))
  with check ((fournisseur_id = mon_fournisseur()));
create policy "promotions : lecture" on public.promotions_fournisseur as PERMISSIVE for SELECT to authenticated
  using (((fournisseur_id = mon_fournisseur()) OR est_admin()));
create policy "realisations : ajout admin" on public.realisations as PERMISSIVE for INSERT to authenticated
  with check (est_admin());
create policy "realisations : lecture admin" on public.realisations as PERMISSIVE for SELECT to authenticated
  using (est_admin());
create policy "realisations : lecture proprietaire" on public.realisations as PERMISSIVE for SELECT to authenticated
  using ((( SELECT auth.uid() AS uid) = utilisateur_id));
create policy "realisations : lecture publique" on public.realisations as PERMISSIVE for SELECT to anon, authenticated
  using ((statut = 'publiee'::text));
create policy "realisations : modification admin" on public.realisations as PERMISSIVE for UPDATE to authenticated
  using (est_admin())
  with check (est_admin());
create policy "realisations : reponse proprietaire" on public.realisations as PERMISSIVE for UPDATE to authenticated
  using (((( SELECT auth.uid() AS uid) = utilisateur_id) AND (statut = ANY (ARRAY['proposee'::text, 'soumise'::text]))))
  with check (((( SELECT auth.uid() AS uid) = utilisateur_id) AND (statut = ANY (ARRAY['soumise'::text, 'declinee'::text]))));
create policy "realisations : suppression admin" on public.realisations as PERMISSIVE for DELETE to authenticated
  using (est_admin());
create policy "reversements : lecture" on public.reversements as PERMISSIVE for SELECT to authenticated
  using (((fournisseur_id = mon_fournisseur()) OR est_admin()));
create policy "support conv : admin" on public.support_conversations as PERMISSIVE for SELECT to authenticated
  using (est_admin());
create policy "support msg : admin" on public.support_messages as PERMISSIVE for SELECT to authenticated
  using (est_admin());
create policy "lecture publique types projets" on public.types_projets as PERMISSIVE for SELECT to anon, authenticated
  using (true);
create policy "types projets : mise a jour admin" on public.types_projets as PERMISSIVE for UPDATE to authenticated
  using (est_admin())
  with check (est_admin());
create policy "versements : admin" on public.versements as PERMISSIVE for ALL to authenticated
  using (est_admin())
  with check (est_admin());

-- ---------------------------------------------------------------------------------------------------------------------
-- Déclencheurs
-- ---------------------------------------------------------------------------------------------------------------------
CREATE TRIGGER trg_avis_proteger BEFORE UPDATE ON public.avis FOR EACH ROW EXECUTE FUNCTION avis_proteger_modification();
CREATE TRIGGER trg_contenus_site_maj BEFORE UPDATE ON public.contenus_site FOR EACH ROW EXECUTE FUNCTION maj_horodatage();
CREATE TRIGGER trg_fournisseurs_maj BEFORE UPDATE ON public.fournisseurs FOR EACH ROW EXECUTE FUNCTION maj_horodatage();
CREATE TRIGGER trg_materiaux_maj BEFORE UPDATE ON public.materiaux FOR EACH ROW EXECUTE FUNCTION maj_horodatage();
CREATE TRIGGER trg_parametres_versement_maj BEFORE UPDATE ON public.parametres_versement FOR EACH ROW EXECUTE FUNCTION maj_horodatage();
CREATE TRIGGER proteger_admin_principal BEFORE DELETE OR UPDATE ON public.profils FOR EACH ROW EXECUTE FUNCTION proteger_admin_principal();
CREATE TRIGGER trg_proteger_profil BEFORE UPDATE ON public.profils FOR EACH ROW EXECUTE FUNCTION proteger_profil();
CREATE TRIGGER projets_code_retrait BEFORE INSERT OR UPDATE ON public.projets FOR EACH ROW EXECUTE FUNCTION proteger_code_retrait();
CREATE TRIGGER projets_figer_encaisse BEFORE UPDATE ON public.projets FOR EACH ROW EXECUTE FUNCTION projets_figer_encaisse();
CREATE TRIGGER trg_projets_maj BEFORE UPDATE ON public.projets FOR EACH ROW EXECUTE FUNCTION maj_horodatage();
CREATE TRIGGER trg_realisations_proteger BEFORE UPDATE ON public.realisations FOR EACH ROW EXECUTE FUNCTION realisations_proteger();
CREATE TRIGGER proteger_admin_principal_auth BEFORE DELETE OR UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION proteger_admin_principal_auth();
CREATE TRIGGER trg_nouvel_utilisateur AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION creer_profil_utilisateur();
CREATE TRIGGER trg_refuser_email_jetable BEFORE INSERT OR UPDATE OF email, email_change ON auth.users FOR EACH ROW EXECUTE FUNCTION refuser_email_jetable();
CREATE TRIGGER zz_demande_pro_inscription AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION enregistrer_demande_pro_inscription();

-- ---------------------------------------------------------------------------------------------------------------------
-- Stockage (photos des réalisations)
-- ---------------------------------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('realisations', 'realisations', true, 5242880, '{image/jpeg,image/png,image/webp}')
on conflict (id) do nothing;

create policy "realisations : depot photo" on storage.objects as PERMISSIVE for INSERT to authenticated
  with check (((bucket_id = 'realisations'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR est_admin())));
create policy "realisations : suppression photo" on storage.objects as PERMISSIVE for DELETE to authenticated
  using (((bucket_id = 'realisations'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR est_admin())));

-- ---------------------------------------------------------------------------------------------------------------------
-- Tâche planifiée : liste des domaines d'e-mail jetables, chaque nuit à 4 h 17
-- ---------------------------------------------------------------------------------------------------------------------
select cron.schedule('maj-domaines-jetables', '17 4 * * *', 'select public.maj_domaines_jetables()');

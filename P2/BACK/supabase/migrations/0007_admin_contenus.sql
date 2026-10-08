-- =============================================================================
-- BTM — Migration 0007 : site entièrement pilotable depuis /admin
-- =============================================================================
--   * contenus_site : textes éditables du site (accueil, pied de page, contact,
--     bandeau d'annonce). Une ligne par section, valeur JSONB.
--     Le front garde des valeurs par défaut : une section absente n'est jamais vide.
--   * types_projets : l'admin modifie libellés, textes et constantes de calcul.
--   * materiaux     : l'admin modifie les prix (les identifiants restent fixes,
--     car les formules de calcul les référencent).
--   * categories_fournisseurs : création / modification / suppression par l'admin.
--   * avis : colonne « visible » pour masquer un avis sans le supprimer.
-- Toutes les écritures passent par public.est_admin() (0004) : pas de récursion RLS.
-- Les GRANT par colonne limitent ce qu'un admin peut changer via l'API.
-- =============================================================================

-- ---------- Contenus du site ---------------------------------------------------
create table if not exists public.contenus_site (
  cle             text primary key check (cle ~ '^[a-z0-9_-]{2,40}$'),
  valeur          jsonb not null default '{}'::jsonb,
  mis_a_jour_le   timestamptz not null default now(),
  mis_a_jour_par  uuid references auth.users(id) on delete set null
);

drop trigger if exists trg_contenus_site_maj on public.contenus_site;
create trigger trg_contenus_site_maj
  before update on public.contenus_site
  for each row execute function public.maj_horodatage();

alter table public.contenus_site enable row level security;

drop policy if exists "contenus : lecture publique" on public.contenus_site;
create policy "contenus : lecture publique"
  on public.contenus_site for select
  to anon, authenticated using (true);

drop policy if exists "contenus : insertion admin" on public.contenus_site;
create policy "contenus : insertion admin"
  on public.contenus_site for insert
  to authenticated with check (public.est_admin());

drop policy if exists "contenus : mise a jour admin" on public.contenus_site;
create policy "contenus : mise a jour admin"
  on public.contenus_site for update
  to authenticated using (public.est_admin()) with check (public.est_admin());

drop policy if exists "contenus : suppression admin" on public.contenus_site;
create policy "contenus : suppression admin"
  on public.contenus_site for delete
  to authenticated using (public.est_admin());

grant select on public.contenus_site to anon, authenticated;
grant insert, update, delete on public.contenus_site to authenticated;

-- Frais de service BTM ajoutés à chaque devis : 1,25 % du coût des travaux (modifiable dans /admin)
insert into public.contenus_site (cle, valeur) values ('frais', '{"taux": 1.25}'::jsonb)
on conflict (cle) do nothing;

-- ---------- Types de projets : textes + constantes de calcul -------------------
alter table public.types_projets add column if not exists accroche   text;
alter table public.types_projets add column if not exists hypotheses text;

drop policy if exists "types projets : mise a jour admin" on public.types_projets;
create policy "types projets : mise a jour admin"
  on public.types_projets for update
  to authenticated using (public.est_admin()) with check (public.est_admin());

grant update (libelle, description, accroche, hypotheses, parametres) on public.types_projets to authenticated;

-- La description est désormais affichée dans le choix de l'ouvrage du calculateur :
-- on remplace les textes techniques du seed, seulement s'ils n'ont jamais été modifiés.
update public.types_projets set description = 'Un mur en parpaings, avec ou sans porte et fenêtre'
  where id = 'mur' and description = 'Mur en parpaings 20×20×40 cm, avec ouvertures.';
update public.types_projets set description = 'Le sol en béton d’une maison, d’un garage ou d’un abri'
  where id = 'dalle' and description = 'Dalle béton armée sur hérisson de gravier.';
update public.types_projets set description = 'Les tranchées en béton qui portent la maison'
  where id = 'fondation' and description = 'Semelles filantes en béton armé.';
update public.types_projets set description = 'Un sol extérieur carrelé ou en béton lissé'
  where id = 'terrasse' and description = 'Dalle extérieure avec finition carrelage ou béton lissé.';

-- ---------- Matériaux : prix unitaires -----------------------------------------
drop policy if exists "materiaux : mise a jour admin" on public.materiaux;
create policy "materiaux : mise a jour admin"
  on public.materiaux for update
  to authenticated using (public.est_admin()) with check (public.est_admin());

grant update (libelle, unite, prix_unitaire, source) on public.materiaux to authenticated;

-- ---------- Catégories de fournisseurs ------------------------------------------
drop policy if exists "categories : insertion admin" on public.categories_fournisseurs;
create policy "categories : insertion admin"
  on public.categories_fournisseurs for insert
  to authenticated with check (public.est_admin());

drop policy if exists "categories : mise a jour admin" on public.categories_fournisseurs;
create policy "categories : mise a jour admin"
  on public.categories_fournisseurs for update
  to authenticated using (public.est_admin()) with check (public.est_admin());

drop policy if exists "categories : suppression admin" on public.categories_fournisseurs;
create policy "categories : suppression admin"
  on public.categories_fournisseurs for delete
  to authenticated using (public.est_admin());

grant insert, update, delete on public.categories_fournisseurs to authenticated;

-- ---------- Avis : masquer sans supprimer ---------------------------------------
alter table public.avis add column if not exists visible boolean not null default true;

-- Le public ne voit plus que les avis visibles ; l'auteur et l'admin voient tout.
drop policy if exists "avis : lecture publique" on public.avis;
create policy "avis : lecture publique"
  on public.avis for select
  to anon, authenticated using (visible);

drop policy if exists "avis : lecture proprietaire" on public.avis;
create policy "avis : lecture proprietaire"
  on public.avis for select
  to authenticated using (auth.uid() = utilisateur_id);

drop policy if exists "avis : lecture admin" on public.avis;
create policy "avis : lecture admin"
  on public.avis for select
  to authenticated using (public.est_admin());

drop policy if exists "avis : moderation admin" on public.avis;
create policy "avis : moderation admin"
  on public.avis for update
  to authenticated using (public.est_admin()) with check (public.est_admin());

grant update (visible) on public.avis to authenticated;

notify pgrst, 'reload schema';

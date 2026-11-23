-- Avis sur les fournisseurs : après un retrait encaissé au comptoir, le fournisseur demande son avis au client
-- (Mon compte → Présentation et avis). Le client le voit dans « Mes projets », note de 1 à 5 étoiles avec un
-- commentaire, ou décline. Les avis publiés s'affichent sur la fiche de l'annuaire ; l'admin peut les masquer
-- ou les supprimer (Administration → Avis).
--  - une demande par encaissement (paiement), jamais pour un concurrent : tout passe par des fonctions qui vérifient ;
--  - lecture publique par la fonction avis_fournisseurs_publics() : ni le projet ni le compte du client ne sortent.

create table if not exists public.avis_fournisseurs (
  id uuid primary key default gen_random_uuid(),
  fournisseur_id uuid not null references public.fournisseurs(id) on delete cascade,
  fournisseur_nom text not null,
  paiement_id uuid not null unique references public.paiements(id) on delete cascade,
  utilisateur_id uuid not null references auth.users(id) on delete cascade,
  projet_nom text not null,
  statut text not null default 'demande' check (statut in ('demande', 'publie', 'decline')),
  note integer check (note between 1 and 5),
  commentaire text not null default '' check (char_length(commentaire) <= 600),
  nom text check (nom is null or char_length(nom) <= 60), -- nom public : « Amina M. »
  visible boolean not null default true,
  demande_le timestamptz not null default now(),
  repondu_le timestamptz,
  constraint avis_fournisseurs_publie_complet check (statut <> 'publie' or (note is not null and nom is not null))
);
create index if not exists idx_avis_fournisseurs_fournisseur on public.avis_fournisseurs (fournisseur_id);
create index if not exists idx_avis_fournisseurs_utilisateur on public.avis_fournisseurs (utilisateur_id);

alter table public.avis_fournisseurs enable row level security;

-- Lecture : le client (ses demandes), le fournisseur (les siennes), l'admin (tout). Écriture : fonctions ci-dessous, et l'admin.
drop policy if exists "avis fournisseurs : lecture client" on public.avis_fournisseurs;
create policy "avis fournisseurs : lecture client" on public.avis_fournisseurs for select to authenticated
  using (utilisateur_id = (select auth.uid()));
drop policy if exists "avis fournisseurs : lecture fournisseur" on public.avis_fournisseurs;
create policy "avis fournisseurs : lecture fournisseur" on public.avis_fournisseurs for select to authenticated
  using (fournisseur_id = public.mon_fournisseur());
drop policy if exists "avis fournisseurs : lecture admin" on public.avis_fournisseurs;
create policy "avis fournisseurs : lecture admin" on public.avis_fournisseurs for select to authenticated
  using (public.est_admin());
drop policy if exists "avis fournisseurs : moderation admin" on public.avis_fournisseurs;
create policy "avis fournisseurs : moderation admin" on public.avis_fournisseurs for update to authenticated
  using (public.est_admin()) with check (public.est_admin());
drop policy if exists "avis fournisseurs : suppression admin" on public.avis_fournisseurs;
create policy "avis fournisseurs : suppression admin" on public.avis_fournisseurs for delete to authenticated
  using (public.est_admin());

grant select, update, delete on public.avis_fournisseurs to authenticated;

-- Le fournisseur demande l'avis du client d'un de ses encaissements (une seule fois par encaissement)
create or replace function public.demander_avis_fournisseur(p_paiement uuid)
 returns avis_fournisseurs
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  fid uuid := public.mon_fournisseur();
  pai public.paiements;
  client uuid;
  ligne public.avis_fournisseurs;
begin
  if fid is null then raise exception 'Réservé aux comptes fournisseur.'; end if;

  select * into pai from public.paiements where id = p_paiement and fournisseur_id = fid;
  if not found then raise exception 'Encaissement introuvable.'; end if;

  select utilisateur_id into client from public.projets where id = pai.projet_id;
  if client is null then raise exception 'Ce client n’a plus de compte BTM : impossible de lui demander un avis.'; end if;

  select * into ligne from public.avis_fournisseurs where paiement_id = p_paiement;
  if found then return ligne; end if; -- déjà demandé : on ne relance pas le client

  insert into public.avis_fournisseurs (fournisseur_id, fournisseur_nom, paiement_id, utilisateur_id, projet_nom)
  values (fid, (select nom from public.fournisseurs where id = fid), p_paiement, client, pai.projet_nom)
  returning * into ligne;
  return ligne;
end;
$function$;
revoke all on function public.demander_avis_fournisseur(uuid) from public, anon, authenticated;
grant execute on function public.demander_avis_fournisseur(uuid) to authenticated;

-- Le client publie (ou corrige) son avis : note, commentaire, nom public
create or replace function public.publier_avis_fournisseur(p_id uuid, p_note integer, p_commentaire text, p_nom text)
 returns avis_fournisseurs
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  ligne public.avis_fournisseurs;
begin
  if p_note is null or p_note not between 1 and 5 then raise exception 'Choisissez une note de 1 à 5 étoiles.'; end if;
  p_commentaire := btrim(coalesce(p_commentaire, ''));
  p_nom := nullif(btrim(coalesce(p_nom, '')), '');
  if char_length(p_commentaire) > 600 then raise exception 'Commentaire trop long (600 caractères maximum).'; end if;
  if p_nom is null then raise exception 'Indiquez le nom affiché avec votre avis.'; end if;

  update public.avis_fournisseurs
     set statut = 'publie', note = p_note, commentaire = p_commentaire, nom = left(p_nom, 60), repondu_le = now()
   where id = p_id and utilisateur_id = auth.uid()
  returning * into ligne;
  if not found then raise exception 'Demande d’avis introuvable.'; end if;
  return ligne;
end;
$function$;
revoke all on function public.publier_avis_fournisseur(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.publier_avis_fournisseur(uuid, integer, text, text) to authenticated;

-- Le client ne souhaite pas répondre : la demande disparaît de « Mes projets »
create or replace function public.decliner_avis_fournisseur(p_id uuid)
 returns avis_fournisseurs
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  ligne public.avis_fournisseurs;
begin
  update public.avis_fournisseurs set statut = 'decline', repondu_le = now()
   where id = p_id and utilisateur_id = auth.uid() and statut = 'demande'
  returning * into ligne;
  if not found then raise exception 'Demande d’avis introuvable.'; end if;
  return ligne;
end;
$function$;
revoke all on function public.decliner_avis_fournisseur(uuid) from public, anon, authenticated;
grant execute on function public.decliner_avis_fournisseur(uuid) to authenticated;

-- Annuaire : avis publiés et visibles, sans rien qui identifie le compte ou le projet du client
create or replace function public.avis_fournisseurs_publics()
 returns table (id uuid, fournisseur_id uuid, note integer, commentaire text, nom text, publie_le timestamptz)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select a.id, a.fournisseur_id, a.note, a.commentaire, a.nom, a.repondu_le
    from public.avis_fournisseurs a
    join public.fournisseurs f on f.id = a.fournisseur_id and f.actif
   where a.statut = 'publie' and a.visible
   order by a.repondu_le desc;
$function$;
revoke all on function public.avis_fournisseurs_publics() from public;
grant execute on function public.avis_fournisseurs_publics() to anon, authenticated;

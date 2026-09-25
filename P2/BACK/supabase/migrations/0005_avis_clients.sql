-- =============================================================================
-- BTM — Migration 0005 : avis clients
-- =============================================================================
--   * Lecture publique des avis (page d'accueil, sans connexion).
--   * Publication réservée aux utilisateurs connectés, un seul avis par compte.
--   * Les avis de démonstration (clients fictifs, sans compte) sont marqués demo = true :
--       delete from public.avis where demo;   -- pour les retirer plus tard
-- =============================================================================

create table if not exists public.avis (
  id              uuid primary key default gen_random_uuid(),
  utilisateur_id  uuid references auth.users(id) on delete set null,   -- null pour les avis de démonstration
  nom             text not null check (char_length(nom) between 2 and 60),
  ville           text not null default 'Mayotte' check (char_length(ville) <= 60),
  note            int  not null check (note between 1 and 5),
  commentaire     text not null default '' check (char_length(commentaire) <= 300),
  demo            boolean not null default false,
  cree_le         timestamptz not null default now()
);

create index if not exists idx_avis_cree_le on public.avis(cree_le desc);
-- Un seul avis par compte utilisateur
create unique index if not exists uniq_avis_utilisateur on public.avis(utilisateur_id) where utilisateur_id is not null;

alter table public.avis enable row level security;

drop policy if exists "avis : lecture publique" on public.avis;
create policy "avis : lecture publique"
  on public.avis for select
  to anon, authenticated using (true);

drop policy if exists "avis : publication par le proprietaire" on public.avis;
create policy "avis : publication par le proprietaire"
  on public.avis for insert
  to authenticated with check (auth.uid() = utilisateur_id and demo = false);

drop policy if exists "avis : suppression par le proprietaire" on public.avis;
create policy "avis : suppression par le proprietaire"
  on public.avis for delete
  to authenticated using (auth.uid() = utilisateur_id);

grant select on public.avis to anon, authenticated;
grant insert, delete on public.avis to authenticated;

-- ---------- Clients de démonstration (fictifs) ----------------------------------
insert into public.avis (id, utilisateur_id, nom, ville, note, commentaire, demo, cree_le) values
  ('a0000000-0000-4000-8000-000000000001', null, 'Amina M.',    'Mamoudzou', 5, 'Un devis clair et rapide pour préparer mon projet.', true, '2026-09-12 09:20+03'),
  ('a0000000-0000-4000-8000-000000000002', null, 'Youssouf B.', 'Koungou',   4, 'Les quantités sont faciles à comprendre. Très pratique avant de demander un devis.', true, '2026-09-10 17:45+03'),
  ('a0000000-0000-4000-8000-000000000003', null, 'Sarah A.',    'Dzaoudzi',  5, 'Enfin un outil pensé pour les projets de construction à Mayotte.', true, '2026-09-06 11:05+03'),
  ('a0000000-0000-4000-8000-000000000004', null, 'Nassim R.',   'Pamandzi',  4, 'Simple, lisible et utile pour comparer les matériaux.', true, '2026-09-02 14:30+03'),
  ('a0000000-0000-4000-8000-000000000005', null, 'Fatima S.',   'Sada',      5, 'J’ai estimé ma dalle en cinq minutes et trouvé un fournisseur près de chez moi.', true, '2026-08-28 08:15+03'),
  ('a0000000-0000-4000-8000-000000000006', null, 'Ibrahim H.',  'Chirongui', 5, 'Très utile pour préparer le budget de ma fondation avant de contacter le maçon.', true, '2026-08-21 19:00+03')
on conflict (id) do nothing;

notify pgrst, 'reload schema';

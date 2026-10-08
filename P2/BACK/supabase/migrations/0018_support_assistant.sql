-- =============================================================================
-- BTM — Migration 0018 : support client (assistante IA + conseiller humain)
-- =============================================================================
-- Une conversation est d'abord tenue par l'assistante (statut « ia »). Si la demande dépasse ce
-- qu'elle peut faire, ou si le client le demande, elle passe « attente » : l'admin (conseiller) la
-- reprend dans /admin/support (statut « humain »), puis la ferme ou la rend à l'assistante.
-- Le visiteur n'a aucun accès direct aux tables : tout passe par la fonction « assistant »
-- (clé service), qui vérifie le jeton secret de la conversation. L'admin lit et répond via la RLS.
-- À exécuter APRÈS 0017.
-- =============================================================================

create table if not exists public.support_conversations (
  id              uuid primary key default gen_random_uuid(),
  jeton           uuid not null default gen_random_uuid(),     -- secret connu du seul navigateur du client
  utilisateur_id  uuid references auth.users(id) on delete set null,
  nom             text check (char_length(nom) <= 80),
  email           text check (char_length(email) <= 254),
  statut          text not null default 'ia' check (statut in ('ia', 'attente', 'humain', 'fermee')),
  raison          text check (char_length(raison) <= 300),       -- pourquoi l'assistante a passé la main
  page            text check (char_length(page) <= 200),
  reponses_ia     integer not null default 0,                    -- plafond anti-abus
  non_lu          boolean not null default false,                -- nouveau message client pour le conseiller
  cree_le         timestamptz not null default now(),
  mis_a_jour_le   timestamptz not null default now()
);
create index if not exists idx_support_conv_statut on public.support_conversations(statut, mis_a_jour_le desc);

create table if not exists public.support_messages (
  id               bigint generated always as identity primary key,
  conversation_id  uuid not null references public.support_conversations(id) on delete cascade,
  auteur           text not null check (auteur in ('client', 'ia', 'conseiller', 'systeme')),
  texte            text not null check (char_length(texte) between 1 and 4000),
  cree_le          timestamptz not null default now()
);
create index if not exists idx_support_msg_conv on public.support_messages(conversation_id, id);

alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;
drop policy if exists "support conv : admin" on public.support_conversations;
create policy "support conv : admin" on public.support_conversations for select to authenticated using (public.est_admin());
drop policy if exists "support msg : admin" on public.support_messages;
create policy "support msg : admin" on public.support_messages for select to authenticated using (public.est_admin());
grant select on public.support_conversations, public.support_messages to authenticated;

-- Le conseiller (admin) répond : la conversation passe « humain »
create or replace function public.support_repondre(p_conversation uuid, p_texte text)
returns public.support_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  texte text := btrim(coalesce(p_texte, ''));
  res public.support_messages;
begin
  if not public.est_admin() then raise exception 'Réservé aux conseillers BTM.' using errcode = '42501'; end if;
  if texte = '' then raise exception 'Message vide.'; end if;
  insert into public.support_messages (conversation_id, auteur, texte) values (p_conversation, 'conseiller', left(texte, 4000)) returning * into res;
  update public.support_conversations set statut = 'humain', non_lu = false, mis_a_jour_le = now() where id = p_conversation;
  return res;
end;
$$;
revoke execute on function public.support_repondre(uuid, text) from public, anon;
grant execute on function public.support_repondre(uuid, text) to authenticated;

-- Le conseiller change le statut : prise en charge, rendue à l'assistante, fermée ; ou marque comme lue
create or replace function public.support_statut(p_conversation uuid, p_statut text)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
$$;
revoke execute on function public.support_statut(uuid, text) from public, anon;
grant execute on function public.support_statut(uuid, text) to authenticated;

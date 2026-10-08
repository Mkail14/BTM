-- =============================================================================
-- BTM — Migration 0021 : support — accusés de lecture (« Vu ») et indicateur « … écrit »
-- =============================================================================
-- Chaque côté de la discussion (client / conseiller) enregistre :
--   * le dernier message qu'il a vu (identifiant) : l'autre côté affiche « Vu » sous son message ;
--   * le moment où il a tapé pour la dernière fois : l'autre côté affiche « … écrit » pendant quelques secondes.
-- Le client passe toujours par la fonction « assistant » (jeton secret) ; le conseiller par la RPC support_presence.
-- Ces mises à jour ne touchent pas mis_a_jour_le : l'ordre de la liste du conseiller ne bouge pas.
-- À exécuter APRÈS 0020.
-- =============================================================================

alter table public.support_conversations
  add column if not exists vu_client_id        bigint not null default 0,  -- dernier message vu par le client
  add column if not exists vu_conseiller_id    bigint not null default 0,  -- dernier message vu par le conseiller
  add column if not exists ecrit_client_le     timestamptz,                -- le client tape…
  add column if not exists ecrit_conseiller_le timestamptz;                -- le conseiller tape…

-- Le conseiller a la discussion sous les yeux : il marque les messages vus (jusqu'à p_vu), signale qu'il écrit,
-- et reçoit en retour l'état du client : { vu_client_id, client_ecrit }
create or replace function public.support_presence(p_conversation uuid, p_vu bigint default null, p_ecrit boolean default false)
returns json
language plpgsql
security definer
set search_path = public
as $$
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
$$;
revoke execute on function public.support_presence(uuid, bigint, boolean) from public, anon;
grant execute on function public.support_presence(uuid, bigint, boolean) to authenticated;

-- Réponse du conseiller : il a forcément vu la discussion, et il a fini d'écrire
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
  update public.support_conversations
     set statut = 'humain', non_lu = false, mis_a_jour_le = now(), vu_conseiller_id = res.id, ecrit_conseiller_le = null
   where id = p_conversation;
  return res;
end;
$$;
revoke execute on function public.support_repondre(uuid, text) from public, anon;
grant execute on function public.support_repondre(uuid, text) to authenticated;

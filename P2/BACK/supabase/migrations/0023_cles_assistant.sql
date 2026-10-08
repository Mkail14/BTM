-- =============================================================================
-- BTM — Migration 0023 : clés d'IA de l'assistante Awa dans Supabase Vault
-- =============================================================================
-- Les clés Gemini sont gardées chiffrées dans Vault (noms gemini_api_key_1, _2, _3…), et non dans le code.
-- Seule la fonction « assistant » (clé service) peut les lire, par cles_assistant() : ni les visiteurs ni les comptes
-- connectés, même administrateurs, n'y ont accès depuis le navigateur.
-- Ajouter une clé (SQL Editor) : select vault.create_secret('<clé>', 'gemini_api_key_3', 'Clé Gemini 3 de Awa');
-- Les secrets d'Edge Functions GEMINI_API_KEY… restent possibles : ils sont essayés en premier.
-- À exécuter APRÈS 0022.
-- =============================================================================

create or replace function public.cles_assistant()
returns table (nom text, valeur text)
language sql
security definer
set search_path = ''
as $$
  select s.name::text, s.decrypted_secret::text
  from vault.decrypted_secrets s
  where s.name like 'gemini\_api\_key\_%'
  order by s.name;
$$;
revoke execute on function public.cles_assistant() from public, anon, authenticated;
grant execute on function public.cles_assistant() to service_role;

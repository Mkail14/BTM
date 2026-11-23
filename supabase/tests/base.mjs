// Base PostgreSQL jetable (PGlite) qui imite Supabase : rôles, auth.uid(), storage, cron ; puis schema.sql + migrations.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RACINE = fileURLToPath(new URL('../..', import.meta.url))

const AMORCE = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create role supabase_auth_admin nologin;
create schema auth; create schema storage; create schema cron; create schema extensions; create schema vault;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text, encrypted_password text, raw_user_meta_data jsonb default '{}',
  banned_until timestamptz, email_change text, created_at timestamptz default now(), last_sign_in_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated, anon;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant execute on function storage.foldername(text) to anon, authenticated;
create table cron.job (jobid serial, jobname text, schedule text, command text);
create function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.job (jobname, schedule, command) values (n, s, c) returning jobid::bigint $$;
create function cron.unschedule(n text) returns boolean language sql as $$ delete from cron.job where jobname = n returning true $$;
create view vault.decrypted_secrets as select ''::text as name, ''::text as decrypted_secret where false;
create function extensions.crypt(a text, b text) returns text language sql as $$ select a $$;
`

function nettoyer(sql) {
  return sql
    .replace(/^create extension[^\n]*$/gim, '')
    .replace(/^create sequence if not exists/gim, 'create sequence if not exists')
}

export async function creerBase() {
  const db = new PGlite()
  await db.exec(AMORCE)
  await db.exec(nettoyer(readFileSync(join(RACINE, 'supabase/schema.sql'), 'utf8')))
  // droits de table habituels de Supabase (l'API donne tout ; la RLS filtre)
  await db.exec(`grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
                 grant usage, select on all sequences in schema public to anon, authenticated, service_role;`)
  const dossier = join(RACINE, 'supabase/migrations')
  for (const f of readdirSync(dossier).sort()) {
    if (f < '20261020000000' || (process.env.SANS && f >= process.env.SANS)) continue // déjà intégrées à schema.sql (relevé du 19-20/10)
    try { await db.exec(nettoyer(readFileSync(join(dossier, f), 'utf8'))) } catch (e) { throw new Error(`${f} : ${e.message}`) }
  }
  return db
}

/** Exécute en tant que compte connecté (rôle authenticated) ou clé service, puis revient au superutilisateur */
export async function comme(db, qui, sql, params = []) {
  const role = qui === 'service' ? 'service_role' : qui ? 'authenticated' : 'anon'
  await db.exec(`select set_config('request.jwt.claim.sub', '${qui && qui !== 'service' ? qui : ''}', false);
                 select set_config('request.jwt.claim.role', '${role}', false); set role ${role};`)
  try { return await db.query(sql, params) } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); select set_config('request.jwt.claim.role', '', false);`)
  }
}

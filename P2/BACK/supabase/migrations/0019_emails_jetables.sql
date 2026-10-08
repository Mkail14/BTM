-- =============================================================================
-- BTM — Migration 0019 : refus des adresses e-mail jetables
-- =============================================================================
-- Le site refuse les adresses jetables (yopmail, temp-mail, aminavin…) à la saisie, mais ce contrôle
-- peut être contourné en appelant directement l'API Supabase Auth. Côté base :
--   * table `domaines_jetables` alimentée par les listes communautaires (~98 000 domaines),
--     téléchargées par maj_domaines_jetables() puis rafraîchies chaque nuit (pg_cron) :
--     les services jetables créent de nouveaux domaines en continu, une liste figée est vite dépassée ;
--   * est_email_jetable() : appelée par le site (RPC) pour prévenir l'utilisateur dès la saisie ;
--   * déclencheur sur auth.users : bloque la création d'un compte (inscription, invitation, admin)
--     et le changement d'adresse (email_change, puis email à la confirmation).
-- Les comptes existants ne sont pas touchés : ils peuvent toujours se connecter.
-- À exécuter APRÈS 0018.
-- =============================================================================

create extension if not exists http with schema extensions;
create extension if not exists pg_cron;

create table if not exists public.domaines_jetables (
  domaine  text primary key check (domaine = lower(domaine))
);
-- Aucune politique : table illisible via l'API, seules les fonctions SECURITY DEFINER la consultent
alter table public.domaines_jetables enable row level security;

-- Liste de départ (miroir de FRONT/src/donnees/domainesJetables.js), complétée par le téléchargement ci-dessous
insert into public.domaines_jetables (domaine) values
  ('yopmail.com'), ('yopmail.fr'), ('yopmail.net'), ('cool.fr.nf'), ('jetable.fr.nf'), ('courriel.fr.nf'),
  ('moncourrier.fr.nf'), ('monemail.fr.nf'), ('monmail.fr.nf'), ('nospam.ze.tc'), ('nomail.xl.cx'), ('mega.zik.dj'),
  ('speed.1s.fr'), ('jetable.org'), ('jetable.com'), ('jetable.net'), ('link2mail.net'), ('mail-temporaire.fr'),
  ('mail-temporaire.com'), ('emailtemporaire.fr'), ('tempomail.fr'), ('trashmail.fr'), ('spambox.fr'), ('mailtemporaire.fr'),
  ('mailinator.com'), ('mailinator.net'), ('mailinator2.com'), ('mailinater.com'), ('notmailinator.com'), ('reallymymail.com'),
  ('guerrillamail.com'), ('guerrillamail.net'), ('guerrillamail.org'), ('guerrillamail.biz'), ('guerrillamail.de'), ('guerrillamail.info'),
  ('guerrillamailblock.com'), ('sharklasers.com'), ('grr.la'), ('pokemail.net'), ('spam4.me'), ('10minutemail.com'),
  ('10minutemail.net'), ('10minutemail.co.uk'), ('10minutemail.de'), ('10minemail.com'), ('20minutemail.com'), ('temp-mail.org'),
  ('temp-mail.io'), ('tempmail.com'), ('tempmail.net'), ('tempmail.dev'), ('tempmail.plus'), ('tempmailo.com'),
  ('tempmail.ninja'), ('tempmailaddress.com'), ('tempinbox.com'), ('tempail.com'), ('tempr.email'), ('temp-mail.ru'),
  ('throwawaymail.com'), ('throwam.com'), ('trashmail.com'), ('trashmail.net'), ('trashmail.de'), ('trashmail.me'),
  ('trashmail.io'), ('trashmail.ws'), ('trash-mail.com'), ('trashinbox.com'), ('wegwerfmail.de'), ('wegwerfmail.net'),
  ('wegwerfmail.org'), ('dispostable.com'), ('discard.email'), ('discardmail.com'), ('discardmail.de'), ('disposablemail.com'),
  ('getnada.com'), ('nada.email'), ('mailnesia.com'), ('maildrop.cc'), ('mailcatch.com'), ('mailnull.com'),
  ('mytemp.email'), ('mohmal.com'), ('emailondeck.com'), ('fakeinbox.com'), ('fakemail.net'), ('fakemailgenerator.com'),
  ('fake-mail.net'), ('emailfake.com'), ('email-fake.com'), ('getairmail.com'), ('airmail.cc'), ('spamgourmet.com'),
  ('spambox.us'), ('spamdecoy.net'), ('spamex.com'), ('spamfree24.org'), ('mintemail.com'), ('mailexpire.com'),
  ('meltmail.com'), ('incognitomail.com'), ('incognitomail.org'), ('anonbox.net'), ('anonymbox.com'), ('mailforspam.com'),
  ('spammotel.com'), ('mvrht.com'), ('mvrht.net'), ('byom.de'), ('emailsensei.com'), ('emailtemporanea.com'),
  ('emailtemporanea.net'), ('emailtemporario.com.br'), ('mailtemp.info'), ('harakirimail.com'), ('inboxkitten.com'), ('mailpoof.com'),
  ('moakt.com'), ('moakt.cc'), ('tmail.ws'), ('tmails.net'), ('tmpmail.org'), ('tmpmail.net'),
  ('tmpeml.com'), ('tmpbox.net'), ('burnermail.io'), ('mail.tm'), ('mail.gw'), ('emlhub.com'),
  ('emltmp.com'), ('dropmail.me'), ('1secmail.com'), ('1secmail.net'), ('1secmail.org'), ('esiix.com'),
  ('wwjmp.com'), ('xojxe.com'), ('yoggm.com'), ('kzccv.com'), ('qiott.com'), ('icznn.com'),
  ('vjuum.com'), ('laafd.com'), ('txcct.com'), ('rteet.com'), ('dpptd.com'), ('emailnax.com'),
  ('lroid.com'), ('mailsac.com'), ('inboxbear.com'), ('spamherelots.com'), ('trbvm.com'), ('boun.cr'),
  ('crazymailing.com'), ('mailmetrash.com'), ('mt2015.com'), ('mt2014.com'), ('thankyou2010.com'), ('trash2009.com'),
  ('zetmail.com'), ('zippymail.info'), ('tafmail.com'), ('cuvox.de'), ('dayrep.com'), ('einrot.com'),
  ('fleckens.hu'), ('gustr.com'), ('jourrapide.com'), ('rhyta.com'), ('superrito.com'), ('teleworm.us'),
  ('armyspy.com'), ('yomail.info'), ('owlymail.com'), ('hidemail.de'), ('linshiyouxiang.net'), ('bccto.me'),
  ('chacuo.net'), ('guerrillamail.cc'), ('fexbox.org'), ('fexpost.com'), ('fextemp.com'), ('emailtmp.com'),
  ('privy-mail.com'), ('tempemail.net'), ('tempemail.com'), ('temporaryemail.net'), ('temporaryinbox.com'), ('temporarymail.com'),
  ('tempsky.com'), ('deadaddress.com'), ('mailhazard.com'), ('mailzilla.com'), ('nowmymail.com'), ('pookmail.com'),
  ('sneakemail.com'), ('sogetthis.com'), ('spamavert.com'), ('tempemailaddress.com'), ('mail7.io'), ('emailna.co'),
  ('smailpro.com'), ('disbox.net'), ('disbox.org'), ('vomoto.com'), ('luxusmail.org'), ('minuteinbox.com'),
  ('spam.la'), ('kurzepost.de'), ('objectmail.com'), ('proxymail.eu'), ('rcpt.at'), ('trash-me.com'), ('wh4f.org')
on conflict (domaine) do nothing;

-- Télécharge les listes communautaires et ajoute les nouveaux domaines ; renvoie le nombre de domaines en base.
-- En cas d'échec réseau, la liste actuelle est conservée (avertissement seulement).
create or replace function public.maj_domaines_jetables()
returns integer
language plpgsql
security definer set search_path = public, extensions
as $$
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
$$;

revoke all on function public.maj_domaines_jetables() from public, anon, authenticated;

-- Vrai si le domaine de l'adresse (ou un domaine parent : « x.yopmail.com ») relève d'un service jetable
create or replace function public.est_email_jetable(p_email text)
returns boolean
language plpgsql
stable
security definer set search_path = public
as $$
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
$$;

-- Le site l'appelle avant l'inscription pour afficher un message clair (la base bloque de toute façon)
revoke all on function public.est_email_jetable(text) from public;
grant execute on function public.est_email_jetable(text) to anon, authenticated;

create or replace function public.refuser_email_jetable()
returns trigger
language plpgsql
security definer set search_path = public
as $$
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
$$;

drop trigger if exists trg_refuser_email_jetable on auth.users;
create trigger trg_refuser_email_jetable
  before insert or update of email, email_change on auth.users
  for each row execute function public.refuser_email_jetable();

-- Premier téléchargement, puis rafraîchissement chaque nuit à 4 h 17 (UTC)
select public.maj_domaines_jetables();
select cron.unschedule(jobid) from cron.job where jobname = 'maj-domaines-jetables';
select cron.schedule('maj-domaines-jetables', '17 4 * * *', 'select public.maj_domaines_jetables()');

notify pgrst, 'reload schema';

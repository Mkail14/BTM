/**
 * Domaines d'adresses e-mail jetables (temporaires) refusés à l'inscription et au changement d'e-mail.
 * Extrait des plus courants, pour un message immédiat sans requête réseau : la liste complète (~98 000 domaines,
 * rafraîchie chaque nuit) est dans la table Supabase `domaines_jetables` (migration 0019), interrogée ensuite.
 * Un sous-domaine d'un domaine listé est aussi refusé (ex. « x.yopmail.com »).
 */
export const DOMAINES_JETABLES = new Set([
  // Services francophones
  'yopmail.com', 'yopmail.fr', 'yopmail.net', 'cool.fr.nf', 'jetable.fr.nf', 'courriel.fr.nf', 'moncourrier.fr.nf',
  'monemail.fr.nf', 'monmail.fr.nf', 'nospam.ze.tc', 'nomail.xl.cx', 'mega.zik.dj', 'speed.1s.fr', 'jetable.org',
  'jetable.com', 'jetable.net', 'link2mail.net', 'mail-temporaire.fr', 'mail-temporaire.com', 'emailtemporaire.fr',
  'tempomail.fr', 'trashmail.fr', 'spambox.fr', 'mailtemporaire.fr',
  // Services internationaux
  'mailinator.com', 'mailinator.net', 'mailinator2.com', 'mailinater.com', 'notmailinator.com', 'reallymymail.com',
  'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamail.biz', 'guerrillamail.de',
  'guerrillamail.info', 'guerrillamailblock.com', 'sharklasers.com', 'grr.la', 'pokemail.net', 'spam4.me',
  '10minutemail.com', '10minutemail.net', '10minutemail.co.uk', '10minutemail.de', '10minemail.com', '20minutemail.com',
  'temp-mail.org', 'temp-mail.io', 'tempmail.com', 'tempmail.net', 'tempmail.dev', 'tempmail.plus', 'tempmailo.com',
  'tempmail.ninja', 'tempmailaddress.com', 'tempinbox.com', 'tempail.com', 'tempr.email', 'temp-mail.ru',
  'throwawaymail.com', 'throwam.com', 'trashmail.com', 'trashmail.net', 'trashmail.de', 'trashmail.me', 'trashmail.io',
  'trashmail.ws', 'trash-mail.com', 'trashinbox.com', 'wegwerfmail.de', 'wegwerfmail.net', 'wegwerfmail.org',
  'dispostable.com', 'discard.email', 'discardmail.com', 'discardmail.de', 'disposablemail.com', 'getnada.com', 'nada.email',
  'mailnesia.com', 'maildrop.cc', 'mailcatch.com', 'mailnull.com', 'mytemp.email', 'mohmal.com', 'emailondeck.com',
  'fakeinbox.com', 'fakemail.net', 'fakemailgenerator.com', 'fake-mail.net', 'emailfake.com', 'email-fake.com',
  'getairmail.com', 'airmail.cc', 'spamgourmet.com', 'spambox.us', 'spamdecoy.net', 'spamex.com', 'spamfree24.org',
  'mintemail.com', 'mailexpire.com', 'meltmail.com', 'incognitomail.com', 'incognitomail.org', 'anonbox.net',
  'anonymbox.com', 'mailforspam.com', 'spammotel.com', 'mvrht.com', 'mvrht.net', 'byom.de',
  'emailsensei.com', 'emailtemporanea.com', 'emailtemporanea.net', 'emailtemporario.com.br', 'mailtemp.info',
  'harakirimail.com', 'inboxkitten.com', 'mailpoof.com', 'moakt.com', 'moakt.cc', 'tmail.ws', 'tmails.net',
  'tmpmail.org', 'tmpmail.net', 'tmpeml.com', 'tmpbox.net', 'burnermail.io', 'mail.tm', 'mail.gw', 'emlhub.com',
  'emltmp.com', 'dropmail.me', '1secmail.com', '1secmail.net', '1secmail.org', 'esiix.com', 'wwjmp.com', 'xojxe.com',
  'yoggm.com', 'kzccv.com', 'qiott.com', 'icznn.com', 'vjuum.com', 'laafd.com', 'txcct.com', 'rteet.com', 'dpptd.com',
  'emailnax.com', 'lroid.com', 'mailsac.com', 'inboxbear.com', 'spamherelots.com', 'trbvm.com', 'boun.cr',
  'crazymailing.com', 'mailmetrash.com', 'mt2015.com', 'mt2014.com', 'thankyou2010.com', 'trash2009.com',
  'zetmail.com', 'zippymail.info', 'tafmail.com', 'cuvox.de', 'dayrep.com', 'einrot.com', 'fleckens.hu', 'gustr.com',
  'jourrapide.com', 'rhyta.com', 'superrito.com', 'teleworm.us', 'armyspy.com', 'yomail.info', 'owlymail.com',
  'hidemail.de', 'linshiyouxiang.net', 'bccto.me', 'chacuo.net',
  'guerrillamail.cc', 'fexbox.org', 'fexpost.com',
  'fextemp.com', 'emailtmp.com', 'privy-mail.com', 'tempemail.net', 'tempemail.com',
  'temporaryemail.net', 'temporaryinbox.com', 'temporarymail.com', 'tempsky.com', 'deadaddress.com', 'mailhazard.com',
  'mailzilla.com', 'nowmymail.com', 'pookmail.com', 'sneakemail.com', 'sogetthis.com', 'spamavert.com', 'tempemailaddress.com',
  'mail7.io', 'emailna.co', 'smailpro.com', 'disbox.net', 'disbox.org', 'vomoto.com', 'luxusmail.org', 'minuteinbox.com',
  'spam.la', 'kurzepost.de', 'objectmail.com', 'proxymail.eu', 'rcpt.at', 'trash-me.com', 'wh4f.org',
])

// Noms caractéristiques des services jetables : attrape les variantes absentes de la liste
const MOTS_JETABLES = /(yopmail|mailinator|guerrill?amail|10minute|minutemail|minuteinbox|temp-?e?mail|tmp-?e?mail|tempinbox|throwaway|trash-?mail|trashinbox|disposable|discardmail|fake-?e?mail|fakeinbox|burnermail|spambox|spamgourmet|wegwerf|jetable|mail-?temporaire|emailtemporaire)/

/** Vrai si le domaine (ou l'adresse) correspond à un service d'e-mail jetable */
export function estDomaineJetable(adresseOuDomaine) {
  const domaine = String(adresseOuDomaine || '').trim().toLowerCase().split('@').pop()
  if (!domaine) return false
  if (MOTS_JETABLES.test(domaine)) return true
  const labels = domaine.split('.')
  // « a.b.yopmail.com » → teste « a.b.yopmail.com », « b.yopmail.com », « yopmail.com »
  for (let i = 0; i < labels.length - 1; i++) {
    if (DOMAINES_JETABLES.has(labels.slice(i).join('.'))) return true
  }
  return false
}

/**
 * Génère les modèles d'e-mails d'authentification BTM (Supabase Auth) à partir d'une mise en page commune.
 *
 *   node supabase/templates/generer.mjs              → écrit les fichiers .html dans ce dossier
 *   node supabase/templates/generer.mjs --publier    → les envoie aussi dans le projet Supabase distant
 *                                                      (variables SUPABASE_ACCESS_TOKEN et SUPABASE_PROJECT_REF)
 *
 * Variables Supabase disponibles dans les modèles : {{ .ConfirmationURL }}, {{ .Token }}, {{ .Email }},
 * {{ .NewEmail }}, {{ .SiteURL }}, {{ .Data.<clé> }} (métadonnées du compte : prenom, pseudo…).
 * Tout est en styles en ligne et en tableaux : c'est ce que Gmail, Outlook et les applis mobiles affichent correctement.
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DOSSIER = dirname(fileURLToPath(import.meta.url))

const C = {
  fond: '#eef3f6', nuit: '#0b1220', cyan: '#06b6d4', cyanClair: '#67e8f9', bouton: '#0e7490',
  texte: '#374151', titre: '#0b1220', discret: '#6b7280', bordure: '#e5edf1', alerte: '#f59e0b', sable: '#fde68a'
}
const POLICE = "'Segoe UI',Helvetica,Arial,sans-serif"

// Logo « mur de briques » dessiné en cellules de tableau : s'affiche partout, même quand les images sont bloquées
const brique = (couleur, largeur) => `<td width="${largeur}" height="7" style="background:${couleur};border-radius:2px;font-size:0;line-height:0;">&nbsp;</td>`
const espace = '<td width="3" style="font-size:0;line-height:0;">&nbsp;</td>'
const rangee = (cellules) => `<table role="presentation" cellpadding="0" cellspacing="0"><tr>${cellules.join(espace)}</tr></table>`
const LOGO = `
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
  <td style="padding-right:14px;vertical-align:middle;">
    ${rangee([brique(C.cyan, 12), brique('#ffffff', 12), brique('#ffffff', 12)])}
    <div style="height:3px;font-size:0;line-height:0;">&nbsp;</div>
    ${rangee([brique('#ffffff', 5), brique('#ffffff', 12), brique(C.cyan, 12), brique('#ffffff', 5)])}
    <div style="height:3px;font-size:0;line-height:0;">&nbsp;</div>
    ${rangee([brique('#ffffff', 12), brique('#ffffff', 12), brique('#ffffff', 12)])}
  </td>
  <td style="vertical-align:middle;">
    <div style="font-family:${POLICE};font-size:26px;font-weight:800;letter-spacing:.06em;color:#ffffff;line-height:1;">BTM</div>
    <div style="font-family:${POLICE};margin-top:4px;font-size:10px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:${C.cyanClair};">Bâtiment &amp; Travaux Mayotte</div>
  </td>
</tr></table>`

const bouton = (libelle, url = '{{ .ConfirmationURL }}') => `
<table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr>
  <td style="background:${C.bouton};border-radius:10px;">
    <a href="${url}" style="display:inline-block;padding:15px 34px;font-family:${POLICE};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${libelle}</a>
  </td>
</tr></table>`

const lienSecours = `
<p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:${C.discret};">Le bouton ne fonctionne pas&nbsp;? Copiez ce lien dans votre navigateur&nbsp;:</p>
<p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;"><a href="{{ .ConfirmationURL }}" style="color:${C.bouton};">{{ .ConfirmationURL }}</a></p>`

const avantages = (lignes) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f8fa;border-radius:12px;">
  ${lignes.map(([icone, texte]) => `<tr>
    <td width="44" style="padding:12px 0 12px 16px;font-size:20px;vertical-align:top;">${icone}</td>
    <td style="padding:12px 16px 12px 4px;font-size:14px;line-height:1.55;color:${C.texte};">${texte}</td>
  </tr>`).join('')}
</table>`

const encadre = (texte, couleur = C.alerte) => `
<div style="background:#f7fafb;border-left:4px solid ${couleur};border-radius:6px;padding:14px 16px;font-size:13px;line-height:1.6;color:#4b5563;">${texte}</div>`

const bonjour = (cle = 'prenom') => `Bonjour{{ if .Data.${cle} }} {{ .Data.${cle} }}{{ end }},`

function page({ titre, apercu, pastille, intro, action = '', complement = '', securite = '' }) {
  const bloc = (contenu, padding) => (contenu ? `<tr><td style="padding:${padding};">${contenu}</td></tr>` : '')
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${titre}</title>
</head>
<body style="margin:0;padding:0;background:${C.fond};font-family:${POLICE};color:${C.texte};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${apercu}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.fond};padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(11,18,32,.10);">
        <tr><td style="background:${C.nuit};padding:26px 32px;border-bottom:4px solid ${C.cyan};">${LOGO}</td></tr>
        <tr><td style="padding:36px 32px 8px;">
          <div style="width:56px;height:56px;line-height:56px;text-align:center;font-size:28px;background:#ecfeff;border-radius:50%;margin-bottom:18px;">${pastille}</div>
          <h1 style="margin:0 0 14px;font-size:25px;line-height:1.25;color:${C.titre};">${titre}</h1>
          ${intro}
        </td></tr>
        ${bloc(action, '20px 32px 24px')}
        ${bloc(complement, '0 32px 24px')}
        ${action.includes('ConfirmationURL') ? bloc(lienSecours, '0 32px 24px') : ''}
        ${bloc(securite, '0 32px 32px')}
        <tr><td style="background:#f7fafb;padding:22px 32px;border-top:1px solid ${C.bordure};text-align:center;">
          <p style="margin:0 0 6px;font-size:13px;color:${C.texte};"><a href="{{ .SiteURL }}" style="color:${C.bouton};font-weight:700;text-decoration:none;">www.btm.yt</a> &nbsp;·&nbsp; <a href="mailto:contact@btm.yt" style="color:${C.bouton};text-decoration:none;">contact@btm.yt</a></p>
          <p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;">BTM — Bâtiment &amp; Travaux Mayotte<br>Estimez vos travaux et retirez vos matériaux chez nos fournisseurs partenaires.</p>
        </td></tr>
      </table>
      <p style="margin:18px 0 0;font-size:11px;color:#9ca3af;">Message automatique envoyé à {{ .Email }} — merci de ne pas y répondre directement.</p>
    </td></tr>
  </table>
</body>
</html>
`
}

const p = (texte) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.65;color:${C.texte};">${texte}</p>`

// cle = nom du modèle dans l'API Supabase (mailer_templates_<cle>_content / mailer_subjects_<cle>)
const MODELES = [
  {
    cle: 'confirmation', fichier: 'confirmation.html', sujet: 'Bienvenue sur BTM — confirmez votre adresse e-mail',
    html: page({
      titre: 'Bienvenue sur BTM&nbsp;!', apercu: 'Un dernier clic pour activer votre compte BTM et retrouver vos devis partout.', pastille: '👷',
      intro: p(bonjour()) + p('Merci de rejoindre BTM. Il ne reste qu’un clic pour activer votre compte.'),
      action: bouton('Activer mon compte'),
      complement: avantages([
        ['☁️', '<strong>Vos devis sauvegardés</strong> et synchronisés entre vos appareils.'],
        ['🧱', '<strong>Les matériaux calculés pour vous</strong> : mur, dalle, fondation, terrasse.'],
        ['🎟️', '<strong>Un code de retrait</strong> pour récupérer votre commande chez le fournisseur.']
      ]),
      securite: encadre('Vous n’êtes pas à l’origine de cette inscription&nbsp;? Ignorez ce message : aucun compte ne sera activé.')
    })
  },
  {
    cle: 'recovery', fichier: 'recuperation.html', sujet: 'Réinitialisation de votre mot de passe BTM',
    html: page({
      titre: 'Choisissez un nouveau mot de passe', apercu: 'Votre lien pour réinitialiser le mot de passe de votre compte BTM.', pastille: '🔑',
      intro: p(bonjour()) + p('Nous avons reçu une demande de réinitialisation du mot de passe de votre compte BTM. Ce lien est valable <strong>1&nbsp;heure</strong>.'),
      action: bouton('Choisir mon nouveau mot de passe'),
      securite: encadre('Vous n’avez rien demandé&nbsp;? Ignorez ce message : votre mot de passe actuel reste valable. Si cela se répète, écrivez-nous à <a href="mailto:contact@btm.yt" style="color:#0e7490;">contact@btm.yt</a>.')
    })
  },
  {
    cle: 'invite', fichier: 'invitation.html', sujet: 'Votre espace fournisseur BTM vous attend',
    html: page({
      titre: 'Votre espace fournisseur est prêt', apercu: 'Créez votre mot de passe pour gérer votre fiche, vos matériaux et vos retraits sur BTM.', pastille: '🏗️',
      intro: p('Bonjour,') + p('L’équipe BTM a ouvert l’espace fournisseur{{ if .Data.pseudo }} de <strong>{{ .Data.pseudo }}</strong>{{ end }}. Choisissez votre mot de passe pour y accéder.'),
      action: bouton('Créer mon mot de passe'),
      complement: avantages([
        ['📋', '<strong>Votre fiche</strong> visible dans l’annuaire des fournisseurs.'],
        ['🧾', '<strong>Vos matériaux et vos prix</strong>, mis à jour quand vous le souhaitez.'],
        ['✅', '<strong>Les retraits au comptoir</strong> validés en un instant avec le code client.']
      ]),
      securite: encadre('Ce lien est personnel et à usage unique. Vous ne vous attendiez pas à cette invitation&nbsp;? Ignorez simplement ce message.')
    })
  },
  {
    cle: 'email_change', fichier: 'changement-email.html', sujet: 'Confirmez votre nouvelle adresse e-mail',
    html: page({
      titre: 'Confirmez votre nouvelle adresse', apercu: 'Validez le changement d’adresse e-mail de votre compte BTM.', pastille: '✉️',
      intro: p(bonjour()) + p('Vous avez demandé à remplacer <strong>{{ .Email }}</strong> par <strong>{{ .NewEmail }}</strong> pour vous connecter à BTM.'),
      action: bouton('Confirmer ma nouvelle adresse'),
      securite: encadre('Vous n’avez pas demandé ce changement&nbsp;? Ne cliquez pas, changez votre mot de passe et prévenez-nous à <a href="mailto:contact@btm.yt" style="color:#0e7490;">contact@btm.yt</a>.')
    })
  },
  {
    cle: 'magic_link', fichier: 'lien-connexion.html', sujet: 'Votre lien de connexion BTM',
    html: page({
      titre: 'Votre lien de connexion', apercu: 'Connectez-vous à BTM en un clic.', pastille: '🔓',
      intro: p(bonjour()) + p('Cliquez sur le bouton pour vous connecter à BTM. Ce lien expire rapidement et ne fonctionne qu’une fois.'),
      action: bouton('Me connecter'),
      securite: encadre('Vous n’avez pas demandé à vous connecter&nbsp;? Ignorez ce message.')
    })
  },
  {
    cle: 'reauthentication', fichier: 'code-verification.html', sujet: '{{ .Token }} — votre code de vérification BTM',
    html: page({
      titre: 'Votre code de vérification', apercu: 'Votre code pour confirmer cette action sur BTM.', pastille: '🔐',
      intro: p(bonjour()) + p('Saisissez ce code sur BTM pour confirmer qu’il s’agit bien de vous&nbsp;:'),
      action: `<div style="text-align:center;"><span style="display:inline-block;padding:16px 28px;background:#f3f8fa;border:2px dashed ${C.cyan};border-radius:12px;font-family:Consolas,'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:.3em;color:${C.titre};">{{ .Token }}</span></div>`,
      securite: encadre('Ne communiquez jamais ce code, même à quelqu’un qui se présente comme l’équipe BTM.')
    })
  },
  {
    cle: 'password_changed_notification', fichier: 'notif-mot-de-passe.html', sujet: 'Le mot de passe de votre compte BTM a été modifié',
    html: page({
      titre: 'Mot de passe modifié', apercu: 'Le mot de passe de votre compte BTM vient d’être changé.', pastille: '🛡️',
      intro: p(bonjour()) + p('Le mot de passe de votre compte BTM vient d’être modifié. Si c’est bien vous, il n’y a rien d’autre à faire.'),
      securite: encadre('Ce n’est pas vous&nbsp;? Utilisez « Mot de passe oublié » sur <a href="{{ .SiteURL }}" style="color:#0e7490;">www.btm.yt</a> pour reprendre la main, puis prévenez-nous à <a href="mailto:contact@btm.yt" style="color:#0e7490;">contact@btm.yt</a>.', '#ef4444')
    })
  },
  {
    cle: 'email_changed_notification', fichier: 'notif-email.html', sujet: 'L’adresse e-mail de votre compte BTM a été modifiée',
    html: page({
      titre: 'Adresse e-mail modifiée', apercu: 'L’adresse e-mail de votre compte BTM vient d’être changée.', pastille: '🛡️',
      intro: p(bonjour()) + p('L’adresse e-mail de connexion de votre compte BTM a été remplacée par <strong>{{ .NewEmail }}</strong>.'),
      securite: encadre('Ce n’est pas vous&nbsp;? Écrivez-nous au plus vite à <a href="mailto:contact@btm.yt" style="color:#0e7490;">contact@btm.yt</a>.', '#ef4444')
    })
  }
]

for (const m of MODELES) writeFileSync(join(DOSSIER, m.fichier), m.html)
console.log(`${MODELES.length} modèles écrits dans ${DOSSIER}`)

if (process.argv.includes('--publier')) {
  const jeton = process.env.SUPABASE_ACCESS_TOKEN
  const projet = process.env.SUPABASE_PROJECT_REF || 'yywcviknnlegvwonkqcj'
  if (!jeton) throw new Error('Variable SUPABASE_ACCESS_TOKEN manquante')
  const corps = {}
  for (const m of MODELES) {
    corps[`mailer_subjects_${m.cle}`] = m.sujet
    corps[`mailer_templates_${m.cle}_content`] = m.html
  }
  const rep = await fetch(`https://api.supabase.com/v1/projects/${projet}/config/auth`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corps)
  })
  if (!rep.ok) throw new Error(`Publication refusée (${rep.status}) : ${await rep.text()}`)
  console.log(`Modèles publiés dans le projet ${projet}`)
}

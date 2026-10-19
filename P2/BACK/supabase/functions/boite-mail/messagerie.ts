// Opérations sur la boîte contact@btm.yt (OVH) : lecture en IMAP, envoi en SMTP.
// Séparé de index.ts (authentification HTTP) pour pouvoir être testé seul avec Deno.
import { ImapFlow } from "npm:imapflow@1.0.172";
import { simpleParser } from "npm:mailparser@3.7.1";
import nodemailerModule from "npm:nodemailer@6.9.16";
import MailComposerModule from "npm:nodemailer@6.9.16/lib/mail-composer/index.js";
import { Buffer } from "node:buffer";
import { classerEnvoi, sourceMessage, sourcesMessages } from "./imapBrut.ts";

// Imports statiques obligatoires : sur Supabase, un import() dynamique de paquet npm n'est pas embarqué
// dans la fonction déployée, et l'appel reste bloqué indéfiniment (message qui ne s'ouvre jamais).
const analyseur = async () => simpleParser;
const expediteur = async () => nodemailerModule;
const compositeur = async () => MailComposerModule;

export type Config = { utilisateur: string; motDePasse: string; hoteImap: string; hoteSmtp: string; nom: string };

const PAR_PAGE = 25;
const TAILLE_MAX_LECTURE = 15 * 1024 * 1024; // au-delà, on n'ouvre pas le message dans le site
const TAILLE_MAX_PRECHARGEMENT = 1024 * 1024; // préchargement : seulement les messages légers
const TAILLE_MAX_IMAGE_INTEGREE = 400 * 1024; // images « cid: » converties en data: pour l'affichage

// Dossiers spéciaux reconnus par leur rôle IMAP (RFC 6154), affichés en français
const ROLES: Record<string, { cle: string; libelle: string; ordre: number }> = {
  "\\Inbox": { cle: "reception", libelle: "Boîte de réception", ordre: 0 },
  "\\Sent": { cle: "envoyes", libelle: "Envoyés", ordre: 1 },
  "\\Drafts": { cle: "brouillons", libelle: "Brouillons", ordre: 2 },
  "\\Junk": { cle: "indesirables", libelle: "Indésirables", ordre: 3 },
  "\\Trash": { cle: "corbeille", libelle: "Corbeille", ordre: 4 },
  "\\Archive": { cle: "archives", libelle: "Archives", ordre: 5 },
};

// Connexion IMAP partagée entre les appels : se connecter à OVH prend plusieurs secondes,
// alors elle est gardée ouverte tant que la fonction reste active, et fermée après 2 minutes sans activité.
const INACTIVITE = 120_000;
let partagee: { client: ImapFlow; connexion: Promise<void> } | null = null;
let minuterie: ReturnType<typeof setTimeout> | undefined;

function oublier(client: ImapFlow) {
  if (partagee?.client === client) partagee = null;
}

async function clientImap(config: Config, nouvelle = false): Promise<ImapFlow> {
  if (!partagee || nouvelle) {
    const client = new ImapFlow({
      host: config.hoteImap, port: 993, secure: true,
      auth: { user: config.utilisateur, pass: config.motDePasse },
      logger: false, emitLogs: false,
    });
    client.on("close", () => oublier(client));
    client.on("error", () => oublier(client));
    partagee = { client, connexion: client.connect() };
  }
  const { client, connexion } = partagee;
  try {
    await connexion;
  } catch (e) {
    oublier(client);
    throw e;
  }
  if (!client.usable) { // connexion gardée mais coupée par le serveur entre-temps
    oublier(client);
    if (nouvelle) throw new Error("Connexion à la boîte impossible.");
    return clientImap(config, true);
  }
  clearTimeout(minuterie);
  minuterie = setTimeout(() => { oublier(client); client.logout().catch(() => client.close()); }, INACTIVITE);
  Deno.unrefTimer(minuterie as unknown as number); // la minuterie ne retient pas la fonction en vie
  return client;
}

async function avecImap<T>(config: Config, action: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = await clientImap(config);
  try {
    return await action(client);
  } catch (e) {
    // connexion coupée entre deux appels (délai OVH) : une seconde tentative sur une connexion neuve
    if (!client.usable) { oublier(client); return action(await clientImap(config, true)); }
    throw e;
  }
}

const adresses = (liste?: { name?: string; address?: string }[]) =>
  (liste || []).map((a) => ({ nom: a.name || "", email: a.address || "" }));

/** Dossiers de la boîte, avec le nombre de messages non lus */
async function listeDossiers(client: ImapFlow) {
  {
    const liste = await client.list({ statusQuery: { unseen: true, messages: true } });
    // doublons anglais vides (créés par un logiciel de messagerie) masqués quand le dossier français existe
    const roles = new Set(liste.map((d) => d.specialUse).filter(Boolean));
    const DOUBLONS: Record<string, string> = { drafts: "\\Drafts", junk: "\\Junk", spam: "\\Junk", sent: "\\Sent", trash: "\\Trash" };
    return liste
      .filter((d) => !d.flags.has("\\Noselect"))
      .filter((d) => !(d.status?.messages === 0 && !d.specialUse && roles.has(DOUBLONS[d.name.toLowerCase()])))
      .map((d) => {
        const role = d.path.toUpperCase() === "INBOX" ? ROLES["\\Inbox"] : d.specialUse ? ROLES[d.specialUse] : undefined;
        return { chemin: d.path, cle: role?.cle || null, libelle: role?.libelle || d.name, ordre: role?.ordre ?? 10, nonLus: d.status?.unseen ?? 0, total: d.status?.messages ?? 0 };
      })
      .sort((a, b) => a.ordre - b.ordre || a.libelle.localeCompare(b.libelle, "fr"));
  }
}
export const dossiers = (config: Config) => avecImap(config, listeDossiers);

/** Chemin réel d'un dossier spécial (Envoyés, Corbeille…) */
async function cheminRole(client: ImapFlow, role: string, repli: string) {
  const liste = await client.list();
  return liste.find((d) => d.specialUse === role)?.path || liste.find((d) => d.name.toLowerCase() === repli.toLowerCase())?.path || repli;
}

/** Messages d'un dossier, du plus récent au plus ancien ; recherche dans l'expéditeur, l'objet et le texte */
async function listeMessages(client: ImapFlow, dossier: string, page = 1, recherche = "") {
  {
    const verrou = await client.getMailboxLock(dossier);
    try {
      let uids: number[];
      if (recherche.trim()) {
        const q = recherche.trim();
        uids = (await client.search({ or: [{ from: q }, { to: q }, { subject: q }, { body: q }] }, { uid: true })) || [];
      } else {
        uids = (await client.search({ all: true }, { uid: true })) || [];
      }
      uids.sort((a, b) => b - a);
      const total = uids.length;
      const tranche = uids.slice((page - 1) * PAR_PAGE, page * PAR_PAGE);
      const messages: unknown[] = [];
      if (tranche.length) {
        for await (const m of client.fetch(tranche.join(","), { uid: true, envelope: true, flags: true, size: true, bodyStructure: true, internalDate: true }, { uid: true })) {
          const piecesJointes = JSON.stringify(m.bodyStructure || {}).includes('"disposition":"attachment"');
          messages.push({
            uid: m.uid,
            de: adresses(m.envelope?.from)[0] || { nom: "", email: "" },
            a: adresses(m.envelope?.to),
            objet: m.envelope?.subject || "(sans objet)",
            date: (m.envelope?.date || m.internalDate)?.toISOString?.() || null,
            lu: m.flags?.has("\\Seen") || false,
            important: m.flags?.has("\\Flagged") || false,
            repondu: m.flags?.has("\\Answered") || false,
            piecesJointes,
            taille: m.size || 0,
          });
        }
      }
      messages.sort((x: any, y: any) => y.uid - x.uid);
      return { messages, total, page, pages: Math.max(1, Math.ceil(total / PAR_PAGE)) };
    } finally {
      verrou.release();
    }
  }
}
export const lister = (config: Config, dossier: string, page = 1, recherche = "") =>
  avecImap(config, (client) => listeMessages(client, dossier, page, recherche));

/** Ouverture de la messagerie : dossiers et messages en un seul appel, sur la même connexion */
export const ouverture = (config: Config, dossier = "INBOX", recherche = "") =>
  avecImap(config, async (client) => ({ dossiers: await listeDossiers(client), liste: await listeMessages(client, dossier, 1, recherche) }));

/** Message brut (RFC 822) → contenu affichable */
async function analyserMessage(source: Uint8Array, dossier: string, uid: number) {
  const m = await (await analyseur())(Buffer.from(source));

  // images intégrées (cid:) : remplacées par leur contenu pour s'afficher sans requête externe
  let html = typeof m.html === "string" ? m.html : "";
  for (const p of m.attachments || []) {
    if (p.cid && p.size <= TAILLE_MAX_IMAGE_INTEGREE && /^image\//.test(p.contentType)) {
      html = html.split(`cid:${p.cid}`).join(`data:${p.contentType};base64,${p.content.toString("base64")}`);
    }
  }
  return {
    uid,
    dossier,
    messageId: m.messageId || null,
    references: Array.isArray(m.references) ? m.references : m.references ? [m.references] : [],
    de: adresses((m.from as any)?.value)[0] || { nom: "", email: "" },
    a: adresses((m.to as any)?.value),
    cc: adresses((m.cc as any)?.value),
    repondreA: adresses((m.replyTo as any)?.value),
    objet: m.subject || "(sans objet)",
    date: m.date?.toISOString() || null,
    texte: m.text || "",
    html,
    piecesJointes: (m.attachments || [])
      .map((p, index) => ({ index, nom: p.filename || `piece-${index + 1}`, type: p.contentType, taille: p.size, integree: !!p.cid && p.contentDisposition === "inline" }))
      .filter((p) => !p.integree),
  };
}

/** Contenu complet d'un message (le marque comme lu). Lu sans imapflow : voir imapBrut.ts */
export async function lire(config: Config, dossier: string, uid: number) {
  return analyserMessage(await sourceMessage(config, dossier, uid, { marquerLu: true, tailleMax: TAILLE_MAX_LECTURE }), dossier, uid);
}

/** Plusieurs messages en un appel (une seule connexion), sans les marquer comme lus : la messagerie
 *  les précharge pour qu'ils s'ouvrent instantanément. Les messages lourds restent à l'ouverture classique. */
export async function lirePlusieurs(config: Config, dossier: string, uids: number[]) {
  const messages: unknown[] = [];
  for (const [uid, source] of await sourcesMessages(config, dossier, uids, TAILLE_MAX_PRECHARGEMENT)) {
    try { messages.push(await analyserMessage(source, dossier, uid)); } catch { /* illisible ici : il sera ouvert normalement */ }
  }
  return { messages };
}

/** Une pièce jointe, encodée en base64 */
export async function pieceJointe(config: Config, dossier: string, uid: number, index: number) {
  const m = await (await analyseur())(Buffer.from(await sourceMessage(config, dossier, uid)));
  const p = (m.attachments || [])[index];
  if (!p) throw new Error("Pièce jointe introuvable");
  return { nom: p.filename || `piece-${index + 1}`, type: p.contentType, base64: p.content.toString("base64") };
}

/** Lu / non lu, important ou non */
export function marquer(config: Config, dossier: string, uids: number[], { lu, important }: { lu?: boolean; important?: boolean }) {
  return avecImap(config, async (client) => {
    const verrou = await client.getMailboxLock(dossier);
    try {
      const plage = uids.join(",");
      if (lu === true) await client.messageFlagsAdd(plage, ["\\Seen"], { uid: true });
      if (lu === false) await client.messageFlagsRemove(plage, ["\\Seen"], { uid: true });
      if (important === true) await client.messageFlagsAdd(plage, ["\\Flagged"], { uid: true });
      if (important === false) await client.messageFlagsRemove(plage, ["\\Flagged"], { uid: true });
      return { ok: true };
    } finally {
      verrou.release();
    }
  });
}

/** Déplace vers un autre dossier */
export function deplacer(config: Config, dossier: string, uids: number[], vers: string) {
  return avecImap(config, async (client) => {
    const verrou = await client.getMailboxLock(dossier);
    try {
      await client.messageMove(uids.join(","), vers, { uid: true });
      return { ok: true };
    } finally {
      verrou.release();
    }
  });
}

/** Supprime : vers la corbeille, ou définitivement si l'on est déjà dans la corbeille */
export function supprimer(config: Config, dossier: string, uids: number[]) {
  return avecImap(config, async (client) => {
    const corbeille = await cheminRole(client, "\\Trash", "Trash");
    const verrou = await client.getMailboxLock(dossier);
    try {
      if (dossier === corbeille) await client.messageDelete(uids.join(","), { uid: true });
      else await client.messageMove(uids.join(","), corbeille, { uid: true });
      return { ok: true, definitif: dossier === corbeille };
    } finally {
      verrou.release();
    }
  });
}

export type Envoi = {
  a: string[]; cc?: string[]; cci?: string[]; objet: string; texte: string;
  html?: string; // corps mis en forme par l'éditeur de l'admin (déjà nettoyé côté navigateur)
  enReponseA?: { messageId: string; references?: string[]; dossier?: string; uid?: number } | null;
  pieces?: { nom: string; type: string; base64: string }[];
};

const echapper = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Second filet de sécurité sur le HTML reçu : ni script, ni cadre, ni attribut on…, ni lien javascript: */
const assainir = (html: string) => html
  .replace(/<(script|style|iframe|object|embed|form|link|meta)\b[\s\S]*?(<\/\1\s*>|$)/gi, "")
  .replace(/<\/?(script|style|iframe|object|embed|form|link|meta)\b[^>]*>/gi, "")
  .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
  .replace(/(href|src)\s*=\s*(["']?)\s*(javascript|vbscript|data):[^"'\s>]*\2/gi, '$1="#"');

/** Envoie un message (SMTP) et en garde une copie dans « Envoyés » (OVH ne le fait pas tout seul) */
export async function envoyer(config: Config, e: Envoi) {
  const message = {
    from: { name: config.nom, address: config.utilisateur },
    to: e.a, cc: e.cc?.length ? e.cc : undefined, bcc: e.cci?.length ? e.cci : undefined,
    subject: e.objet,
    text: e.texte,
    html: `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f2937">${e.html?.trim() ? assainir(e.html) : echapper(e.texte).replace(/\n/g, "<br>")}</div>`,
    inReplyTo: e.enReponseA?.messageId || undefined,
    references: e.enReponseA ? [...(e.enReponseA.references || []), e.enReponseA.messageId].filter(Boolean) : undefined,
    attachments: (e.pieces || []).map((p) => ({ filename: p.nom, contentType: p.type, content: p.base64, encoding: "base64" })),
  };
  const nodemailer = await expediteur();
  const MailComposer = await compositeur();
  const transport = nodemailer.createTransport({ host: config.hoteSmtp, port: 465, secure: true, auth: { user: config.utilisateur, pass: config.motDePasse } });
  const info = await transport.sendMail(message);

  // copie dans « Envoyés » et message d'origine marqué « répondu »
  const brut: Buffer = await new Promise((ok, ko) => new MailComposer({ ...message, messageId: info.messageId, date: new Date() }).compile().build((err: Error | null, r: Buffer) => (err ? ko(err) : ok(r))));
  // (lecteur direct, comme pour la lecture : imapflow bloque sur le contenu des messages côté Supabase)
  try {
    const envoyes = await avecImap(config, (client) => cheminRole(client, "\\Sent", "Sent"));
    const repondu = e.enReponseA?.dossier && e.enReponseA.uid ? { dossier: e.enReponseA.dossier, uid: e.enReponseA.uid } : undefined;
    await classerEnvoi(config, envoyes, new Uint8Array(brut), repondu);
  } catch (err) {
    console.warn("Copie dans Envoyés impossible :", (err as Error)?.message);
  }
  return { ok: true, messageId: info.messageId };
}

/** Nombre de messages non lus dans la boîte de réception (pastille du menu) */
export function nonLus(config: Config) {
  return avecImap(config, async (client) => {
    const s = await client.status("INBOX", { unseen: true });
    return { nonLus: s.unseen || 0 };
  });
}

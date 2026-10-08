// Lecture du contenu complet d'un message en IMAP « à la main » (Deno.connectTls, sans imapflow).
// Sur le runtime Supabase, imapflow boucle sans fin dès qu'il reçoit le corps d'un message (erreur 546) :
// la liste et les drapeaux passent par imapflow, mais le contenu des messages passe par ce petit lecteur.
const decodeur = new TextDecoder("latin1");
const encodeur = new TextEncoder();

/** Nom de dossier en UTF-7 modifié (RFC 3501 §5.1.3), entre guillemets : « INBOX.Éléments envoyés » */
function nomDossier(nom: string) {
  const utf7 = nom.replace(/&/g, "&-").replace(/[^\x20-\x7e]+/g, (segment) => {
    const octets = new Uint8Array(segment.length * 2);
    for (let i = 0; i < segment.length; i++) { const c = segment.charCodeAt(i); octets[2 * i] = c >> 8; octets[2 * i + 1] = c & 0xff; }
    return "&" + btoa(String.fromCharCode(...octets)).replace(/=+$/, "").replace(/\//g, ",") + "-";
  });
  return `"${utf7.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
const chaine = (t: string) => `"${t.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

class Connexion {
  private tampon = new Uint8Array(0);
  private numero = 0;
  constructor(private conn: Deno.TlsConn) {}

  private async remplir() {
    const morceau = new Uint8Array(65536);
    const n = await this.conn.read(morceau);
    if (n === null) throw new Error("Connexion IMAP fermée par le serveur.");
    const suite = new Uint8Array(this.tampon.length + n);
    suite.set(this.tampon); suite.set(morceau.subarray(0, n), this.tampon.length);
    this.tampon = suite;
  }
  async ligne(): Promise<string> {
    for (;;) {
      for (let i = 0; i < this.tampon.length - 1; i++) {
        if (this.tampon[i] === 13 && this.tampon[i + 1] === 10) {
          const l = decodeur.decode(this.tampon.subarray(0, i));
          this.tampon = this.tampon.slice(i + 2);
          return l;
        }
      }
      await this.remplir();
    }
  }
  async octets(n: number): Promise<Uint8Array> {
    while (this.tampon.length < n) await this.remplir();
    const r = this.tampon.slice(0, n);
    this.tampon = this.tampon.slice(n);
    return r;
  }
  /** Envoie une commande ; renvoie le littéral reçu (contenu du message) s'il y en a un */
  async commande(texte: string): Promise<Uint8Array | null> {
    const etiquette = `b${++this.numero}`;
    await this.conn.write(encodeur.encode(`${etiquette} ${texte}\r\n`));
    let litteral: Uint8Array | null = null;
    for (;;) {
      const l = await this.ligne();
      const taille = l.match(/\{(\d+)\}$/);
      if (taille && l.startsWith("*")) { litteral = await this.octets(Number(taille[1])); continue; }
      if (l.startsWith(`${etiquette} `)) {
        if (!/^\S+ OK/i.test(l)) throw new Error(`IMAP : ${l.slice(etiquette.length + 1)}`);
        return litteral;
      }
    }
  }
  /** Envoie une commande ; renvoie le texte des réponses non étiquetées (ex. RFC822.SIZE) */
  async commandeTexte(texte: string): Promise<string> {
    const etiquette = `b${++this.numero}`;
    await this.conn.write(encodeur.encode(`${etiquette} ${texte}\r\n`));
    let reponses = "";
    for (;;) {
      const l = await this.ligne();
      if (l.startsWith(`${etiquette} `)) {
        if (!/^\S+ OK/i.test(l)) throw new Error(`IMAP : ${l.slice(etiquette.length + 1)}`);
        return reponses;
      }
      reponses += l + "\n";
    }
  }
  /** APPEND : le serveur répond « + » avant de recevoir le message (littéral de `brut.length` octets) */
  async ajouter(dossier: string, brut: Uint8Array) {
    const etiquette = `b${++this.numero}`;
    await this.conn.write(encodeur.encode(`${etiquette} APPEND ${dossier} (\\Seen) {${brut.length}}\r\n`));
    const invite = await this.ligne();
    if (!invite.startsWith("+")) throw new Error(`IMAP : ${invite}`);
    await this.conn.write(brut);
    await this.conn.write(encodeur.encode("\r\n"));
    for (;;) {
      const l = await this.ligne();
      if (l.startsWith(`${etiquette} `)) {
        if (!/^\S+ OK/i.test(l)) throw new Error(`IMAP : ${l.slice(etiquette.length + 1)}`);
        return;
      }
    }
  }
  fermer() { try { this.conn.close(); } catch { /* déjà fermée */ } }
}

/** Copie d'un message dans un dossier (« Envoyés ») et drapeau sur le message d'origine (\Answered) */
export async function classerEnvoi(
  config: { hoteImap: string; utilisateur: string; motDePasse: string },
  dossierEnvoyes: string, brut: Uint8Array, repondu?: { dossier: string; uid: number },
) {
  const c = new Connexion(await Deno.connectTls({ hostname: config.hoteImap, port: 993 }));
  try {
    await c.ligne();
    await c.commande(`LOGIN ${chaine(config.utilisateur)} ${chaine(config.motDePasse)}`);
    await c.ajouter(nomDossier(dossierEnvoyes), brut);
    if (repondu) {
      await c.commande(`SELECT ${nomDossier(repondu.dossier)}`);
      await c.commande(`UID STORE ${repondu.uid} +FLAGS.SILENT (\\Answered)`);
    }
    await c.commande("LOGOUT").catch(() => {});
  } finally {
    c.fermer();
  }
}

/** Contenu brut (RFC 822) d'un message ; le marque comme lu si `marquerLu` */
export async function sourceMessage(
  config: { hoteImap: string; utilisateur: string; motDePasse: string },
  dossier: string, uid: number, { marquerLu = false, tailleMax = Infinity } = {},
): Promise<Uint8Array> {
  const c = new Connexion(await Deno.connectTls({ hostname: config.hoteImap, port: 993 }));
  try {
    await c.ligne(); // message d'accueil du serveur
    await c.commande(`LOGIN ${chaine(config.utilisateur)} ${chaine(config.motDePasse)}`);
    await c.commande(`${marquerLu ? "SELECT" : "EXAMINE"} ${nomDossier(dossier)}`);
    if (Number.isFinite(tailleMax)) {
      // taille annoncée par le serveur avant de télécharger : pas de message géant chargé pour rien
      const reponse = await c.commandeTexte(`UID FETCH ${uid} (RFC822.SIZE)`);
      const taille = Number(reponse.match(/RFC822\.SIZE (\d+)/i)?.[1] || 0);
      if (!reponse.includes("FETCH")) throw new Error("Message introuvable (déjà supprimé ?)");
      if (taille > tailleMax) throw new Error("Message trop volumineux pour être ouvert ici : consultez-le sur mail.ovh.net.");
    }
    const source = await c.commande(`UID FETCH ${uid} (BODY.PEEK[])`);
    if (!source) throw new Error("Message introuvable (déjà supprimé ?)");
    if (marquerLu) await c.commande(`UID STORE ${uid} +FLAGS.SILENT (\\Seen)`);
    await c.commande("LOGOUT").catch(() => {});
    return source;
  } finally {
    c.fermer();
  }
}


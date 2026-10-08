// Envoi d'un e-mail texte en SMTP « à la main » (Deno.connectTls, port 465), sans bibliothèque :
// les bibliothèques Node de messagerie sont peu fiables sur le runtime Supabase (voir boite-mail/imapBrut.ts).
const encodeur = new TextEncoder();
const decodeur = new TextDecoder();

export type ConfigSmtp = { hote: string; utilisateur: string; motDePasse: string; nom: string };

const base64 = (t: string) => btoa(String.fromCharCode(...encodeur.encode(t)));
const enTete = (t: string) => (/^[\x20-\x7e]*$/.test(t) ? t : `=?UTF-8?B?${base64(t)}?=`); // RFC 2047 si accents
const lignes76 = (b: string) => b.replace(/.{1,76}/g, (l) => `${l}\r\n`);

export async function envoyerMail(config: ConfigSmtp, { a, objet, texte, repondreA }: { a: string; objet: string; texte: string; repondreA?: string }) {
  const conn = await Deno.connectTls({ hostname: config.hote, port: 465 });
  let tampon = "";
  const reponse = async (attendu: number) => {
    // réponse SMTP : une ou plusieurs lignes « 250-… », la dernière « 250 … »
    for (;;) {
      const fin = tampon.match(/(?:^|\r\n)(\d{3}) [^\r\n]*\r\n/);
      if (fin) {
        const code = Number(fin[1]);
        tampon = tampon.slice((fin.index || 0) + fin[0].length);
        if (code !== attendu) throw new Error(`SMTP ${code} (attendu ${attendu})`);
        return;
      }
      const morceau = new Uint8Array(8192);
      const n = await conn.read(morceau);
      if (n === null) throw new Error("Connexion SMTP fermée");
      tampon += decodeur.decode(morceau.subarray(0, n));
    }
  };
  const envoyer = (ligne: string) => conn.write(encodeur.encode(`${ligne}\r\n`));
  try {
    await reponse(220);
    await envoyer("EHLO btm.yt"); await reponse(250);
    await envoyer(`AUTH PLAIN ${base64(`\0${config.utilisateur}\0${config.motDePasse}`)}`); await reponse(235);
    await envoyer(`MAIL FROM:<${config.utilisateur}>`); await reponse(250);
    await envoyer(`RCPT TO:<${a}>`); await reponse(250);
    await envoyer("DATA"); await reponse(354);
    const message = [
      `From: ${enTete(config.nom)} <${config.utilisateur}>`,
      `To: <${a}>`,
      ...(repondreA ? [`Reply-To: <${repondreA}>`] : []),
      `Subject: ${enTete(objet)}`,
      `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
      `Message-ID: <${crypto.randomUUID()}@btm.yt>`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: base64",
      "",
      lignes76(base64(texte)),
    ].join("\r\n");
    await conn.write(encodeur.encode(`${message}\r\n.\r\n`)); // base64 : aucune ligne ne commence par « . »
    await reponse(250);
    await envoyer("QUIT").catch(() => {});
  } finally {
    try { conn.close(); } catch { /* déjà fermée */ }
  }
}

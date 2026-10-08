// Messagerie de contact@btm.yt dans l'espace admin : lire, répondre, envoyer, classer, supprimer.
// Réservée aux administrateurs : le rôle est revérifié ici (table profils, clé service) — le navigateur n'est jamais cru sur parole.
// Les identifiants de la boîte restent côté serveur (secrets MAIL_*) : ils ne transitent jamais par le navigateur.
import { createClient } from "npm:@supabase/supabase-js@2";
import * as boite from "./messagerie.ts";

const ORIGINES = ["https://www.btm.yt", "https://btm.yt", "https://btm-mayotte.vercel.app", "http://localhost:5173", "http://localhost:5174"];
const enTetes = (req: Request) => ({
  "Access-Control-Allow-Origin": ORIGINES.includes(req.headers.get("Origin") || "") ? req.headers.get("Origin")! : ORIGINES[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region",
  Vary: "Origin",
});

const TAILLE_MAX_PIECES = 10 * 1024 * 1024; // pièces jointes d'un envoi (OVH accepte jusqu'à 100 Mo, mais la fonction a ses limites)
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/;
const listeEmails = (v: unknown) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;]/) : []).map((x) => String(x).trim()).filter(Boolean);
const uidsValides = (v: unknown) => (Array.isArray(v) ? v : [v]).map(Number).filter((n) => Number.isInteger(n) && n > 0);

Deno.serve(async (req) => {
  const cors = enTetes(req);
  const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1) Qui appelle ?  2) Est-il admin ?
    const auth = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: appelant, error: erreurAppelant } = await auth.auth.getUser();
    if (erreurAppelant || !appelant.user) return json({ erreur: "Utilisateur non authentifié." }, 401);
    const { data: profil } = await createClient(url, service).from("profils").select("role").eq("id", appelant.user.id).maybeSingle();
    if (profil?.role !== "admin") return json({ erreur: "Accès réservé aux administrateurs." }, 403);

    const config: boite.Config = {
      utilisateur: Deno.env.get("MAIL_UTILISATEUR") || "contact@btm.yt",
      motDePasse: Deno.env.get("MAIL_MOT_DE_PASSE") || "",
      hoteImap: Deno.env.get("MAIL_HOTE_IMAP") || "ssl0.ovh.net",
      hoteSmtp: Deno.env.get("MAIL_HOTE_SMTP") || "ssl0.ovh.net",
      nom: Deno.env.get("MAIL_NOM") || "BTM",
    };
    if (!config.motDePasse) return json({ erreur: "Messagerie non configurée : secret MAIL_MOT_DE_PASSE manquant." }, 500);

    const c = await req.json();
    const dossier = typeof c.dossier === "string" && c.dossier.length < 200 ? c.dossier : "INBOX";

    switch (c.action) {
      case "ouverture": return json(await boite.ouverture(config, dossier, String(c.recherche || "").slice(0, 100)));
      case "dossiers": return json(await boite.dossiers(config));
      case "non-lus": return json(await boite.nonLus(config));
      case "lister": return json(await boite.lister(config, dossier, Math.max(1, Number(c.page) || 1), String(c.recherche || "").slice(0, 100)));
      case "lire": {
        const [uid] = uidsValides(c.uid);
        if (!uid) return json({ erreur: "Message inconnu." }, 400);
        return json(await boite.lire(config, dossier, uid));
      }
      case "piece": {
        const [uid] = uidsValides(c.uid);
        if (!uid || !Number.isInteger(c.index)) return json({ erreur: "Pièce jointe inconnue." }, 400);
        return json(await boite.pieceJointe(config, dossier, uid, c.index));
      }
      case "marquer": {
        const uids = uidsValides(c.uids);
        if (!uids.length) return json({ erreur: "Aucun message choisi." }, 400);
        return json(await boite.marquer(config, dossier, uids, { lu: typeof c.lu === "boolean" ? c.lu : undefined, important: typeof c.important === "boolean" ? c.important : undefined }));
      }
      case "deplacer": {
        const uids = uidsValides(c.uids);
        if (!uids.length || typeof c.vers !== "string") return json({ erreur: "Déplacement incomplet." }, 400);
        return json(await boite.deplacer(config, dossier, uids, c.vers));
      }
      case "supprimer": {
        const uids = uidsValides(c.uids);
        if (!uids.length) return json({ erreur: "Aucun message choisi." }, 400);
        return json(await boite.supprimer(config, dossier, uids));
      }
      case "envoyer": {
        const a = listeEmails(c.a), cc = listeEmails(c.cc), cci = listeEmails(c.cci);
        const invalides = [...a, ...cc, ...cci].filter((e) => !EMAIL.test(e));
        if (!a.length) return json({ erreur: "Indiquez au moins un destinataire." }, 400);
        if (invalides.length) return json({ erreur: `Adresse invalide : ${invalides.join(", ")}` }, 400);
        if (a.length + cc.length + cci.length > 50) return json({ erreur: "50 destinataires au maximum." }, 400);
        const objet = String(c.objet || "").trim().slice(0, 300);
        const texte = String(c.texte || "").slice(0, 100_000);
        if (!objet && !texte.trim()) return json({ erreur: "Le message est vide." }, 400);
        const pieces = (Array.isArray(c.pieces) ? c.pieces : []).slice(0, 10)
          .map((p: any) => ({ nom: String(p.nom || "piece").slice(0, 150), type: String(p.type || "application/octet-stream").slice(0, 100), base64: String(p.base64 || "") }));
        if (pieces.reduce((s: number, p: { base64: string }) => s + p.base64.length * 0.75, 0) > TAILLE_MAX_PIECES) return json({ erreur: "Pièces jointes trop lourdes (10 Mo au total)." }, 400);
        const enReponseA = c.enReponseA?.messageId ? { messageId: String(c.enReponseA.messageId), references: listeEmails(c.enReponseA.references), dossier: c.enReponseA.dossier, uid: Number(c.enReponseA.uid) || undefined } : null;
        return json(await boite.envoyer(config, { a, cc, cci, objet: objet || "(sans objet)", texte, enReponseA, pieces }));
      }
      default: return json({ erreur: "Action inconnue." }, 400);
    }
  } catch (e) {
    console.error("boite-mail :", e);
    const message = e instanceof Error ? e.message : String(e);
    return json({ erreur: /auth|login|credentials/i.test(message) ? "Connexion à la boîte refusée : vérifiez le mot de passe (secret MAIL_MOT_DE_PASSE)." : message }, 500);
  }
});

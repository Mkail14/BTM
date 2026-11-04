// Assistante BTM (support client) : Awa, la même que sur BTM AI. Ses réponses viennent de BTM AI (route /api/awa),
// qui a son cerveau, sa personnalité et ses API ; ici, on garde les conversations, les vraies offres des fournisseurs,
// et le passage à un conseiller humain (l'admin) quand la demande la dépasse ou que le client le demande.
// Le navigateur ne touche jamais aux tables : chaque conversation est protégée par un jeton secret.
// Secret : AWA_SECRET (son empreinte est dans la table awa_partner_keys de BTM AI) ; AWA_URL facultatif.
// Sans lui, toute demande part directement vers un conseiller.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { envoyerMail } from "./smtpBrut.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const AWA_URL = Deno.env.get("AWA_URL") || "https://btm-ai.vercel.app/api/awa";
const MAX_REPONSES_IA = 40;         // par conversation : au-delà, un conseiller prend le relais
const MAX_LONGUEUR = 1000;
const MAX_CONVERSATIONS_HEURE = 10; // par adresse IP : nouvelles conversations
const MAX_MESSAGES_HEURE = 60;      // par adresse IP : réponses de l'IA (protège les crédits d'IA)
const uuid = /^[0-9a-f-]{36}$/i;
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/;
const SITE = "https://www.btm.yt";
type ClientAdmin = ReturnType<typeof createClient<any>>;
const AUTEURS: Record<string, string> = { client: "Client", ia: "Assistante", conseiller: "Conseiller", systeme: "Info" };

/** E-mail au conseiller (boîte contact@btm.yt) quand une conversation lui est passée */
async function notifierConseiller(admin: ClientAdmin, conv: Record<string, any>) {
  const utilisateur = Deno.env.get("MAIL_UTILISATEUR"), motDePasse = Deno.env.get("MAIL_MOT_DE_PASSE");
  if (!utilisateur || !motDePasse) return;
  const { data: derniers } = await admin.from("support_messages").select("auteur, texte").eq("conversation_id", conv.id).order("id", { ascending: false }).limit(8);
  const qui = conv.nom || conv.email || "Visiteur";
  const horsService = conv.raison === RAISON_CREDITS; // toutes les API d'Awa sont à court de quota
  const texte = [
    ...(horsService ? [
      "⚠ AWA EST HORS SERVICE : toutes ses API (BTM AI) ont atteint leur quota.",
      "Les nouvelles discussions vous sont transmises directement jusqu’à ce que les quotas se rechargent",
      "ou qu’une nouvelle API soit ajoutée dans BTM AI (Administration → Modèle IA).",
      "",
    ] : []),
    "Un client demande à parler à un conseiller BTM.",
    "",
    `Client : ${qui}${conv.email && conv.nom ? ` <${conv.email}>` : ""}${conv.utilisateur_id ? " (compte BTM)" : " (visiteur sans compte)"}`,
    `Raison : ${conv.raison || "—"}`,
    `Page : ${conv.page || "—"}`,
    "",
    "Derniers messages :",
    ...((derniers || []) as { auteur: string; texte: string }[]).reverse().map((m) => `  ${AUTEURS[m.auteur] || m.auteur} : ${m.texte.replace(/\s+/g, " ").slice(0, 300)}`),
    "",
    `Répondre dans l’espace admin : ${SITE}/admin/support?c=${conv.id}`,
  ].join("\n");
  await envoyerMail({ hote: Deno.env.get("MAIL_HOTE_SMTP") || "ssl0.ovh.net", utilisateur, motDePasse, nom: "BTM Assistance" }, {
    a: utilisateur, objet: horsService ? `⚠ Awa hors service (crédits IA épuisés) — à reprendre : ${qui}` : `Demande d’assistance : ${qui}`, texte, repondreA: conv.email && EMAIL.test(conv.email) ? conv.email : undefined,
  }).catch((e) => console.error("Notification conseiller :", e?.message || e));
}

// Raison affichée au conseiller quand toutes les API d'Awa sont à court de quota (repérée par l'admin : bandeau d'alerte)
const RAISON_CREDITS = "Plus de crédits IA : toutes les API d'Awa (BTM AI) ont atteint leur quota. Awa est hors service, un conseiller doit répondre.";

type Echange = { role: "client" | "assistante"; texte: string };
type ReponseIa = { texte: string; action: "transferer_conseiller" | "annuler_conseiller" | null; raison: string };
type ErreurIa = Error & { credits?: boolean }; // credits : toutes les API d'Awa sont à court de quota

// La fenêtre de discussion affiche du texte brut : on retire le Markdown que le modèle ajoute parfois (**gras**, titres, puces)
const sansMarkdown = (t: string) => t
  .replace(/\*\*(.+?)\*\*/gs, "$1").replace(/__(.+?)__/gs, "$1").replace(/(^|\s)\*(\S[^*\n]*?)\*(?=\s|[.,;:!?]|$)/g, "$1$2")
  .replace(/^#{1,6}\s+/gm, "").replace(/^\s*[*-]\s+/gm, "· ").replace(/\n{3,}/g, "\n\n").trim();

/** Demande la réponse à Awa (BTM AI) : texte pour le client et, au besoin, transfert ou annulation du conseiller */
async function demanderAwa(echanges: Echange[], contexte: { data: string; page: string | null; nom: string | null; enAttente: boolean }): Promise<ReponseIa> {
  const r = await fetch(AWA_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${Deno.env.get("AWA_SECRET")}` },
    signal: AbortSignal.timeout(40000),
    body: JSON.stringify({
      site: "btm-batiment",
      messages: echanges.map((e) => ({ role: e.role === "client" ? "user" : "assistant", content: e.texte.slice(0, 4000) })),
      data: contexte.data.slice(0, 30000),
      ...(contexte.page && { page: contexte.page.slice(0, 200) }),
      ...(contexte.nom && { clientName: contexte.nom.slice(0, 80) }),
      waitingForAdvisor: contexte.enAttente,
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const echec: ErreurIa = new Error(`Awa : ${r.status} ${j?.error || ""}`.trim());
    echec.credits = j?.error === "quota";
    throw echec;
  }
  return { texte: sansMarkdown(String(j.text || "")), action: j.action || null, raison: String(j.reason || "Demande à reprendre par un conseiller.") };
}

/** Offres actuelles, lisibles par l'assistante : par matériau, le prix BTM de chaque fournisseur */
async function contexteOffres(admin: ClientAdmin) {
  const [{ data: offres }, { data: fiches }] = await Promise.all([
    admin.rpc("offres_publiques"),
    admin.from("fournisseurs").select("nom, commune, adresse, telephone, horaires, livraison").eq("actif", true).order("nom"),
  ]);
  const parProduit = new Map<string, string[]>();
  for (const o of offres || []) {
    const cle = `${o.libelle} (${o.unite})`;
    const texte = o.disponible
      ? `${o.fournisseur_nom} ${Number(o.prix).toFixed(2)} € (comptoir ${Number(o.prix_comptoir).toFixed(2)} €)`
      : `${o.fournisseur_nom} en rupture`;
    parProduit.set(cle, [...(parProduit.get(cle) || []), texte]);
  }
  const lignesOffres = [...parProduit.entries()].map(([p, l]) => `- ${p} : ${l.join(" · ")}`).join("\n") || "- (aucune offre renseignée)";
  const lignesFiches = (fiches || []).map((f) =>
    `- ${f.nom}, ${f.commune}${f.adresse ? `, ${f.adresse}` : ""} · tél. ${f.telephone}${f.horaires ? ` · ${f.horaires}` : ""}${f.livraison ? " · livraison possible" : ""}`
  ).join("\n");
  return `Fournisseurs partenaires :\n${lignesFiches}\n\nOffres actuelles (prix BTM avec code, par unité) :\n${lignesOffres}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, service);
    const corps = await req.json().catch(() => ({}));
    // Limites par adresse IP (compteur limites_essais, migration 0027) : la base répond « limite atteinte » ou non
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "inconnue";
    const limiteAtteinte = async (cle: string, max: number) => {
      const { data, error } = await admin.rpc("limite_atteinte", { p_cle: `${cle}:${ip}`, p_max: max, p_fenetre: "1 hour" });
      return !error && data === true; // migration absente : pas de blocage
    };

    // Visiteur connecté ? (facultatif : pour le nom affiché au conseiller)
    const auth = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: moi } = await auth.auth.getUser();
    const compte = moi?.user || null;

    // ---------- Conversation : reprise (jeton vérifié) ou création ----------
    let conv: Record<string, any> | null = null;
    if (corps.conversation_id && uuid.test(String(corps.conversation_id)) && uuid.test(String(corps.jeton || ""))) {
      const { data } = await admin.from("support_conversations").select("*").eq("id", corps.conversation_id).eq("jeton", corps.jeton).maybeSingle();
      conv = data as Record<string, any> | null;
    }
    // Discussion d'un compte : visible seulement connecté à ce compte (déconnecté, elle « disparaît »).
    // Discussion d'un visiteur qui vient de se connecter : elle est rattachée à son compte.
    if (conv?.utilisateur_id && conv.utilisateur_id !== compte?.id) conv = null;
    else if (conv && !conv.utilisateur_id && compte) {
      const meta = compte.user_metadata || {};
      const { data } = await admin.from("support_conversations").update({
        utilisateur_id: compte.id,
        nom: conv.nom || [meta.prenom, meta.nom].filter(Boolean).join(" ") || meta.pseudo || null,
        email: conv.email || compte.email || null,
      }).eq("id", conv.id).is("utilisateur_id", null).select().maybeSingle();
      if (data) conv = data;
    }
    const lire = async (apres = 0) => {
      const { data } = await admin.from("support_messages").select("id, auteur, texte, cree_le")
        .eq("conversation_id", conv!.id).gt("id", apres).order("id").limit(200);
      return data || [];
    };
    // Accusé de lecture et « le conseiller écrit… » (migration 0021) : renvoyés au client à chaque échange
    const conseillerEcrit = () => !!conv!.ecrit_conseiller_le && Date.now() - new Date(conv!.ecrit_conseiller_le).getTime() < 7000;
    const reponse = async (apres = 0) => json({
      conversation_id: conv!.id, jeton: conv!.jeton, statut: conv!.statut, email: conv!.email || null,
      vu_conseiller_id: Number(conv!.vu_conseiller_id) || 0, conseiller_ecrit: conseillerEcrit(), messages: await lire(apres),
    });
    /** Le client a vu les messages jusqu'à corps.vu et/ou est en train d'écrire (sans toucher à mis_a_jour_le) */
    const presence = async (autres: Record<string, unknown> = {}) => {
      const champs: Record<string, unknown> = { ...autres };
      const vu = Math.floor(Number(corps.vu) || 0);
      if (vu > (Number(conv!.vu_client_id) || 0)) champs.vu_client_id = vu;
      if (corps.ecrit === true && !("ecrit_client_le" in champs)) champs.ecrit_client_le = new Date().toISOString();
      if (!Object.keys(champs).length) return;
      const { data } = await admin.from("support_conversations").update(champs).eq("id", conv!.id).select().single();
      if (data) conv = data;
    };

    if (corps.action === "lire") {
      if (!conv) return json({ erreur: "Conversation introuvable." }, 404);
      await presence();
      return reponse(Number(corps.apres) || 0);
    }

    // Connexion sur un navigateur sans discussion : dernière discussion du compte
    if (corps.action === "mienne") {
      if (!conv && compte) {
        const { data } = await admin.from("support_conversations").select("*").eq("utilisateur_id", compte.id)
          .order("mis_a_jour_le", { ascending: false }).limit(1).maybeSingle();
        conv = data;
      }
      return conv ? reponse(0) : json({ conversation_id: null });
    }

    if (!conv) {
      if (await limiteAtteinte("assistant-conversation", MAX_CONVERSATIONS_HEURE)) {
        return json({ erreur: "Trop de conversations ouvertes depuis votre connexion : réessayez dans une heure." }, 429);
      }
      const meta = compte?.user_metadata || {};
      const nom = [meta.prenom, meta.nom].filter(Boolean).join(" ") || meta.pseudo || null;
      const { data, error } = await admin.from("support_conversations").insert({
        utilisateur_id: compte?.id || null, nom, email: compte?.email || null, page: String(corps.page || "").slice(0, 200) || null,
      }).select().single();
      if (error) return json({ erreur: error.message }, 400);
      conv = data as Record<string, any>;
    }
    const apresInitial = Number(corps.apres) || 0;
    const majConv = async (champs: Record<string, unknown>) => {
      const { data } = await admin.from("support_conversations").update({ ...champs, mis_a_jour_le: new Date().toISOString() }).eq("id", conv!.id).select().single();
      conv = data as Record<string, any>;
    };
    const ajouter = (auteur: string, texte: string) => admin.from("support_messages").insert({ conversation_id: conv!.id, auteur, texte: texte.slice(0, 4000) });
    const passerConseiller = async (raison: string, message: string) => {
      const dejaChezConseiller = conv!.statut === "attente" || conv!.statut === "humain";
      await ajouter("ia", message);
      await majConv({ statut: "attente", raison: raison.slice(0, 300), non_lu: true });
      if (!dejaChezConseiller) await notifierConseiller(admin, conv!); // une seule notification par demande
    };
    const enregistrerCoordonnees = async () => {
      const email = String(corps.email || "").trim().slice(0, 254), nom = String(corps.nom || "").trim().slice(0, 80);
      const champs: Record<string, unknown> = {};
      if (email && EMAIL.test(email) && !conv!.email) champs.email = email;
      if (nom && !conv!.nom) champs.nom = nom;
      if (Object.keys(champs).length) await majConv(champs);
    };

    // ---------- Le client demande un conseiller ----------
    if (corps.action === "coordonnees") {
      await enregistrerCoordonnees();
      return reponse(apresInitial);
    }

    if (corps.action === "conseiller") {
      await enregistrerCoordonnees();
      // parcours suivi dans les questions guidées : le conseiller sait d’emblée où en est le client
      const contexte = String(corps.contexte || "").trim().slice(0, 600);
      if (contexte && (conv.statut === "ia" || conv.statut === "fermee")) await ajouter("client", contexte);
      if (conv.statut === "ia" || conv.statut === "fermee") {
        await passerConseiller(contexte ? `Questions guidées : ${contexte.replace(/^Parcours suivi : /, "")}`.slice(0, 300) : "Le client a demandé à parler à un conseiller.", "Je vous mets en relation avec un conseiller BTM. Il vous répond ici même dès que possible — vous pouvez déjà lui expliquer votre demande.");
      }
      return reponse(apresInitial);
    }

    // ---------- Nouveau message du client ----------
    const texte = String(corps.texte || "").trim().slice(0, MAX_LONGUEUR);
    if (!texte) return json({ erreur: "Message vide." }, 400);
    await ajouter("client", texte);
    await presence({ ecrit_client_le: null }); // message envoyé : le client a fini d'écrire
    if (conv.statut === "fermee") await majConv({ statut: "ia" });

    // Un conseiller a pris la discussion en main (statut « humain ») : on l'avertit, l'assistante se tait.
    // En attente d'un conseiller (« attente ») : Awa continue d'aider, le client n'est jamais laissé sans réponse.
    const enAttente = conv.statut === "attente";
    if (conv.statut === "humain" || enAttente) await majConv({ non_lu: true });
    if (conv.statut === "humain") return reponse(apresInitial);
    if (conv.reponses_ia >= MAX_REPONSES_IA) {
      if (!enAttente) await passerConseiller("Conversation longue : limite de l'assistante atteinte.", "Pour aller plus loin, je vous passe un conseiller BTM : il vous répond ici même dès que possible.");
      return reponse(apresInitial);
    }

    if (await limiteAtteinte("assistant-message", MAX_MESSAGES_HEURE)) {
      await ajouter("ia", "Vous m’avez envoyé beaucoup de messages en peu de temps : patientez un peu avant de continuer, ou demandez à parler à un conseiller.");
      return reponse(apresInitial);
    }

    if (!Deno.env.get("AWA_SECRET")) {
      if (!enAttente) await passerConseiller("Assistante indisponible (Awa n'est pas reliée : secret AWA_SECRET).", "Merci pour votre message ! Un conseiller BTM va vous répondre ici même dès que possible.");
      return reponse(apresInitial);
    }

    // Historique : client → client ; assistante et conseiller → assistante ; messages système ignorés
    const { data: historique } = await admin.from("support_messages").select("auteur, texte")
      .eq("conversation_id", conv.id).neq("auteur", "systeme").order("id", { ascending: false }).limit(20);
    const echanges: Echange[] = (historique || []).reverse().map((m) => ({
      role: m.auteur === "client" ? "client" : "assistante",
      texte: m.auteur === "conseiller" ? `(Message du conseiller BTM) ${m.texte}` : m.texte,
    }));
    while (echanges.length && echanges[0].role !== "client") echanges.shift();

    try {
      const r = await demanderAwa(echanges, { data: await contexteOffres(admin), page: conv.page, nom: conv.nom, enAttente });
      await majConv({ reponses_ia: conv.reponses_ia + 1 });
      if (r.action === "transferer_conseiller") {
        await passerConseiller(r.raison, r.texte || "Je transmets votre demande à un conseiller BTM avec tous les détails : il vous répond ici même.");
      } else if (r.action === "annuler_conseiller") {
        await ajouter("systeme", "Demande de conseiller annulée : vous continuez avec Awa.");
        await majConv({ statut: "ia", raison: null, non_lu: false });
        await ajouter("ia", r.texte || "C’est noté, je reste avec vous. Que puis-je faire pour vous ?");
      } else {
        await ajouter("ia", r.texte || "Pouvez-vous me dire plus précisément ce que vous cherchez ?");
      }
    } catch (e) {
      console.error("Assistante :", e instanceof Error ? e.message : e);
      // déjà en attente d'un conseiller : il est prévenu, inutile de le redire
      // plus de crédits sur aucune API : alerte claire au conseiller ; sinon panne technique passagère
      if (!enAttente) {
        await passerConseiller((e as ErreurIa).credits ? RAISON_CREDITS : "Assistante indisponible (Awa ne répond pas).",
          "Je vous passe un conseiller BTM : il prend le relais et vous répond ici même dès que possible.");
      }
    }
    return reponse(apresInitial);
  } catch (e) {
    return json({ erreur: e instanceof Error ? e.message : "Erreur inattendue." }, 500);
  }
});

// Assistante BTM (support client) : répond avec Gemini (Google) à partir des vraies offres des fournisseurs,
// et passe la main à un conseiller humain (l'admin) quand la demande la dépasse ou que le client le demande.
// Le navigateur ne touche jamais aux tables : chaque conversation est protégée par un jeton secret.
// Clés Gemini : secrets GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3, puis celles de Supabase Vault
// (gemini_api_key_1, _2… lues par cles_assistant(), migration 0023) ; la suivante prend le relais.
// Facultatifs : GEMINI_MODELES (liste séparée par des virgules), ANTHROPIC_API_KEY (Claude, dernier recours).
// Sans aucune clé, toute demande part directement vers un conseiller.
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { envoyerMail } from "./smtpBrut.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MODELE_CLAUDE = "claude-haiku-4-5"; // dernier recours, si ANTHROPIC_API_KEY est configurée
const MAX_REPONSES_IA = 40;         // par conversation : au-delà, un conseiller prend le relais
const MAX_LONGUEUR = 1000;
const MAX_CONVERSATIONS_HEURE = 10; // par adresse IP : nouvelles conversations
const MAX_MESSAGES_HEURE = 60;      // par adresse IP : réponses de l'IA (protège les crédits d'IA)
const uuid = /^[0-9a-f-]{36}$/i;
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/;
const SITE = "https://www.btm.yt";
const AUTEURS: Record<string, string> = { client: "Client", ia: "Assistante", conseiller: "Conseiller", systeme: "Info" };

/** E-mail au conseiller (boîte contact@btm.yt) quand une conversation lui est passée */
async function notifierConseiller(admin: ReturnType<typeof createClient>, conv: Record<string, any>) {
  const utilisateur = Deno.env.get("MAIL_UTILISATEUR"), motDePasse = Deno.env.get("MAIL_MOT_DE_PASSE");
  if (!utilisateur || !motDePasse) return;
  const { data: derniers } = await admin.from("support_messages").select("auteur, texte").eq("conversation_id", conv.id).order("id", { ascending: false }).limit(8);
  const qui = conv.nom || conv.email || "Visiteur";
  const horsService = conv.raison === RAISON_CREDITS; // toutes les clés d'IA sont à court de quota
  const texte = [
    ...(horsService ? [
      "⚠ AWA EST HORS SERVICE : toutes les clés Gemini ont atteint leur quota.",
      "Les nouvelles discussions vous sont transmises directement jusqu’à ce que les quotas se rechargent",
      "(en général le lendemain) ou qu’une nouvelle clé soit ajoutée dans Supabase (secret GEMINI_API_KEY_3).",
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

const CONSIGNES = `Tu es Awa, l'assistante virtuelle de BTM (Bâtiment & Travaux Mayotte).
BTM est une plateforme gratuite de mise en relation : elle ne vend rien. Elle aide les particuliers et les professionnels
de Mayotte à chiffrer leurs travaux (mur, dalle, fondation, terrasse) ou à acheter directement des matériaux,
puis à les retirer chez un fournisseur partenaire au meilleur prix.

Comment fonctionne BTM (à expliquer simplement quand c'est utile) :
- Calculateur : « Selon mes mesures » (on donne les dimensions, BTM calcule les quantités) ou « Je sais ce qu'il me faut »
  (on choisit directement ses matériaux et ses quantités).
- Les résultats comparent les fournisseurs : prix exact chez chacun, disponibilité, économie par rapport au comptoir.
- En enregistrant son devis (compte gratuit), le client obtient un code de retrait (ex. K7QM-4XPA) à présenter au fournisseur :
  il paie alors le « prix BTM », plus bas que le prix au comptoir, sans aucun frais BTM.
- Chaque achat avec un code rapporte du crédit fidélité, utilisable au comptoir lors d'un prochain retrait (visible dans « Mes projets »).
- Les codes promo BTM et les promotions des fournisseurs ne servent qu'une fois par client.
- Les professionnels (SIRET vérifié) peuvent réunir plusieurs ouvrages et achats dans un seul devis.

Ta façon de parler :
- Chaleureuse, naturelle et simple, comme une conseillère en magasin. Vouvoiement. Français courant, phrases courtes.
- Réponses brèves : 1 à 4 phrases en général. Texte simple, sans titres ni tableaux ni Markdown.
- Tu peux poser une question pour mieux comprendre le besoin.
- Mène une vraie conversation : réponds à ce que le client vient d'écrire, en tenant compte de tout l'échange.
  Ne salue et ne te présente qu'une seule fois ; ne répète jamais une phrase ou une explication déjà donnée.
  Un simple « coucou » ou « merci » appelle une réponse courte et chaleureuse, pas un discours.
  Si le client repose la même question, c'est que ta réponse ne l'a pas aidé : dis-le autrement, plus simplement,
  ou demande-lui ce qui bloque.
- Tu es une assistante virtuelle : tu ne prétends jamais être une personne. Si on te le demande, dis-le franchement
  et propose un conseiller humain.

Ton rôle : régler toi-même le problème du client chaque fois que c'est possible.
- Commence toujours par essayer : si la demande est floue, pose une ou deux questions précises (quel devis, quel
  fournisseur, quel message s'affiche, à quelle étape), puis donne une solution concrète, étape par étape, avec les
  bons menus du site. Ensuite, demande si c'est réglé.
- Problèmes courants que tu sais traiter :
  · code de retrait introuvable ou refusé : le devis doit être enregistré ; le code fait 8 caractères (ex. K7QM-4XPA) ;
    s'il a choisi un fournisseur dans son devis, le code n'est valable que chez lui ; le code est sur le devis et le PDF ;
  · code promo refusé : il ne sert qu'une fois par compte, il peut avoir expiré, il se saisit sur le devis ;
  · mot de passe oublié : bouton « Connexion » en haut du site, puis « Mot de passe oublié ? » dans la fenêtre ; un code arrive par e-mail (regarder les courriers indésirables) ;
  · e-mail de confirmation non reçu : il vient de contact@btm.yt, regarder les indésirables, attendre quelques minutes ;
  · crédit fidélité : affiché à côté du nom une fois connecté, déduit par le fournisseur au retrait suivant ;
  · écart de prix au comptoir : le prix BTM ne s'applique qu'avec le code de retrait ; montrer le devis au fournisseur ;
  · modifier ou supprimer son compte : cliquer sur son nom en haut à droite.

Passe la main à un conseiller (outil transferer_conseiller) seulement dans ces trois cas :
1. Le client demande à parler à un humain, à un conseiller, à l'admin ou à l'équipe BTM, même une seule fois :
   transfère tout de suite, sans chercher à le retenir ni à répondre à sa place.
2. Tu as proposé une solution et le client dit que le problème persiste, ou tu as fait le tour de ce que tu peux proposer.
3. Il faut une action que seule l'équipe peut faire : rembourser, vérifier un paiement ou un double débit, corriger un
   devis enregistré, intervenir sur un compte bloqué, régler un litige avec un fournisseur. Rassemble d'abord, si le
   client ne les a pas donnés, le code de retrait ou le nom du devis, le fournisseur, la date et le montant ; puis transfère
   avec une raison complète, pour que le conseiller n'ait rien à redemander.
Dans tous les autres cas, n'utilise pas l'outil : continue d'aider. Un client mécontent : excuse-toi et cherche une
solution ; transfère s'il le demande ou si tu ne peux rien faire. Sécurité d'un ouvrage (structure, porteur, étanchéité) :
donne les principes généraux, recommande un professionnel du bâtiment, et transfère si le client le souhaite.
Quand tu transfères, écris une courte phrase au client (ex. « Je transmets votre demande à un conseiller BTM avec
tous les détails : il vous répond ici même. »).

Règles :
- Pour les prix et la disponibilité, utilise uniquement les offres fournies ci-dessous ; n'invente jamais un prix,
  un fournisseur, un délai ou une promotion. Si l'information n'y est pas, dis-le.
- Tu ne peux ni modifier un devis, ni annuler un paiement, ni voir le compte du client.
- Quantités : calcule avec ce repère, en montrant le calcul simplement : béton courant dosé à 350 kg de ciment par m³,
  soit 10 sacs de 35 kg par m³ ; volume = surface × épaisseur (une dalle de 10 cm fait 0,1 m³ par m²).
  Exemple : dalle de 4 m² sur 10 cm = 0,4 m³ = 4 sacs. Pour un chiffrage complet (sable, gravier, acier, prix),
  propose le calculateur « Selon mes mesures ».
- Hors sujet (sans rapport avec le bâtiment ou BTM) : réponds poliment que tu es là pour BTM et ramène la conversation.`;

const OUTIL_TRANSFERT: Anthropic.Tool = {
  name: "transferer_conseiller",
  description: "Passe la conversation à un conseiller humain de BTM, qui répondra au client dans cette même discussion. Uniquement si le client demande un humain, si tes solutions n'ont pas réglé le problème, ou si une action de l'équipe est indispensable (remboursement, vérification de paiement, litige, compte bloqué).",
  input_schema: {
    type: "object",
    properties: { raison: { type: "string", description: "En une phrase, pourquoi un conseiller doit prendre le relais (pour le conseiller)." } },
    required: ["raison"],
    additionalProperties: false,
  },
};
// Discussion en attente d'un conseiller : le client préfère finalement continuer avec Awa
const OUTIL_ANNULER: Anthropic.Tool = {
  name: "annuler_conseiller",
  description: "Annule la demande de conseiller : à utiliser seulement si le client dit qu'il n'a plus besoin d'un conseiller ou qu'il préfère continuer avec Awa.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
};

// ---------- Modèles d'IA : toujours une réponse disponible ----------
// Gemini, avec jusqu'à 3 clés de projets Google différents (quotas séparés) : la clé 1 répond tant qu'elle le peut ;
// quand elle n'a plus de quota (429) ou est refusée, elle est mise de côté et la clé suivante prend le relais.
// Les quotas sont comptés par modèle : une clé épuisée sur un modèle peut encore répondre avec le suivant.
// Un modèle saturé chez Google (503) ou trop lent laisse la place au suivant. Claude en dernier recours.
// Si plus rien ne répond, la discussion passe au conseiller (admin), alerté par e-mail et dans l'admin.
// Les mises de côté durent tant que l'instance de la fonction reste « chaude ».
const MODELES_GEMINI = (Deno.env.get("GEMINI_MODELES") || "gemini-3.5-flash,gemini-3.8-flash,gemini-3.5-flash-lite")
  .split(",").map((m) => m.trim()).filter(Boolean);
// Clés : secrets d'Edge Functions d'abord, puis Supabase Vault (relu toutes les 5 min par instance)
let clesVault: { cles: string[]; lues: number } | null = null;
async function clesGemini(admin: ReturnType<typeof createClient>): Promise<string[]> {
  const secrets = ["GEMINI_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3"].map((nom) => Deno.env.get(nom)?.trim() || "");
  if (!clesVault || Date.now() - clesVault.lues > 300_000) {
    const { data, error } = await admin.rpc("cles_assistant");
    if (error) console.error("Clés Vault :", error.message);
    clesVault = { cles: ((data || []) as { valeur: string }[]).map((l) => String(l.valeur || "").trim()), lues: Date.now() };
  }
  return [...new Set([...secrets, ...clesVault.cles].filter(Boolean))];
}
type Cause = "quota" | "refus" | "sature";
const repos = new Map<string, { jusqua: number; cause: Cause }>(); // clé, modèle ou « clé|modèle » → mis de côté
const auRepos = (k: string): Cause | null => { const r = repos.get(k); return r && r.jusqua > Date.now() ? r.cause : null; };
const mettreDeCote = (k: string, cause: Cause, ms: number) => repos.set(k, { jusqua: Date.now() + ms, cause });
// Raison affichée au conseiller quand toutes les clés ont épuisé leur quota (repérée par l'admin : bandeau d'alerte)
const RAISON_CREDITS = "Plus de crédits IA : toutes les clés Gemini ont atteint leur quota. Awa est hors service, un conseiller doit répondre.";

type Echange = { role: "client" | "assistante"; texte: string };
type ReponseIa = { texte: string; appel: { nom: string; raison: string } | null }; // appel : outil demandé (transfert, annulation)
type ErreurIa = Error & { statut?: number; credits?: boolean }; // credits : toutes les clés sont à court de quota
const erreurIa = (message: string, statut: number): ErreurIa => Object.assign(new Error(message), { statut });

// La fenêtre de discussion affiche du texte brut : on retire le Markdown que le modèle ajoute parfois (**gras**, titres, puces)
const sansMarkdown = (t: string) => t
  .replace(/\*\*(.+?)\*\*/gs, "$1").replace(/__(.+?)__/gs, "$1").replace(/(^|\s)\*(\S[^*\n]*?)\*(?=\s|[.,;:!?]|$)/g, "$1$2")
  .replace(/^#{1,6}\s+/gm, "").replace(/^\s*[*-]\s+/gm, "· ").replace(/\n{3,}/g, "\n\n").trim();
const raisonDe = (args: unknown) => String((args as { raison?: string } | undefined)?.raison || "Demande à reprendre par un conseiller.");

async function appelerGemini(cle: string, modele: string, systeme: string, echanges: Echange[], outils: Anthropic.Tool[]): Promise<ReponseIa> {
  // Gemini attend une alternance user / model : deux messages consécutifs du même côté sont réunis
  const contents: { role: string; parts: { text: string }[] }[] = [];
  for (const e of echanges) {
    const role = e.role === "client" ? "user" : "model";
    const dernier = contents.at(-1);
    if (dernier?.role === role) dernier.parts[0].text += `\n\n${e.texte}`;
    else contents.push({ role, parts: [{ text: e.texte }] });
  }
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": cle },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systeme }] },
      contents,
      // mêmes outils que pour Claude ; un outil sans paramètre est déclaré sans « parameters »
      tools: [{ functionDeclarations: outils.map((o) => {
        const s = o.input_schema as { properties?: Record<string, unknown>; required?: string[] };
        return Object.keys(s.properties || {}).length
          ? { name: o.name, description: o.description, parameters: { type: "object", properties: s.properties, required: s.required || [] } }
          : { name: o.name, description: o.description };
      }) }],
      generationConfig: { maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: "low" } }, // réflexion courte : réponse en 2 à 4 s
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw erreurIa(`Gemini ${modele} : ${r.status} ${j?.error?.message || ""}`.trim(), r.status);
  const parts: { text?: string; thought?: boolean; functionCall?: { name: string; args?: { raison?: string } } }[] = j?.candidates?.[0]?.content?.parts || [];
  const texte = parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("\n").trim();
  const appel = parts.find((p) => p.functionCall && outils.some((o) => o.name === p.functionCall!.name))?.functionCall;
  if (!texte && !appel) throw erreurIa(`Gemini ${modele} : réponse vide (${j?.candidates?.[0]?.finishReason || "inconnu"})`, 0);
  return { texte: sansMarkdown(texte), appel: appel ? { nom: appel.name, raison: raisonDe(appel.args) } : null };
}

async function appelerClaude(cle: string, systeme: string, echanges: Echange[], outils: Anthropic.Tool[]): Promise<ReponseIa> {
  const resultat = await new Anthropic({ apiKey: cle }).messages.create({
    model: MODELE_CLAUDE, max_tokens: 1024, system: systeme, tools: outils,
    messages: echanges.map((e) => ({ role: e.role === "client" ? "user" : "assistant", content: e.texte })),
  });
  const texte = resultat.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
  const appel = resultat.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && outils.some((o) => o.name === b.name));
  return { texte: sansMarkdown(texte), appel: appel ? { nom: appel.name, raison: raisonDe(appel.input) } : null };
}

async function demanderIa(cles: string[], systeme: string, echanges: Echange[], outils: Anthropic.Tool[]): Promise<ReponseIa> {
  const debut = Date.now();
  const erreurs: string[] = [];
  const causesCles: Cause[] = []; // pourquoi chaque clé n'a pas répondu (quota ou refus), pour l'alerte finale
  for (const modele of MODELES_GEMINI) {
    if (auRepos(modele)) continue;
    for (let i = 0; i < cles.length && Date.now() - debut < 30000; i++) {
      const cle = cles[i]; // toujours dans l'ordre : la clé 1 d'abord, la suivante quand elle ne peut plus
      const deCote = auRepos(cle) || auRepos(`${cle}|${modele}`);
      if (deCote) { causesCles.push(deCote); continue; }
      try {
        return await appelerGemini(cle, modele, systeme, echanges, outils);
      } catch (e) {
        const statut = (e as ErreurIa).statut;
        const message = (e as Error).message;
        erreurs.push(`clé ${i + 1} · ${message}`);
        if (statut === 429) {                                                     // plus de quota : clé suivante
          // quota du jour épuisé : de côté 1 h (il se recharge chaque jour) ; quota par minute : 1 min
          mettreDeCote(`${cle}|${modele}`, "quota", /per.?day|daily|jour/i.test(message) ? 3600_000 : 60_000);
          causesCles.push("quota");
          continue;
        }
        if (statut === 401 || statut === 403 || (statut === 400 && /api.?key/i.test(message))) {
          mettreDeCote(cle, "refus", 10 * 60_000);                                // clé refusée : clé suivante
          causesCles.push("refus");
          continue;
        }
        if (statut === undefined || statut >= 500) mettreDeCote(modele, "sature", 30_000); // saturé ou trop lent
        break;                                                                    // → modèle suivant
      }
    }
  }
  const cleClaude = Deno.env.get("ANTHROPIC_API_KEY");
  if (cleClaude) {
    try { return await appelerClaude(cleClaude, systeme, echanges, outils); } catch (e) { erreurs.push(`Claude · ${(e as Error).message}`); }
  }
  const echec: ErreurIa = new Error(erreurs.join(" | ") || "Aucune clé d'IA disponible.");
  echec.credits = causesCles.length > 0 && causesCles.every((c) => c === "quota");
  throw echec;
}

/** Offres actuelles, lisibles par l'assistante : par matériau, le prix BTM de chaque fournisseur */
async function contexteOffres(admin: ReturnType<typeof createClient>) {
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
      conv = data;
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
      conv = data;
    }
    const apresInitial = Number(corps.apres) || 0;
    const majConv = async (champs: Record<string, unknown>) => {
      const { data } = await admin.from("support_conversations").update({ ...champs, mis_a_jour_le: new Date().toISOString() }).eq("id", conv!.id).select().single();
      conv = data;
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

    const cles = await clesGemini(admin);
    if (!cles.length && !Deno.env.get("ANTHROPIC_API_KEY")) {
      if (!enAttente) await passerConseiller("Assistante indisponible (aucune clé d'IA configurée).", "Merci pour votre message ! Un conseiller BTM va vous répondre ici même dès que possible.");
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
      const situation = enAttente
        ? "\n\nSituation : un conseiller BTM a été prévenu et va rejoindre cette discussion. En attendant, continue d'aider le client normalement (sans redemander de conseiller : c'est déjà fait).\nSi le client dit qu'il ne veut pas de conseiller, qu'il n'en a plus besoin ou qu'il préfère parler avec toi, tu dois appeler l'outil annuler_conseiller (en plus de ta réponse) : sinon le conseiller le dérangera inutilement."
        : "";
      const systeme = `${CONSIGNES}\n\n${await contexteOffres(admin)}\n\nPage consultée par le client : ${conv.page || "inconnue"}.${conv.nom ? ` Le client s'appelle ${conv.nom}.` : ""}${situation}`;
      const r = await demanderIa(cles, systeme, echanges, enAttente ? [OUTIL_ANNULER] : [OUTIL_TRANSFERT]);
      await majConv({ reponses_ia: conv.reponses_ia + 1 });
      if (r.appel?.nom === OUTIL_TRANSFERT.name) {
        await passerConseiller(r.appel.raison, r.texte || "Je transmets votre demande à un conseiller BTM avec tous les détails : il vous répond ici même.");
      } else if (r.appel?.nom === OUTIL_ANNULER.name) {
        await ajouter("systeme", "Demande de conseiller annulée : vous continuez avec Awa.");
        await majConv({ statut: "ia", raison: null, non_lu: false });
        await ajouter("ia", r.texte || "C’est noté, je reste avec vous. Que puis-je faire pour vous ?");
      } else {
        await ajouter("ia", r.texte || "Pouvez-vous me dire plus précisément ce que vous cherchez ?");
      }
    } catch (e) {
      console.error("Assistante :", e instanceof Error ? e.message : e);
      // déjà en attente d'un conseiller : il est prévenu, inutile de le redire
      // plus de crédits sur aucune clé : alerte claire au conseiller ; sinon panne technique passagère
      if (!enAttente) {
        await passerConseiller((e as ErreurIa).credits ? RAISON_CREDITS : "Assistante indisponible (erreur technique des IA).",
          "Je vous passe un conseiller BTM : il prend le relais et vous répond ici même dès que possible.");
      }
    }
    return reponse(apresInitial);
  } catch (e) {
    return json({ erreur: e instanceof Error ? e.message : "Erreur inattendue." }, 500);
  }
});

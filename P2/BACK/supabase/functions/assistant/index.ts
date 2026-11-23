// Assistance BTM (support client) : Tamilya (API de BTM AI, https://tamilya.yt) répond à partir des vraies offres
// des fournisseurs, et la main passe à un conseiller humain (l'admin) quand la demande la dépasse ou que le client le demande.
// Le navigateur ne touche jamais aux tables : chaque conversation est protégée par un jeton secret.
// Secret obligatoire : TAMILYA_API_KEY (code d'accès tml_…, jamais dans le code ni côté navigateur).
// Tamilya exige aussi une clé Gemini (en-tête X-Gemini-Key) : secrets GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3,
// puis celles de Supabase Vault (gemini_api_key_1, _2… lues par cles_assistant(), migration 0023) ; la suivante prend le relais.
// Sans code Tamilya ou sans clé Gemini, toute demande part directement vers un conseiller.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { envoyerMail } from "./smtpBrut.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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
      "⚠ TAMILYA EST HORS SERVICE : toutes les clés Gemini ont atteint leur quota.",
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
    a: utilisateur, objet: horsService ? `⚠ Tamilya hors service (crédits IA épuisés) — à reprendre : ${qui}` : `Demande d’assistance : ${qui}`, texte, repondreA: conv.email && EMAIL.test(conv.email) ? conv.email : undefined,
  }).catch((e) => console.error("Notification conseiller :", e?.message || e));
}

// Tamilya (https://tamilya.yt/developpeurs/documentation) : API sans mémoire ni outils.
// Conditions (https://tamilya.yt/developpeurs/charte) : ne jamais la renommer ni changer sa personnalité, ne pas lui
// faire demander de données sensibles, clé côté serveur uniquement, et indiquer aux utilisateurs que les réponses
// viennent d'une IA fournie par BTM AI (mention affichée dans la fenêtre de discussion).
const TAMILYA_URL = "https://tamilya.yt/api/v1/tamilya";
const TAMILYA_MAX_MESSAGES = 40, TAMILYA_MAX_MISSION = 2000, TAMILYA_MAX_CONTEXTE = 8000, TAMILYA_MAX_TEXTE = 4000;
// Pas d'appel d'outils chez Tamilya : elle signale un passage au conseiller par ce repère, retiré avant affichage
const REPERE_TRANSFERT = "[CONSEILLER]";

// Mission (≤ 2000 caractères) : uniquement le rôle confié, sans toucher au nom ni à la personnalité de Tamilya
const MISSION = `Tu es l'agent d'accueil du support client de BTM (Bâtiment & Travaux Mayotte), plateforme gratuite qui aide les
particuliers et professionnels de Mayotte à chiffrer leurs travaux et à retirer leurs matériaux chez un fournisseur partenaire
au meilleur prix. Règle toi-même le problème du client quand c'est possible : pose une ou deux questions précises si la demande
est floue, puis donne une solution concrète, étape par étape, avec les menus du site, et demande si c'est réglé.
Réponses brèves (1 à 4 phrases), texte simple sans Markdown, vouvoiement. Ne demande jamais de données sensibles
(papiers d'identité, coordonnées bancaires, santé).
Si le client veut un humain, si tes solutions n'ont pas réglé son problème, ou s'il faut une action de l'équipe (remboursement,
vérification de paiement, devis enregistré à corriger, compte bloqué, litige avec un fournisseur), écris une courte phrase
disant que tu transmets sa demande à un conseiller BTM qui lui répondra ici même, puis termine ta réponse par ${REPERE_TRANSFERT}
suivi d'une phrase résumant la demande pour le conseiller. N'utilise ce repère dans aucun autre cas.`;

const CONSIGNES = `Fonctionnement de BTM :
- Calculateur : « Selon mes mesures » (BTM calcule les quantités) ou « Je sais ce qu'il me faut » (choix direct des matériaux).
- Les résultats comparent les fournisseurs : prix chez chacun, disponibilité, économie par rapport au comptoir.
- En enregistrant son devis (compte gratuit), le client obtient un code de retrait de 8 caractères (ex. K7QM-4XPA) à présenter
  au fournisseur : il paie le « prix BTM », plus bas que le comptoir, sans frais BTM. S'il a choisi un fournisseur dans son devis,
  le code n'est valable que chez lui. Le code figure sur le devis et le PDF.
- Chaque achat avec un code rapporte du crédit fidélité (affiché à côté du nom une fois connecté, déduit au retrait suivant).
- Codes promo BTM et promotions fournisseurs : une fois par client, saisis sur le devis, peuvent expirer.
- Professionnels (SIRET vérifié) : plusieurs ouvrages et achats dans un seul devis.
- Mot de passe oublié : bouton « Connexion » en haut, puis « Mot de passe oublié ? » ; un code arrive par e-mail (vérifier les indésirables).
- E-mail de confirmation : envoyé par contact@btm.yt, vérifier les indésirables et patienter quelques minutes.
- Écart de prix au comptoir : le prix BTM ne s'applique qu'avec le code de retrait ; montrer le devis au fournisseur.
- Modifier ou supprimer son compte : cliquer sur son nom en haut à droite.
Limites : l'assistance ne peut ni modifier un devis, ni annuler un paiement, ni voir le compte du client.
Prix et disponibilités : uniquement les offres ci-dessous ; ne jamais inventer un prix, un fournisseur, un délai ou une promotion.
Quantités : béton courant à 350 kg de ciment par m³, soit 10 sacs de 35 kg par m³ ; volume = surface × épaisseur
(dalle de 4 m² sur 10 cm = 0,4 m³ = 4 sacs). Pour un chiffrage complet, proposer le calculateur « Selon mes mesures ».
Sécurité d'un ouvrage (structure, étanchéité) : principes généraux et recommandation d'un professionnel du bâtiment.`;

// Demandes évidentes, traitées sans appeler l'IA
const VEUT_HUMAIN = /(conseill(er|ère)|\bhumain|une (vraie )?personne|quelqu.un de (chez )?btm|l.?admin\b|l.?équipe btm|parler à quelqu)/i;
const ANNULE_CONSEILLER = /(plus besoin|pas besoin|pas la peine|annul).{0,30}(conseill|humain)|(continuer|rester) avec (toi|vous|tamilya)/i;

// Clés Gemini (en-tête X-Gemini-Key exigé par Tamilya) : secrets d'Edge Functions d'abord, puis Supabase Vault (relu toutes les 5 min)
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
const repos = new Map<string, number>(); // clé Gemini → mise de côté jusqu'à (quota épuisé ou clé refusée)
const auRepos = (k: string) => (repos.get(k) || 0) > Date.now();

// Raison affichée au conseiller quand toutes les clés ont épuisé leur quota (repérée par l'admin : bandeau d'alerte)
const RAISON_CREDITS = "Plus de crédits IA : toutes les clés Gemini ont atteint leur quota. Tamilya est hors service, un conseiller doit répondre.";

type Echange = { role: "client" | "assistante"; texte: string };
type ReponseIa = { texte: string; transfert: string | null }; // transfert : raison pour le conseiller
type ErreurIa = Error & { credits?: boolean }; // credits : toutes les clés sont à court de quota

// La fenêtre de discussion affiche du texte brut : on retire le Markdown éventuel (**gras**, titres, puces)
const sansMarkdown = (t: string) => t
  .replace(/\*\*(.+?)\*\*/gs, "$1").replace(/__(.+?)__/gs, "$1").replace(/(^|\s)\*(\S[^*\n]*?)\*(?=\s|[.,;:!?]|$)/g, "$1$2")
  .replace(/^#{1,6}\s+/gm, "").replace(/^\s*[*-]\s+/gm, "· ").replace(/\n{3,}/g, "\n\n").trim();

/** Messages au format Tamilya : alternance user / assistant, 40 au plus, le premier et le dernier venant du client */
function messagesTamilya(echanges: Echange[]) {
  const messages: { role: "user" | "assistant"; content: string }[] = [];
  for (const e of echanges) {
    const texte = e.texte.trim();
    if (!texte) continue;
    const role = e.role === "client" ? "user" : "assistant";
    const dernier = messages.at(-1);
    if (dernier?.role === role) dernier.content = `${dernier.content}\n\n${texte}`.slice(0, TAMILYA_MAX_TEXTE);
    else messages.push({ role, content: texte.slice(0, TAMILYA_MAX_TEXTE) });
  }
  const derniers = messages.slice(-TAMILYA_MAX_MESSAGES);
  while (derniers.length && derniers[0].role !== "user") derniers.shift();
  return derniers;
}

async function demanderTamilya(code: string, clesG: string[], contexte: string, echanges: Echange[]): Promise<ReponseIa> {
  const messages = messagesTamilya(echanges);
  if (!messages.length || messages.at(-1)!.role !== "user") throw new Error("Tamilya : aucun message client à envoyer.");
  const corps = JSON.stringify({ mission: MISSION.slice(0, TAMILYA_MAX_MISSION), context: contexte.slice(0, TAMILYA_MAX_CONTEXTE), messages });
  const erreurs: string[] = [];
  let quotas = 0;
  for (let i = 0; i < clesG.length; i++) {
    const cle = clesG[i]; // la clé 1 d'abord, la suivante quand elle ne peut plus
    if (auRepos(cle)) { quotas++; continue; }
    const r = await fetch(TAMILYA_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${code}`, "X-Gemini-Key": cle, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(60000), // la documentation conseille d'attendre au moins 60 s
      body: corps,
    }).catch((e) => { erreurs.push(`clé ${i + 1} · réseau : ${e?.message || e}`); return null; });
    if (!r) break;
    const j = await r.json().catch(() => ({}));
    if (r.ok && typeof j?.reply === "string" && j.reply.trim()) {
      const brut = j.reply as string;
      const pos = brut.indexOf(REPERE_TRANSFERT);
      const texte = sansMarkdown(pos >= 0 ? brut.slice(0, pos) : brut);
      const transfert = pos >= 0 ? (brut.slice(pos + REPERE_TRANSFERT.length).trim().slice(0, 300) || "Demande à reprendre par un conseiller.") : null;
      return { texte, transfert };
    }
    const codeErreur = String(j?.error || r.status);
    erreurs.push(`clé ${i + 1} · Tamilya ${r.status} ${codeErreur}`);
    if (codeErreur === "gemini_quota") { repos.set(cle, Date.now() + 3600_000); quotas++; continue; } // clé Gemini suivante
    if (codeErreur === "invalid_gemini_key") { repos.set(cle, Date.now() + 10 * 60_000); continue; }
    break; // code Tamilya refusé, limite atteinte, maintenance… : inutile d'essayer une autre clé Gemini
  }
  const echec: ErreurIa = new Error(erreurs.join(" | ") || "Aucune clé Gemini disponible pour Tamilya.");
  echec.credits = clesG.length > 0 && quotas === clesG.length;
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
    // En attente d'un conseiller (« attente ») : Tamilya continue d'aider, le client n'est jamais laissé sans réponse.
    let enAttente = conv.statut === "attente";
    if (conv.statut === "humain" || enAttente) await majConv({ non_lu: true });
    if (conv.statut === "humain") return reponse(apresInitial);

    // Tamilya n'a pas d'outils : les demandes évidentes de conseiller (ou d'annulation) sont repérées ici
    if (!enAttente && VEUT_HUMAIN.test(texte) && !ANNULE_CONSEILLER.test(texte)) {
      await passerConseiller("Le client a demandé à parler à un conseiller.", "Je vous mets en relation avec un conseiller BTM. Il vous répond ici même dès que possible — vous pouvez déjà lui expliquer votre demande.");
      return reponse(apresInitial);
    }
    if (enAttente && ANNULE_CONSEILLER.test(texte)) {
      await ajouter("systeme", "Demande de conseiller annulée : vous continuez avec Tamilya.");
      await majConv({ statut: "ia", raison: null, non_lu: false });
      enAttente = false;
    }

    if (conv.reponses_ia >= MAX_REPONSES_IA) {
      if (!enAttente) await passerConseiller("Conversation longue : limite de l'assistante atteinte.", "Pour aller plus loin, je vous passe un conseiller BTM : il vous répond ici même dès que possible.");
      return reponse(apresInitial);
    }

    if (await limiteAtteinte("assistant-message", MAX_MESSAGES_HEURE)) {
      await ajouter("ia", "Vous m’avez envoyé beaucoup de messages en peu de temps : patientez un peu avant de continuer, ou demandez à parler à un conseiller.");
      return reponse(apresInitial);
    }

    const codeTamilya = Deno.env.get("TAMILYA_API_KEY")?.trim() || "";
    const cles = await clesGemini(admin);
    if (!codeTamilya || !cles.length) {
      if (!enAttente) await passerConseiller("Assistante indisponible (secret TAMILYA_API_KEY ou clé Gemini manquant).", "Merci pour votre message ! Un conseiller BTM va vous répondre ici même dès que possible.");
      return reponse(apresInitial);
    }

    // Historique : client → client ; assistante et conseiller → assistante ; messages système ignorés
    const { data: historique } = await admin.from("support_messages").select("auteur, texte")
      .eq("conversation_id", conv.id).neq("auteur", "systeme").order("id", { ascending: false }).limit(20);
    const echanges: Echange[] = (historique || []).reverse().map((m) => ({
      role: m.auteur === "client" ? "client" : "assistante",
      texte: m.auteur === "conseiller" ? `(Message du conseiller BTM) ${m.texte}` : m.texte,
    }));

    try {
      const situation = enAttente
        ? "\n\nSituation : un conseiller BTM a été prévenu et va rejoindre cette discussion. En attendant, continue d'aider le client normalement, sans redemander de conseiller (c'est déjà fait) et sans utiliser le repère de transfert."
        : "";
      const contexte = `${CONSIGNES}

Page consultée par le client : ${conv.page || "inconnue"}.${conv.nom ? ` Le client s'appelle ${conv.nom}.` : ""}${situation}

${await contexteOffres(admin)}`;
      const r = await demanderTamilya(codeTamilya, cles, contexte, echanges);
      await majConv({ reponses_ia: conv.reponses_ia + 1 });
      if (r.transfert && !enAttente) {
        await passerConseiller(r.transfert, r.texte || "Je transmets votre demande à un conseiller BTM avec tous les détails : il vous répond ici même.");
      } else {
        await ajouter("ia", r.texte || "Pouvez-vous me dire plus précisément ce que vous cherchez ?");
      }
    } catch (e) {
      console.error("Assistante :", e instanceof Error ? e.message : e);
      // déjà en attente d'un conseiller : il est prévenu, inutile de le redire
      // plus de crédits sur aucune clé : alerte claire au conseiller ; sinon panne technique passagère
      if (!enAttente) {
        await passerConseiller((e as ErreurIa).credits ? RAISON_CREDITS : "Assistante indisponible (erreur technique de Tamilya).",
          "Je vous passe un conseiller BTM : il prend le relais et vous répond ici même dès que possible.");
      }
    }
    return reponse(apresInitial);
  } catch (e) {
    return json({ erreur: e instanceof Error ? e.message : "Erreur inattendue." }, 500);
  }
});

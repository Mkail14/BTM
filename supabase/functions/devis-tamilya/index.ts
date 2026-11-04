// Devis BTM faits dans la conversation de Tamilya (BTM AI, route /api/btm-devis), de serveur à serveur.
// - « prix » : prix des matériaux et constantes du calculateur, pour que BTM AI calcule comme le site ;
// - « enregistrer » : le devis rejoint « Mes projets » du compte btm.yt qui a la même adresse e-mail
//   (confirmée des deux côtés), et le code de retrait est renvoyé. Les prix y sont recalculés ici.
// Secret : TAMILYA_SECRET (même valeur que BTM_DEVIS_SECRET de BTM AI). Sans lui, la fonction est fermée.
// Déploiement : supabase functions deploy devis-tamilya --no-verify-jwt (appelée sans session Supabase).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { "Content-Type": "application/json" } });

const TYPES = ["mur", "dalle", "fondation", "terrasse", "carrelage"];
const LIBELLES: Record<string, string> = { mur: "Mur", dalle: "Dalle", fondation: "Fondation", terrasse: "Terrasse", carrelage: "Carrelage" };
const MAX_DEVIS_HEURE = 20; // par compte
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/;
// Prix de repli du site (src/donnees/materiaux.js), pour un matériau absent de la table `materiaux`
const PRIX_LOCAUX: Record<string, { libelle: string; unite: string; prix_unitaire: number }> = {
  parpaing: { libelle: "Parpaing 20×20×40 cm", unite: "u", prix_unitaire: 1.9 },
  ciment: { libelle: "Ciment gris (sac 35 kg)", unite: "sac", prix_unitaire: 12.5 },
  sable: { libelle: "Sable de construction", unite: "m³", prix_unitaire: 95 },
  beton: { libelle: "Béton prêt à l’emploi", unite: "t", prix_unitaire: 145 },
  beton_arme: { libelle: "Béton armé (fondations)", unite: "t", prix_unitaire: 155 },
  ferraillage: { libelle: "Treillis soudé / ferraillage", unite: "kg", prix_unitaire: 2.2 },
  acier: { libelle: "Armatures acier HA", unite: "kg", prix_unitaire: 2.6 },
  gravier: { libelle: "Gravier concassé", unite: "t", prix_unitaire: 85 },
  beton_lisse: { libelle: "Finition béton lissé", unite: "m²", prix_unitaire: 15 },
  carrelage_sol: { libelle: "Carrelage de sol intérieur", unite: "m²", prix_unitaire: 30 },
  colle_carrelage: { libelle: "Colle à carrelage (sac 25 kg)", unite: "sac", prix_unitaire: 16 },
  joint_carrelage: { libelle: "Mortier joint carrelage", unite: "kg", prix_unitaire: 3.5 },
};
const arrondi = (n: number, d = 2) => Math.round((n + Number.EPSILON) * 10 ** d) / 10 ** d;

/** Comparaison à durée constante (empreintes SHA-256 des deux valeurs) */
async function memeSecret(donne: string, attendu: string) {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(donne)), crypto.subtle.digest("SHA-256", enc.encode(attendu))]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const texte = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const petit = (v: unknown) => typeof v === "number" ? Number.isFinite(v) : typeof v === "string" && v.length <= 40;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erreur: "Méthode refusée." }, 405);
  const secret = Deno.env.get("TAMILYA_SECRET") || "";
  if (secret.length < 16 || !(await memeSecret(req.headers.get("x-tamilya-secret") || "", secret))) {
    return json({ erreur: "Non autorisé." }, 401);
  }
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const corps = await req.json().catch(() => ({}));

    if (corps.action === "prix") {
      const [{ data: materiaux, error: e1 }, { data: types, error: e2 }] = await Promise.all([
        admin.from("materiaux").select("id, libelle, unite, prix_unitaire"),
        admin.from("types_projets").select("id, parametres"),
      ]);
      if (e1 || e2) {
        console.error("Devis Tamilya, prix :", e1?.message, e2?.message);
        return json({ erreur: "Prix illisibles.", detail: e1?.message || e2?.message }, 500);
      }
      return json({ materiaux, types });
    }

    if (corps.action !== "enregistrer") return json({ erreur: "Action inconnue." }, 400);

    // ---------- Le compte btm.yt de cette adresse ----------
    const email = texte(corps.email, 200).toLowerCase();
    if (!EMAIL.test(email)) return json({ erreur: "Adresse invalide." }, 400);
    const motif = email.replace(/[\\%_]/g, (c) => `\\${c}`); // ilike sans joker : la casse seule est ignorée
    const { data: profils, error: eProfil } = await admin.from("profils").select("id, role, banni_le, banni_jusqua").ilike("email", motif).limit(2);
    // Base illisible : surtout pas « aucun compte » (le client serait envoyé créer un compte qu'il a déjà)
    if (eProfil) {
      console.error("Devis Tamilya, comptes :", eProfil.message);
      return json({ erreur: "Comptes illisibles.", detail: eProfil.message }, 500);
    }
    if (!profils?.length) return json({ erreur: "Aucun compte." }, 404);
    if (profils.length > 1) return json({ erreur: "Plusieurs comptes pour cette adresse." }, 403);
    const profil = profils[0];
    const { data: auth } = await admin.auth.admin.getUserById(profil.id);
    const compte = auth?.user;
    if (!compte || compte.email?.toLowerCase() !== email || !compte.email_confirmed_at) return json({ erreur: "Adresse non confirmée sur btm.yt." }, 404);
    const banni = profil.banni_le && (!profil.banni_jusqua || new Date(profil.banni_jusqua).getTime() > Date.now());
    // Les comptes admin et fournisseur n'utilisent pas le site public (ni devis, ni projets).
    if (banni || profil.role !== "user") return json({ erreur: "Compte non autorisé." }, 403);

    const { data: limite } = await admin.rpc("limite_atteinte", { p_cle: `tamilya-devis:${profil.id}`, p_max: MAX_DEVIS_HEURE, p_fenetre: "1 hour" });
    if (limite === true) return json({ erreur: "Trop de devis en peu de temps." }, 429);

    // ---------- Le devis, revérifié ----------
    const type = String(corps.type || "");
    const resultat = corps.resultat || {};
    if (!TYPES.includes(type) || resultat.type !== type || !Array.isArray(resultat.lignes) || !resultat.lignes.length || resultat.lignes.length > 10) {
      return json({ erreur: "Devis invalide." }, 400);
    }
    const dimensions = corps.dimensions && typeof corps.dimensions === "object" ? corps.dimensions : {};
    const entrees = Object.entries(dimensions);
    if (entrees.length > 10 || !entrees.every(([k, v]) => /^[a-z]{1,20}$/i.test(k) && petit(v))) return json({ erreur: "Mesures invalides." }, 400);

    // Prix de la base (repli : ceux du site, comme le calculateur), jamais ceux reçus
    const { data: materiaux } = await admin.from("materiaux").select("id, libelle, unite, prix_unitaire");
    const prix = new Map(Object.entries(PRIX_LOCAUX).map(([id, m]) => [id, { id, ...m }]));
    for (const m of materiaux || []) prix.set(m.id, m);
    const lignes = [];
    for (const l of resultat.lignes) {
      const m = prix.get(String(l?.id));
      const quantite = arrondi(Number(l?.quantite), 3);
      if (!m || !Number.isFinite(quantite) || quantite < 0 || quantite > 1e6) return json({ erreur: "Matériau ou quantité invalide." }, 400);
      const prixUnitaire = Number(m.prix_unitaire);
      lignes.push({ id: m.id, libelle: m.libelle, unite: m.unite, quantite, prixUnitaire, sousTotal: arrondi(quantite * prixUnitaire) });
    }
    const totalMateriaux = arrondi(lignes.reduce((s, l) => s + l.sousTotal, 0));
    const mesures = (Array.isArray(resultat.mesures) ? resultat.mesures : []).slice(0, 10)
      .filter((m: Record<string, unknown>) => typeof m?.label === "string" && petit(m.valeur))
      .map((m: Record<string, unknown>) => ({ label: texte(m.label, 80), valeur: m.valeur, unite: texte(m.unite, 10), ...(m.principale === true && { principale: true }) }));
    const propre = {
      type, typeLibelle: LIBELLES[type], dimensions, calculeLe: new Date().toISOString(), mesures, lignes, totalMateriaux, total: totalMateriaux,
      source: "tamilya",
    };
    const nom = texte(corps.nom, 120) || `${LIBELLES[type]} (Tamilya)`;

    const { data: projet, error } = await admin.from("projets").insert({
      utilisateur_id: profil.id, nom, type_projet_id: type, dimensions, resultat: propre, cout_total: totalMateriaux,
    }).select("code_retrait").single();
    if (error || !projet) {
      console.error("Devis Tamilya :", error?.message);
      return json({ erreur: "Enregistrement impossible." }, 500);
    }
    return json({ ok: true, code: projet.code_retrait, nom, total: totalMateriaux });
  } catch (e) {
    console.error("Devis Tamilya :", (e as Error)?.message || e);
    return json({ erreur: "Erreur du serveur." }, 500);
  }
});

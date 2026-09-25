// Fonction réservée aux administrateurs : lire / modifier un utilisateur, lui envoyer un e-mail de réinitialisation.
// Le rôle admin est revérifié ici (table profils, avec la clé service) — le navigateur n'est jamais cru sur parole.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ROLES = ["user", "fournisseur", "admin"];
const TYPES = ["particulier", "professionnel", "fournisseur"];
const texte = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!url || !anon || !service) throw new Error("Configuration Supabase incomplète.");

    // 1) Qui appelle ?
    const auth = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: appelant, error: erreurAppelant } = await auth.auth.getUser();
    if (erreurAppelant || !appelant.user) return json({ erreur: "Utilisateur non authentifié." }, 401);

    // 2) Est-il admin ?
    const admin = createClient(url, service);
    const { data: profil } = await admin.from("profils").select("role").eq("id", appelant.user.id).maybeSingle();
    if (profil?.role !== "admin") return json({ erreur: "Accès réservé aux administrateurs." }, 403);

    const corps = await req.json();
    const id = String(corps.id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ erreur: "Utilisateur invalide." }, 400);

    // ---------- Lire ----------
    if (corps.action === "lire") {
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error || !data.user) return json({ erreur: "Utilisateur introuvable." }, 404);
      const { data: p } = await admin.from("profils").select("role, type_profil, nom_affiche").eq("id", id).maybeSingle();
      const m = data.user.user_metadata || {};
      return json({
        id, email: data.user.email, derniereConnexion: data.user.last_sign_in_at,
        pseudo: m.pseudo || "", prenom: m.prenom || "", nom: m.nom || "", telephone: m.telephone || "", civilite: m.civilite || "",
        role: p?.role || "user", type_profil: p?.type_profil || "particulier",
      });
    }

    // ---------- Modifier ----------
    if (corps.action === "modifier") {
      const { data: cible, error } = await admin.auth.admin.getUserById(id);
      if (error || !cible.user) return json({ erreur: "Utilisateur introuvable." }, 404);

      const meta = { ...(cible.user.user_metadata || {}) };
      for (const [cle, max] of [["pseudo", 30], ["prenom", 60], ["nom", 60], ["telephone", 20], ["civilite", 5]] as const) {
        const v = texte(corps[cle], max);
        if (v !== undefined) meta[cle] = v;
      }
      const maj: Record<string, unknown> = { user_metadata: meta };
      const nouvelEmail = texte(corps.email, 254)?.toLowerCase();
      if (nouvelEmail && nouvelEmail !== cible.user.email) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(nouvelEmail)) return json({ erreur: "Adresse e-mail invalide." }, 400);
        maj.email = nouvelEmail;
        maj.email_confirm = true;
      }
      const { error: e1 } = await admin.auth.admin.updateUserById(id, maj);
      if (e1) return json({ erreur: e1.message }, 400);

      const ligne: Record<string, unknown> = { nom_affiche: meta.pseudo || nouvelEmail || cible.user.email?.split("@")[0] };
      if (maj.email) ligne.email = maj.email;
      if (TYPES.includes(corps.type_profil)) ligne.type_profil = corps.type_profil;
      // Un admin ne peut pas modifier son propre rôle (évite de se retirer l'accès par erreur)
      if (ROLES.includes(corps.role) && id !== appelant.user.id) ligne.role = corps.role;
      const { error: e2 } = await admin.from("profils").update(ligne).eq("id", id);
      if (e2) return json({ erreur: e2.message }, 400);
      return json({ ok: true, message: "Utilisateur mis à jour." });
    }

    // ---------- Réinitialisation du mot de passe ----------
    if (corps.action === "reinitialiser") {
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error || !data.user?.email) return json({ erreur: "Utilisateur introuvable." }, 404);
      const origine = typeof corps.origine === "string" && /^https?:\/\/[^\s]+$/.test(corps.origine) ? corps.origine.replace(/\/$/, "") : undefined;
      const { error: e } = await auth.auth.resetPasswordForEmail(data.user.email, origine ? { redirectTo: `${origine}/nouveau-mot-de-passe` } : undefined);
      if (e) return json({ erreur: e.message }, 400);
      return json({ ok: true, message: `E-mail de réinitialisation envoyé à ${data.user.email}.` });
    }

    return json({ erreur: "Action inconnue." }, 400);
  } catch (e) {
    return json({ erreur: e instanceof Error ? e.message : "Erreur inattendue." }, 500);
  }
});

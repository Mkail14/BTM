import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Suppression de son propre compte.
 *  - Client (particulier, professionnel) : le crédit fidélité doit être entièrement utilisé.
 *  - Fournisseur (fermeture depuis Mon compte) : mot de passe du compte et phrase « Je supprime mon compte <nom> »
 *    vérifiés ici, puis la fiche est masquée de l'annuaire (elle reste chez BTM avec ses paiements et son RIB).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Phrase tapée : sans guillemets, espaces et majuscules indifférents, apostrophes typographiques acceptées
const normaliser = (s: unknown) =>
  String(s ?? "").normalize("NFC").replace(/["«»“”]/g, "").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error("Variables Supabase non configurées pour la suppression du compte.");
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: req.headers.get("Authorization") ?? "",
        },
      },
    });

    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData.user) {
      throw new Error("Utilisateur non authentifié.");
    }
    const user = userData.user;
    const corps = await req.json().catch(() => ({}));
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Fournisseur : mot de passe et phrase de confirmation obligatoires
    const { data: profil } = await adminClient.from("profils").select("role, fournisseur_id").eq("id", user.id).maybeSingle();
    let ficheAMasquer: string | null = null;
    if (profil?.role === "fournisseur") {
      const { data: fiche } = profil.fournisseur_id
        ? await adminClient.from("fournisseurs").select("id, nom, actif").eq("id", profil.fournisseur_id).maybeSingle()
        : { data: null };
      const attendu = `Je supprime mon compte ${fiche?.nom || ""}`;
      if (normaliser(corps.confirmation) !== normaliser(attendu)) {
        throw new Error(`Recopiez exactement : ${attendu.trim()}`);
      }
      if (typeof corps.motDePasse !== "string" || !corps.motDePasse || !user.email) {
        throw new Error("Indiquez le mot de passe du compte.");
      }
      // vérification du mot de passe sur un client à part, sans garder la session ouverte
      const verif = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error: eMdp } = await verif.auth.signInWithPassword({ email: user.email, password: corps.motDePasse });
      if (eMdp) throw new Error("Mot de passe incorrect.");
      await verif.auth.signOut();
      // déjà masquée par BTM : rien à masquer ni à rétablir
      ficheAMasquer = fiche?.actif ? fiche.id : null;
    } else {
      // Le crédit fidélité doit être entièrement utilisé avant de pouvoir supprimer le compte
      const { data: solde, error: soldeError } = await authClient.rpc("solde_credit");
      if (soldeError) {
        throw new Error("Impossible de vérifier votre crédit fidélité.");
      }
      if (Number(solde) > 0) {
        const euros = Number(solde).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
        throw new Error(`Il vous reste ${euros} de crédit fidélité. Utilisez-le chez un fournisseur avant de supprimer votre compte.`);
      }
    }

    if (ficheAMasquer) {
      const { error: eFiche } = await adminClient.from("fournisseurs").update({ actif: false }).eq("id", ficheAMasquer);
      if (eFiche) throw new Error("Impossible de retirer votre fiche de l’annuaire.");
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteError) {
      // suppression ratée : la fiche redevient visible
      if (ficheAMasquer) await adminClient.from("fournisseurs").update({ actif: true }).eq("id", ficheAMasquer);
      throw deleteError;
    }

    return new Response(
      JSON.stringify({ ok: true, message: "Compte supprimé." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur de suppression du compte.";
    return new Response(JSON.stringify({ erreur: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

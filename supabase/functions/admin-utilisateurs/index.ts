
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

    /** Compte BTM (vitrine, particulier) : celui de l'e-mail de contact configuré dans /admin, créé s'il n'existe pas */
    async function compteBtm() {
      const { data: contenu } = await admin.from("contenus_site").select("valeur").eq("cle", "contact").maybeSingle();
      const email = String((contenu?.valeur as { email?: string } | null)?.email || "contact@btm.yt").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error("E-mail de contact invalide (Contenu du site → Coordonnées).");
      const { data: existant } = await admin.from("profils").select("id, role").eq("email", email).maybeSingle();
      if (existant) return { ...existant, email };
      const motDePasse = crypto.randomUUID() + crypto.randomUUID(); // jamais utilisé : connexion par lien uniquement
      const { data: cree, error: eCree } = await admin.auth.admin.createUser({
        email, password: motDePasse, email_confirm: true,
        user_metadata: { pseudo: "BTM", prenom: "BTM", nom: "Mayotte" },
      });
      if (eCree || !cree.user) throw new Error(eCree?.message || "Création du compte BTM impossible.");
      await admin.from("profils").upsert({ id: cree.user.id, email, nom_affiche: "BTM", role: "user", type_profil: "particulier" });
      return { id: cree.user.id, role: "user", email };
    }

    // ---------- « Voir le site » : connexion au compte vitrine (particulier) de BTM ----------
    // Uniquement le compte de l'e-mail de contact configuré dans /admin — jamais un autre utilisateur.
    // Le compte est créé s'il n'existe pas ; il ne doit jamais avoir de droits d'administration.
    if (corps.action === "vitrine") {
      const origine = typeof corps.origine === "string" && /^https?:\/\/[^\s]+$/.test(corps.origine) ? corps.origine.replace(/\/$/, "") : undefined;
      const { data: contenu } = await admin.from("contenus_site").select("valeur").eq("cle", "contact").maybeSingle();
      const emailContact = String((contenu?.valeur as { email?: string } | null)?.email || "contact@btm.yt").trim().toLowerCase();
      if (emailContact === appelant.user.email?.toLowerCase()) {
        return json({ erreur: "L’e-mail de contact est celui de votre compte admin : choisissez une autre adresse de contact." }, 400);
      }
      let existant;
      try { existant = await compteBtm(); } catch (e) { return json({ erreur: e instanceof Error ? e.message : "Compte vitrine indisponible." }, 400); }
      const email = existant.email;
      if (existant.role === "admin") {
        return json({ erreur: "Le compte de contact a des droits d’administration : retirez-les (Utilisateurs) avant d’utiliser « Voir le site »." }, 400);
      }

      const { data: lien, error: eLien } = await admin.auth.admin.generateLink({
        type: "magiclink", email, options: origine ? { redirectTo: `${origine}/` } : undefined,
      });
      if (eLien || !lien?.properties?.action_link) return json({ erreur: eLien?.message || "Lien de connexion impossible à générer." }, 400);
      return json({ ok: true, email, lien: lien.properties.action_link });
    }

    // ---------- Accès fournisseur : invitation, statut, relance, retrait ----------
    // L'invitation part par e-mail (service d'envoi de Supabase). Si l'envoi échoue (service e-mail non
    // configuré, quota atteint), on renvoie un lien d'invitation que l'admin transmet lui-même.
    const origineDe = (v: unknown) => (typeof v === "string" && /^https?:\/\/[^\s]+$/.test(v) ? v.replace(/\/$/, "") : undefined);
    const versMotDePasse = (origine?: string) => (origine ? { redirectTo: `${origine}/nouveau-mot-de-passe` } : {});
    const actif = (u: { last_sign_in_at?: string | null }) => !!u.last_sign_in_at;
    /** Statut d'un compte fournisseur, lu dans Auth (le navigateur n'y a pas accès) */
    const statutAcces = (u: { id: string; email?: string; invited_at?: string | null; created_at: string; last_sign_in_at?: string | null }) => ({
      id: u.id, email: u.email, statut: actif(u) ? "actif" : "invite", invite_le: u.invited_at || u.created_at, derniere_connexion: u.last_sign_in_at || null,
    });
    /** Lien de secours : invitation tant que le compte n'est pas activé, sinon choix d'un nouveau mot de passe */
    async function lienDeSecours(email: string, dejaActif: boolean, origine?: string) {
      const { data, error } = await admin.auth.admin.generateLink({ type: dejaActif ? "recovery" : "invite", email, options: versMotDePasse(origine) });
      if (error || !data?.properties?.action_link) throw new Error(error?.message || "Lien impossible à générer.");
      return data.properties.action_link;
    }

    if (corps.action === "acces_fournisseurs") {
      const { data: profils } = await admin.from("profils").select("id, fournisseur_id").eq("role", "fournisseur").not("fournisseur_id", "is", null);
      const acces = [];
      for (const p of profils || []) {
        const { data } = await admin.auth.admin.getUserById(p.id);
        if (data?.user) acces.push({ ...statutAcces(data.user), fournisseur_id: p.fournisseur_id });
      }
      return json({ ok: true, acces });
    }

    if (corps.action === "inviter_fournisseur" || corps.action === "creer_fournisseur") {
      const origine = origineDe(corps.origine);
      const email = texte(corps.email, 254)?.toLowerCase();
      const fournisseurId = String(corps.fournisseur_id || "");
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ erreur: "Adresse e-mail invalide." }, 400);
      if (!/^[0-9a-f-]{36}$/i.test(fournisseurId)) return json({ erreur: "Fournisseur invalide." }, 400);
      const { data: fiche } = await admin.from("fournisseurs").select("id, nom").eq("id", fournisseurId).maybeSingle();
      if (!fiche) return json({ erreur: "Fournisseur introuvable dans l’annuaire." }, 404);

      const { data: existant } = await admin.from("profils").select("id, role, fournisseur_id").eq("email", email).maybeSingle();
      if (existant?.role === "admin") return json({ erreur: "Cette adresse appartient à un administrateur." }, 400);
      if (existant?.role === "fournisseur" && existant.fournisseur_id && existant.fournisseur_id !== fiche.id) {
        return json({ erreur: "Cette adresse est déjà l’accès d’un autre fournisseur." }, 400);
      }
      if (existant) {
        // compte déjà inscrit : relié à la fiche, il se connecte avec ses identifiants habituels
        const { error: eLien } = await admin.from("profils").update({ role: "fournisseur", fournisseur_id: fiche.id, type_profil: "fournisseur" }).eq("id", existant.id);
        if (eLien) return json({ erreur: eLien.message }, 400);
        const { data: u } = await admin.auth.admin.getUserById(existant.id);
        return json({ ok: true, relie: true, envoye: false, acces: u?.user ? statutAcces(u.user) : null });
      }

      const donnees = { pseudo: fiche.nom.slice(0, 30) };
      let envoye = true;
      let lien: string | null = null;
      const { data: invite, error: eInvite } = await admin.auth.admin.inviteUserByEmail(email, { data: donnees, ...versMotDePasse(origine) });
      let utilisateur = invite?.user || null;
      if (eInvite || !utilisateur) {
        // envoi impossible : le compte est créé (ou repris) avec un lien que l'admin transmettra
        envoye = false;
        const { data: gen, error: eGen } = await admin.auth.admin.generateLink({ type: "invite", email, options: { data: donnees, ...versMotDePasse(origine) } });
        if (eGen || !gen?.user) return json({ erreur: eGen?.message || eInvite?.message || "Création du compte impossible." }, 400);
        utilisateur = gen.user;
        lien = gen.properties?.action_link || null;
      }
      // le profil est créé par le déclencheur d'inscription ; on le rattache à la fiche
      const { error: eProfil } = await admin.from("profils").upsert({
        id: utilisateur.id, email, nom_affiche: fiche.nom, role: "fournisseur", fournisseur_id: fiche.id, type_profil: "fournisseur",
      });
      if (eProfil) return json({ erreur: eProfil.message }, 400);
      return json({ ok: true, relie: false, envoye, lien, acces: statutAcces(utilisateur) });
    }

    if (["relancer_fournisseur", "lien_fournisseur", "retirer_fournisseur"].includes(corps.action)) {
      const cibleId = String(corps.id || "");
      if (!/^[0-9a-f-]{36}$/i.test(cibleId)) return json({ erreur: "Compte invalide." }, 400);
      const { data: p } = await admin.from("profils").select("role").eq("id", cibleId).maybeSingle();
      if (p?.role !== "fournisseur") return json({ erreur: "Ce compte n’est pas un accès fournisseur." }, 400);
      const { data: u, error: eU } = await admin.auth.admin.getUserById(cibleId);
      if (eU || !u?.user?.email) return json({ erreur: "Compte introuvable." }, 404);
      const cible = u.user;
      const origine = origineDe(corps.origine);

      // Renvoie l'e-mail : invitation si le compte n'est pas activé, sinon réinitialisation du mot de passe
      if (corps.action === "relancer_fournisseur") {
        const { error } = actif(cible)
          ? await auth.auth.resetPasswordForEmail(cible.email, versMotDePasse(origine))
          : await admin.auth.admin.inviteUserByEmail(cible.email, versMotDePasse(origine));
        if (!error) return json({ ok: true, envoye: true, acces: statutAcces(cible) });
        return json({ ok: true, envoye: false, lien: await lienDeSecours(cible.email, actif(cible), origine), acces: statutAcces(cible) });
      }
      if (corps.action === "lien_fournisseur") {
        return json({ ok: true, lien: await lienDeSecours(cible.email, actif(cible), origine) });
      }
      // Retrait : un compte jamais activé est supprimé ; un compte actif redevient un compte particulier
      if (!actif(cible)) {
        const { error } = await admin.auth.admin.deleteUser(cible.id);
        if (error) return json({ erreur: error.message }, 400);
        return json({ ok: true, supprime: true });
      }
      const { error: eRetrait } = await admin.from("profils").update({ role: "user", fournisseur_id: null, type_profil: "particulier" }).eq("id", cible.id);
      if (eRetrait) return json({ erreur: eRetrait.message }, 400);
      return json({ ok: true, supprime: false });
    }

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

    // ---------- Bannir / lever le bannissement (migration 0022) ----------
    // Le blocage est posé dans Auth (ban_duration) : plus de connexion ni de renouvellement de session,
    // levé automatiquement à la date de fin. profils garde la date, le motif et l'auteur pour l'admin.
    if (corps.action === "bannir") {
      if (id === appelant.user.id) return json({ erreur: "Vous ne pouvez pas bannir votre propre compte." }, 400);
      const aVie = corps.jusqua === null || corps.jusqua === "vie";
      let jusqua: Date | null = null;
      let duree = "876000h"; // « à vie » : 100 ans
      if (!aVie) {
        jusqua = new Date(String(corps.jusqua || ""));
        const heures = Math.ceil((jusqua.getTime() - Date.now()) / 3600000);
        if (Number.isNaN(heures) || heures < 1) return json({ erreur: "La date de fin du bannissement doit être dans le futur." }, 400);
        if (heures > 87600) return json({ erreur: "Au-delà de 10 ans, choisissez un bannissement à vie." }, 400);
        duree = `${heures}h`;
      }
      const { data: cible, error } = await admin.auth.admin.getUserById(id);
      if (error || !cible.user) return json({ erreur: "Utilisateur introuvable." }, 404);
      const { error: eBan } = await admin.auth.admin.updateUserById(id, { ban_duration: duree });
      if (eBan) return json({ erreur: eBan.message }, 400);
      const { error: eProfil } = await admin.from("profils").update({
        banni_le: new Date().toISOString(), banni_jusqua: jusqua ? jusqua.toISOString() : null,
        banni_motif: texte(corps.motif, 300) || null, banni_par: appelant.user.id,
      }).eq("id", id);
      if (eProfil) return json({ erreur: eProfil.message }, 400);
      const fin = jusqua ? `jusqu’au ${jusqua.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Indian/Mayotte" })}` : "à vie";
      return json({ ok: true, message: `${cible.user.email || "Le compte"} est banni ${fin}.` });
    }
    if (corps.action === "debannir") {
      const { error: eBan } = await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
      if (eBan) return json({ erreur: eBan.message }, 400);
      const { error: eProfil } = await admin.from("profils").update({ banni_le: null, banni_jusqua: null, banni_motif: null, banni_par: null }).eq("id", id);
      if (eProfil) return json({ erreur: eProfil.message }, 400);
      return json({ ok: true, message: "Bannissement levé : le compte peut de nouveau se connecter." });
    }

    // ---------- Supprimer définitivement un compte ----------
    // N'importe quel compte, sauf le sien (évite qu'un admin se retire l'accès par erreur).
    // Le crédit fidélité restant est annulé : la preuve (montant, motif, historique des mouvements, auteur) est
    // gardée dans credits_annules et affichée dans l'historique des fonds. Il n'est versé à aucun compte.
    // Projets, profil et lignes de crédit partent avec le compte (on delete cascade) ; avis, paiements et
    // discussions du support sont conservés sans auteur (on delete set null).
    if (corps.action === "supprimer") {
      if (id === appelant.user.id) return json({ erreur: "Vous ne pouvez pas supprimer votre propre compte depuis l’administration." }, 400);
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error || !data.user) return json({ erreur: "Utilisateur introuvable." }, 404);

      const { data: mouvements, error: eCredit } = await admin.from("credits_fidelite").select("montant, libelle, paiement_id, cree_le").eq("utilisateur_id", id).order("cree_le");
      if (eCredit) return json({ erreur: "Impossible de lire le crédit fidélité du compte." }, 400);
      const solde = Math.round((mouvements || []).reduce((s, m) => s + Number(m.montant), 0) * 100) / 100;
      let preuve: number | null = null;
      if (mouvements?.length) {
        const motif = texte(corps.motif, 300);
        if (solde > 0 && !motif) return json({ erreur: "Indiquez le motif : il accompagne l’annulation du crédit restant." }, 400);
        const { data: ligne, error: ePreuve } = await admin.from("credits_annules").insert({
          ancien_utilisateur_id: id, ancien_email: data.user.email || null, montant: Math.max(0, solde),
          motif: motif || "Compte supprimé", mouvements, par: appelant.user.id, par_email: appelant.user.email || null,
        }).select("id").single();
        if (ePreuve || !ligne) return json({ erreur: ePreuve?.message || "Enregistrement de l’annulation du crédit impossible." }, 400);
        preuve = ligne.id;
      }

      const { error: e } = await admin.auth.admin.deleteUser(id);
      if (e) {
        // suppression ratée : le crédit reste au compte, on retire la preuve d'annulation
        if (preuve !== null) await admin.from("credits_annules").delete().eq("id", preuve);
        return json({ erreur: e.message }, 400);
      }
      const euros = solde.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
      const qui = data.user.email ? `Le compte ${data.user.email} a été supprimé` : "Compte supprimé";
      return json({ ok: true, message: solde > 0 ? `${qui} ; ${euros} de crédit annulés (voir l’historique des fonds).` : `${qui}.` });
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

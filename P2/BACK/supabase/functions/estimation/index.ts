// =============================================================================
// BTM — Edge Function Supabase : /functions/v1/estimation
// -----------------------------------------------------------------------------
// Recalcule une estimation côté serveur à partir des prix stockés en base.
// Utile pour : vérifier un résultat client, générer un PDF côté serveur plus
// tard, ou exposer une API publique (POST { type, dimensions }).
// Déploiement : supabase functions deploy estimation
// =============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Dimensions = Record<string, number | string | undefined>;

interface Ligne {
  id: string;
  libelle: string;
  unite: string;
  quantite: number;
  prixUnitaire: number;
  sousTotal: number;
}

const arrondi = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { type, dimensions } = (await req.json()) as { type: string; dimensions: Dimensions };
    if (!type || !dimensions) throw new Error("Paramètres 'type' et 'dimensions' requis");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );

    const [{ data: typeProjet, error: e1 }, { data: materiaux, error: e2 }] = await Promise.all([
      supabase.from("types_projets").select("*").eq("id", type).single(),
      supabase.from("materiaux").select("*"),
    ]);
    if (e1 || !typeProjet) throw new Error("Type de projet inconnu");
    if (e2 || !materiaux) throw new Error("Impossible de charger les matériaux");

    const prix = Object.fromEntries(materiaux.map((m) => [m.id, m]));
    const p = typeProjet.parametres as Record<string, number | Record<string, number>>;
    const num = (k: string) => Number(dimensions[k] ?? 0);
    const ligne = (id: string, quantite: number): Ligne => ({
      id,
      libelle: prix[id].libelle,
      unite: prix[id].unite,
      quantite: arrondi(quantite),
      prixUnitaire: Number(prix[id].prix_unitaire),
      sousTotal: arrondi(quantite * Number(prix[id].prix_unitaire)),
    });

    let lignes: Ligne[] = [];
    let heures = 0, tauxHoraire = 0, livraison = 0;
    const mesures: Record<string, number> = {};

    if (type === "mur") {
      const surfaceBrute = num("longueur") * num("hauteur");
      const surface = Math.max(0, surfaceBrute - num("ouvertures"));
      mesures.surfaceNette = arrondi(surface);
      lignes = [
        ligne("parpaing", Math.ceil((surface / (p.surfaceParpaing as number)) * (p.margeParpaing as number))),
        ligne("ciment", Math.ceil(surface / (p.m2ParSacCiment as number))),
        ligne("sable", surface / (p.m2ParM3Sable as number)),
      ];
      heures = (surface / 10) * (p.heuresPour10m2 as number);
      tauxHoraire = p.tauxHoraire as number;
      livraison = p.livraisonFixe as number;
    } else if (type === "dalle" || type === "terrasse") {
      const surface = num("longueur") * num("largeur");
      const volume = surface * (num("epaisseur") / 100);
      const tonnesBeton = volume * (p.densiteBeton as number);
      mesures.surface = arrondi(surface);
      mesures.volume = arrondi(volume, 3);
      lignes = [
        ligne("beton", tonnesBeton),
        ligne("ferraillage", surface * (p.kgFerParM2 as number)),
        ligne("gravier", volume * (p.tonnesGravierParM3 as number)),
      ];
      if (type === "terrasse") {
        const finition = String(dimensions.finition ?? "carrelage");
        lignes.push(ligne(finition === "beton_lisse" ? "beton_lisse" : "carrelage", surface));
      }
      heures = (surface / 10) * (p.heuresPour10m2 as number);
      tauxHoraire = p.tauxHoraire as number;
      livraison = (p.livraisonFixe as number) + tonnesBeton * (p.livraisonParTonne as number);
    } else if (type === "fondation") {
      const volume = num("longueur") * num("largeur") * num("profondeur");
      const tonnesBeton = volume * (p.densiteBeton as number);
      mesures.volume = arrondi(volume, 3);
      lignes = [ligne("beton_arme", tonnesBeton), ligne("acier", volume * (p.kgAcierParM3 as number))];
      heures = volume * (p.heuresParM3 as number);
      tauxHoraire = p.tauxHoraire as number;
      livraison = (p.livraisonFixe as number) + tonnesBeton * (p.livraisonParTonne as number);
    } else {
      throw new Error("Type de projet non pris en charge");
    }

    const totalMateriaux = arrondi(lignes.reduce((s, l) => s + l.sousTotal, 0));
    const mainOeuvre = { heures: arrondi(heures, 1), tauxHoraire, total: arrondi(heures * tauxHoraire) };
    livraison = arrondi(livraison);
    const total = arrondi(totalMateriaux + mainOeuvre.total + livraison);

    return new Response(
      JSON.stringify({ type, dimensions, mesures, lignes, totalMateriaux, mainOeuvre, livraison, total,
        avertissement: "Estimation indicative — ne constitue pas un devis officiel." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ erreur: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

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
const TAUX_FRAIS_DEFAUT = 1.25;

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

    const [{ data: typeProjet, error: e1 }, { data: materiaux, error: e2 }, { data: frais }] = await Promise.all([
      supabase.from("types_projets").select("*").eq("id", type).single(),
      supabase.from("materiaux").select("*"),
      supabase.from("contenus_site").select("valeur").eq("cle", "frais").maybeSingle(),
    ]);
    // Frais de service BTM (% du coût des travaux), réglés dans /admin — 1,25 % par défaut
    const tauxLu = Number((frais?.valeur as { taux?: unknown } | null)?.taux);
    const tauxFrais = Number.isFinite(tauxLu) && tauxLu >= 0 ? tauxLu : TAUX_FRAIS_DEFAUT;
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
    } else if (type === "carrelage") {
      // carreaux +10 % (coupes, casse), colle en sacs, joint au kg — même formule que le calculateur du site
      const surface = num("longueur") * num("largeur");
      mesures.surface = arrondi(surface);
      lignes = [
        ligne("carrelage_sol", surface * (p.margeCarreaux as number)),
        ligne("colle_carrelage", Math.ceil((surface * (p.kgColleParM2 as number)) / (p.kgParSacColle as number))),
        ligne("joint_carrelage", surface * (p.kgJointParM2 as number)),
      ];
    } else if (type === "fondation") {
      const volume = num("longueur") * num("largeur") * num("profondeur");
      const tonnesBeton = volume * (p.densiteBeton as number);
      mesures.volume = arrondi(volume, 3);
      lignes = [ligne("beton_arme", tonnesBeton), ligne("acier", volume * (p.kgAcierParM3 as number))];
    } else {
      throw new Error("Type de projet non pris en charge");
    }

    const totalMateriaux = arrondi(lignes.reduce((s, l) => s + l.sousTotal, 0));
    // devis « matériaux uniquement » : les frais BTM s'appliquent aux matériaux
    const sousTotal = totalMateriaux;
    const fraisService = { taux: tauxFrais, montant: arrondi((sousTotal * tauxFrais) / 100) };
    const total = arrondi(sousTotal + fraisService.montant);

    return new Response(
      JSON.stringify({ type, dimensions, mesures, lignes, totalMateriaux, sousTotal, fraisService, total,
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

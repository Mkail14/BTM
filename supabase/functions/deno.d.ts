// Types de Deno pour l'éditeur (les fonctions tournent sur Deno, chez Supabase).
declare module "https://esm.sh/@supabase/supabase-js@2" {
  export * from "@supabase/supabase-js";
}

declare const Deno: {
  env: { get(nom: string): string | undefined };
  serve(gestionnaire: (req: Request) => Response | Promise<Response>): void;
};

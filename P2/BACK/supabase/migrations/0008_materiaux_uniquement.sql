-- =============================================================================
-- BTM — Migration 0008 : devis « matériaux uniquement »
-- =============================================================================
-- La main-d'œuvre et la livraison étaient des estimations fictives : elles sont
-- retirées du calcul. Un devis = matériaux + frais de service BTM (calculés sur
-- les matériaux).
--   * types_projets : suppression des constantes d'heures, de taux horaire et de livraison ;
--   * materiaux     : « Carrelage extérieur posé » devient « Carrelage extérieur » (hors pose) ;
--   * projets       : les estimations déjà enregistrées perdent leur main-d'œuvre et leur
--                     livraison ; total et frais BTM sont recalculés sur les matériaux.
-- Le script peut être relancé sans effet de bord (il ne touche qu'aux anciennes données).
-- NB : la colonne fournisseurs.livraison (le fournisseur livre-t-il ?) est une vraie
--      information de l'annuaire : elle est conservée.
-- =============================================================================

-- ---------- Constantes de calcul ---------------------------------------------
update public.types_projets
set parametres = parametres - 'heuresPour10m2' - 'heuresParM3' - 'tauxHoraire'
                            - 'livraisonFixe' - 'livraisonParTonne' - 'finitions'
where parametres ?| array['heuresPour10m2', 'heuresParM3', 'tauxHoraire', 'livraisonFixe', 'livraisonParTonne', 'finitions'];

update public.types_projets set hypotheses = null
where hypotheses ilike '%main-d%' or hypotheses ilike '%livraison%';

-- ---------- Matériaux --------------------------------------------------------
update public.materiaux set libelle = 'Carrelage extérieur'
where id = 'carrelage' and libelle = 'Carrelage extérieur posé';

-- ---------- Estimations déjà enregistrées ------------------------------------
-- total = matériaux (+ frais BTM au même taux, recalculés sur les matériaux, si le devis en avait)
update public.projets p
set resultat = (p.resultat - 'mainOeuvre' - 'livraison' - 'sousTotal' - 'fraisService' - 'total')
      || case when p.resultat ? 'fraisService'
           then jsonb_build_object(
             'sousTotal', m.materiaux,
             'fraisService', jsonb_build_object('taux', m.taux, 'montant', round(m.materiaux * m.taux / 100, 2)),
             'total', round(m.materiaux + round(m.materiaux * m.taux / 100, 2), 2))
           else jsonb_build_object('total', round(m.materiaux, 2))
         end,
    cout_total = case when p.resultat ? 'fraisService'
                   then round(m.materiaux + round(m.materiaux * m.taux / 100, 2), 2)
                   else round(m.materiaux, 2)
                 end
from (
  select id,
         coalesce((resultat ->> 'totalMateriaux')::numeric, 0)         as materiaux,
         coalesce((resultat -> 'fraisService' ->> 'taux')::numeric, 0) as taux
  from public.projets
) m
where m.id = p.id
  and (p.resultat ? 'mainOeuvre' or p.resultat ? 'livraison');

notify pgrst, 'reload schema';

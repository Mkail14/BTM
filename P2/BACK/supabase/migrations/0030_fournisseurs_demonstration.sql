-- =============================================================================================
-- 0030 — Fournisseurs de démonstration
--   Un fournisseur « de démonstration » figure dans l'annuaire sans être partenaire : ses prix et
--   ses stocks sont fictifs. Le site l'indique (annuaire, accueil, comparateur de prix).
--   Réglé par l'admin uniquement (modifier_ma_fiche ne touche pas cette colonne) ; à décocher
--   dès que l'entreprise a donné son accord et ses vrais prix.
-- =============================================================================================

alter table public.fournisseurs add column if not exists demonstration boolean not null default false;

-- Les fiches créées pendant le développement (aucun accord des entreprises) : ETPC, IBS, Batimax
update public.fournisseurs set demonstration = true where slug in ('etpc', 'ibs', 'batimax');

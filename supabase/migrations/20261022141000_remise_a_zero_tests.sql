-- Remise à zéro des fonds de test (argent fictif) : paiements, crédits fidélité, crédits annulés, reversements
-- et journal des encaissements des fournisseurs. Les comptes, projets, fournisseurs et réglages ne bougent pas.
-- À exécuter UNE fois, avant la mise en ligne réelle.
begin;
delete from public.credits_fidelite;
delete from public.credits_annules;
delete from public.reversements;
delete from public.journal_operations;
delete from public.paiements;
alter sequence if exists public.numero_recu_seq restart with 1;
commit;

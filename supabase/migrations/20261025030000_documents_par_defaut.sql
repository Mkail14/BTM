-- Dossier de validation : deux pièces demandées d'office à chaque nouvelle demande de compte fournisseur, pour que
-- l'entreprise puisse les déposer sans attendre BTM :
--  - l'extrait Kbis (ou l'avis de situation SIRENE d'une entreprise individuelle) : l'entreprise existe, est active,
--    et son représentant légal est connu ;
--  - le RIB au nom de l'entreprise : BTM y rembourse les codes promo et le crédit fidélité.
-- La pièce d'identité et l'attestation d'assurance restent demandées au cas par cas par l'admin.
-- Libellés et consignes identiques à src/donnees/documentsFournisseur.js.

create or replace function public.demander_documents_par_defaut()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.documents_demande_fournisseur (demande_id, type, libelle, consigne) values
    (new.id, 'kbis', 'Extrait Kbis ou avis de situation SIRENE', 'De moins de 3 mois, au nom de l’entreprise (avis SIRENE pour une entreprise individuelle).'),
    (new.id, 'rib', 'RIB de l’entreprise', 'Au nom de l’entreprise : BTM y rembourse les codes promo et le crédit fidélité.');
  return new;
exception when others then
  return new; -- ne bloque jamais l'enregistrement de la demande
end
$$;
drop trigger if exists documents_par_defaut on public.demandes_fournisseur;
create trigger documents_par_defaut after insert on public.demandes_fournisseur
  for each row execute function public.demander_documents_par_defaut();

-- Demandes déjà en attente : les mêmes pièces, si elles n'ont pas déjà été demandées
insert into public.documents_demande_fournisseur (demande_id, type, libelle, consigne)
select d.id, p.type, p.libelle, p.consigne
from public.demandes_fournisseur d
cross join (values
  ('kbis', 'Extrait Kbis ou avis de situation SIRENE', 'De moins de 3 mois, au nom de l’entreprise (avis SIRENE pour une entreprise individuelle).'),
  ('rib', 'RIB de l’entreprise', 'Au nom de l’entreprise : BTM y rembourse les codes promo et le crédit fidélité.')
) as p(type, libelle, consigne)
where d.statut in ('en_attente', 'a_corriger')
  and not exists (select 1 from public.documents_demande_fournisseur x where x.demande_id = d.id and x.type = p.type);

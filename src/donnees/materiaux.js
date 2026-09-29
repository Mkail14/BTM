/**
 * Prix unitaires provisoires des matériaux (section 9 du CDC).
 * Miroir de la table Supabase `materiaux` — utilisé en repli hors-ligne
 * ou quand Supabase n'est pas configuré.
 * ⚠️ Prix indicatifs à vérifier auprès des fournisseurs de Mayotte.
 */
export const materiaux = {
  parpaing:    { id: 'parpaing',    libelle: 'Parpaing 20×20×40 cm',        unite: 'u',   prixUnitaire: 1.9 },
  ciment:      { id: 'ciment',      libelle: 'Ciment gris (sac 35 kg)',      unite: 'sac', prixUnitaire: 12.5 },
  sable:       { id: 'sable',       libelle: 'Sable de construction',        unite: 'm³',  prixUnitaire: 95 },
  beton:       { id: 'beton',       libelle: 'Béton prêt à l’emploi',        unite: 't',   prixUnitaire: 145 },
  beton_arme:  { id: 'beton_arme',  libelle: 'Béton armé (fondations)',      unite: 't',   prixUnitaire: 155 },
  ferraillage: { id: 'ferraillage', libelle: 'Treillis soudé / ferraillage', unite: 'kg',  prixUnitaire: 2.2 },
  acier:       { id: 'acier',       libelle: 'Armatures acier HA',           unite: 'kg',  prixUnitaire: 2.6 },
  gravier:     { id: 'gravier',     libelle: 'Gravier concassé',             unite: 't',   prixUnitaire: 85 },
  carrelage:   { id: 'carrelage',   libelle: 'Carrelage extérieur',          unite: 'm²',  prixUnitaire: 50 },
  beton_lisse: { id: 'beton_lisse', libelle: 'Finition béton lissé',         unite: 'm²',  prixUnitaire: 15 }
}

/** Convertit une liste de lignes Supabase en dictionnaire indexé par id */
export function indexerMateriaux(lignes) {
  return Object.fromEntries(
    lignes.map((m) => [m.id, { id: m.id, libelle: m.libelle, unite: m.unite, prixUnitaire: Number(m.prix_unitaire) }])
  )
}

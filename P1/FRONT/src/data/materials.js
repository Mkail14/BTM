/**
 * Catalogue des matériaux et prix unitaires.
 *
 * ⚠️ Prix indicatifs pour Mayotte (marché local, matériaux en partie importés).
 * À AJUSTER régulièrement selon les tarifs fournisseurs réels — voir la page
 * "Fournisseurs" pour comparer. C'est le seul fichier à modifier pour mettre
 * les prix à jour.
 */
export const MATERIALS = {
  parpaing15: { label: 'Parpaing creux 15 cm (50×20×15)', unit: 'unité', unitPrice: 1.05, category: 'maçonnerie' },
  parpaing20: { label: 'Parpaing creux 20 cm (50×20×20)', unit: 'unité', unitPrice: 1.25, category: 'maçonnerie' },
  ciment: { label: 'Ciment (sac 25 kg)', unit: 'sac', unitPrice: 9.5, category: 'liant' },
  sable: { label: 'Sable de construction', unit: 'tonne', unitPrice: 55, category: 'granulat' },
  gravier: { label: 'Gravier / gravillon', unit: 'tonne', unitPrice: 60, category: 'granulat' },
  treillisSoude: { label: 'Treillis soudé (panneau 2,4 × 1,2 m)', unit: 'panneau', unitPrice: 28, category: 'ferraillage' },
  ferBeton: { label: 'Fer à béton HA12 (barre 6 m)', unit: 'barre', unitPrice: 9, category: 'ferraillage' },
  ligature: { label: 'Fil de ligature (bobine)', unit: 'bobine', unitPrice: 6.5, category: 'ferraillage' },
  revetementTerrasse: { label: 'Revêtement terrasse (carrelage extérieur)', unit: 'm²', unitPrice: 25, category: 'finition' },
  colleCarrelage: { label: 'Colle carrelage (sac 25 kg, ≈5 m²)', unit: 'sac', unitPrice: 18, category: 'finition' },
  jointCarrelage: { label: 'Joint de carrelage (sac 5 kg)', unit: 'sac', unitPrice: 11, category: 'finition' }
}

export const LABOR = {
  dailyRate: 150, // € / jour / ouvrier — taux moyen constaté à Mayotte
  productivity: {
    mur: 12, // m² de mur posés par jour
    dalle: 15, // m² de dalle coulée + tirée par jour
    fondation: 9, // mètres linéaires de fondation par jour
    terrasse: 10 // m² de terrasse posée + revêtue par jour
  }
}

export const DELIVERY = {
  base: 70, // € forfait de base (petit chantier)
  perTonne: 14 // € par tonne de matériaux au-delà de 1 tonne
}

export function getMaterial(key) {
  const material = MATERIALS[key]
  if (!material) {
    throw new Error(`Matériau inconnu dans le catalogue : "${key}"`)
  }
  return material
}

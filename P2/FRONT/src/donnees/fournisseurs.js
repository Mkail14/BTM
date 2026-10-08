/**
 * Annuaire des fournisseurs BTP de Mayotte (section 11 du CDC).
 * Miroir de la table Supabase `fournisseurs` — repli hors-ligne.
 * Les informations doivent être vérifiées et mises à jour si nécessaire (C04).
 */
export const categories = [
  { id: '', libelle: 'Toutes les catégories', icone: 'fa-solid fa-layer-group' },
  { id: 'beton-granulats', libelle: 'Béton & granulats', icone: 'fa-solid fa-cubes' },
  { id: 'materiaux-generaux', libelle: 'Matériaux généraux', icone: 'fa-solid fa-warehouse' },
  { id: 'fer-acier', libelle: 'Fer & acier', icone: 'fa-solid fa-bars' },
  { id: 'carrelage-finition', libelle: 'Carrelage & finitions', icone: 'fa-solid fa-border-all' }
]

export const fournisseurs = [
  {
    id: 'etpc',
    slug: 'etpc',
    nom: 'ETPC',
    categorie_id: 'beton-granulats',
    categorie: 'Béton & granulats',
    commune: 'Koungou',
    adresse: 'ZI de Longoni, 97600 Koungou',
    telephone: '0269 62 04 82',
    site_web: 'https://etpc.yt',
    description: 'Producteur de béton prêt à l’emploi, granulats et sables à Mayotte. Centrale à béton à Longoni, livraison sur toute l’île.',
    livraison: true,
    horaires: 'Lun–Ven 6h30–15h30, Sam 6h30–11h30',
    logo: '/logos/etpc.svg',
    couleur: '#0e7490'
  },
  {
    id: 'ibs',
    slug: 'ibs',
    nom: 'IBS',
    categorie_id: 'beton-granulats',
    categorie: 'Béton & granulats',
    commune: 'Koungou',
    adresse: 'Route nationale, Kawéni – Koungou, 97600',
    telephone: '0269 61 15 50',
    site_web: 'https://ibs-groupe.fr',
    description: 'Béton, agrégats et matériaux de construction. Livraison par toupie et camion benne sur Grande-Terre.',
    livraison: true,
    horaires: 'Lun–Ven 7h00–16h00',
    logo: '/logos/ibs.svg',
    couleur: '#0891b2'
  },
  {
    id: 'batimax',
    slug: 'batimax',
    nom: 'Batimax',
    categorie_id: 'materiaux-generaux',
    categorie: 'Matériaux généraux',
    commune: 'Mamoudzou',
    adresse: 'Kawéni, 97600 Mamoudzou',
    telephone: '0269 61 12 11',
    site_web: 'https://batimax-mayotte.com',
    description: 'Négoce de matériaux généraux : parpaings, ciment, fer à béton, carrelage, outillage et quincaillerie du bâtiment.',
    livraison: true,
    horaires: 'Lun–Sam 7h30–17h00',
    logo: '/logos/batimax.svg',
    couleur: '#f59e0b'
  }
]

export const libelleCategorie = (id) => categories.find((c) => c.id === id)?.libelle || id

/** Normalise une ligne Supabase vers le format front */
export function normaliserFournisseur(ligne) {
  return {
    id: ligne.id,
    slug: ligne.slug,
    nom: ligne.nom,
    categorie_id: ligne.categorie_id,
    categorie: libelleCategorie(ligne.categorie_id),
    commune: ligne.commune,
    adresse: ligne.adresse,
    telephone: ligne.telephone,
    email: ligne.email || null,
    site_web: ligne.site_web,
    description: ligne.description,
    livraison: !!ligne.livraison,
    horaires: ligne.horaires,
    latitude: ligne.latitude ?? null,
    longitude: ligne.longitude ?? null,
    logo: ligne.logo_url || `/logos/${ligne.slug}.svg`,
    couleur: '#0891b2'
  }
}

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

// Fiches FICTIVES (aucune entreprise réelle : ni nom, ni logo, ni téléphone) tant qu'aucun partenaire n'a signé
const exemple = (lettre, categorie_id, categorie, commune, description, couleur) => ({
  id: `exemple-${lettre}`,
  slug: `exemple-${lettre}`,
  nom: `Fournisseur exemple ${lettre.toUpperCase()}`,
  categorie_id,
  categorie,
  commune,
  adresse: null,
  telephone: '',
  site_web: null,
  description: `Fiche fictive : ${description}, pour montrer le fonctionnement du site.`,
  livraison: true,
  horaires: null,
  logo: `/logos/exemple-${lettre}.svg`,
  couleur,
  demonstration: true
})

export const fournisseurs = [
  exemple('a', 'beton-granulats', 'Béton & granulats', 'Koungou', 'centrale à béton et granulats', '#0e7490'),
  exemple('b', 'beton-granulats', 'Béton & granulats', 'Koungou', 'béton et agrégats', '#0891b2'),
  exemple('c', 'materiaux-generaux', 'Matériaux généraux', 'Mamoudzou', 'négoce de matériaux généraux', '#b45309')
]

// catégorie absente de la liste locale (créée par l'admin) : son identifiant, avec une majuscule
export const libelleCategorie = (id) => categories.find((c) => c.id === id)?.libelle || (id ? id[0].toUpperCase() + id.slice(1).replace(/-/g, ' ') : '')

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
    livraison_payante: !!ligne.livraison_payante,
    livraison_tarif: ligne.livraison_tarif || null,
    demonstration: !!ligne.demonstration,
    horaires: ligne.horaires,
    latitude: ligne.latitude ?? null,
    longitude: ligne.longitude ?? null,
    logo: ligne.logo_url || `/logos/${ligne.slug}.svg`,
    couleur: '#0891b2'
  }
}

import logo1 from '../assets/logo-etpc-1.png'
import logo2 from '../assets/logo-IBS.jpg'
import logo3 from '../assets/logo-batimax-v3.jpg'

/**
 * Annuaire fournisseurs — ACTEURS RÉELS DU BTP À MAYOTTE.
 *
 * Coordonnées vérifiées via les sites officiels / annuaires professionnels
 * à la date de rédaction — à recontrôler périodiquement (adresses, tél.,
 * horaires peuvent évoluer). Ce module est structuré pour être remplacé par
 * un appel à une vraie API (voir services/api/apiClient.js) le jour où un
 * backend / une base de données fournisseurs existera.
 */
export const SUPPLIER_CATEGORIES = ['Béton & granulats', 'Matériaux généraux']

export const SUPPLIERS = [
  {
    id: 'etpc',
    name: 'ETPC',
    fullName: 'Entreprise de Travaux Publics et de Concassage',
    category: 'Béton & granulats',
    commune: 'Koungou (Majicavo-Koropa)',
    description:
      "Premier producteur de granulats et de sable de l'île, présent à Mayotte depuis plus de 30 ans. Exploite 3 carrières (Koungou, Mtsamoudou, Pamandzi) et fabrique blocs béton, parpaings, prédalles, poutrelles, pavés et produits d'assainissement.",
    phone: '0269 62 04 82',
    website: 'https://www.etpc-mayotte.fr',
    logo: logo1,
    deliveryAvailable: true
  },
  {
    id: 'ibs',
    name: 'IBS',
    fullName: 'Groupe IBS — Ingénierie Béton Système',
    category: 'Béton & granulats',
    commune: 'Koungou (Carrière de Kangani)',
    description:
      "Entreprise mahoraise fondée en 1996, acteur majeur du BTP à Mayotte à travers plusieurs filiales : béton préfabriqué (parpaings, blocs, poutrelles, hourdis), granulats, béton prêt à l'emploi, armatures (treillis soudés, fers à béton) et négoce de matériaux.",
    phone: '0269 61 15 50',
    website: 'https://www.ibs-groupe.fr',
    logo: logo2,
    deliveryAvailable: true
  },
  {
    id: 'batimax',
    name: 'Batimax',
    fullName: 'Batimax — enseigne du Groupe Cananga',
    category: 'Matériaux généraux',
    commune: 'Mamoudzou (Kawéni)',
    description:
      "Négociant généraliste implanté sur 20 000 m² à Kawéni, avec plus de 10 000 références : matériaux de gros œuvre, plomberie, quincaillerie, outillage, et un espace d'exposition dédié au carrelage. Livraison sur toute l'île.",
    phone: '0269 61 12 11',
    website: 'https://www.batimax-mayotte.com',
    logo: logo3,
    deliveryAvailable: true
  }
]

export function getSuppliersByCategory(category) {
  if (!category || category === 'Toutes') return SUPPLIERS
  return SUPPLIERS.filter((supplier) => supplier.category === category)
}

export function getSupplierById(id) {
  return SUPPLIERS.find((supplier) => supplier.id === id) || null
}

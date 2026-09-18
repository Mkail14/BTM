/**
 * Types de projets (BF01) — miroir de la table Supabase `types_projets`.
 * Les constantes `parametres` correspondent à la section 9 du cahier des charges.
 * Elles sont provisoires et devront être validées avec des professionnels locaux.
 */
export const typesProjets = [
  {
    id: 'mur',
    libelle: 'Mur',
    description: 'Mur en parpaings 20×20×40 cm, avec prise en compte des ouvertures (portes, fenêtres).',
    icone: 'fa-solid fa-building',
    couleur: '#0891b2',
    ordre: 1,
    champs: [
      { nom: 'longueur', label: 'Longueur du mur', unite: 'm', min: 0.1, max: 200, pas: 0.1, placeholder: '10', aide: 'Longueur totale en mètres' },
      { nom: 'hauteur', label: 'Hauteur du mur', unite: 'm', min: 0.1, max: 20, pas: 0.1, placeholder: '2.5', aide: 'Hauteur du mur fini' },
      { nom: 'ouvertures', label: 'Surface des ouvertures', unite: 'm²', min: 0, max: 4000, pas: 0.1, placeholder: '3', aide: 'Portes + fenêtres (0 si aucune)', optionnel: true }
    ],
    parametres: {
      surfaceParpaing: 0.08, margeParpaing: 1.05, m2ParSacCiment: 2.5, m2ParM3Sable: 10,
      heuresPour10m2: 8, tauxHoraire: 15, livraisonFixe: 50
    }
  },
  {
    id: 'dalle',
    libelle: 'Dalle',
    description: 'Dalle béton armée sur hérisson de gravier, pour maison, garage ou abri.',
    icone: 'fa-solid fa-layer-group',
    couleur: '#06b6d4',
    ordre: 2,
    champs: [
      { nom: 'longueur', label: 'Longueur', unite: 'm', min: 0.1, max: 200, pas: 0.1, placeholder: '8' },
      { nom: 'largeur', label: 'Largeur', unite: 'm', min: 0.1, max: 200, pas: 0.1, placeholder: '6' },
      { nom: 'epaisseur', label: 'Épaisseur', unite: 'cm', min: 5, max: 60, pas: 1, placeholder: '12', aide: 'Généralement 10 à 15 cm' }
    ],
    parametres: {
      densiteBeton: 2.4, kgFerParM2: 5, tonnesGravierParM3: 0.8,
      heuresPour10m2: 4, tauxHoraire: 20, livraisonFixe: 50, livraisonParTonne: 20
    }
  },
  {
    id: 'fondation',
    libelle: 'Fondation',
    description: 'Semelles filantes en béton armé : volume des fouilles, béton et armatures acier.',
    icone: 'fa-solid fa-mountain',
    couleur: '#0e7490',
    ordre: 3,
    champs: [
      { nom: 'longueur', label: 'Longueur totale des tranchées', unite: 'm', min: 0.1, max: 500, pas: 0.1, placeholder: '30', aide: 'Périmètre + refends' },
      { nom: 'largeur', label: 'Largeur de la tranchée', unite: 'm', min: 0.1, max: 5, pas: 0.05, placeholder: '0.5' },
      { nom: 'profondeur', label: 'Profondeur', unite: 'm', min: 0.1, max: 5, pas: 0.05, placeholder: '0.6' }
    ],
    parametres: {
      densiteBeton: 2.4, kgAcierParM3: 50, heuresParM3: 6, tauxHoraire: 20,
      livraisonFixe: 100, livraisonParTonne: 20
    }
  },
  {
    id: 'terrasse',
    libelle: 'Terrasse',
    description: 'Dalle extérieure avec finition au choix : carrelage ou béton lissé.',
    icone: 'fa-solid fa-umbrella-beach',
    couleur: '#f59e0b',
    ordre: 4,
    champs: [
      { nom: 'longueur', label: 'Longueur', unite: 'm', min: 0.1, max: 200, pas: 0.1, placeholder: '6' },
      { nom: 'largeur', label: 'Largeur', unite: 'm', min: 0.1, max: 200, pas: 0.1, placeholder: '4' },
      { nom: 'epaisseur', label: 'Épaisseur', unite: 'cm', min: 5, max: 60, pas: 1, placeholder: '10' },
      {
        nom: 'finition', label: 'Finition', type: 'select', defaut: 'carrelage',
        options: [
          { valeur: 'carrelage', label: 'Carrelage — 50 €/m²' },
          { valeur: 'beton_lisse', label: 'Béton lissé — 15 €/m²' }
        ]
      }
    ],
    parametres: {
      densiteBeton: 2.4, kgFerParM2: 5, tonnesGravierParM3: 0.8,
      heuresPour10m2: 4, tauxHoraire: 20, livraisonFixe: 50, livraisonParTonne: 20,
      finitions: { carrelage: 50, beton_lisse: 15 }
    }
  }
]

export const trouverTypeProjet = (id) => typesProjets.find((t) => t.id === id) || null

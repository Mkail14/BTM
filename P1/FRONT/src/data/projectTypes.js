/**
 * Catalogue des types de projets supportés par le calculateur.
 * Ajouter un nouveau type de projet = ajouter une entrée ici + une formule
 * dans services/calculations/formulas/ + l'enregistrer dans calculationEngine.js.
 */
export const PROJECT_TYPES = [
  {
    id: 'mur',
    label: 'Mur',
    shortLabel: 'Mur en parpaings',
    description: 'Mur porteur ou de clôture en parpaings (agglomérés creux).',
    unit: 'm²',
    icon: 'wall'
  },
  {
    id: 'dalle',
    label: 'Dalle',
    shortLabel: 'Dalle béton',
    description: 'Dalle en béton armé pour plancher ou sol de bâtiment.',
    unit: 'm³',
    icon: 'slab'
  },
  {
    id: 'fondation',
    label: 'Fondation',
    shortLabel: 'Fondation / semelle',
    description: 'Semelle filante en béton armé pour les fondations.',
    unit: 'm³',
    icon: 'foundation'
  },
  {
    id: 'terrasse',
    label: 'Terrasse',
    shortLabel: 'Terrasse extérieure',
    description: 'Dalle extérieure avec revêtement (carrelage, pierre, béton lissé).',
    unit: 'm²',
    icon: 'terrace'
  }
]

export function getProjectType(id) {
  return PROJECT_TYPES.find((type) => type.id === id) || null
}

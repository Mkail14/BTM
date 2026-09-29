/**
 * Types de projets (BF01) — miroir de la table Supabase `types_projets`.
 * Les constantes `parametres` correspondent à la section 9 du cahier des charges.
 * Elles sont provisoires et devront être validées avec des professionnels locaux.
 * Le tableau est réactif : les textes et constantes modifiés dans /admin
 * (table types_projets) y sont fusionnés au démarrage par `appliquerTypesDistants`.
 */
import { reactive } from 'vue'

export const typesProjets = reactive([
  {
    id: 'mur',
    libelle: 'Mur',
    accroche: 'Parpaings, ciment, sable',
    description: 'Un mur en parpaings, avec ou sans porte et fenêtre',
    sujet: 'Votre mur', sujetPluriel: 'Vos murs',
    hypotheses: 'Parpaings 20×20×40 (+5 % de marge), 1 sac de ciment pour 2,5 m², sable 1 m³ pour 10 m².',
    icone: 'fa-solid fa-building',
    couleur: '#0891b2',
    ordre: 1,
    champs: [
      { nom: 'longueur', question: 'Quelle est la longueur du mur ?', label: 'Longueur du mur', unite: 'm', min: 0.1, max: 200, pas: 0.1, placeholder: '10', aide: 'Longueur totale en mètres' },
      { nom: 'hauteur', question: 'Quelle est la hauteur du mur ?', label: 'Hauteur du mur', unite: 'm', min: 0.1, max: 20, pas: 0.1, placeholder: '2.5', aide: 'Hauteur du mur fini' },
      { nom: 'ouvertures', question: 'Quelle surface font les portes et fenêtres ?', label: 'Surface des ouvertures', unite: 'm²', min: 0, max: 4000, pas: 0.1, placeholder: '3', aide: 'Portes + fenêtres (0 si aucune)', optionnel: true }
    ],
    parametres: {
      surfaceParpaing: 0.08, margeParpaing: 1.05, m2ParSacCiment: 2.5, m2ParM3Sable: 10
    }
  },
  {
    id: 'dalle',
    libelle: 'Dalle',
    accroche: 'Béton, treillis, hérisson',
    description: 'Le sol en béton d’une maison, d’un garage ou d’un abri',
    sujet: 'Votre dalle',
    hypotheses: 'Béton 2,4 t/m³, ferraillage 5 kg/m², gravier 0,8 t/m³.',
    icone: 'fa-solid fa-layer-group',
    couleur: '#06b6d4',
    ordre: 2,
    champs: [
      { nom: 'longueur', question: 'Quelle est la longueur de la dalle ?', label: 'Longueur', unite: 'm', min: 0.1, max: 200, pas: 0.1, placeholder: '8' },
      { nom: 'largeur', question: 'Quelle est la largeur de la dalle ?', label: 'Largeur', unite: 'm', min: 0.1, max: 200, pas: 0.1, placeholder: '6' },
      { nom: 'epaisseur', question: 'Quelle épaisseur pour la dalle ?', label: 'Épaisseur', unite: 'cm', min: 5, max: 60, pas: 1, placeholder: '12', aide: 'Généralement 10 à 15 cm' }
    ],
    parametres: {
      densiteBeton: 2.4, kgFerParM2: 5, tonnesGravierParM3: 0.8
    }
  },
  {
    id: 'fondation',
    libelle: 'Fondation',
    accroche: 'Semelles en béton armé',
    description: 'Les tranchées en béton qui portent la maison',
    sujet: 'Vos fondations',
    hypotheses: 'Béton armé 2,4 t/m³, acier 50 kg/m³.',
    icone: 'fa-solid fa-mountain',
    couleur: '#0e7490',
    ordre: 3,
    champs: [
      { nom: 'longueur', question: 'Quelle longueur de tranchées faut-il creuser au total ?', label: 'Longueur totale des tranchées', unite: 'm', min: 0.1, max: 500, pas: 0.1, placeholder: '30', aide: 'Périmètre + refends' },
      { nom: 'largeur', question: 'Quelle est la largeur de la tranchée ?', label: 'Largeur de la tranchée', unite: 'm', min: 0.1, max: 5, pas: 0.05, placeholder: '0.5' },
      { nom: 'profondeur', question: 'Quelle est la profondeur de la tranchée ?', label: 'Profondeur', unite: 'm', min: 0.1, max: 5, pas: 0.05, placeholder: '0.6' }
    ],
    parametres: {
      densiteBeton: 2.4, kgAcierParM3: 50
    }
  },
  {
    id: 'terrasse',
    libelle: 'Terrasse',
    accroche: 'Carrelage ou béton lissé',
    description: 'Un sol extérieur carrelé ou en béton lissé',
    sujet: 'Votre terrasse',
    hypotheses: 'Calcul d’une dalle (comme ci-dessus) + finition carrelage (50 €/m²) ou béton lissé (15 €/m²).',
    icone: 'fa-solid fa-umbrella-beach',
    couleur: '#f59e0b',
    ordre: 4,
    champs: [
      { nom: 'longueur', question: 'Quelle est la longueur de la terrasse ?', label: 'Longueur', unite: 'm', min: 0.1, max: 200, pas: 0.1, placeholder: '6' },
      { nom: 'largeur', question: 'Quelle est la largeur de la terrasse ?', label: 'Largeur', unite: 'm', min: 0.1, max: 200, pas: 0.1, placeholder: '4' },
      { nom: 'epaisseur', question: 'Quelle épaisseur pour la terrasse ?', label: 'Épaisseur', unite: 'cm', min: 5, max: 60, pas: 1, placeholder: '10', aide: 'Généralement 10 cm' },
      {
        nom: 'finition', question: 'Quelle finition voulez-vous ?', label: 'Finition', type: 'select', defaut: 'carrelage',
        options: [
          { valeur: 'carrelage', label: 'Carrelage — 50 €/m²' },
          { valeur: 'beton_lisse', label: 'Béton lissé — 15 €/m²' }
        ]
      }
    ],
    parametres: {
      densiteBeton: 2.4, kgFerParM2: 5, tonnesGravierParM3: 0.8
    }
  }
])

export const trouverTypeProjet = (id) => typesProjets.find((t) => t.id === id) || null

/** Champs texte modifiables depuis l'admin, fusionnés sur les définitions locales */
const CHAMPS_DISTANTS = ['libelle', 'description', 'accroche', 'hypotheses']

export function appliquerTypesDistants(lignes = []) {
  for (const l of lignes) {
    const t = trouverTypeProjet(l.id)
    if (!t) continue // un type inconnu du front n'a ni formulaire ni formule
    for (const c of CHAMPS_DISTANTS) if (typeof l[c] === 'string' && l[c].trim()) t[c] = l[c]
    // seules les constantes numériques déjà connues sont reprises (pas de clé inventée)
    for (const [k, v] of Object.entries(l.parametres || {})) {
      if (typeof t.parametres[k] === 'number' && v !== '' && Number.isFinite(Number(v))) t.parametres[k] = Number(v)
    }
  }
}

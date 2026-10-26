/**
 * Galerie « Réalisations » de l'accueil — exemples de REPLI seulement.
 * Les réalisations affichées viennent de la table `realisations` (migration 0025), gérée dans
 * Admin → Contenus du site → Réalisations ; ces exemples ne servent que sans Supabase ou avant la migration
 * (la migration les recopie en base comme point de départ).
 * Photos d'exemple : Unsplash (licence libre, usage commercial autorisé) — identifiants photo-1787672358208,
 * 1774931363306, 1788398913509, 1783753445561, 1787672357678, 1764856601179.
 */
export const realisations = [
  {
    id: 'r1', titre: 'Maison familiale', type: 'mur', auteur: 'Amina M.',
    commune: 'Mamoudzou', quartier: 'Kawéni', fournisseur: 'Fournisseur exemple C', annee: 2026,
    detail: '68 m² de murs en parpaings', photo: '/realisations/maison-kaweni.jpg', teintes: ['#1f1f1f', '#111111']
  },
  {
    id: 'r2', titre: 'Dalle de garage', type: 'dalle', auteur: 'Youssouf B.',
    commune: 'Koungou', quartier: 'Longoni', fournisseur: 'Fournisseur exemple A', annee: 2026,
    detail: '32 m² de dalle béton armé', photo: '/realisations/dalle-longoni.jpg', teintes: ['#d97706', '#7c2d12']
  },
  {
    id: 'r3', titre: 'Terrasse vue lagon', type: 'terrasse', auteur: 'Sarah A.',
    commune: 'Dzaoudzi', quartier: 'Labattoir', fournisseur: 'Fournisseur exemple C', annee: 2026,
    detail: '24 m² carrelés', photo: '/realisations/terrasse-labattoir.jpg', teintes: ['#111111', '#2a2a2a']
  },
  {
    id: 'r4', titre: 'Fondations d’extension', type: 'fondation', auteur: 'Nassim R.',
    commune: 'Sada', quartier: 'Centre', fournisseur: 'Fournisseur exemple B', annee: 2025,
    detail: '18 m de semelles filantes', photo: '/realisations/fondation-sada.jpg', teintes: ['#be123c', '#4c0519']
  },
  {
    id: 'r5', titre: 'Mur de clôture', type: 'mur', auteur: 'Fatima S.',
    commune: 'Chirongui', quartier: 'Mramadoudou', fournisseur: 'Fournisseur exemple C', annee: 2025,
    detail: '45 m linéaires', photo: '/realisations/cloture-chirongui.jpg', teintes: ['#7c3aed', '#312e81']
  },
  {
    id: 'r6', titre: 'Dalle de terrasse', type: 'dalle', auteur: 'Ali H.',
    commune: 'Pamandzi', quartier: 'Four à Chaux', fournisseur: 'Fournisseur exemple B', annee: 2025,
    detail: '40 m² de dalle', photo: '/realisations/dalle-pamandzi.jpg', teintes: ['#ea580c', '#9a3412']
  }
]

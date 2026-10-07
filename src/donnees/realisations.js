/**
 * Galerie « Réalisations » de l'accueil : projets d'utilisateurs, avec leur lieu et le fournisseur choisi.
 * EXEMPLES à remplacer par de vrais projets (avec l'accord de leurs auteurs).
 * Photo : déposer le fichier dans /public/realisations/ ; sans photo, un visuel aux couleurs du projet s'affiche.
 * Photos d'exemple : Unsplash (licence libre, usage commercial autorisé) — identifiants photo-1787672358208,
 * 1774931363306, 1788398913509, 1783753445561, 1787672357678, 1764856601179.
 */
export const realisations = [
  {
    id: 'r1', titre: 'Maison familiale', type: 'mur', auteur: 'Amina M.',
    commune: 'Mamoudzou', quartier: 'Kawéni', fournisseur: 'Batimax', annee: 2026,
    detail: '68 m² de murs en parpaings', photo: '/realisations/maison-kaweni.jpg', teintes: ['#0e7490', '#164e63']
  },
  {
    id: 'r2', titre: 'Dalle de garage', type: 'dalle', auteur: 'Youssouf B.',
    commune: 'Koungou', quartier: 'Longoni', fournisseur: 'ETPC', annee: 2026,
    detail: '32 m² de dalle béton armé', photo: '/realisations/dalle-longoni.jpg', teintes: ['#d97706', '#7c2d12']
  },
  {
    id: 'r3', titre: 'Terrasse vue lagon', type: 'terrasse', auteur: 'Sarah A.',
    commune: 'Dzaoudzi', quartier: 'Labattoir', fournisseur: 'Batimax', annee: 2026,
    detail: '24 m² carrelés', photo: '/realisations/terrasse-labattoir.jpg', teintes: ['#0891b2', '#0f766e']
  },
  {
    id: 'r4', titre: 'Fondations d’extension', type: 'fondation', auteur: 'Nassim R.',
    commune: 'Sada', quartier: 'Centre', fournisseur: 'IBS', annee: 2025,
    detail: '18 m de semelles filantes', photo: '/realisations/fondation-sada.jpg', teintes: ['#be123c', '#4c0519']
  },
  {
    id: 'r5', titre: 'Mur de clôture', type: 'mur', auteur: 'Fatima S.',
    commune: 'Chirongui', quartier: 'Mramadoudou', fournisseur: 'Batimax', annee: 2025,
    detail: '45 m linéaires', photo: '/realisations/cloture-chirongui.jpg', teintes: ['#7c3aed', '#312e81']
  },
  {
    id: 'r6', titre: 'Dalle de terrasse', type: 'dalle', auteur: 'Ali H.',
    commune: 'Pamandzi', quartier: 'Four à Chaux', fournisseur: 'IBS', annee: 2025,
    detail: '40 m² de dalle', photo: '/realisations/dalle-pamandzi.jpg', teintes: ['#ea580c', '#9a3412']
  }
]

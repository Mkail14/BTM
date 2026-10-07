/**
 * Textes éditables du site — miroir de la table Supabase `contenus_site`.
 * `contenusParDefaut` sert de repli (hors-ligne, ou section jamais modifiée) ;
 * `sectionsContenus` décrit le formulaire de l'admin (libellés, types de champ, limites).
 */
export const contenusParDefaut = {
  annonce: {
    actif: false,
    type: 'info',
    texte: '',
    lien: '',
    libelleLien: ''
  },
  hero: {
    surtitre: 'Plateforme de devis BTP · Mayotte',
    titre: 'Le devis de vos travaux',
    description: 'Budget, quantités et fournisseurs pour mur, dalle, fondation ou terrasse.',
    boutonPrincipal: 'Faire mon devis',
    boutonSecondaire: 'Annuaire des fournisseurs',
    raccourcisTitre: 'Que voulez-vous construire ?'
  },
  ouvrages: {
    surtitre: 'Ouvrages',
    titre: 'Que construisez-vous ?'
  },
  avis: {
    surtitre: 'Avis',
    titre: 'Ils ont préparé leur chantier avec BTM.',
    vide: 'Aucun avis pour le moment. Soyez le premier à donner le vôtre !',
    bouton: 'Donner mon avis',
    // lien « laisser un avis » de la fiche Google de BTM (colonne centrale de la page d'accueil)
    lienGoogle: ''
  },
  realisations: {
    surtitre: 'Réalisations',
    titre: 'Leurs chantiers, partout à Mayotte.',
    lien: 'Voir les fournisseurs'
  },
  contact: {
    email: 'contact@btm.yt',
    telephone: '0639 94 11 01',
    whatsapp: '0639 94 11 01',
    localisation: 'Mamoudzou, Mayotte (976)'
  },
  // Commission BTM payée par le fournisseur (% des ventes avec code) et part rendue au client en crédit fidélité
  // (% de la commission) — réglées dans « Calculateur & prix ». Le client ne paie aucun frais.
  frais: {
    taux: 1.25,
    fidelite: 25
  },
  pied: {
    description: 'Bâtiment & Travaux Mayotte — plateforme de devis BTP et annuaire des fournisseurs de matériaux à Mayotte.',
    note: 'Plateforme BTM — Devis et accompagnement des travaux à Mayotte',
    mention: 'Vue 3 · Vite · Supabase · Vercel'
  }
}

export const sectionsContenus = [
  {
    cle: 'annonce', titre: 'Bandeau d’annonce', icone: 'fa-solid fa-bullhorn', page: '/',
    description: 'Un message discret affiché en bas de toutes les pages : promotion, fermeture exceptionnelle, nouveauté…',
    champs: [
      { nom: 'actif', label: 'Afficher le bandeau', type: 'interrupteur' },
      { nom: 'type', label: 'Style', type: 'choix', options: [{ valeur: 'info', label: 'Information' }, { valeur: 'succes', label: 'Bonne nouvelle' }, { valeur: 'avertissement', label: 'Avertissement' }] },
      { nom: 'texte', label: 'Message', type: 'long', max: 180, plein: true },
      { nom: 'lien', label: 'Lien (optionnel)', aide: '/calculateur ou https://…', max: 200 },
      { nom: 'libelleLien', label: 'Texte du lien', aide: 'Ex. : En savoir plus', max: 40 }
    ]
  },
  {
    cle: 'hero', titre: 'Accueil — en-tête', icone: 'fa-solid fa-house', page: '/',
    description: 'Le grand bloc d’ouverture de la page d’accueil. Un visiteur connecté voit « Bonjour … » à la place du titre.',
    champs: [
      { nom: 'surtitre', label: 'Surtitre', max: 60 },
      { nom: 'titre', label: 'Titre', max: 60 },
      { nom: 'description', label: 'Description', type: 'long', max: 200, plein: true },
      { nom: 'boutonPrincipal', label: 'Bouton principal', max: 30 },
      { nom: 'boutonSecondaire', label: 'Bouton secondaire', max: 40 },
      { nom: 'raccourcisTitre', label: 'Titre des raccourcis (mobile)', max: 50 }
    ]
  },
  {
    cle: 'ouvrages', titre: 'Accueil — ouvrages', icone: 'fa-solid fa-cubes', page: '/#types-projets',
    description: 'Titre de la section des quatre ouvrages. Les accroches de chaque carte se modifient dans « Calculateur & tarifs ».',
    champs: [
      { nom: 'surtitre', label: 'Surtitre', max: 40 },
      { nom: 'titre', label: 'Titre', max: 80 }
    ]
  },
  {
    cle: 'avis', titre: 'Accueil — avis', icone: 'fa-solid fa-star', page: '/#avis',
    description: 'Textes de la section des avis clients.',
    champs: [
      { nom: 'surtitre', label: 'Surtitre', max: 40 },
      { nom: 'titre', label: 'Titre', max: 90 },
      { nom: 'vide', label: 'Message quand il n’y a aucun avis', type: 'long', max: 160, plein: true },
      { nom: 'bouton', label: 'Bouton', max: 30 },
      { nom: 'lienGoogle', label: 'Lien « Laisser un avis Google »', aide: 'https://g.page/r/… (fiche Google de BTM → Demander des avis)', max: 300, plein: true }
    ]
  },
  {
    cle: 'realisations', titre: 'Accueil — réalisations', icone: 'fa-solid fa-images', page: '/#realisations',
    description: 'Textes de la galerie des projets d’utilisateurs, après les avis.',
    champs: [
      { nom: 'surtitre', label: 'Surtitre', max: 40 },
      { nom: 'titre', label: 'Titre', max: 90 },
      { nom: 'lien', label: 'Bouton vers l’annuaire', max: 30 }
    ]
  },
  {
    cle: 'contact', titre: 'Coordonnées', icone: 'fa-solid fa-address-card', page: '/',
    description: 'Utilisées dans le pied de page, l’aide flottante et les demandes envoyées par e-mail.',
    champs: [
      { nom: 'email', label: 'E-mail de contact', type: 'email', max: 120 },
      { nom: 'telephone', label: 'Téléphone', max: 30 },
      { nom: 'whatsapp', label: 'Numéro WhatsApp', aide: 'Ex. : 0639 94 11 01 (converti automatiquement au format international pour WhatsApp)', max: 20 },
      { nom: 'localisation', label: 'Localisation', max: 80 }
    ]
  },
  {
    cle: 'pied', titre: 'Pied de page', icone: 'fa-solid fa-grip-lines', page: '/',
    description: 'Présentation et mentions affichées en bas de chaque page.',
    champs: [
      { nom: 'description', label: 'Présentation', type: 'long', max: 240, plein: true },
      { nom: 'note', label: 'Note sous le contact', max: 120, plein: true },
      { nom: 'mention', label: 'Mention en bas à droite', max: 80, plein: true }
    ]
  }
]

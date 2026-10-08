/**
 * Questions guidées de l'assistance « Sur le site » : réponses immédiates aux demandes courantes, sans IA.
 * Chaque étape propose des choix (`suite` = étape suivante, `conseiller` = passer la main à un conseiller).
 * Une étape `resolu` demande au visiteur si sa question est réglée ; sinon, Awa (IA) cherche avec lui à partir de
 * son explication (étape `libre`, parcours suivi joint), et passe la main à un conseiller seulement si elle n'y arrive pas.
 * Le bouton « Parler à un conseiller » reste toujours disponible : le visiteur peut demander un humain à tout moment.
 * Un choix `devis` lance le devis fait dans la discussion (useDevisAwa).
 */
export const ETAPES = {
  depart: {
    texte: 'Bonjour, je suis Awa, l’assistante de BTM. Sur quoi puis-je vous aider ?',
    choix: [
      { label: 'Faire un devis', suite: 'devis', icone: 'fa-solid fa-calculator' },
      { label: 'Mon code de retrait ou un achat', suite: 'retrait', icone: 'fa-solid fa-ticket' },
      { label: 'Fournisseurs et prix', suite: 'fournisseurs', icone: 'fa-solid fa-truck' },
      { label: 'Mon compte', suite: 'compte', icone: 'fa-solid fa-user' },
      { label: 'Crédit fidélité et codes promo', suite: 'fidelite', icone: 'fa-solid fa-coins' },
      { label: 'Autre question', suite: 'autre', icone: 'fa-regular fa-comment' }
    ]
  },
  devis: {
    texte: 'Je peux faire votre devis ici même : je vous pose quelques questions, je calcule, et le projet est enregistré dans « Mes projets » avec son PDF. Vous préférez le faire vous-même ? Le calculateur donne le même résultat en 2 minutes.',
    lien: { label: 'Ouvrir le calculateur', to: '/calculateur' },
    choix: [{ label: 'Faire mon devis avec Awa', devis: true, icone: 'fa-solid fa-wand-magic-sparkles' }]
  },
  retrait: {
    texte: 'Quel est le souci avec votre retrait ?',
    choix: [
      { label: 'Je n’ai pas de code de retrait', suite: 'retrait-sans' },
      { label: 'Le fournisseur ne trouve pas mon code', suite: 'retrait-introuvable' },
      { label: 'Un problème de prix ou de paiement', suite: 'paiement' }
    ]
  },
  paiement: {
    texte: 'Expliquez-moi ce qui s’est passé : le fournisseur, le montant attendu et celui payé, et votre code de retrait si vous l’avez. Je regarde avec vous.',
    libre: true
  },
  'retrait-sans': {
    texte: 'Le code apparaît quand vous enregistrez votre devis (compte gratuit) : ouvrez votre devis et cliquez sur « Enregistrer ». Le code, par exemple K7QM-4XPA, s’affiche alors et figure aussi sur le PDF.',
    lien: { label: 'Mes projets', to: '/dashboard' },
    resolu: true
  },
  'retrait-introuvable': {
    texte: 'Vérifiez que votre devis est bien enregistré et que le code est saisi en entier (8 caractères, par exemple K7QM-4XPA). Si vous avez choisi un fournisseur dans votre devis, le code n’est valable que chez lui.',
    resolu: true
  },
  fournisseurs: {
    texte: 'L’annuaire présente les fournisseurs partenaires de Mayotte. Dans vos résultats de devis, BTM compare le prix exact chez chacun, ce qu’ils ont en stock et l’économie par rapport au comptoir.',
    lien: { label: 'Voir les fournisseurs', to: '/fournisseurs' },
    resolu: true
  },
  compte: {
    texte: 'Que se passe-t-il avec votre compte ?',
    choix: [
      { label: 'J’ai oublié mon mot de passe', suite: 'mot-de-passe' },
      { label: 'Je n’ai pas reçu l’e-mail de confirmation', suite: 'confirmation' },
      { label: 'Modifier ou supprimer mon compte', suite: 'modifier' },
      { label: 'Un autre souci de compte', suite: 'compte-autre' }
    ]
  },
  'compte-autre': {
    texte: 'Décrivez-moi le souci : ce que vous essayez de faire et le message qui s’affiche. Je cherche une solution avec vous.',
    libre: true
  },
  'mot-de-passe': {
    texte: 'Dans la fenêtre de connexion, cliquez sur « Mot de passe oublié ? » : vous recevez un code par e-mail, à saisir sur le site pour choisir un nouveau mot de passe. Pensez à regarder vos courriers indésirables.',
    // ouvre la fenêtre de connexion directement sur « Mot de passe oublié » (sur la page en cours)
    lien: { label: 'Mot de passe oublié', to: { query: { connexion: '1', oubli: '1' } } },
    resolu: true
  },
  confirmation: {
    texte: 'L’e-mail vient de contact@btm.yt et arrive parfois dans les courriers indésirables. S’il n’est toujours pas là après quelques minutes, un conseiller peut vérifier votre compte.',
    resolu: true
  },
  modifier: {
    texte: 'Une fois connecté, cliquez sur votre nom en haut à droite : vous pouvez modifier vos informations et votre mot de passe, ou supprimer votre compte.',
    resolu: true
  },
  fidelite: {
    texte: 'Chaque achat payé avec un code de retrait vous rapporte du crédit fidélité, affiché à côté de votre nom une fois connecté : le fournisseur le déduit de votre prochain retrait. Un code promo BTM se saisit sur votre devis et ne sert qu’une fois par compte.',
    resolu: true
  },
  autre: {
    texte: 'Je vous écoute : écrivez votre question ci-dessous.',
    libre: true
  },
  // réponse guidée sans effet : Awa cherche avec le visiteur avant tout passage à un conseiller
  'pas-regle': {
    texte: 'D’accord, cherchons ensemble. Dites-moi ce qui bloque exactement : ce qui s’affiche, à quelle étape, chez quel fournisseur…',
    libre: true
  }
}


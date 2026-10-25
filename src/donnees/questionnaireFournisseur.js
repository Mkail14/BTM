/**
 * Questions posées à une entreprise qui crée son compte fournisseur (« Devenir partenaire »), en plus de ses
 * coordonnées : ce qui aide BTM à valider le compte et à préparer l'ouverture (catalogue, retraits en caisse).
 * Réponses gardées dans demandes_fournisseur.questionnaire (migration 20261025010000), lues par l'admin.
 */
export const QUESTIONNAIRE = {
  // les catégories vendues (plusieurs) sont aussi gardées dans le questionnaire : questionnaire.categories
  equipe: {
    libelle: 'Taille de l’équipe',
    options: [
      { valeur: '1-5', libelle: '1 à 5' },
      { valeur: '6-20', libelle: '6 à 20' },
      { valeur: '21-50', libelle: '21 à 50' },
      { valeur: '50+', libelle: 'Plus de 50' }
    ]
  },
  logiciel: {
    libelle: 'Votre logiciel de caisse ou de stock',
    options: [
      { valeur: 'odoo', libelle: 'Odoo' },
      { valeur: 'sage_ebp', libelle: 'Sage ou EBP' },
      { valeur: 'autre', libelle: 'Un autre' },
      { valeur: 'aucun', libelle: 'Aucun' }
    ]
  }
}

/** Libellé lisible d'une réponse (« Pros du BTP »), ou '—' */
export const reponse = (question, valeur) => QUESTIONNAIRE[question]?.options.find((o) => o.valeur === valeur)?.libelle || '—'

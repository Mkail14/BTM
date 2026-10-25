/**
 * Pièces que BTM peut demander à une entreprise avant de valider son compte fournisseur
 * (Admin → Fournisseurs → Demandes → Dossier). Le contrat de partenariat, lui, se signe en ligne (contratPartenaire.js).
 * Le Kbis et le RIB sont demandés d'office à chaque nouvelle demande (migration 20261025030000, mêmes libellés) ;
 * la pièce d'identité et l'assurance, au cas par cas.
 */
export const DOCUMENTS = [
  { type: 'kbis', libelle: 'Extrait Kbis ou avis de situation SIRENE', consigne: 'De moins de 3 mois, au nom de l’entreprise (avis SIRENE pour une entreprise individuelle).', icone: 'fa-solid fa-building', parDefaut: true },
  { type: 'identite', libelle: 'Pièce d’identité du représentant légal', consigne: 'Carte d’identité ou passeport en cours de validité, recto verso.', icone: 'fa-solid fa-id-card' },
  { type: 'rib', libelle: 'RIB de l’entreprise', consigne: 'Au nom de l’entreprise : BTM y rembourse les codes promo et le crédit fidélité.', icone: 'fa-solid fa-building-columns', parDefaut: true },
  { type: 'assurance', libelle: 'Attestation d’assurance responsabilité civile professionnelle', consigne: 'En cours de validité.', icone: 'fa-solid fa-shield-halved' }
]
export const DOCUMENT_AUTRE = { type: 'autre', libelle: '', consigne: '', icone: 'fa-solid fa-file-lines' }
export const iconeDocument = (type) => (DOCUMENTS.find((d) => d.type === type) || DOCUMENT_AUTRE).icone

/** Fichiers acceptés : PDF ou photo, 10 Mo au plus (même règle que le stockage) */
export const TYPES_FICHIERS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
export const TAILLE_MAX = 10 * 1024 * 1024

export const STATUTS_DOCUMENT = {
  a_fournir: { libelle: 'À fournir', classe: 'attente' },
  envoye: { libelle: 'Envoyé, en vérification', classe: 'envoye' },
  valide: { libelle: 'Validé', classe: 'valide' },
  refuse: { libelle: 'Refusé', classe: 'refuse' }
}

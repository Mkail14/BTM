/**
 * Contrat de partenariat fournisseur, lu et signé par l'entreprise dans son dossier de validation.
 * La version signée est enregistrée avec la signature (demandes_fournisseur.contrat_version) : toute modification
 * du texte doit changer VERSION, pour savoir quelle version chaque fournisseur a acceptée.
 * Les éléments entre crochets dans IDENTITE_BTM sont à compléter avant la mise en service.
 */
import { formaterNombre } from '@/services/calculs/moteurCalculs.js'
import { formaterSiret } from '@/services/entreprises.js'

export const VERSION = '2026-10-25'
export const DATE_VERSION = '25 octobre 2026'

export const IDENTITE_BTM = {
  nom: 'BTM — Bâtiment & Travaux Mayotte',
  forme: '[forme juridique et capital]',
  siren: '[numéro SIREN]',
  adresse: '[adresse du siège], 97600 Mamoudzou',
  representant: '[nom et qualité du représentant]',
  email: 'contact@btm.yt'
}

/**
 * Le contrat d'une demande (demandes_fournisseur) : texte complété, et signature enregistrée s'il est signé.
 * Sert à la signature, à la feuille lue à côté et au PDF.
 * @param {object} d demande
 * @param {number} taux commission BTM en %
 */
export function contratDeLaDemande(d, taux) {
  const date = d.contrat_signe_le ? new Date(d.contrat_signe_le).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' }) : ''
  return {
    entreprise: d.entreprise,
    articles: articles({ entreprise: d.entreprise, siret: formaterSiret(d.siret || '') || '—', commune: d.commune || '—', adresse: d.adresse, taux: `${formaterNombre(taux, 2)} %` }),
    signature: d.contrat_signe_le ? { trace: d.contrat_signature, signataire: d.contrat_signataire, qualite: d.contrat_qualite, date, version: d.contrat_version } : null
  }
}

/**
 * Articles du contrat, complétés avec les informations de l'entreprise.
 * @param {{ entreprise: string, siret: string, commune: string, adresse?: string, taux: string }} p
 * @returns {{ titre: string, texte: string[] }[]}
 */
export function articles({ entreprise, siret, commune, adresse, taux }) {
  return [
    {
      titre: 'Les parties',
      texte: [
        `${IDENTITE_BTM.nom}, ${IDENTITE_BTM.forme}, SIREN ${IDENTITE_BTM.siren}, dont le siège est ${IDENTITE_BTM.adresse}, représentée par ${IDENTITE_BTM.representant}, ci-après « BTM ».`,
        `${entreprise}, SIRET ${siret}, établie ${adresse ? `${adresse}, ` : ''}${commune} (Mayotte), représentée par la personne qui signe ci-dessous, ci-après « le Fournisseur ».`
      ]
    },
    {
      titre: '1. Objet',
      texte: [
        'BTM édite la plateforme btm.yt, qui aide les particuliers et les professionnels de Mayotte à estimer les matériaux de leurs travaux et à les acheter chez des fournisseurs partenaires.',
        'Le présent contrat fixe les conditions dans lesquelles le Fournisseur est présenté sur la plateforme, reçoit les clients qui viennent avec un code de retrait BTM et verse à BTM une commission sur ces ventes.',
        'BTM est un intermédiaire : il ne vend, n’achète, ne stocke ni ne livre aucun matériau. Le Fournisseur reste le seul vendeur auprès du client.'
      ]
    },
    {
      titre: '2. Définitions',
      texte: [
        'Client : toute personne qui prépare un devis ou un achat sur la plateforme.',
        'Code de retrait : code unique attaché à un devis enregistré par le Client, qu’il présente au Fournisseur au moment de l’achat.',
        'Prix BTM : prix que le Fournisseur accorde, produit par produit, au Client qui présente un code de retrait. Prix comptoir : prix habituel du Fournisseur sans code.',
        'Espace fournisseur : espace réservé au Fournisseur sur la plateforme (catalogue, prix, stocks, devis reçus, encaissements, paiements).',
        'Vente BTM : vente encaissée par le Fournisseur sur présentation d’un code de retrait et enregistrée dans l’Espace fournisseur.'
      ]
    },
    {
      titre: '3. Ouverture du compte',
      texte: [
        'Le Fournisseur certifie l’exactitude des informations fournies à l’inscription et s’engage à les tenir à jour.',
        'Avant d’ouvrir l’Espace fournisseur, BTM peut demander des pièces justificatives, notamment un extrait Kbis de moins de trois mois, la pièce d’identité du représentant légal, un RIB au nom de l’entreprise et une attestation d’assurance responsabilité civile professionnelle.',
        'BTM reste libre d’accepter ou de refuser une demande. Le contrat prend effet le jour où BTM valide le compte.'
      ]
    },
    {
      titre: '4. Engagements du Fournisseur',
      texte: [
        'Tenir à jour dans son Espace fournisseur son catalogue, ses prix BTM, ses stocks et ses ruptures, ainsi que ses coordonnées et horaires.',
        'Appliquer le prix BTM affiché au Client qui présente un code de retrait valide, dans la limite des stocks disponibles.',
        'Enregistrer chaque Vente BTM dans l’Espace fournisseur au moment de l’encaissement, à partir du code de retrait du Client. Une vente faite avec un code de retrait mais non enregistrée reste due au titre de la commission.',
        'Remettre au Client des produits conformes à leur description et lui délivrer la facture ou le ticket de caisse correspondant. Les garanties légales dues au Client sont à la charge du Fournisseur.',
        'Assurer lui-même la livraison qu’il propose, aux conditions et tarifs qu’il affiche.',
        'Respecter la réglementation applicable à son activité et ne pas utiliser la plateforme pour détourner les Clients vers des ventes sans code de retrait.'
      ]
    },
    {
      titre: '5. Engagements de BTM',
      texte: [
        'Présenter le Fournisseur dans l’annuaire et dans les comparaisons de prix de la plateforme, sur la base des informations qu’il renseigne.',
        'Mettre à sa disposition l’Espace fournisseur et ses outils : catalogue, import de fichiers, devis reçus, encaissement des codes de retrait, suivi des paiements.',
        'Mettre en œuvre les moyens raisonnables pour que la plateforme fonctionne de façon continue, sans pouvoir garantir l’absence d’interruption (maintenance, panne, cause extérieure).',
        'Informer le Fournisseur de toute évolution importante de la plateforme qui le concerne.'
      ]
    },
    {
      titre: '6. Prix',
      texte: [
        'Le Fournisseur fixe librement ses prix BTM et ses prix comptoir. Le prix BTM ne peut pas être supérieur au prix comptoir du même produit.',
        'Le prix appliqué au Client est le prix BTM en vigueur dans l’Espace fournisseur au moment de l’encaissement.'
      ]
    },
    {
      titre: '7. Commission de BTM',
      texte: [
        `Pour chaque Vente BTM, le Fournisseur doit à BTM une commission de ${taux} du montant des matériaux vendus, calculée automatiquement à l’encaissement et visible dans l’Espace fournisseur.`,
        'Le Fournisseur verse les commissions par virement sur le compte bancaire de BTM indiqué dans l’Espace fournisseur, selon la périodicité qui y est affichée (par défaut chaque mois, au plus tard le 5 du mois suivant), puis le signale dans l’Espace fournisseur.',
        'Une Vente BTM annulée depuis l’Espace fournisseur, avec un motif, ne donne pas lieu à commission.',
        'En cas de retard de paiement, BTM peut, après une relance restée sans effet pendant quinze jours, suspendre la présentation du Fournisseur sur la plateforme jusqu’au règlement.'
      ]
    },
    {
      titre: '8. Codes promo et crédit fidélité',
      texte: [
        'Les codes promo proposés par BTM et le crédit fidélité utilisé par les Clients sont financés par BTM. Le Fournisseur les applique au moment de l’encaissement ; leur montant vient en déduction de la commission due.',
        'Lorsque ce montant dépasse la commission, BTM rembourse la différence au Fournisseur par virement sur le RIB enregistré dans l’Espace fournisseur.',
        'Les promotions que le Fournisseur crée lui-même restent à sa charge.'
      ]
    },
    {
      titre: '9. Avis des clients',
      texte: [
        'Après une Vente BTM, la plateforme peut inviter le Client à donner son avis sur le Fournisseur. Les avis sont publiés tels quels ; le Fournisseur ne peut ni les modifier ni les supprimer, mais il peut signaler à BTM un avis qu’il estime abusif.'
      ]
    },
    {
      titre: '10. Données personnelles',
      texte: [
        'Chaque partie est responsable des données personnelles qu’elle traite et respecte le règlement général sur la protection des données (RGPD).',
        'Le Fournisseur n’utilise les données des Clients transmises par la plateforme (nom, devis, téléphone le cas échéant) que pour préparer, encaisser et livrer leurs achats. Il ne les revend pas et ne les utilise pas à des fins de prospection sans leur accord.'
      ]
    },
    {
      titre: '11. Nom, logo et contenus',
      texte: [
        'Le Fournisseur autorise BTM, pendant la durée du contrat, à reproduire son nom, son logo, les photos et descriptions de ses produits sur la plateforme et dans la communication de BTM qui présente ses partenaires.',
        'Le Fournisseur garantit qu’il dispose des droits sur les contenus qu’il met en ligne.'
      ]
    },
    {
      titre: '12. Responsabilité',
      texte: [
        'Le Fournisseur est seul responsable des produits qu’il vend, de leur conformité, de leur disponibilité, de leur livraison et de la relation commerciale avec le Client.',
        'BTM n’est pas responsable des estimations de quantités, qui restent indicatives et que le Client doit faire vérifier par un professionnel, ni des dommages indirects subis par le Fournisseur.'
      ]
    },
    {
      titre: '13. Durée et fin du contrat',
      texte: [
        'Le contrat est conclu pour une durée indéterminée à compter de la validation du compte.',
        'Chaque partie peut y mettre fin à tout moment par écrit (e-mail compris), avec un préavis de trente jours.',
        'En cas de manquement grave (fraude, ventes BTM non enregistrées, commissions impayées malgré une relance), BTM peut y mettre fin sans préavis, après en avoir informé le Fournisseur.',
        'Les commissions nées avant la fin du contrat restent dues.'
      ]
    },
    {
      titre: '14. Modification du contrat',
      texte: [
        'BTM peut faire évoluer le présent contrat. Le Fournisseur en est informé au moins trente jours avant l’entrée en vigueur de la nouvelle version ; s’il la refuse, il peut mettre fin au contrat sans préavis avant cette date.'
      ]
    },
    {
      titre: '15. Droit applicable et litiges',
      texte: [
        'Le contrat est soumis au droit français. Les parties recherchent d’abord une solution amiable. À défaut, le litige est porté devant les juridictions compétentes du ressort de Mamoudzou.'
      ]
    }
  ]
}

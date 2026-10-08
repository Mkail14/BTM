/**
 * Vérification des entreprises (comptes professionnels) :
 *  - contrôle du numéro SIRET (14 chiffres + clé de Luhn) ;
 *  - recherche dans le registre public de l'État (recherche-entreprises.api.gouv.fr, sans clé).
 * La recherche est une aide : l'API limite le nombre d'appels, la décision finale revient à l'admin.
 */

export const nettoyerSiret = (siret) => String(siret || '').replace(/\D/g, '')

/** 356 000 000 00048 */
export const formaterSiret = (siret) => {
  const s = nettoyerSiret(siret)
  return s.length === 14 ? `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6, 9)} ${s.slice(9)}` : s
}

/**
 * 14 chiffres et clé de Luhn correcte. Exception officielle : les établissements de La Poste
 * (SIREN 356000000) utilisent une somme des chiffres multiple de 5 ; on accepte les deux règles pour eux.
 */
export function siretValide(siret) {
  const s = nettoyerSiret(siret)
  if (!/^[0-9]{14}$/.test(s)) return false
  let somme = 0
  for (let i = 0; i < 14; i++) {
    let c = Number(s[13 - i])
    if (i % 2 === 1) { c *= 2; if (c > 9) c -= 9 }
    somme += c
  }
  if (somme % 10 === 0) return true
  return s.startsWith('356000000') && s.split('').reduce((t, c) => t + Number(c), 0) % 5 === 0
}

/** Fiche publique de l'entreprise (lien pour l'admin) */
export const lienAnnuaire = (siret) => `https://annuaire-entreprises.data.gouv.fr/etablissement/${nettoyerSiret(siret)}`

/**
 * @returns {Promise<object|null>} { nom, siren, active, commune, activite, etablissementTrouve } ou null si inconnu
 * @throws si le registre est injoignable ou saturé (à distinguer d'un SIRET inconnu)
 */
export async function rechercherSiret(siret) {
  const s = nettoyerSiret(siret)
  const reponse = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${s}&per_page=1`)
  if (reponse.status === 429) throw new Error('Registre des entreprises momentanément saturé, réessayez dans un instant.')
  if (!reponse.ok) throw new Error('Registre des entreprises injoignable.')
  const { results = [] } = await reponse.json()
  const e = results[0]
  if (!e || e.siren !== s.slice(0, 9)) return null
  const etablissement = [e.siege, ...(e.matching_etablissements || [])].find((x) => x?.siret === s)
  return {
    nom: e.nom_complet || e.nom_raison_sociale,
    siren: e.siren,
    active: e.etat_administratif === 'A' && (!etablissement || etablissement.etat_administratif !== 'F'),
    commune: etablissement?.libelle_commune || e.siege?.libelle_commune || '',
    activite: e.activite_principale || '',
    etablissementTrouve: !!etablissement
  }
}

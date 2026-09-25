/**
 * Téléphone — pays, formatage à la saisie, validation et format international (E.164).
 * Le numéro est stocké en E.164 (« +262639123456 ») et affiché groupé (« +262 639 12 34 56 »).
 */

export const PAYS = [
  { code: 'YT', nom: 'Mayotte', indicatif: '262', longueur: 9, groupes: [3, 2, 2, 2], exemple: '639 12 34 56',
    valide: (n) => /^(269|639)\d{6}$/.test(n), aide: 'Fixe : 0269 …  ·  Mobile : 0639 …' },
  { code: 'RE', nom: 'La Réunion', indicatif: '262', longueur: 9, groupes: [3, 2, 2, 2], exemple: '692 12 34 56',
    valide: (n) => /^(262|692|693)\d{6}$/.test(n), aide: 'Fixe : 0262 …  ·  Mobile : 0692 / 0693 …' },
  { code: 'FR', nom: 'France métropolitaine', indicatif: '33', longueur: 9, groupes: [1, 2, 2, 2, 2], exemple: '6 12 34 56 78',
    valide: (n) => /^[1-9]\d{8}$/.test(n), aide: 'Ex. 06 12 34 56 78' },
  { code: 'KM', nom: 'Comores', indicatif: '269', longueur: 7, groupes: [3, 2, 2], exemple: '321 23 45',
    valide: (n) => /^[3-7]\d{6}$/.test(n), aide: 'Ex. 321 23 45' },
  { code: 'MG', nom: 'Madagascar', indicatif: '261', longueur: 9, groupes: [2, 2, 3, 2], exemple: '32 12 345 67',
    valide: (n) => /^3\d{8}$/.test(n), aide: 'Ex. 032 12 345 67' }
]

export const trouverPays = (code) => PAYS.find((p) => p.code === code) || PAYS[0]

/** Chiffres seuls, sans le 0 initial d'appel national (« 0639… » → « 639… »), tronqués à la longueur du pays */
export function nettoyerNational(saisie, pays) {
  let n = String(saisie || '').replace(/\D/g, '')
  if (n.startsWith('0')) n = n.replace(/^0+/, '')
  return n.slice(0, pays.longueur)
}

export function formaterNational(n, pays) {
  const parts = []
  let i = 0
  for (const g of pays.groupes) {
    if (i >= n.length) break
    parts.push(n.slice(i, i + g))
    i += g
  }
  return parts.join(' ')
}

export const versE164 = (n, pays) => `+${pays.indicatif}${n}`

/** Retrouve pays + numéro national depuis une valeur stockée (E.164 ou ancien format « 0269 00 00 00 ») */
export function analyserTelephone(valeur) {
  const brut = String(valeur || '').trim()
  if (!brut) return null
  const chiffres = brut.replace(/\D/g, '')
  let indicatif = null
  let national = chiffres
  if (brut.startsWith('+') || brut.startsWith('00')) {
    const sansZeros = brut.startsWith('00') ? chiffres.slice(2) : chiffres
    indicatif = ['262', '261', '269', '33'].find((i) => sansZeros.startsWith(i)) || null
    if (!indicatif) return null
    national = sansZeros.slice(indicatif.length)
  } else {
    national = chiffres.replace(/^0+/, '')
    indicatif = '262'
  }
  const candidats = PAYS.filter((p) => p.indicatif === indicatif)
  const pays = candidats.find((p) => p.valide(national)) || candidats[0]
  return pays ? { pays, national } : null
}

export function validerTelephone(valeur) {
  const a = analyserTelephone(valeur)
  return !!a && a.pays.valide(a.national)
}

/** « +262639123456 » → « +262 639 12 34 56 » ; valeur inconnue renvoyée telle quelle */
export function formaterTelephone(valeur) {
  const a = analyserTelephone(valeur)
  if (!a || !a.national) return valeur || ''
  return `+${a.pays.indicatif} ${formaterNational(a.national, a.pays)}`
}

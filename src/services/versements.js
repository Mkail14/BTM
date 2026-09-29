/**
 * Versements des revenus BTM vers le compte de l'entreprise : IBAN, calendrier, montant à verser.
 * Aucune opération bancaire n'est déclenchée par le site : ces calculs servent à planifier
 * les virements et à tenir l'historique dans /admin.
 */

export const normaliserIban = (iban) => String(iban || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

/** Contrôle officiel ISO 13616 : 4 premiers caractères à la fin, lettres → nombres, reste mod 97 = 1 */
export function ibanValide(iban) {
  const n = normaliserIban(iban)
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(n)) return false
  const chiffres = (n.slice(4) + n.slice(0, 4)).replace(/[A-Z]/g, (l) => String(l.charCodeAt(0) - 55))
  let reste = 0
  for (const c of chiffres) reste = (reste * 10 + Number(c)) % 97
  return reste === 1
}

export const bicValide = (bic) => /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(String(bic || '').toUpperCase().replace(/\s+/g, ''))

/** FR76 3000 6000 0112 3456 7890 189 */
export const formaterIban = (iban) => normaliserIban(iban).replace(/(.{4})/g, '$1 ').trim()

/** FR76 •••• •••• •••• 0189 — affichage et historique sans exposer le numéro complet */
export function masquerIban(iban) {
  const n = normaliserIban(iban)
  return n ? `${n.slice(0, 4)} •••• •••• •••• ${n.slice(-4)}` : ''
}

/**
 * Prochaine date de versement (aujourd'hui compris) : le `jour` de chaque mois,
 * ou de chaque trimestre (janvier, avril, juillet, octobre).
 */
export function prochainVersement(parametres, depuis = new Date()) {
  if (!parametres) return null
  const jour = Math.min(28, Math.max(1, Number(parametres.jour) || 1))
  const aujourdhui = new Date(depuis.getFullYear(), depuis.getMonth(), depuis.getDate())
  for (let i = 0; i < 15; i++) {
    const d = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth() + i, jour)
    if (d < aujourdhui) continue
    if (parametres.frequence === 'trimestrielle' && d.getMonth() % 3 !== 0) continue
    return d
  }
  return null
}

/** Encaissé − déjà versé (jamais négatif) */
export function montantAVerser(paiements = [], versements = []) {
  const encaisse = paiements.reduce((s, p) => s + Number(p.revenu_btm || 0), 0)
  const verse = versements.reduce((s, v) => s + Number(v.montant || 0), 0)
  return Math.max(0, Math.round((encaisse - verse) * 100) / 100)
}

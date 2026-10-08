/** Validation des champs d'identité (nom, prénom, e-mail) */
import { estDomaineJetable } from '@/donnees/domainesJetables.js'
import { supabase, supabaseConfigure } from '@/services/supabase/client.js'

// Lettres (accents compris), espaces, apostrophes et tirets uniquement
const HORS_NOM = /[^\p{L}\s'’-]/gu

export const nettoyerNom = (v) => String(v || '').replace(HORS_NOM, '').replace(/^[\s'’-]+/, '').replace(/\s{2,}/g, ' ')

/** « jean-pierre DUPONT » → « Jean-Pierre Dupont » */
export const capitaliserNom = (v) =>
  nettoyerNom(v).trim().toLocaleLowerCase('fr').replace(/(^|[\s'’-])(\p{L})/gu, (_, sep, l) => sep + l.toLocaleUpperCase('fr'))

export function erreurNom(v, libelle = 'nom') {
  const t = String(v || '').trim()
  if (!t) return 'Ce champ est obligatoire'
  if (/\d/.test(t)) return `Le ${libelle} ne peut pas contenir de chiffres`
  if (!/^[\p{L}][\p{L}\s'’-]*$/u.test(t)) return `Le ${libelle} ne doit contenir que des lettres`
  if ((t.match(/\p{L}/gu) || []).length < 2) return `Le ${libelle} doit contenir au moins 2 lettres`
  if (t.length > 60) return `Le ${libelle} est trop long`
  return ''
}

const DOMAINES = ['gmail.com', 'yahoo.fr', 'yahoo.com', 'hotmail.com', 'hotmail.fr', 'outlook.com', 'outlook.fr', 'live.fr', 'icloud.com', 'orange.fr', 'free.fr', 'sfr.fr', 'wanadoo.fr', 'laposte.net', 'proton.me', 'protonmail.com']

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

/** Pseudo : 3 à 20 caractères — lettres, chiffres, point, tiret et underscore ; pas d'espace */
export const nettoyerPseudo = (v) => String(v || '').replace(/[^\p{L}\p{N}._-]/gu, '').slice(0, 20)

export function erreurPseudo(v) {
  const t = String(v || '').trim()
  if (!t) return 'Choisissez un pseudo'
  if (t.length < 3) return 'Le pseudo doit contenir au moins 3 caractères'
  if (t.length > 20) return 'Le pseudo est limité à 20 caractères'
  if (!/^[\p{L}\p{N}._-]+$/u.test(t)) return 'Lettres, chiffres, « . », « - » et « _ » uniquement'
  if (!/\p{L}/u.test(t)) return 'Le pseudo doit contenir au moins une lettre'
  return ''
}

// Partie locale : caractères usuels, pas de points en début/fin ni consécutifs ; domaine : labels valides + extension ≥ 2 lettres
const FORMAT_EMAIL = /^(?!\.)(?!.*\.\.)[A-Za-z0-9._%+'-]{1,64}(?<!\.)@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$/

export const MESSAGE_EMAIL_JETABLE = 'Les adresses e-mail jetables ou temporaires ne sont pas acceptées : utilisez votre adresse habituelle'

/** `accepterJetable` : à la connexion, un ancien compte créé avec une adresse jetable doit pouvoir se connecter */
export function erreurEmail(v, { accepterJetable = false } = {}) {
  const t = String(v || '').trim()
  if (!t) return 'Ce champ est obligatoire'
  if (/\s/.test(t)) return 'L’adresse e-mail ne doit pas contenir d’espace'
  if (!t.includes('@')) return 'Il manque le « @ » dans l’adresse e-mail'
  if (!FORMAT_EMAIL.test(t)) return 'Adresse e-mail invalide (ex. nom@exemple.com)'
  if (!accepterJetable && estDomaineJetable(t)) return MESSAGE_EMAIL_JETABLE
  return ''
}

// Résultats mémorisés par domaine : évite une requête à chaque sortie du champ.
// En cas d'échec réseau, le domaine est accepté (et oublié, pour réessayer) : on ne bloque jamais
// une inscription légitime à cause du réseau ; le déclencheur de la migration 0019 reste le garde-fou final.
const cacheJetable = new Map()
const cacheMx = new Map()

function memoriser(cache, domaine, verifier) {
  if (!cache.has(domaine)) cache.set(domaine, verifier().catch(() => { cache.delete(domaine); return null }))
  return cache.get(domaine)
}

/** Liste complète en base (~98 000 domaines, mise à jour chaque nuit) : la liste locale n'en contient qu'un extrait */
async function domaineJetableEnBase(domaine) {
  if (!supabaseConfigure) return null
  const { data, error } = await supabase.rpc('est_email_jetable', { p_email: `x@${domaine}` })
  if (error) throw error
  return data === true
}

/** DNS sur HTTPS : le domaine possède-t-il un serveur de messagerie (enregistrement MX) ? */
async function domaineRecoitEmails(domaine) {
  const rep = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domaine)}&type=MX`, {
    headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(4000)
  })
  if (!rep.ok) throw new Error(`DNS ${rep.status}`)
  const { Status, Answer = [] } = await rep.json()
  if (Status === 3) return false // NXDOMAIN : le domaine n'existe pas
  // MX « null » (RFC 7505, priorité 0 et cible « . ») : le domaine déclare ne recevoir aucun e-mail
  const mx = Answer.filter((r) => r.type === 15 && !/^0\s+\.?$/.test(r.data))
  return Status === 0 && mx.length > 0
}

/** Vérifications en ligne d'une adresse au bon format : service jetable (liste complète) puis domaine réel */
export async function erreurDomaineEmail(v) {
  const domaine = String(v || '').trim().toLowerCase().split('@')[1]
  if (!domaine || DOMAINES.includes(domaine)) return ''
  const [jetable, recoit] = await Promise.all([
    memoriser(cacheJetable, domaine, () => domaineJetableEnBase(domaine)),
    memoriser(cacheMx, domaine, () => domaineRecoitEmails(domaine))
  ])
  if (jetable) return MESSAGE_EMAIL_JETABLE
  if (recoit === false) return `Le domaine « ${domaine} » ne reçoit pas d’e-mails : vérifiez votre adresse`
  return ''
}

/** Contrôle complet d'une nouvelle adresse (format + jetable + domaine réel) ; lève une erreur lisible */
export async function controlerEmailReel(v) {
  const msg = erreurEmail(v) || (await erreurDomaineEmail(v))
  if (msg) throw new Error(msg)
}

/** Propose « nom@gmail.com » pour « nom@gmial.com » ; renvoie '' si rien à corriger */
export function suggestionEmail(v) {
  const t = String(v || '').trim().toLowerCase()
  if (erreurEmail(t)) return ''
  const [local, domaine] = t.split('@')
  if (DOMAINES.includes(domaine)) return ''
  const proche = DOMAINES.find((d) => distance(domaine, d) <= 1 || (domaine.length > 5 && distance(domaine, d) === 2 && domaine[0] === d[0]))
  return proche ? `${local}@${proche}` : ''
}

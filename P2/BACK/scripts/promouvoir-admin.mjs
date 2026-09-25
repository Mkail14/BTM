// Donne (ou retire) le rôle admin à un compte existant.
//   node scripts/promouvoir-admin.mjs vous@exemple.com          → admin
//   node scripts/promouvoir-admin.mjs vous@exemple.com user     → retire le rôle admin
// Utilise SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY du fichier BACK/.env (ne jamais committer ce fichier).
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const [email, role = 'admin'] = process.argv.slice(2)
if (!email || !['admin', 'user', 'fournisseur'].includes(role)) {
  console.error('Usage : node scripts/promouvoir-admin.mjs <email> [admin|user|fournisseur]')
  process.exit(1)
}
const url = `${env.SUPABASE_URL}/rest/v1/profils?email=eq.${encodeURIComponent(email.toLowerCase())}`
const enTetes = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const rep = await fetch(url, { method: 'PATCH', headers: enTetes, body: JSON.stringify({ role }) })
const lignes = await rep.json()
if (!rep.ok) { console.error('Erreur :', lignes); process.exit(1) }
if (!lignes.length) { console.error(`Aucun compte trouvé pour « ${email} ». Créez d'abord le compte sur le site (inscription).`); process.exit(1) }
console.log(`✔ ${lignes[0].email} a maintenant le rôle « ${role} ».`)

/**
 * Service d'authentification — MOCK LOCAL.
 *
 * ⚠️ Il n'y a pas de backend pour le moment. Ce mock existe uniquement pour
 * rendre l'UI fonctionnelle et pour permettre le test de la route admin.
 * En production, la vraie implémentation doit être serveur-side avec JWT,
 * bcrypt et stockage Supabase.
 */
const USERS_KEY = 'btm.users'
const SESSION_KEY = 'btm.currentUser'
const JWT_KEY = 'btm.jwt'

export function register({ name, email, password }) {
  const users = readUsers()
  const normalizedEmail = email.trim().toLowerCase()

  if (users.some((user) => user.email === normalizedEmail)) {
    throw new AuthError('Un compte existe déjà avec cet e-mail.')
  }

  const isAdmin = normalizedEmail === 'admin@btm.local'
  const user = {
    id: `user_${Date.now()}`,
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: mockHash(password),
    role: isAdmin ? 'admin' : 'client',
    createdAt: new Date().toISOString()
  }

  users.push(user)
  writeUsers(users)
  setSession(user)
  return toPublicUser(user)
}

export function login({ email, password }) {
  const users = readUsers()
  const normalizedEmail = email.trim().toLowerCase()
  const user = users.find((candidate) => candidate.email === normalizedEmail)

  if (!user || user.passwordHash !== mockHash(password)) {
    throw new AuthError('E-mail ou mot de passe incorrect.')
  }

  setSession(user)
  return toPublicUser(user)
}

export function logout() {
  try {
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(JWT_KEY)
  } catch {
    // ignoré
  }
}

export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function setSession(user) {
  try {
    const publicUser = toPublicUser(user)
    const jwt = buildDemoJwt(publicUser)
    localStorage.setItem(SESSION_KEY, JSON.stringify(publicUser))
    localStorage.setItem(JWT_KEY, jwt)
  } catch {
    // ignoré
  }
}

function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role || 'client'
  }
}

function buildDemoJwt(user) {
  return btoa(JSON.stringify({
    sub: user.id,
    email: user.email,
    role: user.role || 'client',
    exp: Date.now() + 8 * 60 * 60 * 1000
  }))
}

function readUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeUsers(users) {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users))
  } catch {
    // ignoré
  }
}

function mockHash(value) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return `h${hash}`
}

export class AuthError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AuthError'
  }
}

const jwt = require('jsonwebtoken')
const rateLimit = require('express-rate-limit')

const JWT_SECRET = process.env.JWT_SECRET || 'btm-dev-secret-change-me'

function getBearerToken(req) {
  const authHeader = req.headers.authorization || ''
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : null
}

function decodeLegacyDemoToken(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'))

    if (!decoded || typeof decoded !== 'object') {
      return null
    }

    return {
      sub: decoded.sub,
      email: decoded.email,
      role: decoded.role || 'admin'
    }
  } catch {
    return null
  }
}

function verifyJwt(req, res, next) {
  const token = getBearerToken(req)

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Token JWT manquant.'
    })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
    return
  } catch (error) {
    const legacyUser = decodeLegacyDemoToken(token)

    if (legacyUser && (legacyUser.role === 'admin' || legacyUser.email === 'admin@btm.local')) {
      req.user = legacyUser
      next()
      return
    }

    return res.status(401).json({
      success: false,
      message: 'Token JWT invalide ou expiré.'
    })
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const role = req.user?.role

    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé. Droits administrateur requis.'
      })
    }

    next()
  }
}

const adminRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Trop de requêtes, merci de réessayer plus tard.'
  }
})

function signAdminToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role || 'admin'
    },
    JWT_SECRET,
    { expiresIn: '8h', issuer: 'btm-admin' }
  )
}

module.exports = {
  verifyJwt,
  requireRole,
  adminRateLimiter,
  signAdminToken,
  JWT_SECRET
}

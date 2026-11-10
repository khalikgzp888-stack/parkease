// ============================================================================
// middleware/auth.js  —  "IS THE USER LOGGED IN?" CHECK
// ============================================================================
// Middleware = a security guard that checks requests before they reach a route.
//   optionalAuth : If a valid token exists in the cookie, it sets req.user; otherwise, it continues silently.
//   requireAuth  : If the user is not logged in, it sends a 401 "Please log in" response.
// Token = JWT: Contains the user's ID + role, signed using our JWT_SECRET. If anyone modifies it, the signature becomes invalid.
// ============================================================================

const jwt = require('jsonwebtoken');

const COOKIE = 'pe_token';
const secret = () => process.env.JWT_SECRET;

function signToken(user) {
  return jwt.sign({ sub: String(user.id), role: user.role }, secret(), { algorithm: 'HS256', expiresIn: '7d' });
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',                                   // dusri site se cookie nahi bhejti (CSRF se bachav)
    secure: process.env.NODE_ENV === 'production',     // live par sirf HTTPS
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

const clearAuthCookie = res => res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });

// Agar valid cookie hai to req.user bharta hai, warna chup-chaap aage badh jata hai
function optionalAuth(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  if (token) {
    try {
      const p = jwt.verify(token, secret(), { algorithms: ['HS256'] });
      req.user = { id: Number(p.sub), role: p.role };   // JWT ka sub string hota hai, DB id number
    } catch { /* kharab ya expire token: anonymous maano */ }
  }
  next();
}

function requireAuth(req, res, next) {
  optionalAuth(req, res, () => {
    if (!req.user) return res.status(401).json({ error: 'Please log in to continue' });
    next();
  });
}

module.exports = { signToken, setAuthCookie, clearAuthCookie, optionalAuth, requireAuth };

// ============================================================================
// routes/auth.js  —  REGISTER, LOGIN, LOGOUT, "WHO AM I?" (/api/me)
// ============================================================================
// Logic:
//   register : validate input (zod) -> hash password with bcrypt -> save to users table -> set login cookie
//   login    : find user by email -> verify password with bcrypt -> set JWT cookie if correct
//   Passwords are never stored as plain text. The cookie is httpOnly (JavaScript cannot read it).
//   Wrong email and wrong password return the same message, so hackers cannot identify registered emails.
// ============================================================================

const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const pool = require('../db');
const { signToken, setAuthCookie, clearAuthCookie, optionalAuth, requireAuth } = require('../middleware/auth');

const router = express.Router();
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your full name').max(80),
  email: z.string().trim().toLowerCase().email('Please enter a valid email').max(160),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100)
});
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email'),
  password: z.string().min(1).max(100)
});

const publicUser = u => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role });

// Ek nakli hash: jab email exist hi na kare tab bhi bcrypt chalate hain,
// taaki response time se koi ye na jaan sake ki email registered hai ya nahi.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

router.post('/auth/register', wrap(async (req, res) => {
  const d = registerSchema.parse(req.body);
  const hash = await bcrypt.hash(d.password, 12);        // 12 = hashing ko jaanbujhkar slow rakhta hai
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash) VALUES ($1, $2, $3, $4) RETURNING *`,
      [d.name, d.email, d.phone, hash]
    );
    setAuthCookie(res, signToken(rows[0]));
    res.status(201).json({ user: publicUser(rows[0]) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'This email is already registered' });
    throw e;
  }
}));

router.post('/auth/login', wrap(async (req, res) => {
  const d = loginSchema.parse(req.body);
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [d.email]);
  const user = rows[0];
  const ok = await bcrypt.compare(d.password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) return res.status(401).json({ error: 'Invalid email or password' });
  setAuthCookie(res, signToken(user));
  res.json({ user: publicUser(user) });
}));

router.post('/auth/logout', (_req, res) => { clearAuthCookie(res); res.json({ ok: true }); });

router.get('/me', optionalAuth, wrap(async (req, res) => {
  if (!req.user) return res.json({ user: null });
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  res.json({ user: rows[0] ? publicUser(rows[0]) : null });
}));

router.patch('/me', requireAuth, wrap(async (req, res) => {
  const d = z.object({ name: z.string().trim().min(2).max(80) }).parse(req.body);
  const { rows } = await pool.query('UPDATE users SET name = $1 WHERE id = $2 RETURNING *', [d.name, req.user.id]);
  res.json({ user: publicUser(rows[0]) });
}));

module.exports = router;

// ============================================================================
// server.js  —  MAIN BACKEND ENTRY POINT (starts the entire server)
// ============================================================================
// What it does:
//   1. Applies security (headers, rate limiting, CSRF checks)
//   2. Routes requests to the correct route files (/api/auth, /api/listings, /api/bookings)
//   3. Serves frontend files from the public/ folder (no separate frontend server needed)
//
// Request flow: Browser -> server.js (security checks) -> routes/*.js (logic) -> db.js -> Database
//
// To start: npm start   (make sure to configure .env first)
// ============================================================================

require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { ZodError } = require('zod');
const { isDbSetupError, explainDbError } = require('./dbHelp');

// Secret ke bina server chalna hi nahi chahiye
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET missing ya bahut chhota hai (kam se kam 32 characters). .env.example dekhein.');
  process.exit(1);
}

const isProd = process.env.NODE_ENV === 'production';
const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY && process.env.TRUST_PROXY !== '0') app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

// 1) Security headers (CSP: browser ko batata hai ki kaun si cheezein load karna allowed hai)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'unsafe-inline'"],    // abhi UI mein onclick="..." use hota hai; baad mein hatana hai
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://images.unsplash.com', 'https://*.tile.openstreetmap.org'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: isProd ? [] : null
    }
  }
}));

app.use(cookieParser());

// 2) Body parsing. Photo wale route par badi limit, baaki sab par chhoti
const small = express.json({ limit: '20kb' });
const big = express.json({ limit: '4mb' });
app.use((req, res, next) => (req.method === 'POST' && req.path === '/api/listings' ? big : small)(req, res, next));

// 3) CSRF se bachav: sirf apni hi site se aayi JSON requests allow
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin) {
    let host; try { host = new URL(origin).host; } catch { host = null; }
    if (host !== req.headers.host) return res.status(403).json({ error: 'Cross-site request blocked' });
  }
  if (!(req.headers['content-type'] || '').startsWith('application/json')) return res.status(415).json({ error: 'JSON required' });
  next();
});

// 4) Rate limiting: brute-force aur spam rokne ke liye
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false }));
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// 5) API routes
app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/listings'));
app.use('/api', require('./routes/bookings'));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// 6) Frontend files (public/ folder) isi server se serve hote hain, isliye CORS ki zaroorat nahi
app.use(express.static(path.join(__dirname, 'public')));

// 7) Error handler: user ko saaf message, andar ki details sirf server log mein
app.use((err, _req, res, _next) => {
  if (err instanceof ZodError) return res.status(400).json({ error: err.issues[0]?.message || 'Invalid input' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  console.error(err);
  // Development mein database ki dikkat saaf batayein (live par andar ki baatein nahi dikhate)
  if (!isProd && isDbSetupError(err)) return res.status(503).json({ error: 'Database se connect nahi ho pa raha. Terminal mein error aur upay likha hai (ya "npm run db:check" chalayein).' });
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`ParkEase running on http://localhost:${port}`);
  // Shuru hote hi database check: dikkat ho to turant saaf bata dete hain
  require('./db').query('SELECT 1')
    .then(() => console.log('✓ Database connected'))
    .catch(e => {
      console.error('✗ Database connect nahi hua:', e.message);
      console.error('  -> ' + explainDbError(e));
    });
});

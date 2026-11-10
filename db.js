// ============================================================================
// db.js  —  DATABASE CONNECTION (This is where Supabase connects)
// ============================================================================
// What it does: Creates a "Pool". A Pool is a set of pre-opened connections
//               that requests reuse one by one (opening a new connection every
//               time would be slow).
// Connection source: The DATABASE_URL in the .env file.
//               To get the Supabase URL, see "Supabase setup" in README.md.
// The rest of the code communicates with the database using `pool.query('SQL', [values])`.
// ============================================================================
require('dns').setDefaultResultOrder('ipv4first');   // IPv4 pehle try karo (kuch internet par IPv6 chalta nahi)
const fs = require('fs');
const { Pool } = require('pg');

const { looksLikePlaceholder } = require('./dbHelp');
if (!process.env.DATABASE_URL || looksLikePlaceholder(process.env.DATABASE_URL)) {
  console.error('DATABASE_URL abhi bhara nahi hai. .env file mein apna Supabase connection string daalein (README dekhein).');
  console.error('Check karne ke liye:  npm run db:check');
  process.exit(1);
}

// SSL = database tak ka raasta encrypted rakhna.
//   Laptop ke local Postgres par:   DATABASE_SSL=false
//   Supabase / Neon par:            DATABASE_SSL=true
// Supabase ka certificate Supabase ki apni CA se bana hota hai, isliye by default Node use verify
// nahi kar paata. Do option:
//   (a) DATABASE_CA_FILE=./supabase-ca.crt  (Supabase dashboard se CA certificate download karke) -> sabse surakshit
//   (b) CA file nahi di to connection encrypted rahega par server ki pehchaan verify nahi hogi (kaam chalau).
// NOTE: URL mein "?sslmode=..." mat lagayein, wo is setting ko override kar deta hai.
let ssl = false;
if (process.env.DATABASE_SSL === 'true') {
  ssl = process.env.DATABASE_CA_FILE
    ? { ca: fs.readFileSync(process.env.DATABASE_CA_FILE, 'utf8'), rejectUnauthorized: true }
    : { rejectUnauthorized: false };
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl,
  max: 10,                    // ek saath kitne connections khule rakhne hain
  idleTimeoutMillis: 30_000   // 30 sec khali rahe to band kar do
});

// Database kabhi beech mein toote to poora server crash na ho
pool.on('error', err => console.error('Unexpected DB error:', err.message));

module.exports = pool;

// ============================================================================
// scripts/check-db.js  —  "IS THE DATABASE CONNECTED?" CHECK  (npm run db:check)
// ============================================================================
// Run this before starting the server. It tells you:
//   1. Whether DATABASE_URL is configured in .env
//   2. Whether a database connection can be established (if not, the reason + fix)
//   3. Whether tables have been created and how many listings exist
// ============================================================================
require('dotenv').config();
const { looksLikePlaceholder, explainDbError } = require('../dbHelp');

(async () => {
  const url = process.env.DATABASE_URL || '';
  if (!url || looksLikePlaceholder(url)) {
    console.log('✗ .env mein DATABASE_URL abhi bhara nahi hai (template wali value hai).');
    console.log('  -> Supabase Dashboard > Project Settings > Database > Connection string > URI > "Session pooler"');
    console.log('  -> Wo URL .env mein DATABASE_URL= ke aage paste karein, [YOUR-PASSWORD] ki jagah apna password.');
    process.exit(1);
  }
  const pool = require('../db');
  try {
    const v = await pool.query('SELECT version()');
    console.log('✓ Database connect ho gaya:', v.rows[0].version.split(',')[0]);
  } catch (e) {
    console.log('✗ Database connect nahi hua:', e.message);
    console.log('  -> ' + explainDbError(e));
    process.exit(1);
  }
  try {
    const c = await pool.query(`SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM listings) AS listings, (SELECT count(*) FROM bookings) AS bookings`);
    console.log('✓ Tables maujood hain:', c.rows[0]);
    if (Number(c.rows[0].listings) === 0) console.log('  (listings 0 hain: demo data ke liye "npm run db:seed" chalayein)');
  } catch (e) {
    console.log('✗ Tables abhi nahi bani.');
    console.log('  -> ' + explainDbError(e));
    process.exit(1);
  } finally {
    await pool.end();
  }
})();

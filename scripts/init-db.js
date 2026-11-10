// ============================================================================
// scripts/init-db.js  —  DATABASE MEIN TABLES BANANA     (npm run db:init)
// schema.sql padhkar database par chalata hai. Dobara chalane se koi nuksan nahi (IF NOT EXISTS).
// ============================================================================

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../db');

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Tables ready.');
  await pool.end();
})().catch(e => { console.error('init-db failed:', e.message); process.exit(1); });

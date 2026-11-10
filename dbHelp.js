// ============================================================================
// dbHelp.js  —  DATABASE ERROR HANDLING HELPER
// ============================================================================
// Showing only "Something went wrong" when the database connection fails
// is not helpful. This file identifies the error and explains what needs
// to be fixed in the .env file.
// Used by db.js, server.js, and scripts/check-db.js.
// ============================================================================

// Is the .env file still using the placeholder value?
function looksLikePlaceholder(url = '') {
  return /\[YOUR-PASSWORD\]|xxxxxxxx|YOUR_PASSWORD|<password>/i.test(url);
}

// Kaun se errors "database tak pahunch hi nahi paye / setup adhura hai" wale hain
const CONN_CODES = ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'EAI_AGAIN', 'ECONNRESET', '28P01', '28000', '3D000', '42P01'];
function isDbSetupError(err = {}) {
  const m = String(err.message || '');
  return CONN_CODES.includes(err.code) || /self-signed|certificate|Tenant or user not found|timeout|no pg_hba|SSL/i.test(m);
}

// Error -> saaf Hinglish salah
function explainDbError(err = {}) {
  const m = String(err.message || '');
  if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN')
    return 'Database address not found. The URL may be incorrect, or your internet connection may be down. Use the "Session pooler" URL from Supabase (aws-...pooler.supabase.com).';
  if (err.code === 'ENETUNREACH')
    return 'Direct Supabase URLs use IPv6, which may not work on your network. Get the "Session pooler" URL from your Supabase Dashboard.';
  if (err.code === 'ECONNREFUSED')
    return 'Connection refused. Local Postgres may not be running, or the host/port in the URL may be incorrect.';
  if (err.code === '28P01' || /password authentication failed/i.test(m))
    return 'Invalid database password. If your password contains special characters like @ # / ?, URL-encode them (@ -> %40).';
  if (/Tenant or user not found/i.test(m))
    return 'Invalid username. For the Supabase pooler, use "postgres.<project-ref>" instead of just "postgres". Copy the URL again from your Supabase Dashboard.';
  if (/self-signed|certificate/i.test(m))
    return 'Set DATABASE_SSL=true in your .env file and do not add "?sslmode=" to the URL.';
  if (/SSL|no pg_hba/i.test(m))
    return 'SSL configuration mismatch. Set DATABASE_SSL=true for Supabase and DATABASE_SSL=false for local PostgreSQL on your laptop.';
  if (err.code === '3D000')
    return 'This database does not exist. Check the database name at the end of the URL (use "postgres" for Supabase).';
  if (err.code === '42P01')
    return 'Database tables have not been created. Run "npm run db:init" (or "npm run setup") in the terminal.';
  if (/timeout/i.test(m))
    return 'The database connection timed out. Check your internet connection or whether your Supabase project is paused (free plans may pause after 1 week of inactivity).';
  return 'Check the DATABASE_URL in your .env file based on the error message above.';
}

module.exports = { looksLikePlaceholder, isDbSetupError, explainDbError };

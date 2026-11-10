// ============================================================================
// routes/listings.js  —  PARKING LISTINGS (VIEW, CREATE, DELETE)
// ============================================================================
//   GET    /api/listings        Get all active listings (with search/filters) - no login required
//   GET    /api/listings/:id    Get listing details (views +1)                - no login required
//   GET    /api/my/listings     Get my listings + earnings                    - login required
//   POST   /api/listings        Create a new listing                           - login required
//   DELETE /api/listings/:id    Delete a listing (owner or admin only)         - login required
//
// Security: All inputs are validated using Zod. SQL values use $1, $2 placeholders
// to prevent SQL injection. Deletion is a "soft delete" (the row remains in the
// database with status='deleted') so previous booking records are preserved.
// ============================================================================

const express = require('express');
const { z } = require('zod');
const pool = require('../db');
const { optionalAuth, requireAuth } = require('../middleware/auth');

const router = express.Router();
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

const DEFAULT_IMG = 'https://images.unsplash.com/photo-1506521781263-d8422e82f27a?w=800&q=70';
const CITIES = ['Delhi', 'Noida', 'Gurugram', 'Bangalore', 'Mumbai', 'Pune', 'Hyderabad', 'Chennai', 'Kolkata', 'Other'];
const AMENITIES = ['CCTV', '24/7 Access', 'Covered', 'EV Charging', 'Security Guard', 'Car Wash'];

// Database ki row ko wahi shape dete hain jo frontend (app.js) expect karta hai
const toListing = r => ({
  id: r.id,
  title: r.title,
  address: r.address,
  city: r.city,
  lat: r.lat,
  lng: r.lng,
  price: r.price_per_hour,
  rating: r.rating === null ? 'New' : Number(r.rating),
  reviews: r.review_count,
  type: r.vehicle_type,
  covered: r.covered,
  amenities: r.amenities,
  owner: { name: r.owner_name, since: new Date(r.owner_since).getFullYear(), response: '15 min' },
  imgs: r.images.length ? r.images : [DEFAULT_IMG],
  desc: r.description,
  status: r.status,
  views: r.views,
  bookings: Number(r.booking_count ?? 0),
  earnings: Number(r.earnings ?? 0)
});

const idParam = z.coerce.number().int().positive();

// Sab active listings (search + filter). Saari values $1, $2... se jaati hain (SQL injection se bachav)
router.get('/listings', wrap(async (req, res) => {
  const q = z.object({
    q: z.string().trim().max(100).optional(),
    type: z.enum(['Bike', 'Car', 'Both']).optional(),
    covered: z.enum(['true', 'false']).optional(),
    maxPrice: z.coerce.number().int().positive().optional()
  }).parse(req.query);

  const where = [`l.status = 'active'`], params = [];
  if (q.q) { params.push(`%${q.q}%`); where.push(`(l.address ILIKE $${params.length} OR l.city ILIKE $${params.length} OR l.title ILIKE $${params.length})`); }
  if (q.type) { params.push(q.type); where.push(`(l.vehicle_type = $${params.length} OR l.vehicle_type = 'Both')`); }
  if (q.covered === 'true') where.push('l.covered = true');
  if (q.maxPrice) { params.push(q.maxPrice); where.push(`l.price_per_hour <= $${params.length}`); }

  const { rows } = await pool.query(
    `SELECT l.*, u.name AS owner_name, u.created_at AS owner_since
       FROM listings l JOIN users u ON u.id = l.owner_id
      WHERE ${where.join(' AND ')}
      ORDER BY l.created_at DESC LIMIT 100`, params);
  res.json(rows.map(toListing));
}));

// Logged-in owner ki apni listings + unki kamai
router.get('/my/listings', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT l.*, u.name AS owner_name, u.created_at AS owner_since,
            COALESCE(b.cnt, 0) AS booking_count, COALESCE(b.sum, 0) AS earnings
       FROM listings l
       JOIN users u ON u.id = l.owner_id
       LEFT JOIN (SELECT listing_id, COUNT(*) cnt, SUM(amount) sum
                    FROM bookings WHERE status = 'confirmed' GROUP BY listing_id) b ON b.listing_id = l.id
      WHERE l.owner_id = $1 AND l.status <> 'deleted'
      ORDER BY l.created_at DESC`, [req.user.id]);
  res.json(rows.map(toListing));
}));

router.get('/listings/:id', optionalAuth, wrap(async (req, res) => {
  const id = idParam.parse(req.params.id);
  const { rows } = await pool.query(
    `SELECT l.*, u.name AS owner_name, u.created_at AS owner_since
       FROM listings l JOIN users u ON u.id = l.owner_id
      WHERE l.id = $1 AND l.status <> 'deleted'`, [id]);
  if (!rows[0]) return res.status(404).json({ error: 'Listing not found' });
  if (!req.user || req.user.id !== rows[0].owner_id) {
    pool.query('UPDATE listings SET views = views + 1 WHERE id = $1', [id]).catch(() => {});
  }
  res.json(toListing(rows[0]));
}));

const imageRule = z.string().max(800_000).refine(
  s => /^https:\/\/[^\s"'<>]+$/.test(s) || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s),
  'Invalid image'
);

const createSchema = z.object({
  address: z.string().trim().min(5, 'Please enter a full address').max(200),
  city: z.enum(CITIES),
  lat: z.number().min(6).max(38),          // India ke andar
  lng: z.number().min(68).max(98),
  price: z.number().int().min(5, 'Minimum rate is ₹5/hour').max(5000),
  type: z.enum(['Bike', 'Car', 'Both']),
  covered: z.boolean(),
  amenities: z.array(z.enum(AMENITIES)).max(6).default([]),
  desc: z.string().trim().max(500).default(''),
  imgs: z.array(imageRule).max(4).default([])
});

router.post('/listings', requireAuth, wrap(async (req, res) => {
  const d = createSchema.parse(req.body);
  const { rows } = await pool.query(
    `INSERT INTO listings (owner_id, title, address, city, lat, lng, price_per_hour, vehicle_type, covered, amenities, description, images)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [req.user.id, d.address.slice(0, 120), d.address, d.city, d.lat, d.lng, d.price, d.type, d.covered, d.amenities, d.desc, d.imgs]);
  res.status(201).json({ id: rows[0].id });
}));

// Delete = soft delete (status='deleted'), taaki purani bookings ka record bana rahe
router.delete('/listings/:id', requireAuth, wrap(async (req, res) => {
  const id = idParam.parse(req.params.id);
  const { rows } = await pool.query('SELECT owner_id FROM listings WHERE id = $1 AND status <> $2', [id, 'deleted']);
  if (!rows[0]) return res.status(404).json({ error: 'Listing not found' });
  if (rows[0].owner_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Not allowed' });

  const up = await pool.query(`SELECT 1 FROM bookings WHERE listing_id = $1 AND status = 'confirmed' AND end_time > now() LIMIT 1`, [id]);
  if (up.rowCount) return res.status(409).json({ error: 'This listing has upcoming bookings and cannot be deleted yet' });

  await pool.query(`UPDATE listings SET status = 'deleted' WHERE id = $1`, [id]);
  res.json({ ok: true });
}));

module.exports = router;

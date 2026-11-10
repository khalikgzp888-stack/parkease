// ============================================================================
// routes/bookings.js  —  CREATE BOOKINGS, VIEW MY BOOKINGS, CANCEL BOOKINGS
// ============================================================================
// Important logic:
//   * PRICE IS CALCULATED ON THE SERVER. Never trust the amount sent by the browser,
//     otherwise someone could book for just 1 rupee.
//   * DOUBLE BOOKING: One slot cannot be booked by two users. This rule is enforced
//     by the database (no_double_booking constraint in schema.sql), so even if two
//     users try at the same time, only one booking succeeds. The other gets a 409 error.
//   * Booking status: cancelled / past (end time has passed) / upcoming.
// DEMO MODE: Payments are not verified yet. Razorpay must be integrated before going live.
// ============================================================================

const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);
const round2 = n => Math.round(n * 100) / 100;

// Price HAMESHA server par calculate hota hai. Browser se aaya hua amount kabhi nahi maante.
function calcPrice(pricePerHour, hours) {
  const base = pricePerHour * hours;
  const disc = hours >= 4 ? base * 0.10 : 0;
  const fee = (base - disc) * 0.08;        // service fee
  const gst = fee * 0.18;
  return round2(base - disc + fee + gst);
}

const toBooking = r => ({
  ref: r.ref,
  listingId: r.listing_id,
  title: r.title,
  address: r.address,
  img: (r.images && r.images[0]) || 'https://images.unsplash.com/photo-1506521781263-d8422e82f27a?w=800&q=70',
  date: r.start_time,
  hours: r.hours,
  amount: Number(r.amount),
  pay: r.pay_method,
  status: r.status === 'cancelled' ? 'cancelled' : (new Date(r.end_time) < new Date() ? 'past' : 'upcoming')
});

const createSchema = z.object({
  listingId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time'),
  hours: z.number().int().min(1).max(24),
  pay: z.enum(['upi', 'card', 'rzp']).default('upi')
});

// NOTE (demo mode): abhi payment verify nahi hoti, booking seedhe 'confirmed' ho jati hai.
// Live karne se pehle yahan Razorpay order banana + webhook se payment verify karna zaroori hai.
router.post('/bookings', requireAuth, wrap(async (req, res) => {
  const d = createSchema.parse(req.body);

  const start = new Date(`${d.date}T${d.time}:00+05:30`);        // India time (IST)
  if (Number.isNaN(start.getTime())) return res.status(400).json({ error: 'Invalid date or time' });
  const now = Date.now();
  if (start.getTime() < now - 5 * 60 * 1000) return res.status(400).json({ error: 'Start time is in the past' });
  if (start.getTime() > now + 90 * 24 * 3600 * 1000) return res.status(400).json({ error: 'You can book up to 90 days ahead' });
  const end = new Date(start.getTime() + d.hours * 3600 * 1000);

  const l = await pool.query(`SELECT id, owner_id, price_per_hour FROM listings WHERE id = $1 AND status = 'active'`, [d.listingId]);
  if (!l.rows[0]) return res.status(404).json({ error: 'Listing not found' });
  if (l.rows[0].owner_id === req.user.id) return res.status(400).json({ error: "You can't book your own space" });

  const amount = calcPrice(l.rows[0].price_per_hour, d.hours);
  const ref = 'PE' + crypto.randomBytes(4).toString('hex').toUpperCase();

  try {
    const { rows } = await pool.query(
      `INSERT INTO bookings (ref, listing_id, user_id, start_time, end_time, hours, amount, pay_method)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [ref, d.listingId, req.user.id, start, end, d.hours, amount, d.pay]);
    const info = await pool.query('SELECT title, address, images FROM listings WHERE id = $1', [d.listingId]);
    res.status(201).json(toBooking({ ...rows[0], ...info.rows[0] }));
  } catch (e) {
    // 23P01 = exclusion violation: yani isi time par kisi aur ki booking pehle se hai
    if (e.code === '23P01') return res.status(409).json({ error: 'Sorry, this slot was just booked. Please pick another time.' });
    throw e;
  }
}));

router.get('/my/bookings', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT b.*, l.title, l.address, l.images
       FROM bookings b JOIN listings l ON l.id = b.listing_id
      WHERE b.user_id = $1 ORDER BY b.start_time DESC`, [req.user.id]);
  res.json(rows.map(toBooking));
}));

router.post('/bookings/:ref/cancel', requireAuth, wrap(async (req, res) => {
  const ref = z.string().regex(/^PE[0-9A-F]{8}$/).parse(req.params.ref);
  const { rows } = await pool.query(
    `UPDATE bookings SET status = 'cancelled'
      WHERE ref = $1 AND user_id = $2 AND status = 'confirmed' AND start_time > now()
      RETURNING ref`, [ref, req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Booking not found or can no longer be cancelled' });
  res.json({ ok: true });
}));

module.exports = router;

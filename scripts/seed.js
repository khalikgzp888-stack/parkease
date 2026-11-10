// ============================================================================
// scripts/seed.js  —  DEMO LISTINGS DAALNA               (npm run db:seed)
// 8 demo listings (Noida, Delhi, Bangalore, Mumbai) daalta hai taaki search page khali na dikhe.
// Inke owner accounts mein KOI login nahi kar sakta (password random hai aur kisi ko pata nahi).
// Dobara chalane par duplicate nahi banata. LIVE jaane se pehle ye demo data hata dein.
// ratings/reviews yahan sirf dikhane ke liye (demo) hain, asli reviews baad mein banenge.
// ============================================================================

require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../db');

const IMG = [
  'https://images.unsplash.com/photo-1506521781263-d8422e82f27a?w=800&q=70',
  'https://images.unsplash.com/photo-1590674899484-d5640e854abe?w=800&q=70',
  'https://images.unsplash.com/photo-1573348722427-f1d6819fdf98?w=800&q=70',
  'https://images.unsplash.com/photo-1486006920555-c77dcf18193c?w=800&q=70',
  'https://images.unsplash.com/photo-1470224114660-3f6686c562eb?w=800&q=70'
];
const pick = (...i) => i.map(n => IMG[n % IMG.length]);

const DATA = [
  { owner: 'Ramesh Kumar', title: 'Covered slot near Sector 18 Metro', address: 'B-24, Sector 18, Noida, Uttar Pradesh', city: 'Noida', lat: 28.5707, lng: 77.3219, price: 40, rating: 4.8, reviews: 126, type: 'Both', covered: true, amenities: ['CCTV', '24/7 Access', 'Covered', 'EV Charging'], imgs: pick(0, 1, 2), desc: 'Safe, gated covered parking 2 minutes from Sector 18 Metro. Guard on duty at night. Ideal for office-goers and shoppers.' },
  { owner: 'Anita Sharma', title: 'Open bike bay, Connaught Place', address: 'Block F, Connaught Place, New Delhi', city: 'Delhi', lat: 28.6315, lng: 77.2167, price: 25, rating: 4.5, reviews: 88, type: 'Bike', covered: false, amenities: ['CCTV', '24/7 Access'], imgs: pick(1, 2, 3), desc: 'Secure bike bay right in the heart of CP. Walkable to all major cafes and offices.' },
  { owner: 'Suresh Reddy', title: 'Spacious car garage in Indiranagar', address: '12th Main, Indiranagar, Bengaluru, Karnataka', city: 'Bangalore', lat: 12.9784, lng: 77.6408, price: 60, rating: 4.9, reviews: 203, type: 'Car', covered: true, amenities: ['CCTV', 'Covered', 'EV Charging', 'Car Wash'], imgs: pick(3, 0, 4), desc: 'Private covered garage with EV charging point. Perfect for overnight and weekend parking.' },
  { owner: 'Priya Nair', title: 'Gated society visitor parking', address: 'Powai Lake Road, Powai, Mumbai, Maharashtra', city: 'Mumbai', lat: 19.1176, lng: 72.906, price: 70, rating: 4.6, reviews: 74, type: 'Car', covered: false, amenities: ['CCTV', '24/7 Access', 'Security Guard'], imgs: pick(4, 1, 2), desc: 'Well-lit gated society parking with 24x7 guard. Easy access from the Powai lake road.' },
  { owner: 'Vikram Singh', title: 'Budget parking near Cyber Hub', address: 'DLF Phase 2, Gurugram, Haryana', city: 'Gurugram', lat: 28.495, lng: 77.0895, price: 45, rating: 4.3, reviews: 52, type: 'Both', covered: false, amenities: ['CCTV', '24/7 Access'], imgs: pick(2, 3, 0), desc: 'Affordable open parking 5 minutes from Cyber Hub. Daily and hourly bookings welcome.' },
  { owner: 'Meera Iyer', title: 'Basement slot, Koramangala', address: '5th Block, Koramangala, Bengaluru, Karnataka', city: 'Bangalore', lat: 12.9352, lng: 77.6245, price: 50, rating: 4.7, reviews: 110, type: 'Car', covered: true, amenities: ['CCTV', 'Covered', '24/7 Access'], imgs: pick(0, 3, 1), desc: 'Covered basement slot in a safe commercial building, lift access to all floors.' },
  { owner: 'Imran Khan', title: 'Bike parking near Andheri Station', address: 'Andheri East, Mumbai, Maharashtra', city: 'Mumbai', lat: 19.1197, lng: 72.8468, price: 20, rating: 4.4, reviews: 67, type: 'Bike', covered: true, amenities: ['Covered', 'CCTV'], imgs: pick(1, 4, 2), desc: 'Covered bike parking 3 minutes walk from Andheri station. Great for daily commuters.' },
  { owner: 'Deepak Gupta', title: 'Premium slot, Noida Sector 62', address: 'Sector 62, Noida, Uttar Pradesh', city: 'Noida', lat: 28.6272, lng: 77.3729, price: 35, rating: 4.6, reviews: 91, type: 'Both', covered: true, amenities: ['CCTV', 'Covered', '24/7 Access', 'EV Charging'], imgs: pick(3, 2, 4), desc: 'Covered parking inside a tech park campus area, monthly passes also available on request.' }
];

(async () => {
  const exists = await pool.query(`SELECT 1 FROM users WHERE email LIKE '%@seed.parkease.invalid' LIMIT 1`);
  if (exists.rowCount) { console.log('Seed data already present, skipping.'); return pool.end(); }

  for (const d of DATA) {
    const email = d.owner.toLowerCase().replace(/\s+/g, '.') + '@seed.parkease.invalid';
    const hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);   // koi login nahi kar sakta
    const u = await pool.query(
      `INSERT INTO users (name, email, password_hash) VALUES ($1,$2,$3) RETURNING id`, [d.owner, email, hash]);
    await pool.query(
      `INSERT INTO listings (owner_id, title, address, city, lat, lng, price_per_hour, vehicle_type, covered, amenities, description, images, rating, review_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [u.rows[0].id, d.title, d.address, d.city, d.lat, d.lng, d.price, d.type, d.covered, d.amenities, d.desc, d.imgs, d.rating, d.reviews]);
  }
  console.log(`Seeded ${DATA.length} demo listings.`);
  await pool.end();
})().catch(e => { console.error('seed failed:', e.message); process.exit(1); });

-- ParkEase database schema (PostgreSQL)
-- Chalane ka tarika:  npm run db:init   (ya psql "$DATABASE_URL" -f schema.sql)

-- btree_gist: "ek hi listing par do bookings ka time overlap na ho" wala rule lagane ke liye
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1) USERS ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT        NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  email         TEXT        NOT NULL UNIQUE,
  phone         TEXT,
  password_hash TEXT        NOT NULL,              -- kabhi asli password nahi, sirf bcrypt hash
  role          TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) LISTINGS ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS listings (
  id             SERIAL PRIMARY KEY,
  owner_id       INT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT        NOT NULL,
  address        TEXT        NOT NULL,
  city           TEXT        NOT NULL,
  lat            DOUBLE PRECISION NOT NULL,
  lng            DOUBLE PRECISION NOT NULL,
  price_per_hour INT         NOT NULL CHECK (price_per_hour BETWEEN 5 AND 5000),
  vehicle_type   TEXT        NOT NULL CHECK (vehicle_type IN ('Bike', 'Car', 'Both')),
  covered        BOOLEAN     NOT NULL DEFAULT false,
  amenities      TEXT[]      NOT NULL DEFAULT '{}',
  description    TEXT        NOT NULL DEFAULT '',
  images         TEXT[]      NOT NULL DEFAULT '{}',
  status         TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deleted')),
  views          INT         NOT NULL DEFAULT 0,
  rating         NUMERIC(2,1),                     -- NULL = abhi koi review nahi ("New")
  review_count   INT         NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listings_owner_idx  ON listings(owner_id);
CREATE INDEX IF NOT EXISTS listings_status_idx ON listings(status);

-- 3) BOOKINGS ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
  id          SERIAL PRIMARY KEY,
  ref         TEXT        NOT NULL UNIQUE,         -- user ko dikhne wala booking ID, jaise PE3FA91C2B
  listing_id  INT         NOT NULL REFERENCES listings(id),
  user_id     INT         NOT NULL REFERENCES users(id),
  start_time  TIMESTAMPTZ NOT NULL,
  end_time    TIMESTAMPTZ NOT NULL,
  hours       INT         NOT NULL CHECK (hours BETWEEN 1 AND 24),
  amount      NUMERIC(10,2) NOT NULL,              -- server ne calculate kiya hua total
  pay_method  TEXT        NOT NULL DEFAULT 'upi',
  status      TEXT        NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time),

  -- DOUBLE-BOOKING ROKNE KA ASLI RULE (database level par, race condition mein bhi safe):
  -- ek hi listing ke do 'confirmed' bookings ka time-range aapas mein overlap nahi kar sakta.
  CONSTRAINT no_double_booking
    EXCLUDE USING gist (listing_id WITH =, tstzrange(start_time, end_time) WITH &&)
    WHERE (status = 'confirmed')
);
CREATE INDEX IF NOT EXISTS bookings_user_idx ON bookings(user_id);

-- 4) SECURITY: ROW LEVEL SECURITY (Supabase par ye ZAROORI hai) --------------
-- Supabase har table ko ek public REST API (anon key se) par khol deta hai jab tak RLS band ho.
-- Anon key website ke code mein dikh sakti hai, isliye RLS ON + koi policy nahi = anon key se
-- users/bookings table koi nahi padh sakta (password hash bhi nahi).
-- Hamara backend database owner ('postgres' role) se connect hota hai, jo RLS bypass karta hai,
-- isliye hamare server par iska koi asar nahi padta. Normal Postgres par bhi ye nuksan nahi karta.
ALTER TABLE users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

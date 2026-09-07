import 'server-only'

/**
 * Postgres schema. Idempotent — safe to run on every cold start.
 *
 * Written to the dialect Neon speaks, and exercised locally through PGlite so
 * the two never drift.
 */
export const SCHEMA = `
-- ─────────────────────────────────────────────────────────── identity
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  phone          TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL DEFAULT '',
  email          TEXT,
  dob            DATE,
  gender         TEXT,
  city           TEXT,
  role           TEXT NOT NULL DEFAULT 'patient',
  tenant_region  TEXT NOT NULL DEFAULT 'IN-MH',
  kyc_level      TEXT NOT NULL DEFAULT 'unverified',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS otps (
  phone      TEXT PRIMARY KEY,
  code       TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts   INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS admins (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token      TEXT PRIMARY KEY,
  admin_id   TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Fixed-window counters (OTP abuse, admin brute force, booking spam).
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket       TEXT NOT NULL,
  key          TEXT NOT NULL,
  count        INT NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket, key)
);

-- ──────────────────────────────────────────────── geography (map-free)
CREATE TABLE IF NOT EXISTS localities (
  locality_id SERIAL PRIMARY KEY,
  pin_code    TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  city        TEXT NOT NULL,
  -- Centroid is written by the offline batch job only. Never read on the
  -- request path, never rendered — it exists so adjacency can be recomputed.
  lat         NUMERIC(9,6),
  lng         NUMERIC(9,6)
);
CREATE INDEX IF NOT EXISTS idx_localities_name ON localities(lower(name));

-- Pre-materialised proximity. Built offline; the request path does an indexed
-- join and never touches lat/lng or a spatial index.
CREATE TABLE IF NOT EXISTS locality_adjacency (
  locality_id          INT NOT NULL REFERENCES localities(locality_id) ON DELETE CASCADE,
  neighbor_locality_id INT NOT NULL REFERENCES localities(locality_id) ON DELETE CASCADE,
  ring                 SMALLINT NOT NULL DEFAULT 1,
  distance_km          NUMERIC(5,1),
  PRIMARY KEY (locality_id, neighbor_locality_id)
);
CREATE INDEX IF NOT EXISTS idx_adjacency_ring ON locality_adjacency(locality_id, ring);

-- ───────────────────────────────────────────────────────────── supply
CREATE TABLE IF NOT EXISTS doctors (
  id               TEXT PRIMARY KEY,
  user_id          TEXT REFERENCES users(id) ON DELETE SET NULL,
  slug             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  speciality       TEXT NOT NULL,
  qualification    TEXT NOT NULL DEFAULT '',
  experience       SMALLINT NOT NULL DEFAULT 0,
  clinic           TEXT NOT NULL DEFAULT '',
  locality_id      INT REFERENCES localities(locality_id),
  pin_code         TEXT NOT NULL DEFAULT '',
  locality         TEXT NOT NULL DEFAULT '',
  city             TEXT NOT NULL DEFAULT '',
  fee              INT NOT NULL DEFAULT 0,
  registration_no  TEXT,
  council          TEXT,
  status           TEXT NOT NULL DEFAULT 'PENDING',
  rating           NUMERIC(2,1) NOT NULL DEFAULT 0,
  reviews_count    INT NOT NULL DEFAULT 0,
  video            BOOLEAN NOT NULL DEFAULT false,
  cashless         BOOLEAN NOT NULL DEFAULT false,
  home_visit       BOOLEAN NOT NULL DEFAULT false,
  gender           TEXT NOT NULL DEFAULT 'Female',
  languages        TEXT NOT NULL DEFAULT '',
  next_slot        TEXT NOT NULL DEFAULT '',
  kind             TEXT NOT NULL DEFAULT 'human',
  about            TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doctors_locality ON doctors(locality_id);
CREATE INDEX IF NOT EXISTS idx_doctors_pin ON doctors(pin_code);
CREATE INDEX IF NOT EXISTS idx_doctors_speciality ON doctors(speciality);
CREATE INDEX IF NOT EXISTS idx_doctors_status ON doctors(status);

-- Full-text search, replacing the Elasticsearch index. One store means no CDC
-- pipeline and no dual-write consistency problem.
CREATE INDEX IF NOT EXISTS idx_doctors_fts ON doctors
  USING GIN (to_tsvector('english', name || ' ' || speciality || ' ' || locality || ' ' || about));

-- Append-only. Medical-board disputes need the transition history, so status
-- is never mutated without a corresponding row here.
CREATE TABLE IF NOT EXISTS provider_status_history (
  id          TEXT PRIMARY KEY,
  doctor_id   TEXT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  reason      TEXT,
  actor       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_documents (
  id         TEXT PRIMARY KEY,
  doctor_id  TEXT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  doc_type   TEXT NOT NULL,
  blob_url   TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'UPLOADED',
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────── booking engine
-- Slot state machine:
--   AVAILABLE → LOCKED_PENDING_PAYMENT → BOOKED → COMPLETED | NO_SHOW
--                        ↓ (TTL / failure)
--                    AVAILABLE
CREATE TABLE IF NOT EXISTS appointment_slots (
  slot_id      TEXT PRIMARY KEY,
  doctor_id    TEXT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  slot_start   TIMESTAMPTZ NOT NULL,
  slot_end     TIMESTAMPTZ NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'clinic',
  status       TEXT NOT NULL DEFAULT 'AVAILABLE',
  locked_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  locked_until TIMESTAMPTZ,
  -- Optimistic concurrency guard. This, not the Redis lock, is what actually
  -- makes double-booking impossible.
  version      INT NOT NULL DEFAULT 0,
  UNIQUE (doctor_id, slot_start)
);
CREATE INDEX IF NOT EXISTS idx_slots_doctor_start ON appointment_slots(doctor_id, slot_start);
CREATE INDEX IF NOT EXISTS idx_slots_expiry ON appointment_slots(status, locked_until);

CREATE TABLE IF NOT EXISTS bookings (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doctor_id    TEXT NOT NULL,
  slot_id      TEXT REFERENCES appointment_slots(slot_id) ON DELETE SET NULL,
  kind         TEXT NOT NULL,
  slot         TEXT NOT NULL,
  fee          INT NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'confirmed',
  payment_ref  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);

-- ──────────────────────────────────────────── documents (was NoSQL)
-- Variable-shape records. JSONB keeps the document model — a prescription's
-- drug list is one value, not a join table — while staying in one database.
CREATE TABLE IF NOT EXISTS documents (
  id          TEXT PRIMARY KEY,
  collection  TEXT NOT NULL,
  subject_id  TEXT,
  body        JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents(collection, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_subject ON documents(collection, subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_body ON documents USING GIN (body);

-- ─────────────────────────────────────────────────────── audit trail
-- Append-only by grant, not just convention. The migration revokes UPDATE and
-- DELETE from the application role, which is the closest equivalent to S3
-- Object Lock available inside Postgres.
CREATE TABLE IF NOT EXISTS audit_log (
  id            BIGSERIAL PRIMARY KEY,
  actor_id      TEXT,
  actor_role    TEXT,
  action        TEXT NOT NULL,
  resource      TEXT,
  tenant_region TEXT,
  detail        JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id, created_at DESC);

-- Append-only by rule, not convention. A trigger is used rather than a GRANT
-- because the app connects as the owner on managed Postgres, and an owner can
-- always re-grant itself. This cannot be bypassed without dropping the trigger,
-- which itself shows up in the database's own DDL history.
CREATE OR REPLACE FUNCTION audit_log_is_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_mutate ON audit_log;
CREATE TRIGGER audit_log_no_mutate
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_is_append_only();

-- ───────────────────────────────────────────────── double-entry ledger
CREATE TABLE IF NOT EXISTS ledger_accounts (
  account_id   TEXT PRIMARY KEY,
  account_type TEXT NOT NULL,
  owner_id     TEXT,
  balance      NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  entry_id       TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  account_id     TEXT NOT NULL REFERENCES ledger_accounts(account_id),
  direction      TEXT NOT NULL CHECK (direction IN ('DEBIT','CREDIT')),
  amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ledger_txn ON ledger_entries(transaction_id);

-- Webhook replay guard. Payment providers deliver more than once by design.
CREATE TABLE IF NOT EXISTS processed_events (
  event_id    TEXT PRIMARY KEY,
  source      TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`

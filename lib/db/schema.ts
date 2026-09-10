import 'server-only'

/**
 * Postgres schema. Idempotent — safe to run on every cold start.
 *
 * Written to the dialect Neon speaks, and exercised locally through PGlite so
 * the two never drift.
 */
export const SCHEMA = `
-- ────────────────────────────────────────────────────────── namespaces
--
-- Three domain schemas, one database.
--
--   patient.*   people, their families, their bookings
--   provider.*  clinicians, their credentials, their calendars
--   clinic.*    the operational workflows a clinic runs — surgery leads,
--               referrals, diagnostic orders
--
-- Separate physical databases were the other option and were rejected on one
-- concrete ground: Postgres cannot enforce a foreign key across databases, so
-- patient.bookings → provider.doctors would degrade from a constraint the
-- engine guarantees into an id the application promises to check. Schemas keep
-- that guarantee while still giving each domain its own namespace and its own
-- GRANTs, which is what the separation was actually for.
--
-- Shared infrastructure and reference data (auth challenges, admins, rate
-- limits, localities, the document store, the audit log, the ledger) stays in
-- public: it belongs to no single domain and all three read it.
CREATE SCHEMA IF NOT EXISTS patient;
CREATE SCHEMA IF NOT EXISTS provider;
CREATE SCHEMA IF NOT EXISTS clinic;

-- ─────────────────────────────────────────────────────────── identity
CREATE TABLE IF NOT EXISTS patient.users (
  id             TEXT PRIMARY KEY,
  -- Nullable: an account created through Google arrives with an email and no
  -- phone number, and demanding one before the person has done anything would
  -- be a worse first impression than asking for it at the first booking.
  phone          TEXT UNIQUE,
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

-- Existing databases were created when a phone number was mandatory. Both
-- statements are safe to re-run, so they double as the migration.
ALTER TABLE patient.users ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE patient.users ADD COLUMN IF NOT EXISTS google_sub TEXT;

-- Partial, so the many rows with no email do not collide on NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
  ON patient.users(lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google
  ON patient.users(google_sub) WHERE google_sub IS NOT NULL;

-- An account must be reachable by something.
ALTER TABLE patient.users DROP CONSTRAINT IF EXISTS users_have_an_identifier;
ALTER TABLE patient.users ADD CONSTRAINT users_have_an_identifier
  CHECK (phone IS NOT NULL OR email IS NOT NULL);

CREATE TABLE IF NOT EXISTS patient.sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES patient.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON patient.sessions(user_id);

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

-- ────────────────────────────────────────────────────── patient: family
-- One account books for a household. In India that is the normal case, not an
-- edge case: an adult books for a parent who does not use apps and for
-- children who cannot consent, so the booking has to record *who the care is
-- for* separately from who arranged it.
CREATE TABLE IF NOT EXISTS patient.family_members (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES patient.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  relation    TEXT NOT NULL,
  dob         DATE,
  gender      TEXT,
  blood_group TEXT,
  phone       TEXT,
  -- The account holder's own row, created with the account and not deletable.
  is_self     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_family_user ON patient.family_members(user_id, created_at);
-- Exactly one "self" row per account.
CREATE UNIQUE INDEX IF NOT EXISTS idx_family_one_self
  ON patient.family_members(user_id) WHERE is_self;

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
CREATE TABLE IF NOT EXISTS provider.doctors (
  id               TEXT PRIMARY KEY,
  user_id          TEXT REFERENCES patient.users(id) ON DELETE SET NULL,
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
CREATE INDEX IF NOT EXISTS idx_doctors_locality ON provider.doctors(locality_id);
CREATE INDEX IF NOT EXISTS idx_doctors_pin ON provider.doctors(pin_code);
CREATE INDEX IF NOT EXISTS idx_doctors_speciality ON provider.doctors(speciality);
CREATE INDEX IF NOT EXISTS idx_doctors_status ON provider.doctors(status);

-- Full-text search, replacing the Elasticsearch index. One store means no CDC
-- pipeline and no dual-write consistency problem.
CREATE INDEX IF NOT EXISTS idx_doctors_fts ON provider.doctors
  USING GIN (to_tsvector('english', name || ' ' || speciality || ' ' || locality || ' ' || about));

-- Append-only. Medical-board disputes need the transition history, so status
-- is never mutated without a corresponding row here.
--
-- RESTRICT rather than CASCADE. A cascade would be a back door: deleting the
-- doctor destroys the very history a dispute turns on, without any UPDATE or
-- DELETE on this table ever being attempted. Removing a clinician from the
-- platform is a status transition (to SUSPENDED or REMOVED), not a row
-- deletion — which is exactly what this table records.
CREATE TABLE IF NOT EXISTS provider.status_history (
  id          TEXT PRIMARY KEY,
  doctor_id   TEXT NOT NULL REFERENCES provider.doctors(id) ON DELETE RESTRICT,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  reason      TEXT,
  actor       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Registration certificates and qualification proofs: the evidence a
-- verification decision rested on. Same reasoning as status_history — if a
-- clinician's listing is challenged, "we checked their council number" has to
-- be provable after they have left the platform.
CREATE TABLE IF NOT EXISTS provider.documents (
  id         TEXT PRIMARY KEY,
  doctor_id  TEXT NOT NULL REFERENCES provider.doctors(id) ON DELETE RESTRICT,
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
CREATE TABLE IF NOT EXISTS provider.appointment_slots (
  slot_id      TEXT PRIMARY KEY,
  doctor_id    TEXT NOT NULL REFERENCES provider.doctors(id) ON DELETE CASCADE,
  slot_start   TIMESTAMPTZ NOT NULL,
  slot_end     TIMESTAMPTZ NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'clinic',
  status       TEXT NOT NULL DEFAULT 'AVAILABLE',
  locked_by    TEXT REFERENCES patient.users(id) ON DELETE SET NULL,
  locked_until TIMESTAMPTZ,
  -- Optimistic concurrency guard. This, not the Redis lock, is what actually
  -- makes double-booking impossible.
  version      INT NOT NULL DEFAULT 0,
  UNIQUE (doctor_id, slot_start)
);
CREATE INDEX IF NOT EXISTS idx_slots_doctor_start ON provider.appointment_slots(doctor_id, slot_start);
CREATE INDEX IF NOT EXISTS idx_slots_expiry ON provider.appointment_slots(status, locked_until);

CREATE TABLE IF NOT EXISTS patient.bookings (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES patient.users(id) ON DELETE CASCADE,
  doctor_id    TEXT NOT NULL,
  slot_id      TEXT REFERENCES provider.appointment_slots(slot_id) ON DELETE SET NULL,
  kind         TEXT NOT NULL,
  slot         TEXT NOT NULL,
  fee          INT NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'confirmed',
  payment_ref  TEXT,
  -- Set when the clinician marks the patient as seen. This is the fact a
  -- review is gated on: without it, any signed-in account could rate any
  -- doctor, which is exactly the manipulation the trust page promises we
  -- prevent.
  attended_at  TIMESTAMPTZ,
  -- Who the appointment is for. Null means the account holder themselves,
  -- which keeps every booking made before family members existed valid.
  patient_for  TEXT REFERENCES patient.family_members(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON patient.bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_doctor ON patient.bookings(doctor_id, status);

-- doctor_id was a bare TEXT column until now, so a booking could name a
-- clinician who does not exist and nothing would object. Added as an ALTER
-- rather than inline so existing databases pick it up too.
ALTER TABLE patient.bookings DROP CONSTRAINT IF EXISTS bookings_doctor_fk;
ALTER TABLE patient.bookings ADD CONSTRAINT bookings_doctor_fk
  FOREIGN KEY (doctor_id) REFERENCES provider.doctors(id) ON DELETE CASCADE;

-- ───────────────────────────────────────────────── clinic: surgery leads
-- A surgery enquiry is a callback request, not a booking. It carries no slot
-- and no payment; what it needs is triage.
--
--   NEW → APPROVED → ROUTED
--     ↓
--   REJECTED
--
-- Admin approval sits deliberately in the middle. A surgical enquiry names a
-- procedure and a phone number, and routing it straight to a surgeon would
-- hand unverified clinical claims to a clinician and a stranger's number to a
-- diagnostic centre. A person checks it first.
CREATE TABLE IF NOT EXISTS clinic.surgery_leads (
  id           TEXT PRIMARY KEY,
  user_id      TEXT REFERENCES patient.users(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL,
  city         TEXT NOT NULL DEFAULT '',
  procedure    TEXT NOT NULL DEFAULT '',
  notes        TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'NEW',
  reviewed_by  TEXT,
  reviewed_at  TIMESTAMPTZ,
  reject_reason TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leads_status ON clinic.surgery_leads(status, created_at DESC);

-- Where an approved lead was sent. Two destinations, one table, because the
-- question asked of it is always "what happened to this lead".
-- Itemised surgery estimates.
--
-- The anxiety this addresses is specific: a patient agrees to a number, then
-- the bill arrives inflated by a room category nobody mentioned, consumables,
-- and administration. So the estimate names every line before admission.
--
-- Immutable once issued. A revision is a NEW row that supersedes the old one,
-- never an edit, so "the price changed" is always provable and "the price was
-- always this" can never be claimed retroactively. Software cannot make an
-- estimate legally binding; what it can do is make a quiet change impossible
-- to hide, which is the part that actually protects the patient.
CREATE TABLE IF NOT EXISTS clinic.estimates (
  id            TEXT PRIMARY KEY,
  -- RESTRICT, not CASCADE. A cascade would be a back door through the
  -- immutability guarantee: delete the enquiry and the priced document
  -- disappears with it, without any UPDATE or DELETE on this table ever being
  -- attempted. An enquiry carrying an issued estimate has to be kept.
  lead_id       TEXT NOT NULL REFERENCES clinic.surgery_leads(id) ON DELETE RESTRICT,
  procedure     TEXT NOT NULL,
  hospital      TEXT NOT NULL DEFAULT '',
  room_tier     TEXT NOT NULL DEFAULT 'General ward',
  -- [{ label, amount, note }] — the breakdown the patient sees.
  line_items    JSONB NOT NULL DEFAULT '[]'::jsonb,
  total         INT NOT NULL DEFAULT 0,
  -- Fingerprint of the priced content. Lets a patient prove the sheet they
  -- were shown is the sheet on file, without trusting our own UI.
  content_hash  TEXT NOT NULL,
  -- The row this one replaces, if any.
  supersedes    TEXT REFERENCES clinic.estimates(id) ON DELETE SET NULL,
  issued_by     TEXT,
  valid_until   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_estimates_lead ON clinic.estimates(lead_id, created_at DESC);

CREATE OR REPLACE FUNCTION clinic.estimates_are_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'an issued estimate cannot be %: supersede it with a new one', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS estimates_no_mutate ON clinic.estimates;
CREATE TRIGGER estimates_no_mutate
  BEFORE UPDATE OR DELETE ON clinic.estimates
  FOR EACH ROW EXECUTE FUNCTION clinic.estimates_are_immutable();

-- A patient saying "the desk is asking for more than this". Kept separate from
-- the estimate so raising it cannot alter the document being disputed.
CREATE TABLE IF NOT EXISTS clinic.estimate_disputes (
  id           TEXT PRIMARY KEY,
  estimate_id  TEXT NOT NULL REFERENCES clinic.estimates(id) ON DELETE CASCADE,
  raised_by    TEXT REFERENCES patient.users(id) ON DELETE SET NULL,
  quoted_total INT,
  detail       TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'OPEN',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_disputes_estimate ON clinic.estimate_disputes(estimate_id);

CREATE TABLE IF NOT EXISTS clinic.referrals (
  id          TEXT PRIMARY KEY,
  lead_id     TEXT NOT NULL REFERENCES clinic.surgery_leads(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  doctor_id   TEXT REFERENCES provider.doctors(id) ON DELETE SET NULL,
  centre_name TEXT,
  status      TEXT NOT NULL DEFAULT 'SENT',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A referral goes to a clinician or to a diagnostic centre, never both and
  -- never neither; the check stops a half-filled row from being written.
  CONSTRAINT referral_has_a_destination CHECK (
    (kind = 'doctor'     AND doctor_id   IS NOT NULL) OR
    (kind = 'diagnostic' AND centre_name IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_referrals_lead ON clinic.referrals(lead_id);
CREATE INDEX IF NOT EXISTS idx_referrals_doctor ON clinic.referrals(doctor_id, created_at DESC);

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
-- ─────────────────────────────────────────────── transactional outbox
--
-- Notifications used to be sent inline: if the SMS gateway was down, the
-- booking still committed, the patient was never told, and nothing retried.
-- The event is now written in the same transaction as the thing it describes,
-- so either both happen or neither does. Delivery is a separate concern that
-- can fail and be retried without touching the booking.
--
-- No foreign keys. An event is a statement about something that happened, and
-- it has to remain sendable — and diagnosable — even if the row it refers to
-- is later removed. The subject is recorded as plain text for the same reason
-- audit_log holds ids that way.
CREATE TABLE IF NOT EXISTS domain_events (
  id           BIGSERIAL PRIMARY KEY,
  kind         TEXT NOT NULL,
  subject_id   TEXT,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- PENDING → SENT, or PENDING → FAILED once attempts run out.
  status       TEXT NOT NULL DEFAULT 'PENDING',
  attempts     INT NOT NULL DEFAULT 0,
  last_error   TEXT,
  -- Claimed by one worker at a time. Set when a drain picks the row up, so a
  -- second drain running concurrently cannot send the same message twice.
  locked_until TIMESTAMPTZ,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- The drain query: pending work that is due, oldest first.
CREATE INDEX IF NOT EXISTS idx_events_pending
  ON domain_events(status, available_at)
  WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS audit_log (
  id            BIGSERIAL PRIMARY KEY,
  -- Plain TEXT, deliberately NOT a foreign key to patient.users.
  --
  -- A reference would make this table cascade-deletable, and erasing an
  -- account would then destroy the record of who read that person's data —
  -- precisely the evidence a regulator asks for after an erasure dispute.
  -- The cost is that ids here can outlive the rows they name, which is the
  -- correct trade for an audit log and wrong for almost anything else.
  --
  -- Do not "fix" this by adding a REFERENCES clause.
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

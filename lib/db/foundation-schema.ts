/** Ordered additive migration. Existing text identifiers and clinical history are retained. */
export const FOUNDATION = `
ALTER TABLE patient.users ADD COLUMN email_verified_at TIMESTAMPTZ;
ALTER TABLE patient.users ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE patient.family_members ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE patient.sessions ADD COLUMN last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE admin_sessions ADD COLUMN last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();
DROP INDEX IF EXISTS patient.idx_users_email;
CREATE UNIQUE INDEX users_verified_email ON patient.users(lower(email)) WHERE email_verified_at IS NOT NULL;
UPDATE patient.users SET email_verified_at=created_at WHERE google_sub IS NOT NULL;
UPDATE patient.sessions SET expires_at=now();
UPDATE admin_sessions SET expires_at=now();
UPDATE otps SET expires_at=now();
ALTER TABLE otps ADD COLUMN challenge_id TEXT;
ALTER TABLE otps ADD COLUMN sent_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE admins ADD COLUMN totp_secret TEXT;
ALTER TABLE admins ADD COLUMN last_totp_step BIGINT;
ALTER TABLE rate_limits ADD COLUMN events TIMESTAMPTZ[] NOT NULL DEFAULT '{}';
ALTER TABLE provider.doctors ADD COLUMN verified_at TIMESTAMPTZ;
ALTER TABLE provider.doctors ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE provider.doctors ADD COLUMN supported_species TEXT[] NOT NULL DEFAULT ARRAY['dog','cat'];
ALTER TABLE provider.doctors ADD COLUMN fee_paise BIGINT GENERATED ALWAYS AS (fee::bigint * 100) STORED;

CREATE TABLE clinic.clinics (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '',
 timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata', status TEXT NOT NULL DEFAULT 'ACTIVE', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE clinic.memberships (
 clinic_id TEXT NOT NULL REFERENCES clinic.clinics(id), user_id TEXT NOT NULL REFERENCES patient.users(id),
 role TEXT NOT NULL CHECK(role IN ('clinician','receptionist','administrator','lab')), status TEXT NOT NULL DEFAULT 'ACTIVE',
 PRIMARY KEY(clinic_id,user_id)
);
CREATE INDEX membership_user ON clinic.memberships(user_id,status);
ALTER TABLE provider.doctors ADD COLUMN clinic_id TEXT REFERENCES clinic.clinics(id);
CREATE UNIQUE INDEX doctor_account_unique ON provider.doctors(user_id) WHERE user_id IS NOT NULL;
CREATE TABLE provider.applications (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES patient.users(id), doctor_id TEXT REFERENCES provider.doctors(id),
 draft JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'DRAFT', reason TEXT, revision INT NOT NULL DEFAULT 0,
 submitted_at TIMESTAMPTZ, reviewed_at TIMESTAMPTZ, reviewed_by TEXT REFERENCES admins(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX application_open ON provider.applications(user_id) WHERE status IN ('DRAFT','SUBMITTED','NEEDS_CHANGES');
CREATE TABLE provider.schedule_rules (
 id TEXT PRIMARY KEY, doctor_id TEXT NOT NULL REFERENCES provider.doctors(id), weekday SMALLINT NOT NULL CHECK(weekday BETWEEN 0 AND 6),
 start_minute SMALLINT NOT NULL CHECK(start_minute BETWEEN 0 AND 1439), end_minute SMALLINT NOT NULL CHECK(end_minute BETWEEN 1 AND 1440),
 duration_minutes SMALLINT NOT NULL CHECK(duration_minutes BETWEEN 5 AND 120),
 enabled BOOLEAN NOT NULL DEFAULT true, CHECK(end_minute > start_minute), UNIQUE(doctor_id,weekday,start_minute)
);
CREATE TABLE provider.schedule_exceptions (
 doctor_id TEXT NOT NULL REFERENCES provider.doctors(id), day DATE NOT NULL, closed BOOLEAN NOT NULL DEFAULT true,
 reason TEXT NOT NULL DEFAULT '', PRIMARY KEY(doctor_id,day)
);
CREATE TABLE patient.pets (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES patient.users(id), name TEXT NOT NULL,
 species TEXT NOT NULL CHECK(species IN ('dog','cat','rabbit','bird','other')), breed TEXT NOT NULL DEFAULT '',
 dob DATE, sex TEXT NOT NULL DEFAULT 'unknown' CHECK(sex IN ('male','female','unknown')), neutered BOOLEAN,
 microchip TEXT, archived_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pet_owner ON patient.pets(owner_id,created_at);
CREATE TABLE patient.pet_measurements (
 id TEXT PRIMARY KEY, pet_id TEXT NOT NULL REFERENCES patient.pets(id), weight_kg NUMERIC(7,3) CHECK(weight_kg>0),
 measured_at TIMESTAMPTZ NOT NULL DEFAULT now(), recorded_by TEXT NOT NULL REFERENCES patient.users(id)
);
CREATE TABLE patient.pet_vaccinations (
 id TEXT PRIMARY KEY, pet_id TEXT NOT NULL REFERENCES patient.pets(id), name TEXT NOT NULL, batch TEXT,
 given_on DATE NOT NULL, due_on DATE, recorded_by TEXT NOT NULL REFERENCES patient.users(id),
 reminder_sent BOOLEAN NOT NULL DEFAULT false, CHECK(due_on IS NULL OR due_on >= given_on)
);
ALTER TABLE patient.bookings ADD COLUMN pet_id TEXT REFERENCES patient.pets(id);
ALTER TABLE patient.bookings ADD COLUMN starts_at TIMESTAMPTZ;
ALTER TABLE patient.bookings ADD COLUMN ends_at TIMESTAMPTZ;
ALTER TABLE patient.bookings ADD COLUMN revision INT NOT NULL DEFAULT 0;
ALTER TABLE patient.bookings ADD COLUMN idempotency_key TEXT;
ALTER TABLE patient.bookings ADD COLUMN request_hash TEXT;
ALTER TABLE patient.bookings ADD COLUMN cancelled_at TIMESTAMPTZ;
ALTER TABLE patient.bookings ADD COLUMN checked_in_at TIMESTAMPTZ;
ALTER TABLE patient.bookings ADD COLUMN started_at TIMESTAMPTZ;
ALTER TABLE patient.bookings ADD COLUMN fee_paise BIGINT GENERATED ALWAYS AS (fee::bigint * 100) STORED;
ALTER TABLE patient.bookings ADD CONSTRAINT booking_one_subject CHECK(NOT(patient_for IS NOT NULL AND pet_id IS NOT NULL));
CREATE UNIQUE INDEX booking_idempotency ON patient.bookings(user_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
UPDATE patient.bookings b SET starts_at=s.slot_start,ends_at=s.slot_end FROM provider.appointment_slots s WHERE b.slot_id=s.slot_id;
ALTER TABLE provider.appointment_slots ADD COLUMN reserved_booking_id TEXT REFERENCES patient.bookings(id);
ALTER TABLE provider.appointment_slots ADD CONSTRAINT valid_slot_interval CHECK(slot_end > slot_start);
UPDATE provider.appointment_slots s SET reserved_booking_id=b.id FROM patient.bookings b
 WHERE b.slot_id=s.slot_id AND b.status IN ('requested','confirmed') AND b.user_id=s.locked_by
 AND (SELECT count(*) FROM patient.bookings x WHERE x.slot_id=s.slot_id AND x.status IN ('requested','confirmed'))=1;
CREATE INDEX booking_time ON patient.bookings(user_id,starts_at,id);
CREATE TABLE appointment_history (
 id BIGSERIAL PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES patient.bookings(id), actor_id TEXT,
 from_status TEXT, to_status TEXT NOT NULL, revision INT NOT NULL, reason TEXT, occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(booking_id,revision)
);
CREATE TABLE patient.consents (
 id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES patient.users(id), purpose TEXT NOT NULL,
 subject_id TEXT, booking_id TEXT REFERENCES patient.bookings(id), version TEXT NOT NULL,
 granted_at TIMESTAMPTZ NOT NULL DEFAULT now(), revoked_at TIMESTAMPTZ
);
CREATE TABLE clinic.encounters (
 id TEXT PRIMARY KEY, booking_id TEXT NOT NULL UNIQUE REFERENCES patient.bookings(id), doctor_id TEXT NOT NULL REFERENCES provider.doctors(id),
 patient_user_id TEXT NOT NULL REFERENCES patient.users(id), family_id TEXT REFERENCES patient.family_members(id), pet_id TEXT REFERENCES patient.pets(id),
 state TEXT NOT NULL DEFAULT 'OPEN', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), closed_at TIMESTAMPTZ,
 CHECK(NOT(family_id IS NOT NULL AND pet_id IS NOT NULL))
);
ALTER TABLE documents ADD COLUMN encounter_id TEXT REFERENCES clinic.encounters(id);
ALTER TABLE documents ADD COLUMN owner_id TEXT REFERENCES patient.users(id);
ALTER TABLE documents ADD COLUMN clinician_id TEXT REFERENCES provider.doctors(id);
ALTER TABLE documents ADD COLUMN revision INT NOT NULL DEFAULT 1;
ALTER TABLE documents ADD COLUMN supersedes TEXT REFERENCES documents(id);
ALTER TABLE documents ADD COLUMN lifecycle TEXT NOT NULL DEFAULT 'SIGNED';
-- Preserve duplicate historical reviews in an archive collection before adding uniqueness.
UPDATE documents SET collection='reviews_duplicate_archive' WHERE id IN (
 SELECT id FROM (SELECT id,row_number() OVER(PARTITION BY subject_id,body->>'userId' ORDER BY created_at,id) AS n
 FROM documents WHERE collection='reviews' AND body->>'userId' IS NOT NULL) numbered WHERE n>1
);
CREATE UNIQUE INDEX review_one_user_provider ON documents(subject_id,(body->>'userId')) WHERE collection='reviews';
UPDATE provider.doctors d SET rating=coalesce((SELECT round(avg((r.body->>'rating')::numeric),1) FROM documents r
 WHERE r.collection='reviews' AND r.subject_id=d.slug),0), reviews_count=(SELECT count(*) FROM documents r
 WHERE r.collection='reviews' AND r.subject_id=d.slug);
CREATE TABLE private_files (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES patient.users(id), uploaded_by TEXT NOT NULL REFERENCES patient.users(id), encounter_id TEXT REFERENCES clinic.encounters(id),
 application_id TEXT REFERENCES provider.applications(id), lab_order_id TEXT,
 original_name TEXT NOT NULL, mime TEXT NOT NULL, bytes BIGINT NOT NULL CHECK(bytes BETWEEN 1 AND 10485760),
 checksum TEXT NOT NULL, storage_key TEXT NOT NULL UNIQUE, state TEXT NOT NULL DEFAULT 'QUARANTINED',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE domain_events ADD COLUMN lease_token TEXT;
ALTER TABLE domain_events ADD COLUMN event_key TEXT;
ALTER TABLE domain_events ADD COLUMN payload_version INT NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX domain_event_key ON domain_events(event_key) WHERE event_key IS NOT NULL;
CREATE TABLE effect_ledger (
 effect_key TEXT PRIMARY KEY, event_id BIGINT REFERENCES domain_events(id), state TEXT NOT NULL,
 provider_ref TEXT, detail JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE patient.notifications (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES patient.users(id), event_id BIGINT REFERENCES domain_events(id),
 title TEXT NOT NULL, body TEXT NOT NULL, read_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(user_id,event_id)
);
CREATE TABLE provider.connections (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES patient.users(id), provider TEXT NOT NULL CHECK(provider IN ('zoom','google')),
 encrypted_tokens TEXT NOT NULL, account_ref TEXT, scopes TEXT, expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(user_id,provider)
);
CREATE TABLE oauth_intents (
 state_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES patient.users(id), provider TEXT NOT NULL,
 verifier TEXT, expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ
);
CREATE TABLE video_sessions (
 id TEXT PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES patient.bookings(id), revision INT NOT NULL,
 provider TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'PENDING', external_id TEXT, encrypted_join TEXT,
 request_ref TEXT NOT NULL UNIQUE, error_code TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(booking_id,revision)
);
CREATE TABLE clinic.lab_packages (
 id TEXT PRIMARY KEY, clinic_id TEXT REFERENCES clinic.clinics(id), name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 fee_paise BIGINT NOT NULL CHECK(fee_paise>=0), status TEXT NOT NULL DEFAULT 'DRAFT', is_demo BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE patient.lab_orders (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES patient.users(id), family_id TEXT REFERENCES patient.family_members(id),
 package_id TEXT NOT NULL REFERENCES clinic.lab_packages(id), fee_paise BIGINT NOT NULL, currency TEXT NOT NULL DEFAULT 'INR',
 state TEXT NOT NULL DEFAULT 'REQUESTED', scheduled_at TIMESTAMPTZ, result_file_id TEXT REFERENCES private_files(id),
 idempotency_key TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(user_id,idempotency_key)
);
ALTER TABLE private_files ADD CONSTRAINT file_lab_order_fk FOREIGN KEY(lab_order_id) REFERENCES patient.lab_orders(id);
CREATE TABLE clinic.invoices (
 id TEXT PRIMARY KEY, booking_id TEXT REFERENCES patient.bookings(id), lab_order_id TEXT REFERENCES patient.lab_orders(id),
 user_id TEXT NOT NULL REFERENCES patient.users(id), total_paise BIGINT NOT NULL CHECK(total_paise>=0),
 currency TEXT NOT NULL DEFAULT 'INR', state TEXT NOT NULL DEFAULT 'UNPAID', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(num_nonnulls(booking_id,lab_order_id)=1)
);
CREATE UNIQUE INDEX invoice_booking ON clinic.invoices(booking_id) WHERE booking_id IS NOT NULL;
CREATE UNIQUE INDEX invoice_lab_order ON clinic.invoices(lab_order_id) WHERE lab_order_id IS NOT NULL;
CREATE TABLE payment_orders (
 id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES clinic.invoices(id), user_id TEXT NOT NULL REFERENCES patient.users(id),
 amount_paise BIGINT NOT NULL CHECK(amount_paise>0), currency TEXT NOT NULL DEFAULT 'INR', gateway TEXT NOT NULL,
 external_id TEXT UNIQUE, state TEXT NOT NULL DEFAULT 'CREATED', idempotency_key TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(user_id,idempotency_key)
);
CREATE TABLE payment_inbox (
 gateway TEXT NOT NULL, event_id TEXT NOT NULL, payload JSONB NOT NULL, received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 processed_at TIMESTAMPTZ, PRIMARY KEY(gateway,event_id)
);
CREATE TABLE refunds (
 id TEXT PRIMARY KEY, payment_id TEXT NOT NULL REFERENCES payment_orders(id), amount_paise BIGINT NOT NULL CHECK(amount_paise>0),
 reason TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'REQUESTED', external_id TEXT UNIQUE,
 requested_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE support_cases (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES patient.users(id), subject TEXT NOT NULL, detail TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'OPEN', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE clinic.settings (
 clinic_id TEXT PRIMARY KEY REFERENCES clinic.clinics(id), reminder_enabled BOOLEAN NOT NULL DEFAULT true,
 contact_phone TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE onboarding_events (
 id BIGSERIAL PRIMARY KEY, application_id TEXT NOT NULL REFERENCES provider.applications(id), actor_id TEXT NOT NULL,
 action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION scoped_records_are_immutable() RETURNS trigger AS $$
BEGIN
 IF OLD.collection IN ('chart_notes','prescriptions') AND OLD.encounter_id IS NOT NULL THEN
  RAISE EXCEPTION 'Signed clinical records are append-only; create an amendment';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER signed_records_no_mutate BEFORE UPDATE OR DELETE ON documents FOR EACH ROW EXECUTE FUNCTION scoped_records_are_immutable();
ALTER TABLE clinic.surgery_leads ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES patient.users(id);
ALTER TABLE provider.connections ADD COLUMN refresh_lease TEXT;
ALTER TABLE provider.connections ADD COLUMN refresh_until TIMESTAMPTZ;
ALTER TABLE clinic.lab_packages ADD COLUMN verified_at TIMESTAMPTZ;
CREATE TABLE notification_delivery (
 effect_key TEXT PRIMARY KEY, channel TEXT NOT NULL, state TEXT NOT NULL, provider_ref TEXT, error_code TEXT,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE worker_runs (id TEXT PRIMARY KEY, expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE maintenance_state (name TEXT PRIMARY KEY,last_run TIMESTAMPTZ NOT NULL);
CREATE TABLE private_file_quota (owner_id TEXT PRIMARY KEY REFERENCES patient.users(id));
ALTER TABLE ledger_accounts ADD COLUMN balance_paise BIGINT NOT NULL DEFAULT 0;
UPDATE ledger_accounts SET balance_paise=(balance*100)::bigint;
ALTER TABLE ledger_entries ADD COLUMN amount_paise BIGINT;
ALTER TABLE payment_orders ADD COLUMN external_payment_id TEXT;
UPDATE ledger_entries SET amount_paise=(amount*100)::bigint;
CREATE TABLE financial_effects (effect_key TEXT PRIMARY KEY,invoice_id TEXT NOT NULL REFERENCES clinic.invoices(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now());
`

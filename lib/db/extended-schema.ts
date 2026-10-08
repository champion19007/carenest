/** Additive local workflow expansion; earlier migration checksums stay unchanged. */
export const EXTENDED = `
CREATE SCHEMA platform;
ALTER TABLE patient.users DROP CONSTRAINT users_have_an_identifier;
ALTER TABLE patient.users ADD CONSTRAINT users_have_an_identifier CHECK(status='ERASED' OR phone IS NOT NULL OR google_sub IS NOT NULL);
CREATE TABLE clinic.people (
 id TEXT PRIMARY KEY,clinic_id TEXT NOT NULL REFERENCES clinic.clinics(id),owner_id TEXT REFERENCES patient.users(id),
 kind TEXT NOT NULL CHECK(kind IN ('human','pet')),encrypted_identity TEXT NOT NULL,claim_hash TEXT UNIQUE,
 claim_expires_at TIMESTAMPTZ,linked_at TIMESTAMPTZ,created_by TEXT NOT NULL REFERENCES patient.users(id),
 consent_attested_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE clinic.walk_ins (
 id TEXT PRIMARY KEY,clinic_id TEXT NOT NULL REFERENCES clinic.clinics(id),person_id TEXT NOT NULL REFERENCES clinic.people(id),
 doctor_id TEXT NOT NULL REFERENCES provider.doctors(id),state TEXT NOT NULL DEFAULT 'WAITING' CHECK(state IN ('WAITING','IN_PROGRESS','ATTENDED','NO_SHOW','CANCELLED')),
 fee_paise BIGINT NOT NULL CHECK(fee_paise>=0),request_key TEXT NOT NULL,request_hash TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES patient.users(id),
 checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),started_at TIMESTAMPTZ,ended_at TIMESTAMPTZ,revision INT NOT NULL DEFAULT 0,
 UNIQUE(clinic_id,request_key)
);
CREATE INDEX walk_in_queue ON clinic.walk_ins(doctor_id,checked_in_at) WHERE state IN ('WAITING','IN_PROGRESS');
ALTER TABLE clinic.encounters ALTER COLUMN booking_id DROP NOT NULL;
ALTER TABLE clinic.encounters ALTER COLUMN patient_user_id DROP NOT NULL;
ALTER TABLE clinic.encounters ADD COLUMN walk_in_id TEXT UNIQUE REFERENCES clinic.walk_ins(id);
ALTER TABLE clinic.encounters ADD COLUMN clinic_person_id TEXT REFERENCES clinic.people(id);
ALTER TABLE clinic.encounters ADD CONSTRAINT encounter_origin CHECK(num_nonnulls(booking_id,walk_in_id)=1);
ALTER TABLE private_files ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE private_files ADD COLUMN clinic_owner_id TEXT REFERENCES clinic.clinics(id);
ALTER TABLE private_files ADD CONSTRAINT file_owner CHECK(num_nonnulls(owner_id,clinic_owner_id)=1);
CREATE TABLE clinic.file_quota(clinic_id TEXT PRIMARY KEY REFERENCES clinic.clinics(id));
CREATE TABLE patient.addresses (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES patient.users(id),label TEXT NOT NULL,encrypted_address TEXT NOT NULL,
 pin_code TEXT NOT NULL CHECK(pin_code~'^[0-9]{6}$'),archived_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE patient.bookings ADD COLUMN home_address_id TEXT REFERENCES patient.addresses(id);
ALTER TABLE patient.bookings ADD COLUMN encrypted_home_address TEXT;
CREATE TABLE clinic.home_visits (
 booking_id TEXT PRIMARY KEY REFERENCES patient.bookings(id),clinic_id TEXT NOT NULL REFERENCES clinic.clinics(id),
 assigned_to TEXT REFERENCES patient.users(id),state TEXT NOT NULL DEFAULT 'UNASSIGNED' CHECK(state IN ('UNASSIGNED','ASSIGNED','EN_ROUTE','ARRIVED','COMPLETED','CANCELLED')),
 revision INT NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE patient.notification_preferences (
 user_id TEXT PRIMARY KEY REFERENCES patient.users(id),email_enabled BOOLEAN NOT NULL DEFAULT false,sms_enabled BOOLEAN NOT NULL DEFAULT false,
 reminders_enabled BOOLEAN NOT NULL DEFAULT true,updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE delivery_inbox(provider TEXT NOT NULL,event_id TEXT NOT NULL,processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(provider,event_id));
ALTER TABLE notification_delivery ADD COLUMN delivered_at TIMESTAMPTZ;
CREATE TABLE platform.settings(name TEXT PRIMARY KEY,value JSONB NOT NULL,revision INT NOT NULL DEFAULT 1,updated_by TEXT REFERENCES admins(id),updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE patient.privacy_requests (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES patient.users(id),kind TEXT NOT NULL CHECK(kind IN ('ACCESS','CORRECTION','DELETION','RESTRICTION')),
 encrypted_detail TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'REQUESTED',reviewed_by TEXT REFERENCES admins(id),encrypted_decision TEXT,
 due_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '30 days',created_at TIMESTAMPTZ NOT NULL DEFAULT now(),resolved_at TIMESTAMPTZ
);
CREATE TABLE retention_holds(id TEXT PRIMARY KEY,user_id TEXT REFERENCES patient.users(id),resource_id TEXT,reason TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES admins(id),expires_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE review_policies (
 id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('CLINICAL','PRIVACY','PRESCRIBING')),version INT NOT NULL,state TEXT NOT NULL DEFAULT 'DRAFT',
 content JSONB NOT NULL,reviewer_id TEXT REFERENCES patient.users(id),approved_by TEXT REFERENCES admins(id),evidence TEXT,approved_at TIMESTAMPTZ,UNIQUE(kind,version)
);
CREATE TABLE clinical_catalogue (
 id TEXT PRIMARY KEY,name TEXT NOT NULL,strength TEXT NOT NULL,form TEXT NOT NULL,species TEXT[] NOT NULL,
 policy_id TEXT REFERENCES review_policies(id),restrictions JSONB NOT NULL DEFAULT '{}',status TEXT NOT NULL DEFAULT 'DRAFT',revision INT NOT NULL DEFAULT 1
);
CREATE TABLE prescription_safety_reviews (
 id TEXT PRIMARY KEY,record_id TEXT NOT NULL REFERENCES documents(id),reviewer_id TEXT NOT NULL REFERENCES patient.users(id),
 decision TEXT NOT NULL CHECK(decision IN ('APPROVED','REJECTED','NEEDS_CLARIFICATION')),encrypted_detail TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(record_id,reviewer_id)
);
CREATE SCHEMA pharmacy;
CREATE TABLE pharmacy.partners (
 id TEXT PRIMARY KEY,clinic_id TEXT NOT NULL REFERENCES clinic.clinics(id),name TEXT NOT NULL,registration TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'DRAFT',verified_by TEXT REFERENCES admins(id),verified_at TIMESTAMPTZ
);
CREATE TABLE pharmacy.memberships(partner_id TEXT NOT NULL REFERENCES pharmacy.partners(id),user_id TEXT NOT NULL REFERENCES patient.users(id),role TEXT NOT NULL CHECK(role IN ('PHARMACIST','DISPATCH')),status TEXT NOT NULL DEFAULT 'ACTIVE',PRIMARY KEY(partner_id,user_id));
ALTER TABLE pharmacy.partners ADD COLUMN expires_on DATE;
ALTER TABLE pharmacy.memberships ADD COLUMN professional_reference TEXT;
ALTER TABLE pharmacy.memberships ADD COLUMN verified_at TIMESTAMPTZ;
CREATE TABLE pharmacy.inventory (
 partner_id TEXT NOT NULL REFERENCES pharmacy.partners(id),catalogue_id TEXT NOT NULL REFERENCES clinical_catalogue(id),
 price_paise BIGINT NOT NULL CHECK(price_paise>=0),stock INT NOT NULL CHECK(stock>=0),reserved INT NOT NULL DEFAULT 0 CHECK(reserved>=0 AND reserved<=stock),revision INT NOT NULL DEFAULT 1,PRIMARY KEY(partner_id,catalogue_id)
);
CREATE TABLE pharmacy.orders (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES patient.users(id),partner_id TEXT NOT NULL REFERENCES pharmacy.partners(id),
 prescription_id TEXT NOT NULL REFERENCES documents(id),address_id TEXT REFERENCES patient.addresses(id),encrypted_address TEXT,
 state TEXT NOT NULL DEFAULT 'REQUESTED',total_paise BIGINT NOT NULL DEFAULT 0,request_key TEXT NOT NULL,request_hash TEXT NOT NULL,
 reviewed_by TEXT REFERENCES patient.users(id),reviewed_at TIMESTAMPTZ,revision INT NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(user_id,request_key)
);
CREATE TABLE pharmacy.order_lines(order_id TEXT NOT NULL REFERENCES pharmacy.orders(id),catalogue_id TEXT NOT NULL REFERENCES clinical_catalogue(id),quantity INT NOT NULL CHECK(quantity BETWEEN 1 AND 100),price_paise BIGINT NOT NULL CHECK(price_paise>=0),PRIMARY KEY(order_id,catalogue_id));
CREATE TABLE pharmacy.fulfilments(order_id TEXT PRIMARY KEY REFERENCES pharmacy.orders(id),assigned_to TEXT REFERENCES patient.users(id),tracking_ref TEXT,delivered_at TIMESTAMPTZ,encrypted_receipt TEXT);
ALTER TABLE clinic.invoices ADD COLUMN pharmacy_order_id TEXT REFERENCES pharmacy.orders(id);
ALTER TABLE clinic.invoices ADD COLUMN walk_in_id TEXT REFERENCES clinic.walk_ins(id);
ALTER TABLE clinic.invoices ADD COLUMN clinic_person_id TEXT REFERENCES clinic.people(id);
ALTER TABLE clinic.invoices ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE clinic.invoices DROP CONSTRAINT invoices_check;
ALTER TABLE clinic.invoices ADD CONSTRAINT invoice_origin CHECK(num_nonnulls(booking_id,lab_order_id,pharmacy_order_id,walk_in_id)=1);
ALTER TABLE clinic.invoices ADD CONSTRAINT invoice_customer CHECK(user_id IS NOT NULL OR clinic_person_id IS NOT NULL);
CREATE UNIQUE INDEX invoice_walk_in ON clinic.invoices(walk_in_id) WHERE walk_in_id IS NOT NULL;
CREATE UNIQUE INDEX invoice_pharmacy ON clinic.invoices(pharmacy_order_id) WHERE pharmacy_order_id IS NOT NULL;
CREATE TABLE integration_cases (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES patient.users(id),booking_id TEXT REFERENCES patient.bookings(id),
 provider TEXT NOT NULL CHECK(provider IN ('ABDM','INSURANCE','FINANCE')),state TEXT NOT NULL DEFAULT 'DRAFT',
 encrypted_payload TEXT NOT NULL,consent_id TEXT REFERENCES patient.consents(id),external_ref TEXT,request_key TEXT NOT NULL,
 revision INT NOT NULL DEFAULT 0,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(user_id,provider,request_key)
);
CREATE TABLE integration_receipts(provider TEXT NOT NULL,event_id TEXT NOT NULL,case_id TEXT REFERENCES integration_cases(id),state TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(provider,event_id));
CREATE TABLE data_reconciliation_cases (
 id TEXT PRIMARY KEY,document_id TEXT NOT NULL UNIQUE REFERENCES documents(id),state TEXT NOT NULL DEFAULT 'PENDING',
 resolved_by TEXT REFERENCES admins(id),encrypted_reason TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),resolved_at TIMESTAMPTZ
);
CREATE TABLE mobile_devices (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES patient.users(id),token_hash TEXT NOT NULL UNIQUE,
 public_key TEXT,expires_at TIMESTAMPTZ NOT NULL,last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),revoked_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE mobile_pairings(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES patient.users(id),expires_at TIMESTAMPTZ NOT NULL,consumed_at TIMESTAMPTZ);
CREATE TABLE mobile_sync_intents (
 user_id TEXT NOT NULL REFERENCES patient.users(id),intent_key TEXT NOT NULL,payload_hash TEXT NOT NULL,result JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(user_id,intent_key)
);
CREATE TABLE provider_webhook_inbox(provider TEXT NOT NULL,event_id TEXT NOT NULL,payload JSONB NOT NULL,processed_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(provider,event_id));
ALTER TABLE video_sessions ADD COLUMN sdk_metadata TEXT;
ALTER TABLE video_sessions ADD COLUMN live_at TIMESTAMPTZ;
ALTER TABLE video_sessions ADD COLUMN ended_at TIMESTAMPTZ;
CREATE TABLE reconciliation_runs(id TEXT PRIMARY KEY,kind TEXT NOT NULL,state TEXT NOT NULL,detail JSONB NOT NULL DEFAULT '{}',started_at TIMESTAMPTZ NOT NULL DEFAULT now(),ended_at TIMESTAMPTZ);
CREATE TABLE infrastructure_runs(id TEXT PRIMARY KEY,kind TEXT NOT NULL,result JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
`;

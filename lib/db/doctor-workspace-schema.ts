export const DOCTOR_WORKSPACE_SCHEMA = `
ALTER TABLE clinic.people ADD COLUMN request_hash TEXT;
CREATE TABLE clinic.scheduled_visits (
 id TEXT PRIMARY KEY,doctor_id TEXT NOT NULL REFERENCES provider.doctors(id),clinic_id TEXT NOT NULL REFERENCES clinic.clinics(id),
 person_id TEXT NOT NULL REFERENCES clinic.people(id),starts_at TIMESTAMPTZ NOT NULL,ends_at TIMESTAMPTZ NOT NULL,
 state TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK(state IN ('SCHEDULED','ARRIVED','CANCELLED','NO_SHOW')),
 fee_paise BIGINT NOT NULL CHECK(fee_paise>=0),encrypted_details TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,
 walk_in_id TEXT UNIQUE REFERENCES clinic.walk_ins(id),created_by TEXT NOT NULL REFERENCES patient.users(id),
 request_key TEXT NOT NULL,request_hash TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(ends_at>starts_at),UNIQUE(doctor_id,request_key)
);
CREATE INDEX scheduled_visit_window ON clinic.scheduled_visits(doctor_id,starts_at) WHERE state='SCHEDULED';
CREATE TABLE clinic.visit_history (
 id TEXT PRIMARY KEY,visit_id TEXT NOT NULL REFERENCES clinic.scheduled_visits(id),actor_id TEXT NOT NULL REFERENCES patient.users(id),
 from_state TEXT,to_state TEXT NOT NULL,revision INTEGER NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE clinic.calendar_blocks (
 id TEXT PRIMARY KEY,doctor_id TEXT NOT NULL REFERENCES provider.doctors(id),starts_at TIMESTAMPTZ NOT NULL,ends_at TIMESTAMPTZ NOT NULL,
 encrypted_reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CANCELLED')),
 request_key TEXT NOT NULL,request_hash TEXT NOT NULL,CHECK(ends_at>starts_at),UNIQUE(doctor_id,request_key)
);
CREATE TABLE clinic.workspace_reminders (
 id TEXT PRIMARY KEY,doctor_id TEXT NOT NULL REFERENCES provider.doctors(id),due_at TIMESTAMPTZ NOT NULL,
 encrypted_body TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(state IN ('ACTIVE','DONE','CANCELLED')),
 request_key TEXT NOT NULL,request_hash TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,UNIQUE(doctor_id,request_key)
);
CREATE TABLE clinic.workspace_preferences (
 doctor_id TEXT PRIMARY KEY REFERENCES provider.doctors(id),encrypted_body TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE clinic.workspace_catalogue (
 id TEXT PRIMARY KEY,doctor_id TEXT NOT NULL REFERENCES provider.doctors(id),kind TEXT NOT NULL CHECK(kind IN ('NOTE','DRUG','PROCEDURE','TEMPLATE','CONSENT')),
 label TEXT NOT NULL,encrypted_body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ARCHIVED')),
 revision INTEGER NOT NULL DEFAULT 0,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX workspace_catalogue_owner ON clinic.workspace_catalogue(doctor_id,kind,status);
CREATE TABLE clinic.stock_items (
 id TEXT PRIMARY KEY,doctor_id TEXT NOT NULL REFERENCES provider.doctors(id),name TEXT NOT NULL,sku TEXT NOT NULL,category TEXT NOT NULL,
 unit TEXT NOT NULL,reorder_level INTEGER NOT NULL DEFAULT 0 CHECK(reorder_level>=0),status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ARCHIVED')),
 revision INTEGER NOT NULL DEFAULT 0,UNIQUE(doctor_id,sku)
);
CREATE TABLE clinic.stock_batches (
 id TEXT PRIMARY KEY,item_id TEXT NOT NULL REFERENCES clinic.stock_items(id),batch_code TEXT NOT NULL,expires_on DATE,
 quantity INTEGER NOT NULL CHECK(quantity>=0),purchase_paise BIGINT NOT NULL CHECK(purchase_paise>=0),sale_paise BIGINT NOT NULL CHECK(sale_paise>=0),
 supplier TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 0,UNIQUE(item_id,batch_code)
);
CREATE TABLE clinic.stock_movements (
 id TEXT PRIMARY KEY,batch_id TEXT NOT NULL REFERENCES clinic.stock_batches(id),actor_id TEXT NOT NULL REFERENCES patient.users(id),
 delta INTEGER NOT NULL,reason TEXT NOT NULL,request_key TEXT NOT NULL,request_hash TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(actor_id,request_key)
);
CREATE TABLE clinic.workspace_expenses (
 id TEXT PRIMARY KEY,doctor_id TEXT NOT NULL REFERENCES provider.doctors(id),spent_on DATE NOT NULL,category TEXT NOT NULL,
 amount_paise BIGINT NOT NULL CHECK(amount_paise>0),encrypted_body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'RECORDED' CHECK(status IN ('RECORDED','VOID')),
 revision INTEGER NOT NULL DEFAULT 0,request_key TEXT NOT NULL,request_hash TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(doctor_id,request_key)
);
CREATE TABLE clinic.marketing_campaigns (
 id TEXT PRIMARY KEY,doctor_id TEXT NOT NULL REFERENCES provider.doctors(id),title TEXT NOT NULL,body JSONB NOT NULL,
 budget_paise BIGINT NOT NULL CHECK(budget_paise>=100),starts_on DATE NOT NULL,ends_on DATE NOT NULL CHECK(ends_on>=starts_on),
 state TEXT NOT NULL DEFAULT 'DRAFT' CHECK(state IN ('DRAFT','SUBMITTED','APPROVED','PAUSED','ARCHIVED')),
 revision INTEGER NOT NULL DEFAULT 0,content_revision INTEGER NOT NULL DEFAULT 0,reviewed_by TEXT,reviewed_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE clinic.campaign_funding_orders (
 id TEXT PRIMARY KEY,doctor_id TEXT NOT NULL REFERENCES provider.doctors(id),campaign_id TEXT NOT NULL REFERENCES clinic.marketing_campaigns(id),
 campaign_revision INTEGER NOT NULL,amount_paise BIGINT NOT NULL CHECK(amount_paise>=100),
 state TEXT NOT NULL DEFAULT 'INITIATING' CHECK(state IN ('INITIATING','PENDING','CAPTURED','UNKNOWN')),
 payment_session_encrypted TEXT,payment_id TEXT UNIQUE,request_key TEXT NOT NULL,next_check_at TIMESTAMPTZ NOT NULL DEFAULT now(),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(doctor_id,request_key)
);
CREATE TABLE clinic.campaign_events (
 campaign_id TEXT NOT NULL REFERENCES clinic.marketing_campaigns(id),kind TEXT NOT NULL CHECK(kind IN ('IMPRESSION','CLICK')),
 visitor_hash TEXT NOT NULL,bucket BIGINT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(campaign_id,kind,visitor_hash,bucket)
);
CREATE TABLE clinic.workspace_intents (
 doctor_id TEXT NOT NULL REFERENCES provider.doctors(id),request_key TEXT NOT NULL,kind TEXT NOT NULL,request_hash TEXT NOT NULL,
 response JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(doctor_id,request_key)
);
CREATE TABLE clinic.staff_requests (
 id TEXT PRIMARY KEY,doctor_id TEXT NOT NULL REFERENCES provider.doctors(id),clinic_id TEXT NOT NULL REFERENCES clinic.clinics(id),
 encrypted_body TEXT NOT NULL,requested_role TEXT NOT NULL CHECK(requested_role IN ('clinician','receptionist','lab')),
 state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','APPROVED','REJECTED')),revision INTEGER NOT NULL DEFAULT 0,
 reviewed_by TEXT,request_key TEXT NOT NULL,request_hash TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(doctor_id,request_key)
);
CREATE INDEX calendar_block_window ON clinic.calendar_blocks(doctor_id,starts_at) WHERE status='ACTIVE';
CREATE INDEX workspace_reminder_due ON clinic.workspace_reminders(doctor_id,due_at);
CREATE INDEX stock_movement_batch ON clinic.stock_movements(batch_id,created_at);
CREATE INDEX workspace_expense_dates ON clinic.workspace_expenses(doctor_id,spent_on);
CREATE INDEX campaign_funding_status ON clinic.campaign_funding_orders(campaign_id,state);
CREATE INDEX staff_request_review ON clinic.staff_requests(state,created_at);
CREATE TRIGGER visit_history_no_mutate BEFORE UPDATE OR DELETE ON clinic.visit_history FOR EACH ROW EXECUTE FUNCTION audit_log_is_append_only();
CREATE TRIGGER stock_movements_no_mutate BEFORE UPDATE OR DELETE ON clinic.stock_movements FOR EACH ROW EXECUTE FUNCTION audit_log_is_append_only();
`;

export const MESSAGING_DEMO = `
ALTER TABLE patient.notification_preferences ADD COLUMN whatsapp_enabled BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE whatsapp_messages (
 id TEXT PRIMARY KEY, user_id TEXT REFERENCES patient.users(id), effect_key TEXT NOT NULL UNIQUE,
 purpose TEXT NOT NULL CHECK(purpose IN ('OTP','UPDATE')), recipient_hash TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'SENDING' CHECK(state IN ('SENDING','ACCEPTED','SENT','DELIVERED','READ','FAILED','UNKNOWN')),
 provider_ref TEXT UNIQUE,error_code TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_messages_owner ON whatsapp_messages(user_id,created_at DESC);
CREATE TABLE demo_payment_orders (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES patient.users(id),idempotency_key TEXT NOT NULL,
 amount_paise BIGINT NOT NULL CHECK(amount_paise>=100),currency TEXT NOT NULL DEFAULT 'INR' CHECK(currency='INR'),
 state TEXT NOT NULL DEFAULT 'CREATING' CHECK(state IN ('CREATING','CREATED','UNKNOWN','CAPTURED')),
 external_id TEXT UNIQUE,external_payment_id TEXT UNIQUE,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),paid_at TIMESTAMPTZ,
 UNIQUE(user_id,idempotency_key)
);
CREATE INDEX demo_payment_orders_owner ON demo_payment_orders(user_id,created_at DESC);
`;

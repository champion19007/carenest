export const FAST2SMS_SCHEMA = `
CREATE TABLE fast2sms_messages (
 id TEXT PRIMARY KEY,user_id TEXT REFERENCES patient.users(id),effect_key TEXT NOT NULL UNIQUE,
 channel TEXT NOT NULL CHECK(channel IN ('sms','whatsapp')),
 purpose TEXT NOT NULL CHECK(purpose IN ('OTP','UPDATE')),recipient_hash TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'SENDING' CHECK(state IN ('SENDING','ACCEPTED','FAILED','UNKNOWN')),
 provider_ref TEXT,error_code TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(channel,provider_ref)
);
CREATE INDEX fast2sms_message_owner ON fast2sms_messages(user_id,created_at DESC);
`;

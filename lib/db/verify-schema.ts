export const VERIFY_SCHEMA = `
CREATE TABLE phone_verifications (
 phone TEXT PRIMARY KEY, intent_id UUID NOT NULL, provider_sid TEXT,
 account_sid TEXT NOT NULL, service_sid TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('SENDING','PENDING','CHECKING','CONSUMED','FAILED','UNKNOWN')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0 AND attempts<=5),
 expires_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

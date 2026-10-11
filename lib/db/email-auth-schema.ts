export const EMAIL_AUTH_SCHEMA = `
CREATE TABLE email_auth_challenges (
 recipient_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES patient.users(id) ON DELETE CASCADE,
 intent_id UUID NOT NULL, code_mac TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('SENDING','ACCEPTED','CONSUMED','UNKNOWN','FAILED')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0 AND attempts<=5),
 expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

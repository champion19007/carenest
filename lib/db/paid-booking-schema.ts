export const PAID_BOOKING = `
ALTER TABLE patient.bookings ADD COLUMN payment_required BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE payment_orders ADD COLUMN next_reconcile_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE TABLE doctor_payout_accounts (
 doctor_id TEXT PRIMARY KEY REFERENCES provider.doctors(id),
 beneficiary_id TEXT NOT NULL UNIQUE, verified_by TEXT NOT NULL REFERENCES admins(id),
 verified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE doctor_payouts (
 id TEXT PRIMARY KEY, booking_id TEXT NOT NULL UNIQUE REFERENCES patient.bookings(id),
 invoice_id TEXT NOT NULL REFERENCES clinic.invoices(id), payment_id TEXT NOT NULL REFERENCES payment_orders(id),
 doctor_id TEXT NOT NULL REFERENCES provider.doctors(id), clinic_id TEXT NOT NULL REFERENCES clinic.clinics(id),
 amount_paise BIGINT NOT NULL CHECK(amount_paise>=100), currency TEXT NOT NULL DEFAULT 'INR' CHECK(currency='INR'),
 beneficiary_id TEXT, state TEXT NOT NULL DEFAULT 'WAITING_SETUP'
 CHECK(state IN ('WAITING_SETUP','READY','BLOCKED_REFUND','SUBMITTING','UNKNOWN','PENDING','PAID','FAILED','REVERSED')),
 provider_id TEXT UNIQUE, status_code TEXT, lease_token UUID, lease_until TIMESTAMPTZ,
 submitted_at TIMESTAMPTZ, paid_at TIMESTAMPTZ, next_check_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX doctor_payout_queue ON doctor_payouts(next_check_at) WHERE state NOT IN ('FAILED','REVERSED');
CREATE INDEX doctor_payout_owner ON doctor_payouts(doctor_id,created_at DESC);
`;

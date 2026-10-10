export const APPOINTMENT_NOTIFICATIONS = `
ALTER TABLE notification_delivery ADD COLUMN user_id TEXT REFERENCES patient.users(id);
ALTER TABLE notification_delivery ADD COLUMN recipient_hash TEXT;
ALTER TABLE notification_delivery ADD COLUMN provider TEXT;
ALTER TABLE notification_delivery ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX notification_delivery_owner ON notification_delivery(user_id,updated_at DESC);
CREATE INDEX booking_reminder_candidates ON patient.bookings(starts_at,id) WHERE status='confirmed' AND started_at IS NULL;
`;

export const CASHFREE = `
ALTER TABLE payment_orders ADD COLUMN payment_session_id TEXT;
ALTER TABLE payment_orders ADD COLUMN provider_request_key UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE demo_payment_orders ADD COLUMN gateway TEXT NOT NULL DEFAULT 'razorpay';
ALTER TABLE demo_payment_orders ADD COLUMN payment_session_id TEXT;
ALTER TABLE demo_payment_orders ADD COLUMN provider_request_key UUID NOT NULL DEFAULT gen_random_uuid();
`;

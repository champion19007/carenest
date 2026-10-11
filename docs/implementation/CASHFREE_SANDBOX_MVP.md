> Appointment checkout and completion-triggered doctor payouts are now implemented. See [Paid bookings and doctor payouts](PAID_BOOKING_AND_DOCTOR_PAYOUTS.md) for the current workflow and provider setup.

# Cashfree sandbox MVP and product selection

Updated 9 October 2026. This replaces the active Razorpay integration. Earlier Razorpay reports describe historical tests, not the current provider. No real money, subscription mandate, vendor settlement, or provider-account activation has been created by this change.

## What to select in your screenshot

Click **Switch to Test**, then **Payment Gateway → Try Test Environment**. Start with consultation checkout. Do not select Payouts as a substitute for Payment Gateway or Easy Split.

| Product | CareNest purpose | MVP decision |
| --- | --- | --- |
| Payment Gateway | One payment for a confirmed consultation, lab or pharmacy invoice | Implemented for sandbox; requires your test credentials |
| Easy Split | Assign the clinic's consultation share and CareNest's service share to separate settlement recipients | Next phase after checkout/refund validation; not activated or implemented yet |
| Subscriptions | Recurring monthly clinic software charges | Next phase once clinic plans and cancellation rules are ready; not activated or implemented yet |
| Payouts | Separate outbound transfer product | Not needed for the first checkout test |

Cashfree requires contacting your account manager to enable Easy Split. It supports vendor onboarding, order-level splits and refund adjustments. Obtain the actual account-specific pricing and settlement terms before choosing it; this integration does not assert that split transactions are cheaper. [Cashfree Easy Split](https://www.cashfree.com/docs/payments/split/overview).

Subscriptions collect recurring charges through a customer-authorized mandate. Use monthly subscriptions for clinics purchasing CareNest software. Keep ordinary patient consultations as individual purchases. [Cashfree Subscriptions](https://www.cashfree.com/docs/payments/subscription/introduction).

## Your fee policy to carry into the next phase

- A subscribed clinic's own bookings waive the ₹50 CareNest service fee.
- CareNest marketplace bookings retain the ₹50 service fee before applicable tax.
- The clinic's monthly software invoice is separate from the patient's consultation invoice.
- A split payment allocates the collected total; it does not increase that total or establish the tax treatment.
- Store doctor fee, CareNest fee, tax and booking attribution as immutable server-calculated invoice lines. Do not accept a client-supplied `source=clinic` as proof for a fee waiver.
- Map each clinic to a verified Cashfree vendor; record settlement status separately from payment success. Apply refunds to the original allocation and reconcile deductions against provider statements.

These fee-waiver and commercial-plan rules are approved product requirements; they are **not yet active in booking prices**. This change switches the payment provider for existing invoice totals without inventing a new fee or enabling transfers to doctors.

## Private configuration

In the Cashfree **test** Payment Gateway dashboard, open **Developers → API Keys** and generate the sandbox App ID and secret. Product names and menu placement can vary by account. Store them in `.env.local`:

```dotenv
ENABLE_PAYMENTS=1
CASHFREE_ENV=sandbox
CASHFREE_CLIENT_ID=your_sandbox_app_id
CASHFREE_CLIENT_SECRET=your_sandbox_secret
APP_ORIGIN=http://localhost:3000
```

Do not put the secret in a browser-prefixed variable, source file, Git commit, screenshot or chat message. This MVP contains only `https://sandbox.cashfree.com/pg/` and browser `mode: 'sandbox'`. Setting `CASHFREE_ENV=production` disables it; it cannot charge real money. All old Razorpay environment variables have been removed from the local configuration.

Restart the local app after saving the credentials. Sign in, visit `/account/billing`, and choose **Pay ₹100 in Cashfree sandbox**. This fixed test receipt is separate from clinic invoices and their financial ledger. To test invoice collection, confirm an appointment first or create an eligible lab/approved pharmacy invoice and use that invoice's checkout button.

The server creates the order using the saved invoice amount in integer paise, converts to rupees for Cashfree, and sends the resulting payment session to Cashfree's web checkout. It uses a synthetic customer ID and dummy phone for this sandbox; it sends no patient name, email, diagnosis or prescription. [Cashfree web checkout](https://www.cashfree.com/docs/payments/online/web).

Use only the current [Cashfree sandbox test data](https://www.cashfree.com/docs/api-reference/payments/data-to-test-integration). If checkout reports a domain restriction, configure the allowed test origin in the dashboard or follow [Cashfree's domain guidance](https://www.cashfree.com/docs/payments/online/go-live/whitelist). Any HTTPS development tunnel must be chosen explicitly; none has been started by this change.

## Verification and callbacks

- `/api/payments/orders`: signed-in owner only, same-origin POST, server-calculated amount; returns a payment session, never the secret.
- `/api/payments/verify`: accepts an owned Cashfree `order_id`; fetches the order and its payments from Cashfree. `PAID` order plus matching `SUCCESS` payment, amount and INR currency is required before posting money. A browser success message alone cannot pay an invoice.
- `/api/webhooks/cashfree`: authenticates the exact raw body using timestamp + body, HMAC-SHA256 and the PG secret, with constant-time comparison. It independently checks provider payment/refund evidence before accounting changes.
- `/api/webhooks/razorpay`: retired, returns HTTP 410 and cannot post money.
- Repeated checkout checks and webhook delivery produce one accounting effect. Late captures after cancellation go into refund review rather than reopening the cancelled invoice.
- Lost create-order responses recover the same merchant order ID with its saved UUID idempotency key. Do not create a new payment simply because the response timed out.
- Pending, failed and dismissed checkout attempts remain unpaid. Use **Check Cashfree payment status** on the same receipt before retrying.

For callback testing, Cashfree must be able to reach an HTTPS endpoint ending `/api/webhooks/cashfree`. `localhost` is not reachable from Cashfree. Configure Payment Success and Refund Status callbacks in the **test** dashboard with webhook version 2025-01-01. Local status checks work without a callback tunnel, although background refund completion needs the callback. [Webhook setup and signature contract](https://www.cashfree.com/docs/payments/online/webhooks/overview).

## Delivery and validation scope

The implementation covers transport, checkout, ownership checks, order verification, signed callbacks, invoice accounting, test receipts, refund submission and successful refund reconciliation. Database migration 0007 adds Cashfree session and provider-idempotency fields; old migration checksums and historical provider labels are preserved.

Cashfree and messaging tests use controlled provider responses with an isolated real SQL database. On 9 October 2026, your supplied sandbox credentials were saved privately and accepted by Cashfree. The actual application adapter created a ₹100 sandbox order, received a checkout session and confirmed that no successful payment had occurred. See [redacted provider check](cashfree-provider-check.json). This configuration probe is separate from application receipts and created no patient invoice. Browser payment completion, dashboard callback delivery and an actual Cashfree refund remain to be validated. Easy Split/vendor onboarding, automated subscription mandates, subscription entitlements, live KYC and production payments are separate follow-up work.

Completed checks on 9 October 2026: **225 tests passed, 0 failed**; TypeScript check and optimized Next.js build passed. The rebuilt local runner applied migration 0007 successfully. Home returned HTTP 200; billing/history redirected unauthenticated visitors; payment APIs returned 401 without a session; retired Razorpay callback returned 410; Cashfree callback returned the expected 503 while credentials were absent. Scanned 54 browser JavaScript files and found zero references to the retired Razorpay checkout script. These checks do not establish a real Cashfree sandbox payment or provider delivery.

Main changes: `lib/cashfree.ts`, `lib/domain/billing.ts`, `lib/domain/demo-payments.ts`, `lib/domain/cashfree-webhooks.ts`, `lib/db/cashfree-schema.ts`, migration registration, checkout and status buttons, payment routes, billing page, setup readiness, environment example and payment tests. The unused Razorpay SDK and adapter were removed.

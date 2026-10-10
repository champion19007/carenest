# Paid appointments and doctor payouts — Cashfree sandbox MVP

Implemented 9 October 2026. This change runs locally. It does not deploy cloud infrastructure or move real money.

## Patient journey

1. Sign in, choose the patient or pet, consultation mode, date and published appointment time, and give the required consent.
2. Continue to payment. The server checks the actual calendar, clinician, subject ownership and consent, snapshots the consultation fee and creates an unpaid invoice. The slot is held for up to 10 minutes, capped at its scheduled start.
3. The appointment payment page displays the clinician, date, time, duration, invoice amount and hold deadline. “Pay and schedule appointment” opens Cashfree Standard Checkout in sandbox mode.
4. Payment failure, pending payment or closing checkout does **not** schedule the visit. Retrying uses the same saved provider order; another browser key for the same unpaid invoice also recovers that order.
5. The server checks Cashfree's order and payment APIs. Verified successful payment atomically records the balanced receipt, changes the invoice to PAID, books the slot and creates the encounter. The screen shows “Appointment scheduled.” Signed Cashfree webhooks and the local worker can also finish reconciliation.
6. The appointment appears in the patient's account and the assigned doctor's calendar. Completing a consultation adds the metadata to consultation history. Video and audio are not recorded.

Zero-fee appointments are confirmed with a WAIVED invoice and no payment order. Older requests retain their original clinic-acceptance workflow; doctors cannot manually accept a new unpaid checkout hold.

The native mobile booking API now creates the same prepaid hold and returns an owned checkout path. The native app shows “Awaiting payment” and opens checkout in the system browser. Sign in there with the same CareNest account, complete payment, then refresh the mobile app. A paired-device access token is never embedded in a URL. Offline intents reserve nothing until synced and never schedule an appointment without verified payment. Existing saved legacy intents retain their original result.

## Doctor payment journey

1. The assigned active verified doctor marks the consultation completed. Booking/capture alone, a no-show, and an unpaid invoice never make the doctor eligible.
2. The worker creates one durable payout obligation per completed paid consultation. Its amount is the consultation fee snapshot, in integer paise, rather than the doctor's later edited profile fee.
3. An administrator with two-factor setup links a Cashfree-verified sandbox beneficiary to the correct active verified doctor at `/admin/payouts`. The ownership attestation is required. Doctors see only their own payout history in `/practice/billing`.
4. With separate Payouts sandbox credentials, provider access, a verified destination and sufficient test balance, the worker automatically submits the transfer after completion. Payment Gateway proceeds do not automatically recharge a separate Payouts balance.
5. The provider response must match transfer ID, beneficiary and amount. RECEIVED, PENDING, approval requests and SUCCESS/SENT_TO_BENEFICIARY remain pending. PAID requires SUCCESS/COMPLETED from Cashfree. Explicit reversals reverse the payout accounting once.

The sandbox endpoint is hardcoded to `https://sandbox.cashfree.com/payout/`, API version `2024-01-01`. Production payouts are deliberately disabled in this MVP. Transfers use a stable ID of at most 40 characters. A database lease prevents overlapping worker submissions. A lost POST response is checked by the same transfer ID, without minting another payment. Failed/reversed transfers require operations review rather than automatic new transfers.

## Configuration

Only the private, Git-ignored `.env.local` contains credentials. Payment Gateway and Payouts credentials are separate:

```dotenv
ENABLE_PAYMENTS=1
CASHFREE_ENV=sandbox
CASHFREE_CLIENT_ID=<Payment Gateway test app ID>
CASHFREE_CLIENT_SECRET=<Payment Gateway test secret>
ENABLE_DOCTOR_PAYOUTS=1
CASHFREE_PAYOUT_CLIENT_ID=<Payouts test app ID>
CASHFREE_PAYOUT_CLIENT_SECRET=<Payouts test secret>
```

Restart the local app after editing configuration. In Cashfree TEST Payouts, configure Developers → Payouts → Two-Factor Authentication → IP Whitelist with the computer/server's current public IPv4. Use the IPv4 for the account whose API keys are configured. A changing home-network IP will need updating. Cashfree returned **403, authentication_error, “IP not whitelisted”** during the provider-access check; credentials were saved, but this account setting must be resolved before a real sandbox transfer can be claimed as tested.

The adapter also supports Cashfree's public-key authentication for dynamic IPs. Download the **TEST Payouts** public key from that account's Developers → Two-Factor Authentication → Public Key section. Save it privately, then set `CASHFREE_PAYOUT_PUBLIC_KEY_PATH=.data/cashfree-payout-public-key.pem` in `.env.local` and restart. The server validates a public RSA key and encrypts `clientId.unixTimestamp` with RSA OAEP/SHA-1 for the `x-cf-signature` header on each request, following Cashfree's specification. No private key is needed or sent. Cashfree requires the matching account/environment and, for this method, its oldest client ID. Real bank details and real payout credentials are not needed for this local test.

## Cancellation, expiry and refunds

| Event | Result |
| --- | --- |
| Unpaid hold expires | Booking expires, unpaid invoice becomes VOID, only its own slot is released. |
| Payment arrives after expiry/cancellation or invalidated consent/provider/subject | Receipt is recorded as excess/late capture and refund liability; it never takes another patient's slot. One refund request is created for review. |
| Patient cancels a paid appointment before it starts | Slot is released and a full remaining refund request is created once. Refund processing remains an explicit administrator operation. |
| Patient requests a refund for a current paid booking | Cancellation is required first. |
| Refund/dispute exists before payout | New payout is blocked for review. |
| Doctor payout has already been submitted | A refund needs support reconciliation; the UI does not promise an automatic refund against money already transferred. |
| Paid appointment rescheduled | A free published replacement slot is claimed atomically, payment and confirmation are retained, no second charge is created. |

Refund requests, provider submission and processed refunds remain separate states. A recorded liability is not a completed Cashfree refund.

## Data and consistency

Migration `0008-paid-booking-payouts` adds `payment_required` to bookings, a payment reconciliation timestamp, verified doctor beneficiary mappings and durable payout rows. Existing migrations were preserved. Money uses BIGINT paise; conversion to provider rupees happens only at the adapter boundary. Payout beneficiary identifiers are stored rather than copying full bank details into patient records.

Booking-money transitions take locks in the order provider → slot → booking → invoice, with payment/payout row locks afterwards. Refund eligibility and payout eligibility serialize through the same booking and invoice locks. Unique booking payout and financial-effect keys prevent duplicate obligations and ledger postings. Payment, booking confirmation, encounter creation and notification events commit together.

The local worker verifies one due appointment payment per run, expires holds, processes notifications and checks a bounded payout batch. It reserves time for transfers. This is a local MVP worker, not a claim of capacity for 50,000 users; production should use durable scalable jobs, signed provider webhooks, alerting and reconciliation reports.

## Fees and rollout limits

This booking change preserves the **existing consultation invoice amount**. It does not silently add a CareNest fee, tax, commission or processor surcharge. The previously agreed ₹50 marketplace fee and waiver for subscribed clinics' own booking links remain a separate pricing/subscription implementation. Payout transfers here use the doctor fee snapshot; this does not establish a profitable production pricing model.

Easy Split is not used for these completion-triggered transfers. Cashfree's default order split delay is one day; for later appointments the full order can settle to the merchant before completion. A production marketplace must agree its settlement/funding arrangements with Cashfree. Subscriptions and clinical-company tax decisions are not enabled by this change.

## Reproducing QA

With the local app stopped, `npx tsx scripts/qa-booking-fixture.mjs` creates clearly labelled synthetic accounts and slots. Sign in with the local demo code as `9000000901` for the test patient or `9000000902` for the test doctor. These are test identities, not real phone verification.

For the synthetic doctor's payout, after fixing API access and setting up a local administrator with two-factor authentication, stop CareNest and run `npx tsx scripts/qa-cashfree-beneficiary.mjs`. It verifies/creates **only** the published Cashfree success-test bank beneficiary, checks the test account details, and links it only to the synthetic QA doctor. Restart the app; its completed paid consultation will enter the payout worker. The helper refuses real/other account details. Regular doctors must use their own individually verified beneficiary mapping in admin.

Payment test data: Cashfree sandbox card `4706131211212123`, expiry `03/2028`, CVV `123`, name `Test`, simulator OTP `111000`. Choose SUCCESS or FAILED in the sandbox simulator. These payment OTPs are separate from CareNest's local login code.

See the accompanying QA report for completed checks, screenshots and outstanding provider/user validation. Do not publish local QA accounts as real clinicians.

## Official references

- [Cashfree web checkout](https://www.cashfree.com/docs/payments/online/web)
- [Payouts Standard Transfer v2](https://www.cashfree.com/docs/api-reference/payouts/v2/transfers-v2/standard-transfer-v2)
- [Transfer status v2](https://www.cashfree.com/docs/api-reference/payouts/v2/transfers-v2/get-transfer-status-v2)
- [Beneficiary v2](https://www.cashfree.com/docs/api-reference/payouts/v2/beneficiary-v2/get-beneficiary-v2)
- [Payouts IP whitelist and public key setup](https://www.cashfree.com/docs/payouts/payouts/integrations/payouts-2fa)
- [Payouts test data](https://www.cashfree.com/docs/payouts/payouts/integrations/data-to-test)
- [Order split delay](https://www.cashfree.com/docs/payments/split/settlements/delay/order-level)

# OTP, actual WhatsApp sandbox and Razorpay test checkout

> Historical Razorpay guide. The active payment provider is now Cashfree sandbox. Follow [Cashfree setup and validation](CASHFREE_SANDBOX_MVP.md); the payment instructions below are retained only as earlier implementation evidence.

Updated 9 October 2026. The site remains local. Razorpay test credentials are stored privately in `.env.local`; neither the key secret nor the Twilio token belongs in browser code, screenshots or Git. The supplied Razorpay.me payment link is not used: Standard Checkout creates a server-side order with the test key.

## Try the site now

Start with `npm run dev:local`, or use `npm run build` followed by `npm run start:local` for production-mode local testing. Stop the app before a build, migration, seed or backup. Startup applies migration `0006-whatsapp-demo-payments` and runs the signed background worker. Open http://localhost:3000.

1. Open **Log in** and choose **Local demo code**. Enter a valid Indian ten-digit number. The six-digit local code is displayed explicitly as a demo; no SMS was sent. Verify it and finish the profile if requested.
2. Open **Invoices** at `/account/billing`. Choose **Pay ₹100 in Razorpay test mode**. The official Razorpay modal uses a server-created test order. Use only the test instruments documented by [Razorpay](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/).
3. On success, the server verifies HMAC-SHA256 and fetches the payment from Razorpay. A signature alone is not enough to record a captured payment: order, amount, currency and provider capture status must match. An authorized-but-not-captured payment remains pending.
4. A captured test payment creates a separate test receipt and durable in-app update. It does not settle a clinic invoice or post fake revenue to the clinic ledger. **Your updates** at `/account/notifications` refreshes periodically while the worker handles events.
5. Cancelled/failed checkout can retry the same order. Do not create a new order after an unknown provider outcome until it is reconciled. Real clinic invoices still require the actual eligible booking/order before collecting their server-derived amount.

If UPI is offered in test checkout, Razorpay documents `success@razorpay` and `failure@razorpay` for success/failure testing. Its current domestic Visa test card is `4100 2800 0000 1007`, with a random CVV and future expiry. Use the [current official test instructions](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/#2-test-integration), since available test methods can change. Never enter your real card for this demo.

The app uses the existing `/api/payments/orders` and `/api/payments/verify` endpoints; they are the project's equivalents of create-order and verify-payment. There is no duplicate payment stack. The Razorpay package is installed; the existing REST adapter keeps a ten-second request deadline, while signature comparison remains timing-safe. Payment failure and modal dismissal are handled explicitly.

## Set up real WhatsApp delivery to your phone

The user chose actual phone delivery and has not created a Twilio account yet. Code can be tested with mocked provider contracts, but actual delivery cannot be claimed until an account, joined phone and credentials exist.

1. Create your own account at [Twilio](https://www.twilio.com/try-twilio). Complete its verification and terms yourself. Use the owner email already selected for the project if appropriate. Trial/testing traffic is subject to Twilio's current account limits and charges; do not activate an unrequested paid subscription.
2. Open Twilio's **Try out WhatsApp** testing page, or the **WhatsApp Sandbox** in the legacy console. Twilio's [current sandbox instructions](https://www.twilio.com/docs/whatsapp/sandbox) describe the difference. Copy the sender and join code shown by your own account.
3. From the actual phone you want to test, send the exact `join ...` message displayed there to the displayed sender. A user message starts the WhatsApp 24-hour customer-service window. Joining/testing must be done from your phone; this app does not invent sandbox membership.
4. Save these values in `.env.local` privately. Replace placeholders with your actual account values; never paste the token into chat:

```dotenv
WHATSAPP_SANDBOX_ENABLED=1
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_private_auth_token
WHATSAPP_FROM=whatsapp:+sender_from_your_sandbox
WHATSAPP_TEST_TO=+91your_joined_ten_digit_phone
WHATSAPP_SANDBOX_WINDOW_EXPIRES_AT=your_actual_window_expiry_in_ISO_format
```

For the first local demo, use the active sandbox conversation window. After sending a new message to the sandbox, a 24-hour expiry can be calculated in PowerShell:

```powershell
[DateTime]::UtcNow.AddHours(24).ToString('o')
```

Record the real window timing; running this command does not itself message the sandbox or extend Meta's window. If the window expires, message the sandbox again and update the expiry. The app permits free-form OTP/update messages only while this local declared window is valid, for the single configured test phone. Provider acceptance still depends on actual sandbox membership/window rules.

5. Restart CareNest. **WhatsApp** becomes available on the sign-in form when the sandbox is configured. Choose it and enter the same joined number. The real OTP is sent to WhatsApp and never echoed to the browser. The OTP is single-use, expires in five minutes and permits at most five wrong guesses. Resend has a sixty-second cooldown and the existing abuse budgets.
6. Sign in, open **Your updates**, enable **WhatsApp updates on my joined test phone**, and save. Press **Send WhatsApp test update**. The worker sends the generic account message. Appointment changes, payment capture/refund and pet reminders also use this opt-in path. Message text omits diagnoses, prescriptions and other clinical detail.
7. Press **Check phone delivery** to fetch the real Twilio receipt. Accepted/sent is not the same as delivered/read. A failed or unknown outcome remains visible and is not blindly resent.

### Templates outside the reply window

[Twilio's template documentation](https://www.twilio.com/docs/whatsapp/tutorial/send-whatsapp-notification-messages-templates) requires approved content for relevant business-initiated messaging. Sandbox accounts have specific preapproved/testing templates; arbitrary templates are not automatically available. Save an actual approved `HX...` template ID only after checking its variable contract:

```dotenv
# OTP template variable 1 = CareNest; variable 2 = six-digit code
WHATSAPP_OTP_CONTENT_SID=approved_otp_content_sid
# Update template variable 1 = CareNest; variable 2 = generic account-update text
WHATSAPP_UPDATE_CONTENT_SID=approved_update_content_sid
```

The template must genuinely match these fields and its approved use. Do not misuse a shipping or appointment template to send unrelated messages. If your trial page provides a different template contract, use the conversation-window path for this demo or have the integration adapted before sending. Production WhatsApp sender registration and approved templates are a separate task; this integration deliberately supports the local test sandbox only.

### Status callbacks are optional for a local demo

Outbound Twilio calls and the **Check phone delivery** button work without exposing localhost. For provider-pushed receipts, Twilio needs a publicly reachable HTTPS callback and its exact configured URL:

```dotenv
WHATSAPP_STATUS_CALLBACK_URL=https://your_authorized_test_host/api/webhooks/whatsapp
```

No public tunnel or cloud deployment has been created. Do not expose the local demo/console-OTP site just to obtain callbacks. A later isolated callback deployment must be reviewed separately. The callback validates Twilio's HMAC-SHA1 signature using the exact configured external URL and form fields, then checks the account, receipt and recipient. Older queued/sent events cannot downgrade a delivered/read receipt.

## Razorpay webhooks and manual steps

The direct browser success-handler verification works locally without a public webhook. For capture/refund events after the tab closes, configure the signed `/api/webhooks/razorpay` endpoint on a reviewed HTTPS deployment and save its independently chosen `RAZORPAY_WEBHOOK_SECRET` privately. The API key secret and webhook secret serve different purposes.

Test-mode integration is not live payment activation. Live KYC, settlement, refund operations and public release remain separate. The demo route rejects live keys and non-local operation. The original signed webhook and invoice/refund reconciliation remain intact.

## Files and verification

Main changes: OTP actions/forms and sign-in/signup pages; payment checkout component, order/verification/webhook routes and invoice page; shared `lib/razorpay.ts`; isolated `lib/domain/demo-payments.ts`; `lib/whatsapp.ts`, signed WhatsApp callback, preference/update controls and durable notification dispatch; migration `0006`; `.env.example`; package lock and focused service tests.

Tests exercise real service/database code with isolated provider responses: payment ownership/signature/amount/capture/idempotency, separate demo receipts, OTP single use, joined-number restrictions, opt-in/out, status ordering, signed callback rejection and ambiguous-outcome duplicate prevention. Actual Razorpay credentials were accepted by a read-only API check. See the validation record for final build, regression and HTTP outcomes. Actual WhatsApp receipt proof remains pending the user's sandbox setup.

Final outcomes and limits are recorded in [the validation record](MESSAGING_PAYMENT_VALIDATION_2026-10-09.md). Testing included actual HTTP form actions and API endpoints, not an automated browser card submission.

### Created/modified implementation files

| Area | Files |
| --- | --- |
| OTP and sign-in | `app/actions/auth.ts`, `components/sign-in-form.tsx`, `app/sign-in/page.tsx`, `app/sign-up/page.tsx` |
| Razorpay transport and isolated test orders | New `lib/razorpay.ts`, new `lib/domain/demo-payments.ts`, modified `lib/domain/billing.ts` |
| Checkout UI and APIs | `components/checkout-button.tsx`, `app/account/billing/page.tsx`, `app/api/payments/orders/route.ts`, `app/api/payments/verify/route.ts`, `app/api/webhooks/razorpay/route.ts` |
| WhatsApp provider | New `lib/whatsapp.ts`, new `app/api/webhooks/whatsapp/route.ts` |
| Preferences and updates | `lib/domain/notification-preferences.ts`, `app/actions/notifications.ts`, `components/notification-preferences.tsx`, new `components/whatsapp-controls.tsx`, `app/account/notifications/page.tsx`, `lib/notifications.ts`, `lib/drain.ts` |
| Database and tests | New `lib/db/messaging-demo-schema.ts`, `lib/db/migrations.ts`, `tests/helpers.mjs`, new `tests/messaging-payments.test.mjs` |
| Configuration | `.env.example`, `package.json`, `package-lock.json`; private `.env.local` configuration is excluded from Git |
| Documentation/evidence | This guide, the validation record and referenced sanitized test/build/provider/HTTP logs |

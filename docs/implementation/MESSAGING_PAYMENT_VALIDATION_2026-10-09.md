# Messaging and payment validation — 9 October 2026

The application remains local. Migration `0006-whatsapp-demo-payments` applied successfully during startup. A private stopped-app backup of the database, files and encryption keys was taken before migration; existing data was retained.

| Check | Result |
| --- | --- |
| Dependency installation | Razorpay installed first; installation audit reported 0 vulnerabilities |
| Type check | Passed |
| Targeted finance/messaging/migration regressions | 23 passed, 0 failed; [log](messaging-targeted-tests.txt) |
| Full regressions | 211 passed, 0 failed; [log](messaging-full-tests.txt) |
| Production build | Passed; [log](messaging-build.txt) |
| Private test credentials | Saved only in protected `.env.local`; no credential values in this report |
| Client asset scan | 54 generated JS/JSON/HTML assets scanned; 0 occurrences of the private Razorpay key secret |
| Razorpay read-only credential check | Provider returned 200; [redacted result](razorpay-provider-check.json) |
| Local OTP through actual HTTP form actions | Code issued and verified; session established; redirect to profile completion |
| Real Razorpay test order | Authenticated endpoint returned 200 and provider order; fixed amount 10,000 paise, INR |
| Forged payment signature | Actual HTTP endpoint rejected with 400 |
| Missing verification fields | Actual HTTP endpoint rejected with 400 |
| Foreign origin | Actual HTTP order endpoint rejected with 403 |
| Rendered payment/update controls | Billing and updates pages returned 200 with the test checkout and WhatsApp setup/opt-in controls |
| Actual Razorpay card/modal capture | Not performed in this validation. Complete with a documented test instrument in the official checkout; never use a live instrument for this demo |
| WhatsApp provider contracts | Tests covered joined-number restrictions, OTP single use, opt-in/out, idempotency, delivery receipt ownership/signature/status ordering and uncertain outcomes |
| Actual WhatsApp phone delivery | Pending: user has no Twilio account yet and requested setup steps. No actual delivery is claimed |
| Cloud/hosting | No deployment, tunnel or live account activation performed |

See [redacted HTTP evidence](messaging-http-verification.json) and [the setup/run guide](OTP_WHATSAPP_RAZORPAY_DEMO.md). The HTTP test created one legitimate Razorpay test order under a synthetic local demo account; it did not submit a card or capture payment. Captured/duplicate/failure paths were tested with controlled provider fixtures against real database/services. Those tests do not substitute for an actual provider capture or phone receipt.

The local server and worker are running on port 3000 after the new production build. Real WhatsApp notifications require the user's joined sandbox number, opt-in and private provider settings. No real SMS or email is sent in local mode.

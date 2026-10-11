# CareNest messaging QA — 10 October 2026

## Result

Twilio Verify SMS OTP is selected and a real signup request was accepted by Twilio. The user confirmed that the SMS arrived on the configured test phone. The actual OTP is excluded from source, reports and screenshots. Physical receipt is verified; entering that OTP to complete a live login was not automated.

Direct Meta WhatsApp and Gmail transaction/appointment delivery are implemented independently. Gmail SMTP authenticated successfully without sending a test email. The three submitted CareNest Utility templates remain **PENDING** at the final API inspection. No CareNest payment or appointment WhatsApp delivery is claimed while approval is pending.

## Completed checks

| Check | Evidence/result |
| --- | --- |
| Complete automated suite | **295 passed, 0 failed**, 5 suites, no skipped/cancelled tests |
| Production build | Passed with the final application changes |
| TypeScript | Passed independently and as part of the production build |
| Migration | `0012-twilio-verify` applied successfully; existing applied migrations unchanged |
| Private backup | Local data and encryption-key snapshot saved before migration |
| Twilio authentication | HTTP 200; account/service match; service configured for six-digit codes |
| Meta authentication | HTTP 200; supplied test phone-number ID matched; template discovery and submission succeeded |
| Gmail authentication | SMTP verification succeeded; no direct test email sent |
| Mobile browser | Home, signup, signin and protected updates entry checked at 390px; no JavaScript errors or horizontal overflow |
| Auth display | SMS enabled, Google sign-in available, no local OTP hint and no stale Fast2SMS ₹5 warning |
| Actual SMS | One real signup send accepted; user confirmed receipt |
| Source secret scan | 397 inspected source/document/config files, zero flagged credential literals; `.env.local` ignored |
| Local app | Restarted successfully at `http://localhost:3000`, with its worker |

The complete test log is retained privately at `.data/twilio-meta-full-tests.log`; build, provider, browser and secret-scan reports also remain in ignored `.data`. [Mobile signup screenshot](qa-twilio-meta-signup.png) contains no entered phone number or OTP.

## Important behaviors covered by tests

- Provider-generated OTPs invalidate local demo codes and cannot be verified through the old local-code path.
- Verify approvals bind to the phone, service, account and stored verification SID. Expiry, five wrong guesses, replay, concurrent checks and an old response arriving after a new request are covered.
- The public auth action never generates or exposes a demo OTP when Verify is selected. Local send budgets fail before a further provider request.
- Pending/forged payment events never generate success receipts. Captures and partial refunds use the correct server-recorded amount and transaction reference. Excess captures explicitly require refund review.
- Template approval, Utility category, exact language and body variables are checked before Meta sends. Grocery samples and `hello_world` cannot replace a transaction template.
- Meta and Gmail are independent; one channel failing cannot suppress the other. Accepted messages are deduplicated; lost acknowledgements remain UNKNOWN for review rather than being charged/sent again.
- Phone allowlisting, notification preferences and verified receiving email are respected. Meta test updates cannot be sent to another phone.
- Appointment details come from the current booking. Ten-minute reminders use the separate reminder template and skip cancelled, started, obsolete or past visits.

## Remaining live acceptance work

1. Wait for Meta approval of `carenest_appointment_update_v1`, `carenest_appointment_reminder_v1` and `carenest_transaction_receipt_v1` in `en`.
2. Connect Google to the same CareNest phone account, enable email and WhatsApp updates plus reminders, and save preferences.
3. Complete a Cashfree sandbox appointment payment and check the receiving Gmail inbox and test WhatsApp phone. Verify the payment receipt, scheduled appointment and ten-minute reminder. Keep the app/worker awake.
4. Test a sandbox refund and completed-consultation doctor payout with a verified test beneficiary and working Payouts authorization. This change does not resolve the earlier Cashfree payout account/IP setup issue or prove a real doctor credit.

Meta classified the optional `carenest_account_update_v1` as Marketing. It remains blocked by the Utility-only contract, and its generic test button is hidden. A real sandbox receipt is the appropriate transaction test once Utility approval is available.

The earlier direct email test was rejected by automatic approval review and was not retried through another route. Actual inbox receipt remains unverified; the owner can use CareNest's email-test button. SMTP authentication alone is not email delivery evidence.

See [current demo setup](TWILIO_VERIFY_META_WHATSAPP_GMAIL_DEMO.md) and [owner MVP checklist](YOUR_MVP_ACTION_CHECKLIST.md) for the remaining account and launch tasks.

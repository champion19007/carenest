# Paid booking and doctor payouts: QA report

## Scope and evidence

9 October 2026. CareNest was exercised locally using synthetic patient/doctor accounts and Cashfree sandbox. The browser walkthrough used the actual Next.js production build, local database, server actions, payment endpoints and Cashfree hosted checkout. No browser payment success response was forged. The Cashfree simulator, explicitly labelled as making no actual debit, completed a ₹100 test-card payment.

This is an agent-led walkthrough and automated QA, **not a study with real patients or doctors**. Native app type checking and backend tests were run; Android/iOS device execution and hardware/camera/network behavior were not tested in this session.

## Automated checks

- Full regression run: **240 tests passed, 0 failed**, across booking/slot ownership, authentication, clinical privacy, files, notification delivery, Cashfree payments, refunds, payout safeguards, mobile access, search, reviews, video and worker behavior. The private full log is `.data/paid-final-full-tests.log`.
- After updating native mobile booking to require payment, its focused suite passed again: **6 tests, 0 failed**. Log: `.data/paid-mobile-tests.log`. It checks the unpaid invoice/checkout result and preserves one-use pairing, deduplication and record ownership.
- Native app type check passed: `.data/paid-mobile-typecheck.log`.
- Supplemental payout/public-key suite passed on 10 October: **16 tests, 0 failed**, including encryption of only client ID/timestamp, rejecting a private/invalid key file, and keeping production disabled. Log: `.data/paid-public-key-tests.log`.
- Production builds and web type checks passed during implementation. Final release checks are recorded in `.data/paid-release-build.log` and `.data/paid-release-typecheck.log`.
- `.env.local` and temporary QA tooling remain Git-ignored. Credentials are kept in the private environment file, not in browser props, receipts, source, screenshots or this report.

Money scenarios include failed/pending payments, duplicate checkout/webhook reconciliation, changed invoice amounts/currency, foreign-user access, expired/reused slots, cancellation refunds, paid rescheduling, zero-fee bookings, no-shows, pre-payout disputes, missing payout setup, payout IP rejection before submission, timeout after submission, mismatched transfer evidence, completed bank-credit evidence, explicit reversal accounting and terminal failure without duplicate transfer.

## Browser walkthrough results

| Walkthrough | Observed result |
| --- | --- |
| Local patient login with the labelled demo code | Opened the intended booking page. No real phone OTP delivery claimed. |
| Date/time selection with no chosen time | Continue button disabled. |
| Selected published time with consent | Opened the owned appointment checkout with the correct doctor, date, time, duration and ₹100 invoice. |
| Phone viewport 390 × 844 | Booking and checkout had no horizontal page overflow. |
| Actual Cashfree sandbox card payment | Provider SUCCESS result was checked by the backend; page changed to “Appointment scheduled.” |
| Actual Cashfree sandbox FAILED/insufficient-funds result | The simulator required a failure reason; after submission the owned payment-status check reported no successful payment and the appointment stayed unscheduled. |
| Assigned doctor login | The paid confirmed visit appeared on the doctor calendar. |
| Synthetic consultation start/completion | Doctor marked it attended; the patient's completed consultation history immediately showed it. No video/audio recording created. |
| Doctor payout history | One ₹100 obligation appeared in WAITING_SETUP; no fake transferred status. |
| Second checkout interrupted during the walkthrough | Its appointment stayed unpaid/unscheduled. After the 10-minute window expired, the worker released it and the page offered “Choose another time.” |
| Authenticated patient page sweep | 15 public/patient routes returned 200, including profile, pets, records, invoices, labs, updates and mobile devices. |
| Admin and doctor routes from patient session | Redirected to their required authentication/access gates. |
| Browser application errors | None recorded in the completed patient/doctor flows. |

Cashfree exposes a separate sandbox bank-simulator popup. Both the successful and failed-payment flows were completed against its actual sandbox. An earlier interrupted failed-payment attempt was not counted; the later completed test selected FAILED and the insufficient-funds reason, submitted the simulator, and verified the provider outcome through CareNest's owned payment-status action. The interrupted/expired browser flow was also separately observed.

The synthetic doctor was started within the existing permitted consultation-start window and marked attended solely to test completion behavior. This is a simulated clinical visit, not a claim that medical care occurred.

## Bugs found and fixed

1. **Payment came after clinic confirmation.** New online bookings now create a payment hold and are scheduled by verified capture instead.
2. **Rescheduling mixed text and timestamp types for the same SQL parameter.** Successful rescheduling raised a PostgreSQL parameter-type error. Explicit casts fixed it; the paid-reschedule test now passes and retains the original payment.
3. **Different checkout keys could create parallel orders for one invoice.** Active Cashfree orders are now recovered for that invoice instead of duplicating them.
4. **A late payment could otherwise be treated as successful without a valid slot.** Invalid/expired holds now enter refund review and cannot steal another reservation.
5. **A stale payment screen still offered checkout after its hold elapsed.** A countdown now removes the payment action at expiry and refreshes availability; API errors also refresh authoritative status.
6. **An unpaid hold showed a reschedule control that the new workflow could never accept.** The account screen now asks the patient to cancel and choose another time. Paid rescheduling remains supported.
7. **The clinician's invoice screen could offer an offline receipt for a new unpaid hold.** It now displays “Awaiting patient checkout”; the backend also rejects premature offline payment recording.
8. **Native mobile bookings still used the old request-only flow.** New mobile intents now return AWAITING_PAYMENT and an owned checkout path; the app opens the payment page and refreshes confirmation from the server.
9. **A provider accepted/sent transfer could be mistaken for doctor bank credit.** PAID requires Cashfree SUCCESS/COMPLETED, with one payout ledger effect and explicit reversal handling.
10. **Destination verification failure before a transfer could strand it as an ambiguous submission.** This is now retained as waiting setup with no submission timestamp, so setup can be corrected without a duplicate transfer.

## Remaining provider and user validation

The separate Cashfree Payouts sandbox keys were saved. The provider check returned **HTTP 403, authentication_error, “IP not whitelisted.”** The actual provider payout remains untested and no doctor bank transfer has been claimed. The doctor also needs an individually verified beneficiary mapping; the supplied QA helper can link only Cashfree's published synthetic test bank account to the synthetic doctor.

The user reported saving the IP whitelist, but repeated checks still returned the same 403 with the same public IPv4 and matching saved client ID. The adapter now also supports Cashfree's downloaded TEST public key; a matching key/account setup is still required before provider authentication can be verified. Supplemental checks are being recorded on 10 October 2026; this report's 9 October date refers to the original browser and regression run.

Required next steps:

1. Whitelist the current server/computer public IPv4 in the correct TEST Payouts account.
2. Verify/create the sandbox beneficiary, link it through admin or the local synthetic QA helper, and confirm adequate sandbox balance/provider activation.
3. Run the worker and verify the transfer ID, amount, beneficiary and completed credit status. Keep pending/failed states visible until actually reconciled.
4. Ask a patient tester and a clinic tester to complete booking, cancellation, rescheduling and consultation completion. Record whether they understand the hold, payment status, total price and payout status, with time-to-complete and observed errors.
5. Run the native app on Android/iOS hardware, testing browser handoff, same-account sign-in, backgrounding, network interruption and returning to refresh payment status. The native device token must never appear in a checkout URL.
6. Validate actual WhatsApp/SMS delivery separately with the configured provider and opted-in test phone; the login used here was explicitly a local demo code.

The previously agreed CareNest marketplace fee/clinic waiver and recurring clinic subscriptions remain separate commercial work. This change preserves consultation invoice amounts and does not claim a profitable pricing model or production readiness.

## Saved browser evidence

- [Mobile booking screen](qa-mobile-booking.png)
- [Mobile appointment checkout](qa-mobile-checkout.png)
- [Actual sandbox payment confirmation](qa-payment-confirmed.png)
- [Actual sandbox failed payment](qa-payment-failed.png)
- [Doctor payout obligation](qa-doctor-payout-status.png)
- [Completed consultation history](qa-consultation-history.png)
- [Route checks](qa-browser-route-checks.json)

Implementation and setup: [Paid booking and doctor payouts](PAID_BOOKING_AND_DOCTOR_PAYOUTS.md).

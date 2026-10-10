# CareNest: Twilio OTP, Meta WhatsApp and Gmail demo

Updated 10 October 2026. This supersedes the Fast2SMS transport selection for the current local demo. Fast2SMS remains available as an explicitly selected alternative.

## What is connected

- SMS sign-in uses Twilio Verify. The supplied API key authenticated to the supplied Verify service; the account and service matched and the service uses six-digit codes. No Twilio From number or Programmable Messaging Auth Token is required for this path.
- Direct Meta Cloud API credentials authenticated to the supplied test phone-number ID and test WhatsApp Business Account. The configured API version is v24.0.
- Gmail remains the email sender. Google sign-in verifies the patient's receiving email; it does not send emails by itself.
- Cashfree remains the sandbox payment gateway. A pending order or checkout browser callback alone cannot trigger a paid receipt.

All credentials are stored in ignored `.env.local`, never in source, browser code or this document. Replace credentials shared in chat before production. Temporary Meta tokens may need replacement independently of template approval.

## Templates actually submitted

CareNest templates were submitted through the API to the user's test WABA. The latest inspection found:

| Purpose | Template | Language | Category | Status at inspection |
| --- | --- | --- | --- | --- |
| Appointment updates | `carenest_appointment_update_v1` | `en` | UTILITY | PENDING |
| Ten-minute reminder | `carenest_appointment_reminder_v1` | `en` | UTILITY | PENDING |
| Payment, refund and doctor payout receipt | `carenest_transaction_receipt_v1` | `en` | UTILITY | PENDING |
| Optional account test update | `carenest_account_update_v1` | `en` | MARKETING, assigned by Meta | PENDING |

The optional generic account test was reclassified by Meta. CareNest deliberately accepts **approved Utility templates only** for these updates, so that test button cannot send this Marketing template. Use an actual sandbox payment after the transaction template is approved to test the receipt flow. Approval cannot be invented or bypassed with `hello_world` or the grocery sample templates. Existing Avyora templates were left unchanged.

Appointment templates contain five body variables in this order: doctor, full date, start/end time in IST, current appointment status plus visit type, authenticated CareNest link. The transaction template contains four: verified transaction status, exact amount with currency, transaction reference, billing link. Messages contain no diagnosis, prescription, bank account or card details.

The app checks the template's name, language, APPROVED status, UTILITY category and variable count with Meta **before sending or spending the local message allowance**. Changing a configured name does not establish approval. Templates are checked again at send time; no restart is required solely because Meta approves an existing configured template.

## What you need to do now

1. In WhatsApp Manager → Message templates → Manage templates, inspect the three CareNest Utility templates. Wait for APPROVED, or address Meta's stated rejection. Their exact names are already saved locally.
2. Keep the test recipient added to Meta's API setup. You confirmed this was done. Local WhatsApp updates are restricted to that recipient, while OTP requests use the phone entered at sign-up/sign-in.
3. In Twilio, keep the trial recipient verified and allow India in Verify Geo Permissions. Successful credential authentication does not prove SMS delivery or available trial credit. Trial restrictions still apply.
4. Sign into the local CareNest account with SMS. Request once and enter the received code on the site. Do not send the OTP in chat. The demo allows **two provider send attempts per rolling 24 hours across this app**, with a 60-second resend cooldown plus per-phone/network limits. Failed or uncertain sends count as attempts.
5. From Your updates, connect Google to that same phone account. Enable Email booking updates, WhatsApp updates and reminders, then save. Google sign-in on a separate account does not automatically merge it with an existing phone account.
6. Once Meta approves the transaction and appointment templates, choose an available appointment date/time and complete Cashfree **sandbox** checkout. Confirm the visit is scheduled only after payment verification, then check the linked Gmail inbox and test WhatsApp phone. Check Spam as well.
7. Keep CareNest and its worker running through the reminder time. The reminder is due ten minutes before the appointment, and skips cancelled, started, past or rescheduled visits. A sleeping or stopped laptop cannot deliver reminders on time.
8. Test a sandbox refund and a completed consultation's payout separately. Payouts still require a verified doctor's test beneficiary and working Cashfree Payouts authorization. This messaging change does not create a beneficiary or resolve an IP whitelist problem.

Local links include `localhost:3000`, which refers to the device opening the link. On a separate phone, the local laptop app needs a properly configured HTTPS/LAN test address; a localhost link cannot reach it. Phone OTP and message receipt themselves do not require exposing the app publicly.

## Delivery and failure behavior

- Provider OTPs are not stored or displayed by CareNest. A durable intent binds the verification SID to the phone, account, service and five-minute local expiry. Five wrong guesses exhaust it. Only Twilio's matching approved and valid response permits login, once. Concurrent checks and old in-flight responses cannot consume a newer request.
- Transaction amounts and references come from server-owned payment, refund or payout records. Excess/late captures are labelled as received with refund review required, rather than appointment confirmation. A partial refund displays the refund amount, not the original invoice total.
- Email and WhatsApp run independently. A Meta setup/approval failure does not prevent the Gmail attempt, and a Gmail failure does not suppress WhatsApp.
- Accepted messages are deduplicated per event and channel. Uncertain sends are retained for review instead of being automatically sent and charged again. A provider switch cannot blindly resend a recorded older WhatsApp attempt.
- Local caps are two Twilio OTP send attempts, ten Meta WhatsApp send attempts and ten Gmail attempts per rolling day. Templates and unknown recipient checks happen before outbound message spending. Confirmation, payment receipt and reminder are separate messages and each consumes an allowance when sent.
- ACCEPTED means the provider accepted the request; it is not proof of delivery to the handset or inbox. This integration does not fabricate DELIVERED/READ states. Signed Meta delivery webhooks require an app secret and a public HTTPS callback and are a later setup step.
- Optional generic account tests reclassified as Marketing remain blocked. SMS transaction notifications are not routed through Verify; Verify is for OTP only.

## Validation evidence and limits

Provider account/service and template discovery use read-only API calls. Template creation submitted review requests, not messages to patients. Automated tests use mock Twilio/Meta/SMTP responses and real isolated Postgres engines: OTP binding, single consumption, wrong guesses, expiry, overlapping requests, budgets, approved-only templates, verified payment amounts, partial refunds, independent channels and ambiguous delivery handling.

See the QA report for final test/build counts and live test results. Google consent, receiving a physical SMS/WhatsApp message and checking the receiving Gmail inbox require separate evidence. Earlier automatic approval review rejected the direct test email; it was not retried through another route. Use the app's email test yourself to confirm inbox delivery.

Provider contracts: [Twilio verification creation](https://www.twilio.com/docs/verify/api/verification), [Twilio verification check](https://www.twilio.com/docs/verify/api/verification-check), [Twilio API-key authentication](https://www.twilio.com/docs/iam/api-keys), [Meta's official WhatsApp API collection](https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api).

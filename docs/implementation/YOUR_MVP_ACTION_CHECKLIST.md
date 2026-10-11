# CareNest: tasks for you as the owner

Updated 10 October 2026. Your main responsibilities are provider-account activation, real clinician onboarding, operating decisions and acceptance testing. Software implementation and deployment engineering remain development work.

## Already done — do not recreate these

- Google OAuth application credentials are saved.
- Twilio Verify and Meta WhatsApp credentials authenticated successfully and are selected for the current demo. Fast2SMS credentials remain saved as an alternative.
- Cashfree Payment Gateway and separate Payouts test credentials are saved.
- The Gmail app password was corrected privately, and Gmail SMTP authentication succeeded.
- Local LiveKit is running and passed synthetic audio/video transport checks.
- Doctor/vet KYC, private evidence upload/review, booking/payment flows, reminder logic and automated tests are implemented.

Credential presence is separate from account approval and actual phone/inbox/transfer receipt. The tasks below supply that missing evidence.

## Do now: phone messages and account testing

### 1. Prove Twilio SMS OTP works on your phone

- [ ] Keep your test phone verified in the Twilio trial account and allow India in Verify Geo Permissions.
- [ ] Open `http://localhost:3000/sign-up` or `/sign-in`, enter your own Indian mobile number and press Send code once.
- [ ] Confirm the SMS arrives and its code signs you in. Enter the code on the site, never in chat.
- [ ] Check Twilio Verify logs if sending is rejected. The account/service credentials authenticated and the service uses six digits; phone delivery remains a separate check.
- [ ] The current local demo allows two Twilio send attempts per rolling day across this app, with a 60-second resend cooldown. Failed/uncertain attempts count.

Fast2SMS credentials remain saved as an alternative, but Fast2SMS is not the currently selected OTP provider. Do not change back to Quick SMS merely to finish this Twilio test.

### 2. Complete Meta WhatsApp template approval and receipt testing

The supplied Meta token authenticated to your test phone number and WhatsApp Business Account. You confirmed the test recipient was added. I submitted these templates; their status at inspection was PENDING:

| Template | Purpose | Body variables |
| --- | --- | --- |
| `carenest_appointment_update_v1` | Appointment update | Doctor, date, IST start/end, status and visit type, CareNest link |
| `carenest_appointment_reminder_v1` | Ten-minute reminder | Same five |
| `carenest_transaction_receipt_v1` | Payment/refund/payout receipt | Status, amount and currency, reference, billing link |

- [ ] Inspect approval in WhatsApp Manager → Message templates → Manage templates.
- [ ] Wait for APPROVED or resolve Meta's stated rejection. Names, language and phone/account IDs are already saved locally.
- [ ] Enable WhatsApp updates and reminders in CareNest's Your updates page, then save.
- [ ] After Utility approval, complete a Cashfree sandbox payment and check receipt, appointment update and ten-minute reminder on the phone.
- [ ] Replace the Meta access token privately when it expires. Do not paste another token into chat.

The app checks approval before sending. The optional generic account test was reclassified as Marketing by Meta and is blocked from this Utility-only integration. Grocery and `hello_world` samples cannot replace CareNest transaction templates.

Detailed current instructions: [TWILIO_VERIFY_META_WHATSAPP_GMAIL_DEMO.md](TWILIO_VERIFY_META_WHATSAPP_GMAIL_DEMO.md). The older Fast2SMS guide remains for an explicitly selected alternative.

### 3. Complete Google and Gmail acceptance checks

- [ ] Click Continue with Google on CareNest and complete Google's account-selection/consent screen.
- [ ] Check the configured OAuth application's audience/test users if Google blocks your intended test account.
- [ ] Confirm the web client's callback matches `http://localhost:3000/api/auth/google/callback` exactly. [Google callback setup](https://developers.google.com/identity/openid-connect/openid-connect)
- [ ] If you already signed up through SMS, sign into that account and use Your updates → Connect Google to this account so your appointment history stays together.
- [ ] Enable Email booking updates and Appointment and pet reminders, then save.
- [ ] Use Send a test email and check Inbox and Spam.
- [ ] Later check that a booking email and its ten-minute reminder arrive with the right doctor/date/time.

The sender app password is already saved and authenticated. You do not need to create it again. No actual inbox-delivery check has been completed by these tools.

### 4. Resolve Cashfree sandbox doctor payouts

- [ ] Open the **same TEST Payouts account** whose credentials are configured; Payment Gateway and Payouts are separate products.
- [ ] Resolve the previous IP authentication rejection. Under Developers → Payouts → Two-Factor Authentication, whitelist the computer's current public **IPv4**, or choose the documented public-key authentication method for a changing IP.
- [ ] For the public-key option, download the TEST account's public key, save it privately as `.data/cashfree-payout-public-key.pem`, and set `CASHFREE_PAYOUT_PUBLIC_KEY_PATH` to that file in `.env.local`. Tell me when saved so I can check it.
- [ ] Create/verify a sandbox test beneficiary using Cashfree's published test details, and provide its beneficiary ID for mapping to the test doctor.
- [ ] After account access is fixed, verify one sandbox completed-consultation transfer and its authoritative final status with my help.

Do not share bank credentials or full real bank-account details in chat. Test beneficiaries belong in the provider sandbox. Before real settlement, actual doctors need their own approved payout destinations and payment/settlement terms.

[Cashfree IP/public-key setup](https://www.cashfree.com/docs/payouts/payouts/integrations/payouts-2fa), [published sandbox payout data](https://www.cashfree.com/docs/payouts/payouts/integrations/data-to-test).

## Do before a real paid pilot

### 5. Recruit actual clinical supply

- [ ] Choose your first service area and initial human/veterinary services.
- [ ] Recruit actual licensed clinicians. For a pilot covering both people and pets, start with a genuine physician and veterinarian you can work with directly.
- [ ] Agree consultation fees, appointment durations, working hours, visit modes and support responsibilities with them.
- [ ] Have each clinician sign up and complete `/join`: identity, registration, qualification/specialty and clinic-affiliation evidence.
- [ ] Arrange a qualified verification reviewer to perform actual register/document checks and record decisions in `/admin/providers`.
- [ ] Have approved clinicians sign in, publish real schedules and enable only modes they can actually deliver.

Current real-provider count is zero. Sample doctors cannot replace this work. Government documents are private uploads; a real review is required before approval. JPEG/PNG evidence currently works without a PDF scanner; accepting PDF evidence requires scanner setup.

### 6. Supply the actual operator/company details

- [ ] Decide the actual legal operating arrangement with your accountant/legal adviser.
- [ ] Supply the real legal name, applicable registration/identifier and business address.
- [ ] Choose an actual grievance/support contact and provide their public name, email and phone.
- [ ] Record these under `/admin/governance` once you have the correct details.
- [ ] Choose who handles patient complaints, cancellations, no-shows, refund requests and doctor disputes.

No company details are currently configured. Do not fill the form with an invented registration or treat the brand name alone as the legal entity.

### 7. Arrange policy review and settle outstanding business rules

- [ ] Have appropriate professionals review privacy, consent, terms, data retention and grievance handling for your actual business.
- [ ] Have qualified clinicians review clinical and prescribing policies for the relevant human/veterinary scope.
- [ ] Record actual reviews and their evidence through `/admin/governance` and `/admin/clinical`.
- [ ] Agree clinician fees for the 15/30/45/60-minute durations you want to offer.
- [ ] Decide cancellation deadlines, no-show treatment, refundable components, refund timing policy, dispute handling and payout release conditions.
- [ ] Have your accountant review the invoice/tax/processor-fee treatment and settlement breakdown.

The **₹50 CareNest fee before applicable tax**, and **waiving it for subscribed clinics' own bookings**, are already your accepted directions. You do not need to approve those again. The fee calculation, eligible booking-source checks, clinic subscription entitlement and settlement implementation remain development work.

Current policy approvals are absent. Filling a form or checking an approval box is not a substitute for a real qualified review.

### 8. Participate in an end-to-end acceptance test

- [ ] Arrange a patient test account and an approved clinician test account, using test care data.
- [ ] Search for the clinician, select a slot and complete Cashfree sandbox payment.
- [ ] Confirm that failed/dismissed payment does not create a confirmed appointment.
- [ ] Check confirmation messages, then the reminder due ten minutes before the visit.
- [ ] Test real camera/microphone controls and two-party conversation.
- [ ] Test cancellation, rescheduling, a late participant and a disconnected/reconnecting call.
- [ ] Have the clinician complete the visit, then check patient history and the reconciled sandbox payout.
- [ ] Report confusing screens, missing messages and exact failure steps; I can fix those.

Localhost works on the computer running CareNest. For phone-plus-computer testing, tell me which devices/networks you will use so I can arrange an intentional secure reachable test origin. Do not assume the phone can open the computer's localhost link.

## Before public launch, not necessary to buy immediately for the local demo

### 9. Choose hosting and operational ownership

- [ ] Choose the domain and the cloud/provider you want to own when you are ready to deploy.
- [ ] Complete the account/billing/business verification yourself and choose a budget/spending limit.
- [ ] Decide who owns administrator access, support, backups and incident response.
- [ ] Enrol individual administrators in MFA; keep provider secrets and recovery information privately.
- [ ] Participate in a backup/restore drill and real-device staging test.
- [ ] Complete provider production activation and supply fresh production credentials privately when the code is ready for them.

I can handle domain/server configuration, HTTPS, database/storage migration, LiveKit networking, monitoring and deployment checks. No cloud migration has been performed, and the present Cashfree implementation intentionally remains sandbox-only.

### 10. Define which services wait until after the first MVP

- [ ] Choose whether clinic SaaS billing, pharmacy fulfilment, insurance/finance, ABDM/ABHA, call-centre/virtual-reception services and hardware are part of a later release.
- [ ] For any service you choose to launch, arrange actual licensed/authorised partners, contracts, pricing and support ownership first.
- [ ] Do not advertise a service as fulfilled merely because an intake form or demonstration screen exists.

## Your recommended order

**First:** real SMS receipt → WhatsApp account/templates → Google/Gmail inbox check → Cashfree payout access.

**Then:** recruit real clinicians → qualified KYC reviews → actual operator details and policies → agreed operational/pricing rules → full acceptance test.

**Finally:** complete remaining code and secure staging/production setup, then launch a controlled pilot after the acceptance evidence is satisfactory.

Keep passwords, API secrets, identity documents and bank details in their appropriate private files/portals. Share setup status and non-secret IDs when you need help.

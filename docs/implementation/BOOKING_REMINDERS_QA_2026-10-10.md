# SMS, Google identity and appointment-message QA — 10 October 2026

## Verified implementation

- 52 related messaging, security, sessions and mobile-maintenance checks passed with zero failures.
- After adding the final worker assertion, the updated appointment-notification/Google identity suite passed all 9 checks.
- Tests exercise real application services and isolated PostgreSQL/PGlite databases; Fast2SMS and SMTP transports are mocked. These test messages did not spend SMS credit or send external mail.
- Production build/type checking passed. Migration `0010-appointment-notifications` was applied without changing earlier applied migrations.
- Local mobile browser checks passed for both signup and login: HTTP 200, Google button present, SMS and Send code enabled, explicit two-per-day Quick SMS notice, no displayed demo OTP, and no horizontal scrolling at 390px. Screenshot: [qa-google-quick-sms-signup.png](qa-google-quick-sms-signup.png).

## Cases covered

- Quick SMS is explicitly selected, does not require a Smart OTP ID, uses one short code/recipient, is local-only, and admits at most two OTP attempts per rolling day across users.
- Challenges are keyed hashes, expire, can be consumed once, and cannot be promoted from displayed demo codes into verified phone identities.
- Concurrent reminder scheduler runs create one durable event per eligible booking revision. Unpaid holds are excluded, future events use the ten-minute due timestamp, and within-ten-minute bookings are due immediately.
- Confirmation and reminder messages derive the doctor, full date, start/end time in IST, visit type and authenticated CareNest URL from the current owned booking.
- Cancellation, obsolete revision, consultation start, reminder opt-out and past-start conditions suppress reminders.
- WhatsApp and email use independent receipts; a WhatsApp failure does not suppress email. Repeating an accepted event does not send it again.
- Lost SMTP acknowledgement stays UNKNOWN and is not blindly duplicated; unverified email and channel opt-outs are skipped.
- The worker records one current in-app reminder and completion; another drain does not duplicate it.
- Google identity tests cover new signup, returning login, explicitly linking an OTP account, verified-email ownership conflicts and suspended-account denial.

## Actual provider check

The user created a Gmail app password and saved it with incorrect formatting. The private file was corrected without displaying the credential. Gmail SMTP authentication succeeded on 10 October 2026. No actual Gmail test email was sent, and inbox delivery is not claimed.

Automatic approval review blocked the browser QA action involving Google's sign-in redirect/cookie checks and the direct test-email send. No detailed reason was returned. The safer local unauthenticated screen checks completed. Actual Google account selection/consent and Gmail inbox testing remain manual through the app.

Quick SMS is configured with the authorized cap, but no actual OTP was sent by these tools. Fast2SMS account sending eligibility, final debit and handset delivery require a controlled phone test. WhatsApp remains blocked by missing business-number/approved template configuration; no WhatsApp delivery is claimed.

Gmail demo sending has a separate ten-attempt rolling daily cap. The app's **Your updates → Send a test email** button is available after Google/email verification and email preference opt-in. Appointment reminders require the local app/worker to remain running. Localhost links work on the computer hosting CareNest; phone access requires separate networking setup.

Full setup guide: [DEMO_SMS_WHATSAPP_GMAIL_GOOGLE_SETUP.md](DEMO_SMS_WHATSAPP_GMAIL_GOOGLE_SETUP.md).

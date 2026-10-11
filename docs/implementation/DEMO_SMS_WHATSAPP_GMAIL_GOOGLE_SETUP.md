# CareNest demo: SMS OTP, WhatsApp bookings, Gmail and Google sign-in

The current demo now uses **Twilio Verify for SMS OTP and direct Meta Cloud API for WhatsApp**. Follow [TWILIO_VERIFY_META_WHATSAPP_GMAIL_DEMO.md](TWILIO_VERIFY_META_WHATSAPP_GMAIL_DEMO.md) first. This older guide documents Fast2SMS as an explicitly selected alternative; do not overwrite the new provider settings to follow it.

Updated 10 October 2026. CareNest remains on your computer; no cloud hosting was deployed.

## What has been implemented

| Feature | App behavior | Remaining account setup |
| --- | --- | --- |
| SMS login/signup | Explicit Fast2SMS Quick SMS demo mode; sends a six-digit code to the submitted Indian mobile number. No Smart OTP ID is needed in this mode. | Fast2SMS must allow Quick SMS for your account. Its send endpoint may still require account/KYC/payment activation. |
| Google signup/login | Continue with Google on both screens; verified Google identity, server-side code exchange, state validation and PKCE. | Your existing OAuth credentials are saved. Test users and exact callback URL must be registered with Google. |
| Link Google to an OTP account | Your updates → Connect Google to this account. Proves the current CareNest session and Google identity before connecting them. | Complete Google's account-selection/consent screen yourself. |
| Booking WhatsApp | After actual confirmation, sends doctor, date, start/end time in IST, visit type and an authenticated CareNest link. | Connect your WhatsApp business number and approve the confirmation utility template. |
| WhatsApp reminder | One reminder event for each current appointment version, due ten minutes before its start. | Approve the reminder utility template; enable WhatsApp and reminders in Your updates. |
| Booking email | Sends the same booking details to the user's verified Google/contact email. | Sender password was formatted privately and Gmail SMTP authentication passed. Enable the user's preference and check the actual inbox. |
| Email reminder | Uses the same ten-minute reminder event as WhatsApp. | Enable email and reminders in Your updates. |

The application can be ready before a provider account is ready. An accepted provider request is not proof that a phone/inbox received the message. No actual SMS, WhatsApp or Gmail delivery is claimed by this guide.

## 1. Test SMS without DLT registration

Your linked Fast2SMS guide explicitly offers Quick SMS without DLT registration and lists **₹5 per SMS** for this premium route. This differs from the approximately ₹0.25 DLT rate in your dashboard. Do not use the cheap DLT rate to estimate Quick SMS costs.

You authorized this demo mode with at most **two OTP messages in a rolling 24-hour window across the entire local app**. The setting is already saved:

```dotenv
SMS_PROVIDER=fast2sms
MESSAGING_PROVIDER=fast2sms
ALLOW_LOCAL_OTP=0
FAST2SMS_ENABLED=1
FAST2SMS_SMS_OTP_ROUTE=quick
FAST2SMS_QUICK_OTP_DAILY_LIMIT=2
FAST2SMS_LOCAL_DAILY_LIMIT=10
```

The existing `FAST2SMS_API_KEY` remains private. It is sent as the raw `Authorization` header, without `Bearer`, never in a browser bundle or URL.

1. Log into Fast2SMS and open **Dev API**.
2. Confirm that **Quick SMS** is available to your account and check its displayed rate/account activation status.
3. Open CareNest `/sign-up` or `/sign-in`, choose SMS, enter a real Indian mobile number you control and press **Send code once**.
4. Read the code on that phone, enter it in CareNest and continue. A successful provider request never displays the code on the website.
5. Check Fast2SMS's Delivery Reports and wallet deduction, and check the handset. A gateway receipt alone does not establish delivery.

The backend uses a fixed HTTPS POST to `/dev/bulkV2` with `route=q`, one recipient in `numbers`, a short single-code message, and `sms_details=1`. Quick SMS is explicitly selected, never a silent fallback after a cheaper route fails. The mode is blocked outside local operation.

At the linked ₹5 rate, two requests use about ₹10 before any account-specific additional charges. The previous ₹50 wallet check does not prove sending eligibility. Fast2SMS's error list includes KYC and a minimum paid-wallet-transaction requirement; if the actual send API returns either, complete that requirement in your own dashboard. CareNest does not top up your wallet automatically or change route to get around a rejection.

The app also applies the existing per-phone/network resend limits: sixty seconds between requests, three per fifteen minutes, five per hour, ten per rolling day per phone; only five incorrect guesses per challenge. The separate two-message Quick SMS cap wins even when a phone's own limit is higher. Codes expire after five minutes and are stored as keyed hashes. An unknown timeout is recorded and is not blindly repeated under the same delivery key.

For launch, replace this expensive demo route with an approved OTP route:

```dotenv
FAST2SMS_SMS_OTP_ROUTE=smart
FAST2SMS_SMS_OTP_ID=your_actual_approved_Smart_OTP_ID
```

Follow [FAST2SMS_SETUP.md](FAST2SMS_SETUP.md) for that route. The older “Bulk SMS (Service)” option described in the linked article may or may not be available on your current account; do not invent its sender/template identifiers.

## 2. Finish Google login and signup

Google OAuth identifies the person and verifies the receiving email. It does **not** send booking mail, and users do not grant CareNest Gmail-reading permissions.

In your existing Google project, open **Google Auth Platform → Clients → your web client** and confirm:

```text
Authorized JavaScript origin:
http://localhost:3000

Authorized redirect URI for signup/login:
http://localhost:3000/api/auth/google/callback

Separate optional clinician Google Calendar/Meet redirect:
http://localhost:3000/api/integrations/google/callback
```

Your local `APP_URL` and `APP_ORIGIN` now use `http://localhost:3000` to match those registered values. Use that hostname for this test; `127.0.0.1` and `localhost` are distinct OAuth redirect strings.

If the OAuth app is in Testing, add your intended test Gmail accounts under **Audience → Test users**. Open CareNest signup or login, click **Continue with Google**, choose the account and finish Google's consent flow. A new verified Google identity creates an account; returning identities sign into that same account.

If you already made an account with SMS OTP, sign into that account first and open **Your updates → Connect Google to this account**. This prevents creating a second unrelated appointment history. CareNest will not silently merge accounts merely because a typed contact email happens to match; a Google identity already attached to another account needs an explicit account-resolution process.

## 3. Set up Gmail as the demo sender

The sender is your chosen account, `your_sender@gmail.com`. Each patient receives messages at their own verified email; they do not supply a password.

1. Open [your Google Account security settings](https://myaccount.google.com/security).
2. Turn on **2-Step Verification** if it is not already enabled. Complete Google's verification yourself.
3. Open [App passwords](https://myaccount.google.com/apppasswords). Sign into the sender account.
4. Create an app password named **CareNest local demo**.
5. Copy the generated sixteen-character app password into the private file `C:\Users\champ\Desktop\carenest\.env.local`:

```dotenv
EMAIL_ENABLED=1
EMAIL_PROVIDER=gmail
EMAIL_LOCAL_DAILY_LIMIT=10
GMAIL_SENDER_EMAIL=your_sender@gmail.com
GMAIL_APP_PASSWORD=your_generated_16_character_app_password
```

All five settings are now saved. The generated app password was formatted privately and Gmail accepted SMTP authentication on 10 October 2026. Spaces in Google's displayed app password are removed by the server. Do not use your ordinary Gmail password, Google OAuth client secret or Fast2SMS key here. Do not paste the app password in chat or commit it. A direct automated test-email send was blocked by automatic review; no test email was sent and inbox delivery remains to be checked through the app's test button.

If App passwords is unavailable, check Google's documented restrictions: managed accounts, Advanced Protection and some security-key-only configurations can prevent it. Use an eligible demo sender or a verified transactional email provider instead; do not disable 2-Step Verification to work around it.

Restart CareNest after saving the password. The app uses encrypted Gmail SMTP at `smtp.gmail.com:465`, sends plain-text messages and caps the local demo at ten new email attempts per rolling day. Gmail account quotas and deliverability rules still apply. Use a transactional sender provider for production volume; this setup is a small demo, not an unlimited bulk-mail service.

In CareNest, connect/verify your Google email, open **Your updates**, enable **Email booking updates** and **Appointment and pet reminders**, and save. Press **Send a test email** once. Check Inbox and Spam. This test emails only; it does not also trigger a WhatsApp/SMS test.

Accepted email receipts are shown under Your updates. SMTP has no reliable provider idempotency contract: if the acknowledgement is lost, CareNest marks the outcome UNKNOWN and requires review rather than automatically duplicating the email.

## 4. Configure WhatsApp booking and reminder templates

Quick SMS activation does not activate WhatsApp. In Fast2SMS, open **WhatsApp Business** and finish connecting a business/test number you control. Copy its **Phone Number ID**, which is an account identifier rather than the literal phone number.

Submit two **Utility** templates for approval. Suggested drafts below are not already approved templates. Use the exact language supported by your account, and provide realistic example variable values when submitting.

Confirmation template name: `carenest_booking_confirmed`

```text
Your CareNest appointment is confirmed.
Doctor: {{1}}
Date: {{2}}
Time: {{3}}
Visit: {{4}}
Open your appointment: {{5}}
```

Reminder template name: `carenest_appointment_reminder`

```text
Reminder: your CareNest appointment starts shortly.
Doctor: {{1}}
Date: {{2}}
Time: {{3}}
Visit: {{4}}
Open your appointment: {{5}}
```

Both use body variables in exactly this order:

| Variable | Example | Source |
| --- | --- | --- |
| 1 | Dr Example | Current booked doctor name |
| 2 | 15 Oct 2026 | Appointment date in Asia/Kolkata |
| 3 | 10:00 am - 10:15 am IST | Current slot start and end |
| 4 | Video consultation | Video, clinic or home visit |
| 5 | CareNest appointment link | Authenticated `/consult/<bookingId>` or `/account` URL |

Do not add a URL-button variable unless the adapter/template definition is also changed; this implementation sends these five body variables. Provider/Meta review may require changes to the draft. For actual WhatsApp delivery, the template and its exact name/language must be approved.

Save privately:

```dotenv
FAST2SMS_TEST_PHONE=your_10_digit_Indian_test_phone
FAST2SMS_WHATSAPP_PHONE_NUMBER_ID=your_actual_phone_number_ID
FAST2SMS_WHATSAPP_BOOKING_TEMPLATE=carenest_booking_confirmed
FAST2SMS_WHATSAPP_REMINDER_TEMPLATE=carenest_appointment_reminder
FAST2SMS_WHATSAPP_VERSION=v26.0
FAST2SMS_WHATSAPP_LANGUAGE=en
```

Use the actual language/version provided by your account. Local booking/update tests are restricted to the saved test phone, while SMS OTP targets the submitted valid phone number. Enable **WhatsApp booking updates** and reminders under Your updates and save before booking.

For other transaction messages such as payment status, refunds and payouts, also approve a generic two-variable Utility template, for example `carenest_transaction_update`:

```text
CareNest: Your requested care transaction has an update: {{1}}.
Reference: {{2}}. Open your CareNest account for details.
```

Save `FAST2SMS_WHATSAPP_UPDATE_TEMPLATE=carenest_transaction_update`. Its variables are status followed by reference, separate from the five-variable appointment templates. The optional existing WhatsApp OTP authentication template is another purpose and is not needed to test SMS OTP plus WhatsApp appointment messages. Leave **SMS updates** off for this demo unless your DLT sender/update template has separately been approved; Quick SMS is used only for login OTPs.

## 5. Full booking and reminder test

1. Sign up through SMS or Google; connect Google to the same account if you used SMS.
2. Complete Gmail sender and WhatsApp template setup, save your notification preferences, and restart the app.
3. Choose a doctor and a future appointment slot, then finish Cashfree sandbox payment.
4. Verify that the appointment becomes confirmed only after the backend verifies successful payment. An unpaid hold does not produce a confirmed-appointment reminder.
5. Check WhatsApp and email for the confirmed doctor, date and start/end time. Check each provider's reports/receipts separately.
6. Keep **CareNest and its worker running**. At the ten-minute threshold, check for one WhatsApp reminder and one email reminder. Your computer being asleep/offline prevents a local worker from sending on time.
7. Cancel or reschedule another test appointment before its reminder is due. Verify that the old reminder is suppressed, and a newly confirmed appointment version gets its own current reminder.
8. Turn off reminders and verify that later reminder attempts are skipped. Turn off an individual channel and verify that the other can still operate.

The demo's `localhost` links open on the computer running CareNest. Receiving a WhatsApp message on a phone does not make that computer's localhost reachable from the phone. Opening the consultation on another device needs a separately configured secure network/public URL; no such exposure or cloud deployment was set up in this task.

If a confirmed booking starts in less than ten minutes, its reminder becomes immediately due. If the worker resumes late but before the start, it can send a delayed reminder saying “starts shortly.” It skips reminders after the start, after consultation start, after cancellation or for obsolete revisions. This is best-effort scheduling, not a guarantee of exact handset arrival time.

## Implementation details

- One durable outbox event per booking revision, with `available_at = max(now, starts_at - 10 minutes)` and a unique event key.
- Scheduler and delivery both validate confirmed/upcoming state, current revision, reminder preference and required payment status.
- Per-channel delivery records and idempotency prevent accepted messages being charged/sent again on a worker retry.
- WhatsApp and email are attempted independently; one channel's failure does not suppress the other.
- Booking details are read from the owned current booking, not trusted client-supplied doctor/time fields.
- Links go through CareNest authentication; no private meeting bearer token, medical notes or prescription is included in a notification.
- Google login uses verified signed ID tokens, matching audience/issuer, state and PKCE. Linking also requires the original CareNest account session.
- Migration `0010-appointment-notifications` adds email recipient/provider attribution and a reminder-candidate index. Applied older migrations are unchanged.

## Primary references

- [Fast2SMS authorization](https://docs.fast2sms.com/reference/authorization)
- [Fast2SMS no-DLT OTP options and Quick SMS rate](https://www.fast2sms.com/OTP-SMS-via-API-without-DLT-Registration)
- [Quick SMS API](https://docs.fast2sms.com/reference/quick-sms)
- [Fast2SMS WhatsApp text-template API](https://docs.fast2sms.com/reference/sendtexttemplate)
- [Fast2SMS sending error codes](https://docs.fast2sms.com/reference/error-code-list)
- [Google app passwords](https://support.google.com/accounts/answer/185833)
- [Nodemailer Gmail setup](https://nodemailer.com/usage/using-gmail/)
- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [Gmail sending limits](https://support.google.com/mail/answer/22839)

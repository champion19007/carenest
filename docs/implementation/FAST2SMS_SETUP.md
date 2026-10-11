# Fast2SMS setup for CareNest — 10 October 2026

The API key is saved privately in `.env.local`. A read-only wallet API check succeeded and returned **₹50.0000**. **No SMS or WhatsApp message was sent by that check.** You subsequently authorized **Quick SMS demo mode**, capped at two OTP attempts per rolling day. That explicit local route does not require a Smart OTP ID; Fast2SMS must still permit sending on your account. CareNest selects Fast2SMS with `FAST2SMS_ENABLED=1`, `FAST2SMS_SMS_OTP_ROUTE=quick` and `ALLOW_LOCAL_OTP=0`. WhatsApp onboarding and approved templates remain missing. Login targets the submitted valid Indian mobile number, without an Address Book entry. A saved test phone restricts local transaction/update tests only.

For the current demo, including WhatsApp appointment dates/times, ten-minute reminders, Gmail and Google signup/login, follow [DEMO_SMS_WHATSAPP_GMAIL_GOOGLE_SETUP.md](DEMO_SMS_WHATSAPP_GMAIL_GOOGLE_SETUP.md). The remaining sections here describe the cheaper approved-template route, rather than the premium Quick SMS demo.

## Switch from the Quick demo to the approved OTP route

Open **Smart OTP → Add OTP Template**, configure an SMS OTP using an approved template available to your account, and copy the resulting **OTP ID**. Save `FAST2SMS_SMS_OTP_ROUTE=smart` and `FAST2SMS_SMS_OTP_ID=your_actual_ID` privately in `.env.local`, then restart CareNest. If no SMS template is available, follow Fast2SMS's account/template activation process first. Do not calculate Quick SMS costs using the DLT tariff.

Your screenshot lists ₹0.25 per DLT SMS and ₹0.25 per WhatsApp authentication/utility message. One SMS plus one WhatsApp message is therefore approximately ₹0.50 at those displayed rates. The wallet is shared: it is not 200 free SMS plus 200 free WhatsApp messages. It can cover about 100 pairs if no other messages or charges use it. Actual deductions depend on your account and message segmentation.

## Automatic signup and login

A visitor enters their mobile number on CareNest and presses Send code. The backend generates one six-digit, five-minute challenge, sends it to that submitted number, and verifies the entered code before creating or signing into the account. When both channels are configured, SMS and WhatsApp receive the same code. The sender/template setup below is done once for the application, not once per customer.

## What to click next

### 1. Prepare the SMS sender and templates

Open **DLT SMS** in the left menu and its **DLT Manager**. Add your actual registered business/Principal Entity, approved sender header and approved content templates. If these are not registered, use Fast2SMS's DLT support process; do not invent an entity or use a random sender.

You need two SMS uses:

- **Login OTP:** one OTP variable, with the CareNest brand and purpose. Keep the text short and consistent with a five-minute code expiry.
- **Care/transaction update:** two variables in order: update status, reference. No advertisements or medical diagnoses.

A suggested update draft for review is: `CareNest: Your requested care transaction has an update: {#var#}. Reference: {#var#}. Open your CareNest account for details.` Use the variable tags required by your DLT portal and the exact approved text. Registration/approval must happen before the app can use it.

After adding the approved templates to Fast2SMS's DLT Manager, retain the sender header and the **Fast2SMS Message ID** for the update template. The API's `message` field uses that Message ID, not an invented value or necessarily the telecom's long content-template ID.

### 2. Create the SMS Smart OTP ID

Click **Smart OTP** in the left menu, then **Add OTP Template**. Select **SMS** as the primary channel, select your approved entity/sender/OTP template and identify the variable holding the code. Save/assign the template and copy its **OTP ID**.

For CareNest's requested simultaneous SMS + WhatsApp mode, use an **SMS-only** OTP ID. Do not also enable an automatic WhatsApp fallback inside this ID: CareNest sends the WhatsApp authentication template separately using the same code, and otherwise the fallback could create an extra charge/message.

CareNest sends its own six-digit code with `otp_expiry=5`, stores only a keyed hash, verifies it in the backend and consumes it once. Two delivered copies refer to the same challenge. The provider's send API supports a supplied OTP.

### 3. Connect the WhatsApp business number

Open **WhatsApp Business** in the left menu and complete its business-account/number onboarding using a business/test number you control. Follow the provider's verification flow. Copy the **Phone Number ID** after the number is connected; this ID is not the phone number itself.

### 4. Approve WhatsApp templates

Create an **Authentication** template for login OTP, preferably with the copy-code button. Example name: `carenest_login_otp`. CareNest passes the same code to its body and button.

Create a **Utility** template for care/transaction updates. Example name: `carenest_transaction_update`. Use the two variables in order: status, reference. Suggested draft: `CareNest: Your requested care transaction has an update: {{1}}. Reference: {{2}}. Open your CareNest account for details.` Submit it for approval; the provider/Meta may require more specific event templates or revised content. Do not pass a marketing template as a utility template to obtain a cheaper category.

Copy the approved template names and their exact language code, such as `en` or `en_US`. Example names in this document are suggestions, not templates that have already been created or approved.

### 5. Save the non-secret IDs and your test phone

Put the following in the private `.env.local`. The API key is already saved; do not paste it again or put it in frontend code.

```dotenv
MESSAGING_PROVIDER=fast2sms
SMS_PROVIDER=fast2sms
ALLOW_LOCAL_OTP=0
FAST2SMS_ENABLED=1
FAST2SMS_LOCAL_DAILY_LIMIT=10
FAST2SMS_TEST_PHONE=your_10_digit_Indian_test_phone
FAST2SMS_SMS_OTP_ID=your_actual_OTP_ID
FAST2SMS_SMS_SENDER_ID=your_approved_3_to_6_letter_header
FAST2SMS_SMS_UPDATE_MESSAGE_ID=your_actual_Fast2SMS_Message_ID
FAST2SMS_WHATSAPP_PHONE_NUMBER_ID=your_actual_phone_number_ID
FAST2SMS_WHATSAPP_OTP_TEMPLATE=your_approved_authentication_template
FAST2SMS_WHATSAPP_UPDATE_TEMPLATE=your_approved_utility_template
FAST2SMS_WHATSAPP_VERSION=v26.0
FAST2SMS_WHATSAPP_LANGUAGE=en
```

Use the exact language code and supported API version displayed for your templates/account. The private delivery flag is now enabled, but every channel checks its required IDs before sending. Set `FAST2SMS_ENABLED=0` whenever you want to pause all Fast2SMS sending. Incomplete setup fails visibly; it does not fall back to a displayed demo code and pretend to verify a phone.

Restart CareNest after editing configuration. The local launcher defaults to disabled phone delivery and demo codes off, and respects an explicitly selected SMS provider. Old displayed demo codes cannot be verified as phone-delivered codes after switching providers. Refresh an already-open signup/login page after the restart.

### 6. Run one controlled phone test

Open CareNest sign-in and use **SMS and WhatsApp**. Enter a valid Indian mobile number you control; the automatic login flow is not limited to the update-test phone. Confirm that the same code arrives through both channels, then verify one copy. Local OTP codes are not shown for a real provider. If only one provider request is accepted, the app states which channel accepted it; the code can still be verified from that copy.

For updates, sign in to the same account, open **Updates**, enable SMS and WhatsApp and save preferences. Use the test-update button once, then check your phone and the wallet. Booking/payment/refund messages follow actual application events; doctor-payout completion follows the provider's completed-credit state.

Ten outbound messages per day means at most five two-channel pairs in local mode. Signup/login OTPs may go to any valid submitted Indian mobile number. Only optional local update tests are restricted to the configured test phone. This is a message-count safeguard, not a guarantee about the provider's final billing. Repeated processing of an accepted event does not send it again. A timeout/unknown receipt requires review and cannot automatically resend a paid message. Notification preferences default off and each opted-in channel is handled independently.

**ACCEPTED is not DELIVERED:** the new receipts record gateway acceptance only. Handset delivery must be checked on the test phone and in Fast2SMS's delivery reports. CareNest does not fabricate delivered/read states.

## Current implementation and limits

- Fast2SMS OTP SMS, WhatsApp authentication and SMS/WhatsApp update adapters are implemented.
- The requested same-code dual OTP path is available once both OTP channels are ready.
- The Fast2SMS journal records per-channel state, provider reference and hashed recipient, without message text or OTP plaintext. Patient update receipts are owner-scoped.
- Approved templates, number onboarding, actual test-phone delivery and account-specific sending eligibility remain unverified. The wallet check proves authentication to the wallet endpoint, not successful message delivery.
- Fast2SMS can return KYC/minimum paid-transaction requirements when attempting a send. If this occurs, the app records rejection rather than silently charging another route. No wallet top-up is performed by CareNest.
- Quick SMS is now available as an explicit, user-authorized local demo choice; it is never an automatic fallback after another OTP route fails. Its separate cap is two OTP attempts per rolling day.
- Email keeps its existing separate configuration. Cashfree payment/payout authentication is independent of Fast2SMS.

## Official references

- [Authorization](https://docs.fast2sms.com/reference/authorization)
- [Read-only wallet balance API](https://docs.fast2sms.com/reference/wallet-balance)
- [Send OTP](https://docs.fast2sms.com/reference/send-otp)
- [DLT SMS](https://docs.fast2sms.com/reference/dlt-sms-single)
- [WhatsApp authentication template](https://docs.fast2sms.com/reference/sendauthenticationtemplate)
- [WhatsApp text template](https://docs.fast2sms.com/reference/sendtexttemplate)
- [Provider error codes](https://docs.fast2sms.com/reference/error-code-list)

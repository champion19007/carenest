# Doctor workspace implementation and pilot checklist

The supplied patient-view and calendar videos and all 80 screenshots informed this workspace. CareNest uses its own branding, copy and components. No screenshot assets, private reference contacts or third-party logos were copied into the application.

## Open the workspace locally

1. Run `npm run start:local` from the CareNest directory after the build has completed. The local launcher applies pending migrations and starts the app and worker together on `http://localhost:3000`.
2. Sign in with an existing clinician account. Access requires an active user with the doctor role, verified professional status, an active provider profile and an active clinician/administrator membership in the linked clinic. Sample providers remain restricted to local demonstration workflows; publication controls from migration 14 are preserved.
3. Open `/practice/calendar`. The left navigation opens the full workspace. An ordinary patient account cannot access patient charts or clinic administration.
4. Publish clinic hours under Settings → Calendar & hours before reserving a future visit. Calendar display hours are separate from bookable hours.

If access is denied, use `/join` to review provider onboarding and ask an administrator to complete the professional/clinic checks. Do not grant the doctor role simply to bypass verification. No real doctor has been automatically verified by this update.

## What each screen does

| Screen | Saved behavior | Important boundary |
|---|---|---|
| Calendar | Day, week, month and agenda; clinic appointments; rescheduling; actual walk-in arrivals; private reminders; calendar blocks; consultation status | Clinic reservations share capacity checks with marketplace bookings and live checkout holds. Arrival is never inferred from a reserved time. |
| Patients | Today/Recent/All search, Due/Waiting/Engaged/Met groups, demographics, private clinic contact editing, encounter selection and consultation history | Phone numbers do not merge patient accounts. Only assigned, consented records are readable. |
| Clinical chart | Signed notes, prescriptions, reported history, measured vitals, attachment upload and saved note/drug presets | Consultation must actually start before charting. Presets require clinician review; no diagnosis, dose or normality is generated. Signed versions are retained. |
| Billing | Online and clinic-arrival invoices, actual offline receipts, CSV export and existing doctor payout history | An unpaid marketplace hold cannot be marked paid manually. Manual clinic receipts do not initiate Cashfree bank transfers. |
| Reports | Date-filtered invoices, paid/unpaid/void amounts, recorded expenses, attended visits and confirmed payout credits | Invoice-date totals are not a bank cash-flow or profit/tax calculation. Amounts use exact integer paise; large aggregates remain decimal strings. |
| Inventory | Items/SKUs, batch receipts, expiry, reorder thresholds, purchase value and quantity removal with audit history | Physician-owned stock tracking; it does not grant dispensing authority. Expired stock cannot be recorded as clinic use and quantities cannot become negative. |
| Expenses | Actual receipt attestations, categories, payee/reference/private notes and voiding | Voiding keeps the record and audit history. Expenses do not send a payment to a supplier. |
| Communications | Booking/receipt queue and provider delivery status | Provider acceptance is distinct from handset delivery. Recipient consent, approved templates and configured credentials still apply. |
| Profile | Reviewed public profile link, eligible feedback and copyable clinic booking widget | Widget reads public directory fields only. Ratings are not fabricated; public identity/licence changes still need review. |
| Marketing | Public campaign drafts, fixed sandbox budget, resumable Cashfree funding, payment checks, submission/review/pause/archive, deduplicated impressions/clicks | Sandbox pilot only. No external Google/Meta ad account or real ad purchase is activated. Campaign copy is frozen once funding is pending or verified. |
| Settings | Private stationery, calendar display, communication topics/channels, print/email footer, note/drug/procedure/chart/consent catalogues and staff requests | Defaults do not certify a clinic, create a recurring charge or overwrite the reviewed public registry. Catalogue procedure prices do not automatically add invoice charges. |
| Integrations | Existing LiveKit/Google account status and setup review requests for digital health and private record sharing | Credentials being configured is not proof of a successful physical-device call or government approval. |
| Activity | Latest 200 audited actions | Private record bodies and provider secrets are not displayed. |
| Administrator reviews | Staff identity/role checks and campaign publication decisions at `/admin/workspace` | Current administrator MFA is required. No staff privileges or campaigns are approved automatically. |

Views are bounded for a pilot: up to 500 clinic contacts/catalogue/stock items/invoices/expenses, 1,000 batches/calendar reservations and 100 campaigns/access requests. They are not an unlimited longitudinal-data export. Stock and campaign ownership currently follows the practitioner workspace; a receptionist does not receive these tools automatically.

## Appointment and payment flow

- **Marketplace:** choose a published slot → hold → Cashfree sandbox checkout → authoritative payment verification → scheduled appointment → actual consultation → existing eligible payout queue. Existing refund and payout protections remain in place.
- **Clinic-owned visit:** choose or add a consented contact → future reservation within published hours → record actual arrival near the appointment time → one encounter and unpaid clinic invoice → begin consultation → signed chart/receipt → completion. A manual clinic receipt is recorded only after real receipt evidence is checked.
- Clinic-owned reservations do not add a marketplace platform charge. Marketplace service-fee behavior remains unchanged. The software-plan section has not activated a subscription or recurring debit.
- Claim receipts are private, expire after seven days and do not authenticate a phone number. A replacement requires an in-person identity attestation, invalidates the previous receipt and cannot replace an already-owned account link.
- Personal calendar reminders are in-app only. Clinic visit reminder events are durable and revision-bound; rescheduling/cancellation invalidates stale reminders. Existing patient booking email/WhatsApp/SMS scheduling remains the recipient-consented, provider-configured flow.

## Sandbox campaigns

1. Create clinic business copy without patient details or unsupported clinical guarantees.
2. Choose a budget and dates of at most 90 days. Use Cashfree Payment Gateway sandbox credentials on the server only.
3. Fund the saved draft. A pending or ambiguous order must be checked/resumed rather than duplicated. The server verifies amount, currency and receipt evidence.
4. Submit the funded campaign. An MFA-enrolled administrator checks clinician eligibility, public copy and matching funding evidence.
5. Approved active campaigns can appear in the matching CareNest doctor/vet discovery page, clearly labelled as a sponsored sandbox pilot. Impressions/clicks are hashed and deduplicated by campaign, network and hourly bucket; they are approximate observations, not unique-person counts or paid-ad performance guarantees.
6. Pause removes publication. No external advertising is created. For a real commercial launch, decide fulfillment, charging/refund terms and provider activation before taking real marketing payments.

## Your remaining owner steps

- Onboard actual clinicians, verify professional registration and clean evidence, and approve their clinic/staff associations. Confirm patient consent practices with the clinic.
- Test a complete real-user session on two accounts: patient and verified clinician. Test pet/guardian records with a verified vet as well.
- Confirm SMS OTP, Gmail/transactional email and approved WhatsApp templates on your own test recipients. Confirm booking, cancellation, receipt and ten-minute reminder messages, including opt-out and failure behavior. The UI QA did not send paid messages.
- Test LiveKit with two physical devices and separate patient/clinician accounts, including camera/microphone permissions, reconnect and ending the visit. Recording remains disabled.
- Finish sandbox beneficiary/payout setup, test a completed marketplace payment and consultation, then independently check provider credit/refund reconciliation. Clinic receipts and campaign funding are not doctor payout triggers.
- Decide the clinic software subscription plan and Cashfree recurring-payment activation before introducing subscriptions. No recurring mandate was fabricated.
- Complete external ad account, digital-health/ABDM and sharing approvals if you want those integrations to operate; support requests do not activate them.
- Provision persistent private file/object storage and a safety scanner for a hosted upload pilot. Local private files must not be mistaken for persistent Vercel storage.

## Database and release

Migration **0015-doctor-workspace** adds the calendar, preferences/catalogues, inventory, expenses, campaign and staff-request tables plus indexes. Visit and stock movement history are append-only. It was applied locally after a private backup. Earlier migration SQL was not edited.

**Production has not been migrated or released by this task.** First use an isolated staging database and staging provider credentials. Existing Vercel preview environments must not share the production database for this clinical migration. A build does not apply migrations; an old database correctly fails readiness until migration 15 is applied explicitly.

Before production release: review this PR → stage/backup the target database → apply migration 15 with the correct connection in a private environment → check readiness and clinician workflows → deploy the reviewed commit → verify role/consent, notification, refund and payout behavior. A code rollback alone does not remove the new tables. Keep the migration 15 schema; do not delete records to roll back UI code.

Private backup for this task: `.data/backups/snapshot-2026-10-11T16-00-45-521Z`. Keep the database and encryption keys together. Raw media, generated fixture bundles/screenshots, provider keys and backups are excluded from Git.

## QA evidence and limits

The full regression/coverage run passed **343 tests**, with **74.03% lines, 76.17% branches and 80.31% functions**. Final focused tests cover new route validation, CSV formula injection, month navigation, revoked membership, immutable stock history and exact large-value monetary sums. Type checks and production builds are part of release validation.

Browser checks used actual client components in an isolated fictional fixture at a separate loopback origin; action boundaries were mocked. The SQL services were separately exercised against throwaway PostgreSQL databases. Browser checks verified light/dark appearance, appointment/duration selection and success feedback, 320/768/1024/1440 layouts without page-wide horizontal overflow, mobile dialog focus, inventory forms, prescription presets replacing an empty row and disabling an unchanged repeat save. No real patient, provider account, external message, payment or bank transfer was involved in those UI checks. This is not a claim of a live clinician/patient payment or video session.

Final maintenance/access checks: 31 affected service, Cashfree payout and actual key-rotation tests passed. The existing rotation command now includes every new encrypted workspace column and its original context. Retain old encryption keys with backups; do not rotate by replacing the only saved key. Both full and production dependency audits reported zero vulnerabilities.

# Avyora improvements applied to CareNest

This work transfers the useful engineering improvements from Avyora Beauty into CareNest. It does not copy customer data, private credentials, deployment regions or retail checkout rules. The work belongs to PR #3; the production branch is not merged or promoted by this change.

## What changed

| Improvement | CareNest implementation | Why it matters |
| --- | --- | --- |
| Email-code sign-in | Optional six-digit code for an existing active account with an already verified email | Provides another sign-in method without another paid SMS; new accounts still use phone or Google |
| Email-code abuse controls | Five-minute validity, sixty-second resend cooldown, five requests/address/hour, twenty requests/network/hour, five wrong attempts/challenge, thirty checks/network/fifteen minutes | Limits guessing, repeated sends and cost; challenge storage contains a keyed hash rather than the code |
| Local email allowance | Two sign-in emails/day by default, sharing the overall local email allowance | Keeps demo sends bounded; allowances count attempts and uncertain deliveries |
| Clinic appointment alert | Durable doctor notification after a current eligible appointment is confirmed | The clinician receives the time and a link to the authenticated practice workspace; no patient name, symptoms or clinical documents in the outbound alert |
| Waived appointment notifications | Valid zero-value waived invoices now qualify for confirmations and ten-minute reminders | Patients still receive updates when the clinic absorbs the booking fee |
| Privacy-safe logs | Operational fields are explicitly allowed; raw errors, provider replies and patient/authentication payloads are discarded | Makes failures visible without exporting clinical data or secrets |
| Optional Sentry hooks | Separate server/browser DSNs, strict event filtering, replay and tracing disabled | Allows basic error reporting once CareNest's own project is configured |
| Fresh readiness check | Every `/api/health` probe reads the current database migration version with an eight-second response deadline | An outage after startup no longer looks healthy because of a cached schema check |
| Environment checker | `npm run check:env` reports missing or invalid setting names without values | Catches configuration mistakes without exposing private keys |
| Automated checks | GitHub PR checks run types, regression tests, native coverage, dependency audits and a hosted build without credentials | New changes are checked before merging |
| Response/image settings | Removes the framework header, enables compression, AVIF/WebP public image variants and optional Docker standalone output | Applies the suitable performance settings while preserving private response handling |

SMTP acceptance is not proof of inbox delivery. Codes remain unusable if delivery acceptance is uncertain. The generic email-request response does not disclose whether an account exists, although this is not a guarantee of identical response timing. Sign-in codes are never displayed as demo hints or sent to Sentry.

Clinic alerts use the existing notification preferences, verified contact checks and configured providers. Email and WhatsApp are independent delivery channels. Unapproved templates, unavailable credentials or provider rejection remain visible in the delivery workflow; they are not reported as a successful send. Reminder jobs require the background worker to remain running. Rescheduling changes the booking revision and invalidates old reminders.

## Existing CareNest features retained

Phone verification, explicit Google account linking, patient and household scope, pet profiles, doctor/vet evidence review, admin MFA, encrypted private files, paid slot reservations, Cashfree sandbox checkout, refund reconciliation, doctor payout accounting, durable outbox retries, consultation history and LiveKit without recording were already implemented. This work preserves their existing authorization and payment boundaries.

## Avyora features that do not transfer

- Guest retail checkout and automatic email-based account merging: medical records require a verified account and explicit ownership.
- Cosmetics recommendations, face analysis, carts, promotional order campaigns and product photography: these do not belong in the appointment workflow.
- Avyora's Sentry project, credentials, customer contacts and deployment region: CareNest needs its own settings.
- Public caching of medical records or appointment responses: only suitable public image optimization is applied.
- Refusing every hosted build without credentials: CareNest deliberately permits a setup page build so an incomplete deployment gives a useful response while protected operations return unavailable.

## Monitoring setup you still need to complete

1. In your existing Sentry organization, create a separate **CareNest** Next.js project. Copy its hosted DSN privately into `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` in `.env.local` for local testing, and the corresponding Vercel environments for hosted testing. Do not reuse the Avyora project DSN. No source-upload token is required for the current hooks.
2. Restart/rebuild after changing the browser DSN. Keep replay, tracing and automatic PII collection disabled. The application exports only generic error text/type and sanitized frame positions, so reports have deliberately limited debugging detail. Verify a synthetic error reaches the CareNest project before relying on it.
3. After setting up the production database and applying migrations, create an UptimeRobot HTTPS monitor for `https://carenest-phi.vercel.app/api/health`. Use a five-minute interval if supported by your plan, require HTTP 200, and select your intended alert contact yourself. A database outage or pending migration returns 503. A fresh read confirms only database/readiness, not that SMS, payment, email or video providers are healthy.
4. Keep the monitor paused while production setup is incomplete. Otherwise 503 is the correct result and will cause repeated alerts. No CareNest monitor or Sentry account resource was created during this work.

Browser account setup could not be completed because the computer-use helper failed with `failed to write kernel assets: The system cannot find the path specified. (os error 3)` after recovery. Account activation therefore remains manual until browser control is available.

## Test and release steps

```powershell
npm run check:env
npm run typecheck
npm run test:coverage
npm audit --omit=dev --audit-level=high
npm audit --audit-level=critical
npm run build
npm run start:local
```

Stop the local app before direct migrations, backups, administrator provisioning or build steps that inspect the local database. Never start another owner of `.data/pg`. The launcher applies the new `0013-email-code-login` migration on startup; a hosted PostgreSQL deployment must apply the ordered migrations separately.

Native V8 coverage artifacts are stored privately under `.data/coverage`. Coverage measures instrumented executed sources; it is not a guarantee that every route or every provider integration was exercised. Some tests transpile services in isolated VM contexts. Provider tests use controlled mocks unless a report explicitly records a live provider check.

## Verification recorded on 11 October 2026

- Full regression/coverage run: **312 tests passed, zero failed**, including actual transactional booking, payment, KYC, identity, ownership and notification services with synthetic data.
- Native executed-source coverage: **71.82% lines, 77.41% branches, 77.39% functions**. The runner now enforces a 70% minimum for each metric; these thresholds were selected after measuring this run. Unexecuted routes and VM/source-map limits remain outside this coverage claim.
- The final email receipt and environment-check refinements were rerun with the observability tests: twelve tests passed, including rejection of null, empty or non-string provider receipts. Local configuration preflight passed; it correctly reports that Sentry is not connected and WhatsApp template approval needs a provider check.
- Type checking and optimized local production build passed. Both runtime and full dependency audits reported zero known vulnerabilities at this check.
- Isolated desktop (1280px) and phone (390px) browser checks passed for email-form rendering, generic unknown-account responses, resend cooldown, invalid-code rejection, no session grant, no horizontal overflow and no browser errors. No email or SMS was sent by these browser checks. Local health returned HTTP 200 with a fresh database readiness result; the framework header was absent.
- Local migration `0013-email-code-login` applied. An encrypted-data snapshot was created before applying it; the running app was stopped for the backup/migration/build sequence and restarted afterwards.
- Publication scanning found no private credentials or configured contacts in the changed source/document files. Private environment files, databases, coverage artifacts and the user's unrelated launcher change remain excluded from the commit.

These checks do not verify a live Sentry event, actual email inbox receipt, Meta utility-template delivery, a physical two-device call or a real doctor payout. The prior missing-database recovery remains covered by regression tests; production still requires its own persistent database and settings.

Read [Vercel database setup](VERCEL_DATABASE_SETUP_AND_CRASH_FIX.md) before production deployment. Configuring a database does not enable provider accounts or replace end-to-end testing with real devices.

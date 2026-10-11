# CareNest

CareNest is a local development platform for healthcare and veterinary appointments in India. It includes patient and family accounts, pets, clinician scheduling, clinic operations, clinical records, billing, partner workflows and video consultations. Provider licensing, clinical policies, external service activation and release readiness still require separate review.

## Run locally

Use Node.js 24 and npm. Docker Desktop is required for local LiveKit video and the optional PostgreSQL verification environment.

```powershell
npm ci
Copy-Item .env.example .env.local
npm run seed
npm run dev:local
```

Copy the example environment file only on a fresh checkout; preserve an existing private `.env.local`. Open http://127.0.0.1:3000. The launcher applies ordered migrations, starts Next.js and the background worker, and forces the local PGlite database and loopback binding even if a remote `DATABASE_URL` is present.

For local video, with Docker Desktop running:

```powershell
npm run video:local
```

This creates private development credentials and the loopback-bound LiveKit container. On subsequent runs, start the existing `carenest-local-livekit` container. See the [LiveKit setup and validation guide](docs/implementation/LIVEKIT_LOCAL_VIDEO_IMPLEMENTATION.md).

For production-mode testing on this computer, stop the running application first:

```powershell
npm run build
npm run start:local
```

Stop with Ctrl+C before seeding, direct migrations, backups or administrator provisioning. Do not run multiple database owners against `.data/pg`, or expose this local demo runner through a public tunnel.

## Main surfaces

| Surface | Routes | Access |
| --- | --- | --- |
| Public care discovery | `/`, `/search`, `/doctor/[slug]`, `/pets`, `/labs`, `/surgeries` | Public |
| Patient and household | `/account/*`, `/dashboard/patient`, `/book/[slug]`, `/consult/[bookingId]` | Current signed-in account and resource ownership |
| Clinician practice | `/practice/*` | Eligible clinician and clinic membership |
| Clinic and partner operations | `/staff/*` | Assigned role and organization scope |
| Administration | `/admin/*` | Individually provisioned account, password and authenticator code |

The seed contains fictional local sample identities: doctor `9000000001`, veterinarian `9000000002`, and lab operator `9000000003`. These are demo identities, not professionally verified providers. Demo phone codes require explicitly enabling the local OTP setting; the launcher does not silently enable it. Real SMS verification needs the configured provider. Keep test contacts and provider credentials private.

Create an administrator with the application stopped:

```powershell
npm run admin:create
```

Read enrollment details privately under `.data/secrets`, enroll the authenticator and sign in at `/admin`. Public sign-in does not create administrator accounts. See the [local runbook](docs/implementation/LOCAL_RUNBOOK.md) for operating details.

## Architecture and implemented workflows

- Next.js 16, React 19, TypeScript and Tailwind 4 form a modular monolith with a shared PostgreSQL transaction boundary. The local runner uses PGlite; a PostgreSQL adapter and synthetic verification tools support a future migration.
- Ordered, checksummed migrations support atomic slot reservations, booking revisions, cancellation and rescheduling, idempotent requests, audit history and a durable transactional outbox.
- Hashed opaque sessions, current database authorization, role and clinic scope checks, clinician eligibility, consent and rolling rate limits protect workflows. Clinical records and private files use contextual encryption and ownership checks.
- Persisted workflows cover household and pet appointments, vaccination records, walk-in clinic visits, home dispatch, lab orders, receipts, refunds, surgery enquiries, support and licensed pharmacy partner operations.
- LiveKit is the default video provider, with short-lived room-scoped tokens, appointment join windows, cancellation cleanup and room reconciliation. `/consult/[bookingId]` hosts the call interface. Zoom integration is retired.
- Optional Google sign-in and Google Calendar-created Meet links require private OAuth configuration and clinician consent. Neither is needed to run the local website or LiveKit.
- Optional email-code sign-in serves existing active accounts whose email is already verified. Google sign-in can create a verified account; email sign-in does not create an account or merge identities. Gmail demo delivery requires a private app password and `EMAIL_OTP_ENABLED=1`.
- Cashfree sandbox checkout confirms a held appointment after verified payment. Doctor completion creates a payout workflow that checks eligibility, beneficiary and payment state; an uncertain transfer requires reconciliation. Clinic-owned bookings can waive the CareNest fee while marketplace bookings retain it.
- Patient booking/payment updates, ten-minute reminders and minimal clinic appointment alerts use a durable outbox. Email and WhatsApp need separate provider setup, verified destinations and approved templates. The background worker must stay running for scheduled delivery.
- Doctor and veterinarian onboarding freezes the submitted evidence revision for manual review, consent, clean-document checks and approval. Fictional seed profiles remain clearly marked as demo providers.
- The responsive website includes mobile navigation and patient workspaces. `apps/mobile` is a separate Expo prototype with device pairing and encrypted offline intents; it is not ready for release.

External SMS, email, payments, AI and partner services require real account setup and activation. ABDM, insurance and finance intake do not establish certification or partnerships. AWS and Google Cloud documents describe future migration options; this local implementation does not deploy cloud infrastructure.

## Checks and operations

GitHub checks run types, the regression suite with native coverage, dependency audits and a hosted build without private credentials. Coverage artifacts describe the instrumented executed services and do not prove that every external integration works. Local provider acceptance, actual recipient delivery and physical-device checks are separate evidence.

```powershell
npm test
npm run typecheck
npm run test:coverage
npm run check:env
npm run verify:postgres
```

The PostgreSQL verification command uses a separate synthetic local Docker environment. `check:env` reports setting names and configuration status, never secret values. Use `node scripts/check-env.mjs --production` against actual deployment environment variables; it deliberately does not import local secrets. It checks configuration shape, not provider activation, template approval or connectivity.

`/api/health` performs a fresh read of the required migration and returns 503 for missing setup, missing migrations or an unavailable database. Sentry is optional and disabled until valid CareNest DSNs are configured. Error export discards request data, raw messages, patient identities, breadcrumbs and source text; replay and tracing remain disabled. Create a separate CareNest project and verify a synthetic event before relying on it.

## Owner setup before the MVP pilot

1. Configure persistent PostgreSQL, authentication and encryption settings in Vercel, apply the ordered migrations and verify `/api/health`. A local PGlite database is not a hosted database. Keep main deployment separate from PR #3 until checks and setup are complete.
2. Activate and validate Twilio phone verification, Gmail sender, Google OAuth redirect URLs, Meta booking/payment/reminder templates and Cashfree test checkout/payout beneficiaries. Sandbox success does not authorize live payments or transfers.
3. Keep a worker running for queued deliveries, reminders and reconciliation. Confirm actual email and WhatsApp receipt using the intended test accounts; provider acceptance alone is insufficient.
4. Onboard real doctors/vets with license evidence, consent, a human reviewer and verified payout details. Complete business information, support/grievance contact and the applicable operating policies before accepting real patients.
5. Test phone and desktop sign-in, failed/cancelled checkout, rescheduling, refunds, a completed consultation and a reconciled doctor payout. Complete a LiveKit call using two real devices with camera/microphone permissions and confirm private records remain scoped to their owners.
6. Set up CareNest monitoring, encrypted backups and a restore exercise. The separate Expo prototype requires its own dependency and device validation before any mobile release.

See the implementation reports for dated test results and outstanding provider checks; successful local checks are not production certification.

## Documentation

- [Local operation, architecture and data rules](docs/implementation/LOCAL_RUNBOOK.md)
- [Avyora improvements, monitoring and remaining setup](docs/implementation/AVYORA_IMPROVEMENTS_APPLIED_TO_CARENEST.md)
- [Vercel database setup and crash recovery](docs/implementation/VERCEL_DATABASE_SETUP_AND_CRASH_FIX.md)
- [Implementation ledger](docs/implementation/LOCAL_IMPLEMENTATION_LEDGER.md)
- [Remaining work and provider setup](docs/implementation/REMAINING_WORK_IMPLEMENTATION_AND_SETUP.md)
- [LiveKit implementation and validation](docs/implementation/LIVEKIT_LOCAL_VIDEO_IMPLEMENTATION.md)
- [Original project audit](docs/audit/CARE_NEST_REVIEW_2026-10-06.md)
- [Practo research and CareNest implementation blueprint](docs/architecture/PRACTO_AND_CARENEST_IMPLEMENTATION_BLUEPRINT.md)
- [Future AWS and Google Cloud engineering and migration plan](docs/architecture/AWS_GCP_DETAILED_ENGINEERING_AND_MIGRATION_PLAN.md)

Private environment files, databases, uploaded records, native runtime files and account/clinical screenshots are excluded from Git. Back up local data together with its encryption keys. A fresh clone does not include the local database or private credentials.

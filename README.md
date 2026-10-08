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

The seed contains fictional local sample identities: doctor `9000000001`, veterinarian `9000000002`, and lab operator `9000000003`. These are demo identities, not professionally verified providers. The local runner enables the explicit demo OTP flags; non-local delivery needs a configured provider.

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
- The responsive website includes mobile navigation and patient workspaces. `apps/mobile` is a separate Expo prototype with device pairing and encrypted offline intents; it is not ready for release.

External SMS, email, payments, AI and partner services require real account setup and activation. ABDM, insurance and finance intake do not establish certification or partnerships. AWS and Google Cloud documents describe future migration options; this local implementation does not deploy cloud infrastructure.

## Verification and remaining limits

The latest recorded full regression run passed **201 tests**, and the production website build passed. Final targeted LiveKit checks cover late cancellation, future-room cleanup and local origin validation. Synthetic PostgreSQL concurrency/restore checks and two-participant LiveKit connection and room-deletion checks are also recorded.

Real camera, microphone and phone call testing remains outstanding. Google authentication reached account selection, but the completed callback, application session and live Meet creation have not been verified. The website dependency audit recorded no known vulnerabilities at that check; the separate mobile prototype still has unresolved high-severity dependency findings.

```powershell
npm test
npm run typecheck
npm run verify:postgres
```

The PostgreSQL verification command uses a separate synthetic local Docker environment. Consult the evidence and limitations in the documentation rather than treating successful local checks as production certification.

## Documentation

- [Local operation, architecture and data rules](docs/implementation/LOCAL_RUNBOOK.md)
- [Implementation ledger](docs/implementation/LOCAL_IMPLEMENTATION_LEDGER.md)
- [Remaining work and provider setup](docs/implementation/REMAINING_WORK_IMPLEMENTATION_AND_SETUP.md)
- [LiveKit implementation and validation](docs/implementation/LIVEKIT_LOCAL_VIDEO_IMPLEMENTATION.md)
- [Original project audit](docs/audit/CARE_NEST_REVIEW_2026-10-06.md)
- [Practo research and CareNest implementation blueprint](docs/architecture/PRACTO_AND_CARENEST_IMPLEMENTATION_BLUEPRINT.md)
- [Future AWS and Google Cloud engineering and migration plan](docs/architecture/AWS_GCP_DETAILED_ENGINEERING_AND_MIGRATION_PLAN.md)

Private environment files, databases, uploaded records, native runtime files and account/clinical screenshots are excluded from Git. Back up local data together with its encryption keys. A fresh clone does not include the local database or private credentials.

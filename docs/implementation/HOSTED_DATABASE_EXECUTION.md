# CareNest hosted database setup

The Vercel project needs its own new PostgreSQL database. The laptop's `.data/pg` is unrelated to Vercel. Never connect or migrate the existing `neon-violet-school` (Avyora) or `neon-coffee-dog` (comics) databases.

## Create and connect

In Vercel → CareNest → Storage, use Create Database → Neon. Choose Singapore and the Free plan, leave the optional Neon Auth add-on off, name the database `carenest`, and connect it to the CareNest project's Production environment. CareNest already has its own authentication. Creation and the final provider confirmation remain an owner action.

Verify that `DATABASE_URL` is actually present in the project's environment-variable metadata. A ready deployment or the old setup page is not evidence of a connected database. Vercel may inject several provider variables in addition to `DATABASE_URL`; keep provider-managed variables rather than deleting them to obtain a particular count.

Create independent production `AUTH_SECRET` (at least 32 characters) and `DATA_ENCRYPTION_KEY` (exactly 64 hexadecimal characters), with encrypted storage. Never reuse another app's credentials, overwrite an existing production encryption key, print values, save them in the repository or copy the laptop's environment file to production. These three required settings must exist; extra provider-managed settings are normal.

## Inspect before any write

Read the new database's table inventory before migrations. Application tables must be absent, or have a recognised CareNest migration history with matching checksums. Neon may have provisioned its optional provider-owned `neon_auth` schema; that schema is preserved and is not used by CareNest. A database containing another application's tables without a CareNest history must be rejected. Low activity is not evidence that it is disposable.

The maintenance commands default to local data even when `DATABASE_URL` is set. For hosted execution, set the dedicated URL and its independently verified hostname in the process environment only:

```powershell
# Supply privately in the invoking process, not in source or .env.local:
# DATABASE_URL = dedicated CareNest connection string
# CARENEST_EXPECTED_DB_HOST = hostname of that same verified database
npm run migrate -- --postgres
npm run seed -- --postgres --demo
```

The remote commands fail if the verified hostname does not match. Migration inspects existing tables before DDL; seed requires the latest CareNest migration and does not silently apply missing migrations. A failed migration stops the deployment sequence. Successful local migration/seed output does not count as hosted success.

## What the demo seed publishes

Seed keeps one fictional profile per existing specialty, clinics and localities. It does not professionally verify anyone. Hosted demo discovery is explicitly enabled by a single database setting (`provider.demo_catalogue_settings`); it is not `CARENEST_LOCAL_MODE` and does not permit embedded storage on Vercel.

The hosted sample profiles show consultation fees and demonstration labels. Their booking controls are unavailable, and the booking service still rejects unverified clinicians. Unreviewed non-demo doctors remain hidden. Real appointments require real provider onboarding and the existing verification/payment setup. The seed does not enable SMS, Google, WhatsApp, email, LiveKit or payments.

To remove hosted sample profiles after onboarding real doctors, an owner can set `provider.demo_catalogue_settings.enabled=false`. This hides the catalogue without deleting doctors, records or history. Never turn on local mode in a hosted deployment to display fixtures.

## Deployment acceptance

After the owner-created database, encrypted settings and hosted migrations/seed are verified, merge the new PR containing the previously unmerged holding-page removal and the hosted setup fixes once checks pass. Deploy from `main`.

Verify the actual production responses: `/api/health` must return HTTP 200 with `status=ready`; `/search` must return HTTP 200 and show provider cards with fees and sample labels. Also check a sample profile explains that real appointments are unavailable. A successful build, a setup page with HTTP 200 or an empty doctor list is insufficient.

Public metadata, sitemap and robots URLs use a configured origin or Vercel's automatic production domain, so this deployment does not need an additional custom setting merely to avoid localhost links. [Vercel documents that production-domain system variable here](https://vercel.com/docs/environment-variables/system-environment-variables#vercel_project_production_url).

Record exact migration, seed, CI and deployment outcomes. Any absent database, denied access or unverified provider delivery remains an outstanding item, not a completed integration.

## Database work completed on 11 October 2026

- The owner created and connected a separate database named `neon-copper-diamond`. Its Neon project identifier differs from both prohibited existing projects. Neither existing application's database was used or modified.
- Initial read-only inventory found nine provider-owned `neon_auth` tables and no application tables. Those nine tables were preserved. The owner-created database had the optional Auth add-on enabled; CareNest does not use it.
- Vercel injected 18 integration-managed variables. The two new independent encrypted production secrets brought the project total to **20**, including all three required variables. It is not a three-variable project; removing the other provider-managed variables was not part of the setup.
- Hosted migration returned exit code 0 and `Ordered migrations applied successfully.` Read-back confirmed all 14 ordered migrations through `0014-hosted-demo-catalogue`.
- Hosted seed returned exit code 0. Read-back confirmed **10 human providers, 5 veterinary providers, 14 localities**, demo discovery enabled and all nine provider-auth tables still present. The current catalogue contains 15 providers total, rather than 15 human providers plus five vets.
- Credentials were transferred in memory and supplied through the maintenance process environment. No production connection string or secret was saved to repository files or `.env.local`.

Deployment and final live-route outcomes are recorded in the release PR and completion report after verification.

## Database-independent hosted builds

The first configured production build attempted a database read inside `generateSitemaps` while collecting build-time route data. Its two-second connection limit expired. `build:vercel` now runs `scripts/hosted-build.mjs`, which sets a build-only phase flag and skips database-dependent sitemap enumeration/content during compilation. That flag is not a Vercel runtime setting. Runtime sitemap and readiness requests still check the real database; an outage is not disguised as a healthy deployment.

Runtime PostgreSQL connections now allow a bounded ten-second connection window while keeping the five-second statement limit. Neon connections explicitly use `sslmode=verify-full` and do not enable the weaker libpq compatibility option. A synthetic configured build with an unreachable database verifies that compilation no longer needs a working connection.

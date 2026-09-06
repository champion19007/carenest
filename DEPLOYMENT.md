# Deploying CareNest

## What runs where

| Concern | Local (default) | Deployed (recommended) |
| --- | --- | --- |
| Relational data | SQLite via `node:sqlite`, file in `./.data` | Postgres (Neon, Supabase, RDS) |
| Documents | NeDB, files in `./.data` | MongoDB Atlas |
| OTP delivery | printed to the console | MSG91 (India) or Twilio |
| Admin auth | scrypt-hashed row in `admins` | same, plus SSO if you have it |

Local defaults need no setup at all: `npm install && npm run seed && npm run dev`.

## Why two databases

**SQL** holds records with a fixed shape and real relationships — accounts,
doctors, sessions, bookings, rate limits. These need joins, uniqueness
constraints (one account per phone number) and foreign keys.

**NoSQL** holds records whose shape varies per row — prescriptions (a
variable-length drug list, each with its own dose, frequency, intake and
duration), free-text chart notes, reviews and the activity feed. Modelling a
prescription relationally means a join table plus several nullable columns;
as a document it is one object.

## Swapping to managed services

Both stores are behind a single module each, so the change is contained.

**Postgres.** Rewrite `lib/db/sql.ts` against `pg` or Prisma. The exported
function signatures (`findUserByPhone`, `searchDoctors`, `hitRateLimit`, …)
are the contract — keep them and nothing else has to change. Watch for:

- `datetime()` in the ORDER BY clauses becomes a `timestamptz` column
- SQLite has no real boolean; the `INTEGER NOT NULL DEFAULT 0` flags become `boolean`
- the `ON CONFLICT … DO UPDATE` upserts are already Postgres syntax

**MongoDB.** `lib/db/docs.ts` already uses Mongo's query API (NeDB implements
it), so swapping in the official driver is close to a find-and-replace of the
datastore construction. Add indexes on `doctorId`, `patientId` and `createdAt`.

## Before going live

1. Set `SMS_PROVIDER` — until you do, anyone can read the OTP off the screen
   and sign in as anyone.
2. In India, transactional SMS needs a **DLT-approved template**. Register it
   with your provider before expecting delivery.
3. Set `NEXT_PUBLIC_SITE_URL` so canonical URLs and the sitemap are right.
4. Create the admin account on first visit to `/admin` — the first credentials
   submitted on an empty `admins` table become the sole admin.
5. Run `npm test` and `npm run build` in CI.

## Data protection

- Phone numbers are masked to the last four digits in the activity log.
- Passwords are hashed with scrypt and a per-row salt; they are never stored
  or logged in plain text.
- Session cookies are `httpOnly`, and `secure` in production.
- `.data/` is gitignored — do not commit patient records.

## Route protection

Middleware checks only that a session cookie exists, because it runs on the
edge runtime and cannot open the database. The real checks are in the pages:

- `requireUser()` validates the session against SQL
- `requireRole('doctor', …)` gates the clinic app, so a patient cannot open
  another patient's chart
- `currentAdmin()` gates `/admin`

Never rely on middleware alone.

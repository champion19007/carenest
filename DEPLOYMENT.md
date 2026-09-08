# Deploying CareNest

## What runs where

| Concern | Local (default) | Deployed (recommended) |
| --- | --- | --- |
| Database | PGlite (Postgres in WASM), files in `./.data` | Neon Postgres, free tier |
| Documents | JSONB `documents` table, same database | same |
| Google sign-in | hidden unless configured | OAuth client, free |
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

**Postgres.** Already done — `lib/db/sql.ts` speaks Postgres and nothing needs
rewriting. Create a Neon project, copy the pooled connection string into
`DATABASE_URL`, and `lib/db/client.ts` switches from PGlite to Neon's HTTP
driver on the next cold start. The schema applies itself, idempotently, on
first use.

The one thing to know: **Neon returns `NUMERIC` as a string**, because a JS
float cannot represent arbitrary-precision decimals safely. `normaliseDoctor()`
in `lib/db/sql.ts` coerces the affected columns. This is also the reason the
tests run on PGlite rather than SQLite — SQLite would have returned a number
and stayed green all the way to production.

**Google sign-in.** Optional and free. Create an OAuth client (Web
application) in the Google Cloud console, add
`https://<your-domain>/api/auth/google/callback` as an authorised redirect URI,
and set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. Set `APP_URL` too if the
app sits behind a proxy — Google matches the redirect URI exactly. Leave them
unset and the button never renders; phone and OTP keep working.

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

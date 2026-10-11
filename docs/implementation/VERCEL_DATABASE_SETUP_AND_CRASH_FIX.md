# CareNest Vercel setup and server-error fix

## What caused the screenshot error

The production deployment behind `carenest-phi.vercel.app` was built from main before PR #3. Its runtime logs matched screenshot error digest `224140945`:

> Configure DATABASE_URL, or run npm run start:local for a single local embedded database.

Vercel's production environment-variable listing was empty. The local database and ignored `.env.local` stay on the laptop; pushing code to GitHub does not upload either. A green Vercel build did not mean the app had a database at runtime.

## Fix included in PR #3

- Hosted configuration is checked before database-backed pages, Google login, payment APIs or server actions run.
- An incomplete deployment displays a mobile-friendly CareNest setup page. It provides a help link and accurately states that signup, appointments and payments are unavailable.
- API and mutation requests receive HTTP 503 with `SETUP_REQUIRED`, rather than opening local storage or charging a messaging provider.
- `/api/health` returns 503 until hosted configuration and schema readiness pass. It exposes no connection string or internal exception message.
- Robots disallow indexing incomplete deployments, and their sitemap contains no provider entries. Static help and icons remain accessible.
- Unexpected page errors have a CareNest error boundary with retry/help controls.
- The Vercel build uses `npm run build:vercel`; local build/start commands retain their embedded database and worker behavior.
- Embedded PGlite is explicitly refused on Vercel, including when someone accidentally copies `CARENEST_LOCAL_MODE=1`.

The setup page fixes the blank crash; it does **not** create a database or make booking/payment operational by itself. Production receives the code fix after PR #3 is merged and Vercel deploys that commit. No production promotion or merge was performed during this repair.

## 1. Create a PostgreSQL database

1. Open Vercel → your **carenest** project → **Storage** → **Create Database**.
2. Choose **Neon** PostgreSQL. If the dashboard presents the Free plan, use it for this demo and review its current allowance/billing screen before confirming. No database or paid plan has been purchased by this repair.
3. Create the database and connect it to this Vercel project. Choose a suitable available region for the demo; this step does not choose the later AWS/Google Cloud production architecture.
4. Check **Settings → Environment Variables**. The exact variable CareNest reads is **DATABASE_URL**. If the integration supplies another prefixed connection variable, add `DATABASE_URL` with that same private PostgreSQL connection value. Use the provider's pooled connection for the serverless web runtime, with TLS as supplied by the provider.
5. Configure the intended Production and Preview targets. Preview databases should be separate from production data; apply migrations to each database that will run this code.

[Vercel Marketplace storage setup](https://vercel.com/docs/marketplace-storage), [Neon on Vercel](https://neon.com/docs/guides/vercel), [current Neon plans](https://neon.com/pricing).

## 2. Save private application settings

In Vercel → **Settings → Environment Variables**, configure:

| Name | Required value |
| --- | --- |
| `DATABASE_URL` | Actual provider-issued PostgreSQL connection string, including database name and TLS settings |
| `AUTH_SECRET` | A freshly generated long random secret; at least 32 characters |
| `DATA_ENCRYPTION_KEY` | 32 random bytes encoded as exactly 64 hexadecimal characters |
| `APP_ORIGIN` | `https://carenest-phi.vercel.app` for production |
| `APP_URL` | `https://carenest-phi.vercel.app` for production |
| `CARENEST_LOCAL_MODE` | Unset or `0` on Vercel, never `1` |

For a new empty hosted database, generate independent hosting keys privately on your computer:

```powershell
@'
import {randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('.data',{recursive:true});
writeFileSync('.data/vercel-runtime-keys.env',
  'AUTH_SECRET='+randomBytes(48).toString('hex')+'\n'+
  'DATA_ENCRYPTION_KEY='+randomBytes(32).toString('hex')+'\n',
  {flag:'wx',mode:0o600});
console.log('Private hosting keys saved in .data/vercel-runtime-keys.env');
'@ | node --input-type=module
```

Open that private file locally and copy the values into Vercel. The command refuses to overwrite an existing file. Do not commit the file or paste its contents into chat. When importing existing encrypted records later, retain their original encryption keys; newly generated hosting keys cannot decrypt older local records.

These settings load the database-backed application. Google, SMS, Gmail, Meta and Cashfree each require their own separate hosted settings if you enable them there. The local provider credentials were not uploaded to Vercel. Register the real HTTPS Google callback URL before enabling hosted Google sign-in.

## 3. Apply the schema to the new hosted database

After the PR #3 files are available in your local checkout and the private variables are saved in Vercel, run these commands from the CareNest folder. The Vercel CLI is already signed in on this computer.

```powershell
vercel env pull .env.vercel.production.local --environment production --project carenest --scope champion19007s-projects
node --env-file=.env.vercel.production.local --import tsx scripts/migrate.ts --postgres
```

The extra environment file is ignored by Git and deliberately does not replace `.env.local`. The migration's explicit `--postgres` argument selects the remote database, so it cannot silently initialize the laptop's PGlite database. Connection strings must remain private. The expected success message is `Ordered migrations applied successfully.`

For a separate Preview database, pull its Preview environment into a different ignored file, select the appropriate Git branch if needed, and run the same explicit remote migration with that file.

Do not run `npm run seed` or `npm run admin:create` expecting a cloud import: those existing commands explicitly target the local database. This guide creates the schema, not invented clinicians, approvals or an imported patient database.

## 4. Deploy and confirm readiness

1. Review/merge PR #3 when ready. Then redeploy the merged commit in Vercel after saving the variables and applying migrations. A previously built deployment does not automatically receive new settings.
2. Open `https://carenest-phi.vercel.app/api/health`.
   - HTTP **200** and `{"status":"ready"}`: configuration/schema checks passed.
   - HTTP **503**, `SETUP_REQUIRED`: a required runtime setting is missing or invalid.
   - HTTP **503**, `DATABASE_NOT_READY`: credentials/network or schema migration need checking.
3. Open the homepage, search and signup pages. A new empty database will have no published real doctors yet; that is different from a server crash.

Full hosted operation still needs persistent private-file storage, a reachable HTTPS/WSS video service, clinician/admin onboarding and a scheduler capable of ten-minute reminders. Vercel's existing once-daily cron cannot replace the five-second local worker for those reminders. Readiness of the database does not claim that these other services work.

## Validation for this repair

All **299 automated tests passed**, along with the production build and TypeScript check. An isolated production server with Vercel flags and **no local environment file or database** reproduced the incomplete-hosting condition:

- Home, search, pets, signin, account and doctor URLs returned the setup page without the old crash.
- Help loaded normally; the mobile browser reported no JavaScript errors or horizontal overflow.
- Health, account probe, Google entry and payment APIs returned 503; a POST to the otherwise allowed help route also returned 503, blocking direct server-action bypass.
- Robots disallowed indexing, the sitemap remained empty, and the icon stayed available.
- Local homepage/signup still returned 200 and local health returned `ready`.

The dedicated tests cover configuration validation, routing, action/API refusal, private health errors and the Vercel embedded-storage guard. The complete test run and preview deployment evidence are recorded in the PR.

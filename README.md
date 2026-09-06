# CareNest

A healthcare booking platform for the Indian market — clinic appointments, video
consultations, lab tests at home, planned surgery and veterinary care.

CareNest is a booking layer, not a provider. Doctors and clinics are independent;
the platform verifies their medical-council registration, shows real fees and
availability, and holds the slot.

## What's here

Three products in one codebase:

| Surface | Route | Access |
| --- | --- | --- |
| Patient site | `/`, `/search`, `/doctor/[slug]`, `/labs`, `/surgeries`, `/pets`, `/help` | public |
| Booking + records | `/book/[slug]`, `/account`, `/dashboard` | signed-in patient |
| Clinic app | `/practice/*` | `doctor` role only |
| Admin console | `/admin` | password |

### Map-free area search

Search accepts a **PIN code or an area name**. If that area has no doctors, the
empty result is intercepted and pre-authored neighbouring areas are offered as
chips, each showing its live doctor count.

There is no geocoding call, no map tile and no distance maths on the request
path — proximity is a hand-authored adjacency table resolved by an indexed join.
Areas with zero doctors are filtered out, so a suggestion never leads to a second
empty page.

## Stack

- **Next.js 16** (App Router, server actions) · **Tailwind v4** · TypeScript
- **SQL — SQLite via `node:sqlite`** — users, doctors, sessions, bookings,
  admins, rate limits, localities, adjacency graph
- **NoSQL — NeDB (MongoDB query API)** — prescriptions, chart notes, reviews,
  activity feed. These have a per-row shape that would otherwise need a join
  table plus several nullable columns.
- **Auth** — passwordless OTP, httpOnly sessions, scrypt-hashed admin passwords,
  rate limiting on OTP and admin login

Neither database needs installing: `node:sqlite` is built into Node 22+, and
NeDB is pure JavaScript.

## Running it

```bash
npm install
npm run seed     # doctors, areas and the proximity graph
npm run dev
```

- Demo clinic login: **+91 9000000001** (role `doctor`)
- The first credentials entered at `/admin` create the sole admin account
- With no SMS gateway configured, the OTP is printed to the console and shown
  on screen

```bash
npm test         # 27 tests, Node's built-in runner
npm run build
```

## Known limits

- **No SMS credentials** — the OTP is readable on screen, so anyone can sign in
  as anyone. `lib/sms.ts` has MSG91 and Twilio adapters ready; set
  `SMS_PROVIDER` and the code stops reaching the browser.
- The clinic patient queue is still sample data. Charting saves correctly, but
  the queue does not read from `bookings` yet.
- Tests cover the data layer only.
- `.data/` is gitignored, so the database resets on a fresh clone.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the Postgres/MongoDB swap.

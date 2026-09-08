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
- **Postgres, one database, three schemas.** `patient.*` holds people, their
  families and their bookings; `provider.*` holds clinicians, credentials and
  calendars; `clinic.*` holds operational workflows such as surgery enquiries
  and referrals. Shared reference data and infrastructure stay in `public`.
  Three separate databases were considered and rejected — Postgres cannot
  enforce a foreign key across databases, so `patient.bookings ->
  provider.doctors` would have stopped being a guarantee.
- **PGlite in development, Neon in production.** Same engine either way, which
  is deliberate: an approximation would let dialect bugs reach production.
  Nothing to install — set `DATABASE_URL` to switch.
- **Free-form clinical documents** (prescriptions, chart notes, reviews,
  activity) live in a JSONB `documents` table rather than a second database.
- **Auth** — passwordless OTP, optional Google sign-in, httpOnly sessions plus
  a signed claims cookie the edge middleware verifies, scrypt-hashed admin
  passwords, rate limiting on OTP, admin login and surgery enquiries.

## Who sees what

| Role | Lands on | Can do |
| --- | --- | --- |
| Patient | `/dashboard/patient` | Book, manage a household, keep records |
| Clinician | `/practice/requests` | Answer requests for **their** practice |
| Admin | `/admin` | Triage surgery enquiries, see live counts |

A clinician signing in goes straight to their own request queue rather than a
patient dashboard, and a patient is redirected away from `/practice`.

## Booking for someone else

One account books for a household — in India that is the normal case, not an
edge case. A booking records who arranged it *and* who the care is for, so an
appointment a daughter makes for her father reaches the clinic under his name
and his age.

## Surgery enquiries

A surgery enquiry is a callback request, not a booking, and it is not routed
automatically:

```
patient submits -> NEW -> (admin approves) -> APPROVED -> routed -> ROUTED
                     \--> (admin rejects) -> REJECTED
```

The approval step is deliberate. An enquiry is free text and a phone number
from a stranger; routing it straight through would hand a surgeon unverified
clinical claims and a diagnostic centre someone's personal number.

## Running it

```bash
npm install
npm run seed     # doctors, areas and the proximity graph
npm run dev
```

- Demo clinic login: **+91 9000000001** (role `doctor`, linked to a real
  provider row so the request queue has something to belong to)
- The first credentials entered at `/admin` create the sole admin account
- With no SMS gateway configured, the OTP is printed to the console and shown
  on screen
- Google sign-in is hidden unless `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
  are set — see `.env.example`

```bash
npm test         # 59 tests, Node's built-in runner, against real Postgres
npm run build
```

## Known limits

- **No SMS credentials** — the OTP is readable on screen, so anyone can sign in
  as anyone. `lib/sms.ts` has MSG91 and Twilio adapters ready; set
  `SMS_PROVIDER` and the code stops reaching the browser.
- **Slots are not yet held atomically.** `provider.appointment_slots` exists
  with a `version` column and a state machine, but nothing writes to it: two
  people can still request the same time. The clinician's accept/decline is
  guarded against double answers; the slot itself is not.
- Payments, telehealth signalling and provider self-onboarding are not built.
- The clinic calendar, reports and billing screens are still sample data. The
  request queue is real.
- `.data/` is gitignored, so the database resets on a fresh clone.

See [DEPLOYMENT.md](DEPLOYMENT.md) for deploying to Vercel and Neon.

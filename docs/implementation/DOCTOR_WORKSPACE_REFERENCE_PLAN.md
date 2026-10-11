# Doctor workspace reference contract

Reference review: 80 supplied screenshots (1028–1107) and both supplied videos, covering patient views (97.46 seconds) and calendar/appointment workflows (197.28 seconds). Reference contact sheets and sampled video frames remain private under `.data/reference-review`. The screenshots include personal account details; none of those details or third-party assets belong in application source.

## Design and interaction contract

- Use CareNest navy/blue, compact navigation, a utility header and dense clinical working areas. Retain CareNest branding, semantic color tokens and original copy.
- Patients: Today/Recent/All views, search, clear waiting/in-consultation/seen groups, selected-patient demographics, encounter timeline, charting/billing tabs and medical-history panel. Patient and guardian identities remain separate. Records are scoped to the current assigned clinician and current consent.
- Calendar: day/week/month and agenda views, Today/previous/next navigation, IST dates, status labels, appointment details and today's queue. Add appointment, walk-in, reminder and block forms must persist and reject scheduling conflicts. A scheduled visit does not count as a physical arrival.
- Mobile: navigation drawer, horizontal controls, a usable agenda instead of a compressed weekly grid, patient list/chart switching, accessible dialogs and no page-wide overflow. Verify 320, 768, 1024 and 1440 pixels.
- Supporting workspace: saved practice settings/catalogues, communications and delivery status, billing/payouts, reports, inventory, expenses, clinic profile/widget, campaign drafts/review, feedback and activity logs. Every visible action must save data, navigate to a working route or explain a genuine permission/provider constraint.
- Include keyboard operation, loading, empty, error and success states. Preserve signed record versions and existing Cashfree verification/payout safeguards. Inventory tracking does not authorize medicine dispensing. External ads and ABDM services require their actual accounts/approvals.

## Data and privacy rules

New practice operations derive the physician and clinic from the current verified account. Submitted IDs never select another doctor. Clinic contacts do not create or merge authenticated patient accounts based on a phone number. Consent is an explicit attestation, private identities/clinical text remain encrypted, and audit writes are part of successful reads/writes.

Manual clinic appointments share conflict checks with online bookings and calendar blocks. Calendar data distinguishes future reservations, checked-in visits and consultation completion. Clinic-owned scheduling does not bypass payment verification for CareNest marketplace bookings.

Marketing tools use public clinic information and explicit opt-in, never diagnoses or clinical notes as advertising audiences. Campaign budgets and performance must reflect actual saved/verified facts. No external campaign, real message or real financial transfer is sent as part of UI QA.

## Acceptance

Exercise clinician-only access, foreign-clinic/patient denial, revoked consent, concurrent appointment collisions, repeat form submission, actual arrival/consultation transitions, stock adjustment conflicts, expense/catalogue ownership and campaign publishing constraints. Run type checks, meaningful service tests, the full regression suite, build checks and responsive/keyboard UI checks. New work is submitted for review before a production release.

> 8 October 2026 update: LiveKit replaces Zoom API/Meeting SDK for local in-app calls. Google Meet remains optional. See [the LiveKit implementation and updated architecture](../implementation/LIVEKIT_LOCAL_VIDEO_IMPLEMENTATION.md). Earlier Zoom setup instructions below are historical and superseded.

# CareNest local implementation ledger

> October 8 expansion: see [Remaining-work implementation and setup](REMAINING_WORK_IMPLEMENTATION_AND_SETUP.md) for the current scope, validation and explicit remaining requirements. The original ledger below is historical.

Updated 8 October 2026. Scope: implement the core repair and product workflows locally, using the supplied phone design as inspiration. No cloud was provisioned or migrated to. The 6 October audit and cloud architecture documents remain historical evidence and future designs.

## What is implemented

- Transaction-capable PGlite/PostgreSQL adapters, ordered/checksummed migrations and read-only request-time schema checks. The local runner and default migration/seed/admin commands force the embedded database. Explicit PostgreSQL migration is a separate later option.
- Atomic appointments, exact booking-owned reservations, expiry, overlap checks, idempotency, consent, cancellation/reschedule, check-in, actual clinician start, attended/no-show and required history/audit/outbox writes.
- Explicit local OTP gating, MAC-protected challenges, atomic attempt/consume and multi-window limits; hashed opaque sessions, current account/role/provider checks, privileged idle limits, MFA administrators and restricted CLI provisioning. No public administrator bootstrap or email-based automatic Google account linking.
- Actual assigned encounter records, signed immutable encrypted notes/prescriptions, isolated drafts, readable record display, private downloads and owner-scoped account export.
- Owned pets, species-compatible veterinary booking, weights/vaccinations and local reminder events.
- Persisted provider applications/private evidence/manual registration review, clinic membership, published hours/closures and real clinic calendar/reports/settings/invoices.
- Private encrypted uploads, random object keys, image normalization, PDF quarantine/scanner support, context access checks and owner storage quotas.
- Durable signed HTTP worker, leased events, versioned handlers, idempotent effects, retries/dead letters, in-app notifications and guarded optional delivery adapters.
- Zoom/Google Calendar Meet OAuth, encrypted tokens/refresh leases, asynchronous room reconciliation, participant-only join links and obsolete-room cancellation. These adapters are mocked-tested; live accounts are unconfigured/unverified.
- Published laboratory packages, request/collection/processing/result transitions, partner/staff controls, clean-result requirements and owned order history.
- Integer-paise invoices, idempotent balanced receipts, optional Razorpay test collection, signed webhook/inbox contracts, authoritative captures, excess-payment handling and refund review/reconciliation. No actual funds were collected or refunded.
- Authenticated encrypted planned-care enquiries, asynchronous consented triage, atomic referral routing, immutable versioned estimates with transactional audit/outbox and owned disputes/history.
- Search/locality/pagination and stable provider-ID joins; unique attended-visit reviews, synchronized self demographics, real policy/support routes, export and stopped-app backup/restore tooling.
- Responsive blue/white website and phone layout, current data in cards, mobile bottom navigation, accurate request/confirmation states and labelled local samples.

## Verification evidence

| Check | Result and artifact |
| --- | --- |
| Full suite | 179 passed, zero failures/skips in `final-tests.txt`. This run includes historical SQL-contract tests and actual-service regressions. |
| Final provider/estimate/file/finance/support changes | 43 targeted tests passed in `final-targeted-tests.txt`; these overlap the full suite and add support/late-capture, clinical recipient/idempotent save, video races/host-link refresh and delivery-window checks. |
| Current session/MFA checks | 5 additional tests passed in `session-tests.txt`: counter vectors, obsolete claims, immediate suspension and non-refreshing polling/idle revocation. |
| Type check | Passed; `final-typecheck.txt`. Build-time TypeScript errors are enabled. |
| Production build | Passed on Next 16.3.8; `final-build.txt`. Local files/secrets are excluded from deployment file traces. |
| Dependency audit | Zero known vulnerabilities at this check; `final-audit.json`. Next, sharp and transitive packages were patched, and unnecessary deployed CLI/analytics/legacy drivers removed. This does not certify absence of security defects. |
| Actual migration | Root local database migrated successfully. Real adapter tests rehearse ordered migration replay and transaction rollback using disposable directories. |
| Local backup/restore | Successful snapshot and restore rehearsal under `.data/backups`; prior directories/data were preserved. Snapshot/key contents stay outside Git. |
| Browser | Local OTP login; persisted requested state; clinician acceptance; patient check-in and clinician start; saved fictional note; owned pet creation/species search/vet request; sample lab request and owned order. |
| Responsive proof | 390×844 phone check showed no horizontal document overflow; screenshots in `screenshots/`. Desktop and narrower checks are recorded in the earlier UI validation and the current browser report. |
| Diff hygiene | `git diff --check` passes; original `.claude/launch.json` user change was preserved. |

The final full-suite run includes the final clinical/video/delivery regressions. Changed areas were also checked with targeted tests, type checks, production builds and actual local browser flows. Passing copied-query tests alone is not treated as proof of a service fix. PGlite serializes transactions; real multi-connection PostgreSQL/load/failover tests remain a later deployment requirement.

A test-loader relative-import isolation mistake was found and corrected: worker tests now use only their disposable database. The local pre-test snapshot was restored conservatively, then real UI testing created explicitly fictional local records. The stopped-app backup and previous directories remain recoverable. No real patient, payment or live vendor activity was performed.

## Finding-by-finding disposition

“Implemented” means the identified mechanism has been changed. Evidence distinguishes actual-service tests, browser checks and source inspection. Operational/legal/clinical assertions are not turned into passed software tests.

| Finding | Change | Evidence / remaining condition |
| --- | --- | --- |
| F01: unsafe OTP fallback | Explicit three-flag local console gate; other production configurations fail closed. Live delivery does not return a code. OTP UI now advances after a successful gateway request even without a demo hint. | `lib/sms.ts`, `app/actions/auth.ts`, `components/sign-in-form.tsx`; local browser and OTP services. Actual SMS delivery still needs configured-account testing. |
| F02: first public admin wins | Removed public bootstrap; local CLI provision, scrypt password, encrypted TOTP, atomic replay guard and short admin session. | CLI provision succeeded; MFA vectors tested. Real operator enrollment remains private, with setup file under `.data/secrets`. |
| F03: foreign clinical writes | Verified current assigned practitioner, encounter/owner/consent checks, started consultation and server-resolved identities. | Actual clinical tests reject foreign doctor/patient and audit failure. Fictional note persisted through browser. |
| F04: stale confirm steals new hold | Reservation token is booking ID; live expiry/revision/state required inside one transaction. | Actual expired-A/replacement-B test. |
| F05: stale decline releases another slot | Every release condition includes exact booking ownership; stale response fails. | Both confirmation and decline stale-A tests. |
| F06: foreign household subject | Owner-scoped family/pet lookup before reservation and again at acceptance; archived subjects cannot receive new care. | Actual foreign-family tests and veterinary UI. |
| F07: partial appointment commit | Booking/hold/consent/history/audit/event share one transaction; replay has an intent key/hash. | Actual injected event failure rolls everything back. |
| F08: suspended profile bookable | Public lookup/search require active publication/current account; transaction repeats current provider/clinic checks. | Actual suspension test; source verification of public SQL. |
| F09: unverified email takeover | Contact email differs from verified auth identity; Google stable subject identity used, no automatic link from mutable contact email. Profile changes clear verification. | Callback/profile code reviewed; real Google login/account-conflict scenarios still need configured provider credentials. |
| F10: chart state crosses patients | Encounter-keyed editor, actual persisted records, independent note/Rx dirty flags and leave prompts; identity resolved server-side. | Clinical ownership tests and real fictional-note browser flow. Wider two-subject/device UX coverage remains advisable. |
| F11: unused PHI boundary | Actual clinical/patient/practice services and request reads enforce authorization and required audit; failed audit blocks response/transaction. | Actual fail-closed audit tests. Legacy unscoped chart rows still require ownership reconciliation before being adopted as current records. |
| F12: old claims/current verification | Authorization derives from current DB session/account/provider, not the old routing JWT. Privileged absolute/idle limits and non-touching polling. | Actual current-session/role/suspension/polling tests and service provider gates. |
| F13: invalid time/mode | Allowlisted compatible modes, future timestamps, species/ownership, published closures, overlap and active connections/consent for video. | Actual booking tests and video consent/connection tests. Complete home-visit dispatch/address operations are still a later workflow, not a live service promise. |
| F14: redirect backslash | Parse internal destination against fixed origin; reject encoded/control/backslash and foreign origins. | Actual redirect contract tests. |
| F15: unchecked prescription JSON | Bounded medicine arrays/fields/duration, actual clinician/subject identity, immutable signed record. | Actual malformed Rx rejection tests. Medicine suitability, species safety and telemedicine prescribing policy require clinical/legal review. |
| F16: unsupported service claims | Replaced active/legacy service copy, removed fake emergency/help contacts, unsupported timing/insurance/scale promises and fake ratings. Labelled sample profiles/packages. | Browser confirms sample/no-review/requested labels. Real company/partner/registration claims still depend on operator evidence. |
| F17: inert pet buttons | Live species-filtered vet catalogue, owned pet selector and actual request persistence; separate pet history. | Pet service tests and browser-owned Milo/vet request. |
| F18: inert lab buttons | Actual package/order/staff state/result/invoice workflow; clean staff-uploaded results required. | Actual lab/attachment tests; browser request/order. No genuine test/collection delivered by sample package. |
| F19: fake onboarding success | Persisted draft, clean private proof, submitted review case and MFA manual-review approval that creates clinic/provider membership. | Actual onboarding/evidence/duplicate approval tests. Government register verification is human work. |
| F20: request shown confirmed | Success notice resolves an owned DB booking and its actual status; no URL-only confirmation. | Browser request followed by acceptance/confirmed state. |
| F21: no cancellation/reschedule/no-show | Guarded transitions, replacement rollback, exact release, started restrictions and unpaid invoice void; paid refunds separate. | Actual cancellation/reschedule tests; clinic controls inspected. |
| F22: inconsistent search contract | Unified area/text/species/video parameters; links/forms agree and explicit filters win. | Source checks and live species search. |
| F23: duplicate reviews | Unique provider/account key, attended eligibility and insertion/aggregate under provider lock. | Actual concurrent duplicate review test yields one review/count. |
| F24: provider ID treated as slug | Patient query joins stable provider ID; slug is only a URL field. | Different-ID/slug fixture in actual tests and patient query inspection. |
| F25: wrong upcoming order | Actual instants, future eligible states and earliest-first visit query. | Actual home-appointment service test. |
| F26: stale relative dates | Store timestamps, render IST day/time at read; seed next-slot labels removed. | Timestamp tests and real clinic/patient browser times. |
| F27: UTC calendar anchoring | Materializer derives the IST day and published weekday hours; closures honored. No request-time auto-slot creation. | Actual near-midnight IST materializer/closure test. |
| F28: queue for tomorrow/request | Requires today in IST, confirmed, checked in and exact current reservation. | Actual queue tests. |
| F29: timezone/stale joins | Explicit clinic timezone and exact current reservation joins, not historical slot reuse. | Actual tomorrow/yesterday/stale reservation queue tests. |
| F30: false queue accuracy | Actual check-in/start/end/no-show, recent duration estimate, freshness and explicit uncertainty. | Actual queue checks plus browser check-in/start. Walk-ins and a calibrated/guaranteed ETA are not implemented. |
| F31: daily/unknown notifications | Local worker every five seconds, version checks, strict leased ownership, unknown-kind dead letters, bounded retries and operational replay. | Actual stale lease/unknown handler tests; worker starts with app. Outbox SENT means handled, not necessarily externally delivered. |
| F32: nullable phone/SMS-only | Nullable phone model, safe author fallback, in-app updates and optional verified-email channel. | Actual service code inspected; local worker sends no external messages. Live email receipts need account testing. |
| F33: OTP read/write races | MAC storage, atomic five-attempt limit and one-time consume, endpoint budget and expiry. | Actual concurrent consume/guess/budget tests. |
| F34: nearby counts ignore filters | Nearby lookup applies the same query filters. | Source verification; counts are capped by current bounded search, not presented as global exact totals. |
| F35: fake footer/policies | Real privacy/terms/cancellation/support routes, owned exports/cases and admin review states. | Browser links; support ownership/state tests. Actual company identity, grievance details and legal retention policy remain operator inputs. |
| F36: duplicated clinic shell | Layout owns the shell once; real clinician/clinic name replaces hardcoded fixture; inert header controls replaced with real search/navigation. | Rebuilt clinic browser confirms one shell/current identity. |
| F37: self demographics diverge | Account and self row update in one transaction, with required audit; archived family preserved. | Actual synchronization and injected-audit rollback test. |
| F38: inline anonymous paid AI | Authenticated consented encrypted enquiry, account/global budgets and asynchronous worker; external AI off locally and requires explicit subject consent elsewhere. | Service/action/worker inspected; no external AI call made. Deployment ingress/network/spend policies still need real traffic validation. |
| F39: partial referral/status writes | Expected-state transactions for referral/status history and audit; recorded route state does not pretend delivery. Estimate/version/audit/event now atomic too. | Service inspection; actual immutable estimate rollback/concurrent reprice tests. |
| F40: unsafe symptom matching | Unicode/boundary mechanics corrected. Automatic symptom routing is disabled by default through ENABLE_SYMPTOM_ROUTING; text remains ordinary provider discovery. | Pure taxonomy tests remain; new default reviewed in search. Enabled routing still needs clinician-approved language, negation/history and adversarial coverage. This finding is only partly addressed clinically. |

## Boundaries and what remains

This is a substantially repaired local core, not a complete production Practo competitor. The earlier architecture backlog contains later distributed infrastructure and business integrations. Specifically, the following are not completed or proven by this task:

1. Live Zoom/Google account/call tests, embedded SDK video, actual SMS/email delivery receipts, real Razorpay capture/refund and reconciliation procedures. Code/configuration hooks exist; credentials and provider account evidence do not.
2. Native Android/iOS applications, offline PHI synchronization, walk-in/receptionist intake, actual home-visit address/dispatch, pharmacy fulfilment, insurers/EMI, ABHA/ABDM/PM-JAY integrations, real hospital/lab partner operations.
3. Legally approved consent/privacy/retention/deletion workflows and actual registered-company/grievance details. The app records support/privacy requests; it does not automatically erase clinical/financial history without retention review.
4. Drug catalogue/contraindication/species-specific prescription rules and medically reviewed multilingual symptom navigation. A structural JSON validator is not clinical decision support.
5. Ownership/encryption reconciliation of pre-existing unscoped clinical documents, key rotation, broader Windows ACL hardening, independent security review, accessibility/device coverage and production multi-connection/load/failover/disaster-recovery tests.
6. Cloud deployment, managed services, distributed rate limiting, object storage, regional residency enforcement and large-scale observability. AWS/GCP documents are future plans, not deployed resources or a claim that this local binary enforces every regional requirement.

For exact setup, rates, types, timing decisions, local backup/restore and integration steps, read `LOCAL_RUNBOOK.md`. For the future designs, read the architecture folder. The next work should follow these explicit remaining requirements rather than treating the existence of a button or a mock provider response as a completed real-world service.

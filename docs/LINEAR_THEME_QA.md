# Linear-inspired CareNest themes

31 October 2026. Direction and reference evidence: [DESIGN.md](../DESIGN.md). This pass changes the presentation layer; it adds no database migration, provider integration or service pricing.

## Scope

Shared light/dark tokens now cover the public site, patient forms and clinic workspace. The homepage has a large, quieter Inter heading and a functional bordered care finder rather than a stock-photo hero. Header, logo treatment, authentication links, provider initials, corners, surfaces and photo overlays follow the same system. Neutral primary actions invert their contrast in dark mode; violet is reserved for links and selections. Success and warning states retain their meanings.

The existing System/Light/Dark preference and first-paint bootstrap are retained. The display font is now Inter too, so Plus Jakarta Sans is no longer fetched. No new dependency or visual asset was added. Booking, Cashfree, LiveKit, authentication and care-request logic are unchanged.

## Browser checks

Checked the compiled local app using the existing fictional CareNest Local QA account. Outbound SMS, WhatsApp, email and payments were disabled for browser QA; no worker was started. No new appointment, care request or payment was submitted.

- Homepage at **320, 390, 768, 1024 and 1440px**, in both themes: document width never exceeded the viewport. Actual screenshots inspected at desktop and phone sizes.
- Theme control changes the rendered canvas, foregrounds, fields and actions. Theme choice survives navigation and a final-build reload. System mode matched the browser's `prefers-color-scheme` value. The original Light selection was restored after QA.
- Entering `Physician` in the homepage search reaches the actual doctor results and preserves the query.
- Mobile Filters opens a native modal, moves focus inside it, closes with Escape and restores focus to Filters.
- Sample doctor detail renders honest initials, sample label, consultation information and availability navigation in dark mode on a phone.
- Pet Home Care renders its audience selection and service actions at tablet width. Request nursing care opens the actual pet request form.
- Pet request controls remain labelled, legible and at least 48px high; the theme control is 44px. The hidden idempotency field is intentionally excluded from visual target measurements.

Screenshots and width measurements are local QA evidence under `.data/linear-theme-qa/`; this ignored directory is not published in the repository. Admin/doctor authenticated workspace screens were not exercised in the browser during this visual pass; they inherit the shared tokens, and existing domain tests cover their workflows. This is not a full accessibility conformance assessment.

## Measured colour pairs

Computed with the bundled antislop human contrast checker formula.

| Pair | Light | Dark | Threshold |
| --- | ---: | ---: | ---: |
| Main text / canvas | 15.42:1 | 16.90:1 | 4.5:1 |
| Secondary text / supporting surface | 5.37:1 | 6.12:1 | 4.5:1 |
| Link / content surface or canvas | 6.00:1 | 9.93:1 | 4.5:1 |
| Main-action text / action fill | 14.48:1 | 14.52:1 | 4.5:1 |
| Input boundary / control surface | 3.34:1 | 4.08:1 | 3:1 |

## Design delivery gate

Antislop ran during implementation, following the owner's existing session choice. Energy 1 / Rhythm 2 / Motion 1. The following is scoped to the changed presentation and checked browser journeys.

| Rules or gate | Result and evidence |
| --- | --- |
| R-01, R-07, R-10, R-12, R-13 | No decorative gradient, texture, glass or glow added; fine borders group working content. Small control shadows indicate a control edge, not floating page sections. |
| R-03, R-25, R-34, R-35 | Both themes and five widths checked; measured text/control contrast, visible focus and modal Escape/focus restoration. Mobile navigation reserves its existing safe-area space. |
| R-04 | Existing clinical, home, paw and search symbols identify actual care destinations. They accompany text. |
| R-05, R-14 | The introduction, search-and-destination panel, care-service rows and provider comparisons have different densities because their tasks differ. |
| R-06 | Inter matches the requested restrained reference and stays readable in form fields; headings use weight and scale rather than a second decorative font. |
| R-08 | Arrows appear on navigation to the next page; form selection and status do not rely on them. |
| R-09, R-17, R-18, R-38 | Sample labels and actual provider/account data retained; no invented metrics, availability, reviews or testimonials. |
| R-11 | Smaller control corners and slightly larger panel corners replace the former large rounded treatment. |
| R-15, R-16 | Care search, nursing requests and profile/booking destinations retain concrete action labels. No AI marketing language added. |
| R-19 | No automatic entrance, floating or looping decorative effects; reduced-motion support retained. |
| R-20, R-29, R-30, R-31 | The owner explicitly requested Linear's aesthetic. CareNest adapts the neutral palette and typography, while keeping its own mark, household/pet distinction and working care flows. Rationale is recorded in DESIGN.md. |
| R-21 | Both themes implemented; neither is forced over the saved or system preference. |
| R-22, R-23 | No illustration, logo asset, stock face or generated image was introduced. Existing photographs remain on relevant service pages; sample provider images are honest initials. |
| R-24, R-26, R-27 | Search, service links, request-form navigation and filter modal were exercised. Existing loading, empty and error mechanisms remain. |
| R-37, identity and hierarchy | The owner's explicit reference sets the direction. A family-care heading leads to real care choices; the recurring person/pet pair keeps the content specific to CareNest. |
| C-1 through C-5 | Reasons are recorded, interactive journeys checked, no filler demonstration dashboard, resilience checked within scope, factual claims kept tied to real data. |
| React review | Homepage stays a server component; independent reads remain parallel; no new client effect or bundle dependency; stable list keys, accessible search labels and explicit theme select retained. |

## Build and regression evidence

- `npm test`: **373 passed, 0 failed, 0 skipped** (627 seconds). Existing suites exercise authentication, account ownership, booking, payment accounting, care requests, messaging contracts, privacy and clinic workflows.
- `npm run typecheck`: passed.
- `npm run build -- --webpack`: final build passed on Next.js 16.4.3, including the photo-overlay and corner-token changes.
- Publication check: all 12 intended source/document files passed the saved-private-value scan; `.env.local`, `.data` and the unrelated `.claude/launch.json` edit are excluded.

No hosted migration or production deployment is part of this visual update. No real provider API message, charge or video consultation was performed by this QA run.

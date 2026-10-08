# CareNest redesign and cloud engineering plan — validation

Date: 6 October 2026. Main deliverable: [detailed engineering and migration plan](AWS_GCP_DETAILED_ENGINEERING_AND_MIGRATION_PLAN.md).

## Implemented

Responsive blue/white patient discovery design inspired by the supplied screenshot: home, search results, doctor profile/availability, booking presentation, header/footer/theme and mobile navigation. Typed doctor-name searching now reaches the existing SQL text filter. The profile's selected slot is carried into the booking page and through sign-in, then checked against current open slots. The home appointment query selects the current user's earliest future requested/confirmed appointment by its slot timestamp.

Provider portraits are initials when no actual photograph exists. The generic desktop hero photograph is not a named provider identity. No account was created and no appointment/payment/clinical record was submitted during browser checks.

## Command evidence

| Check | Result | Artifact |
|---|---|---|
| Full `npm test` | Exit 0; 132 tests passed, 0 failed/skipped | [Raw regression output](UI_REGRESSION_TEST_RESULTS.txt) |
| `npx --no-install tsc --noEmit` | Exit 0, no diagnostics | [Type-check output](UI_TYPECHECK_RESULTS.txt); empty output is expected on success |
| Final `npm run build` | Exit 0; production compilation/static-page generation completed | [Build output](UI_PRODUCTION_BUILD_RESULTS.txt) |
| `git diff --check` | Exit 0 after fixing one extra trailing blank line | Git line-ending notices are not whitespace failures |
| Offline cloud cost model | Exit 0; selected raw vendor rates validated and six scenarios generated | [Cost results](CLOUD_COST_ESTIMATES.json), [comparison](CLOUD_COST_ESTIMATES.md) |

The suite includes the new actual-service PGlite test in `tests/home-appointment.test.mjs`. It covers an absent user, another account's earlier visit, past visits, cancelled/declined visits and the distinction between creation order and actual appointment time. It does not prove PostgreSQL multi-connection booking race safety.

## Browser evidence

Browser used the local Next development server and local embedded database. Final home viewport checks:

| Requested viewport | Document width / scroll width | Bottom navigation |
|---|---|---|
| 320×740 | 305 / 305 px | Visible |
| 390×930 | 375 / 375 px | Visible |
| 768×1024 | 753 / 753 px | Visible |
| 1440×1000 | 1425 / 1425 px | Hidden; desktop header navigation visible |

The 15-pixel width difference is the embedded browser's scrollbar, not page overflow. A two-pixel small-phone header overflow was found and fixed by making the wordmark responsive. [Captured layout measurements](screenshots/responsive-checks.json).

Manually verified doctor-name search `Rohit` → `/search?q=Rohit` → one matching doctor, provider profile navigation, published-slot empty state, and guest booking → `/sign-in?next=%2Fbook%2Frohit-menon`. Search had no document-width overflow at the checked phone size. Mobile header menu opens/closes. Light/dark switching changes the body palette to the intended navy/blue dark variant.

Saved local screenshots: [mobile home](screenshots/carenest-mobile.jpg), [desktop home](screenshots/carenest-desktop.jpg), [dark mobile](screenshots/carenest-mobile-dark.jpg), [mobile search](screenshots/carenest-mobile-search.jpg), [mobile profile](screenshots/carenest-mobile-profile.jpg). These are developer previews with the Next development indicator, not production screenshots or evidence of verified medical supply.

## Material limitations

- `next start` was also attempted locally. Dynamic pages correctly hit the repository's existing production guard because DATABASE_URL is absent and PGlite is disabled in production. That temporary server was stopped. **A complete production runtime smoke test is unverified** until a real production-compatible database is configured. The production build itself passes.
- Existing build warnings remain: deprecated middleware convention and an unrelated parent-directory lockfile/root warning. The repository config skips TypeScript validation during build; the independent type check above is therefore necessary.
- Authenticated selected-slot booking was not completed in the browser. Slot validation/return-path wiring was inspected; actual participant, clinic, transaction and integration guarantees still require the acceptance tests in the plan.
- Seeded ratings, review integrity, clinical authorization, hold ownership and other backend findings from the earlier audit remain outstanding. Passing existing tests does not mean those 13 reproduced defects are repaired.
- Pet care remains a placeholder and Zoom/Meet provisioning is not implemented. Their detailed interfaces/workflows are plans.
- AWS/GCP diagrams, data models, rate-limit numbers and migration settings are proposals. No infrastructure, cloud account, paid API subscription or production migration was created.
- Cost numbers are workload models with allowances/exclusions, not quotes, load benchmarks, currency forecasts or claims that one vendor is always cheaper.

The pre-existing `.claude/launch.json` modification was preserved. Next development automatically generated AGENTS.md/CLAUDE.md instructions; they were read and left intact.

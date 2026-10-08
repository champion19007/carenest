# Audit validation — 6 October 2026

| Check | Result |
| --- | --- |
| `npx --no-install tsc --noEmit` | Passed, exit 0 |
| `npm run build` | Passed, exit 0 |
| `npm test` | 131 passed, 0 failed, 5 suites; approximately 17 minutes on this host |
| `node docs/audit/reproduce.mjs` | 13 audit checks reproduced the problematic behaviors or verified their causes; exit 0 |
| `npm audit --omit=dev` | 12 affected packages: 2 critical, 8 high, 2 moderate |
| Browser: labs Book now | No booking action; URL remained `/labs` |
| Browser: pets Book appointment | No booking action; URL remained `/pets` |
| Browser: `/search?mode=video` | Video filter unchecked; 12 human doctors shown |

The existing tests passing does not establish release readiness. Many database tests duplicate SQL rather than invoking application services. Their serialized PGlite execution does not cover independent Postgres connections or real third-party integrations.

The audit harness uses actual TypeScript source modules, transpiled in memory, with framework/authentication stubs and a disposable PGlite database. It does not modify the application database or send any messages. Its console output is in [reproduction-results.txt](./reproduction-results.txt).

Build warnings: type validation disabled by `ignoreBuildErrors`; middleware convention deprecated; a package lock outside the repository ignored. The separate type check passed. The README's reference to 59 tests is stale.

Dependency exposure needs individual evaluation. Next 16.3.3 is within the affected range of GHSA-vcvr-r3jv-pc5j, but no `next/og` / `ImageResponse` use was found in application source. This report does not claim demonstrated remote code execution in CareNest. The audit also flags transitive tooling packages included in runtime dependencies.

No production database credentials, SMS gateways, Google/Zoom OAuth accounts or payment gateways were used. Authenticated browser journeys and mobile/device testing remain required. The application's implementation was not changed: new audit documentation, a reproduction harness and its results were added. The pre-existing `.claude/launch.json` edit was left alone.

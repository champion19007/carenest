# Optional local PostgreSQL

The default app still uses the embedded database. This compose file is an optional localhost-only PostgreSQL environment for contention/recovery testing and future local multi-process development. It creates no cloud resources and does not move the existing patient database.

Create a random private password file at `.data/infrastructure/postgres-password`; keep it untracked and protected. Run `docker compose -f infra/local/compose.yaml up -d`. A separate explicit PostgreSQL connection and migration are required before using it; `npm run dev` continues to force the embedded database. Do not copy a cloud connection URL into a local launch command.

`npm run verify:postgres` creates a separate temporary test container using synthetic data, applies all migrations, checks multiple pooled connections and contended booking, then removes only that container. It first verifies that Docker points to a local daemon. If Docker is unavailable it fails clearly; a missing check is not a passed load test.

Images use the maintained PostgreSQL 17 tag for this local prototype. Record the resolved digest for a reproducible environment and pin it before a real deployment. No Redis, Kubernetes, object store or distributed queue is claimed as deployed. The transactional PostgreSQL rate limiter is already usable across app processes sharing this database; performance and ingress budgets require real deployment load tests.

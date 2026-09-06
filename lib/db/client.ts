import 'server-only'

/**
 * One Postgres interface, two backends.
 *
 *   DATABASE_URL set  → Neon (serverless driver, HTTP — no connection pool to
 *                       exhaust, which is what matters on Vercel where every
 *                       request may be a cold function)
 *   DATABASE_URL unset → PGlite, Postgres compiled to WASM, running in-process
 *                        against a local directory
 *
 * Both speak the same dialect, so the SQL exercised by `npm test` is the SQL
 * that runs in production. Developing against SQLite and deploying to Postgres
 * would let `now()`, `RETURNING`, `jsonb` and `ON CONFLICT` differences hide
 * until they broke something live.
 */

export type Row = Record<string, unknown>

export interface Db {
  /** Parameterised query. Placeholders are $1, $2 … (Postgres style). */
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>
  /** First row, or undefined. */
  one<T = Row>(text: string, params?: unknown[]): Promise<T | undefined>
  /** Statements with no result set. */
  exec(text: string): Promise<void>
  readonly backend: 'neon' | 'pglite'
}

declare global {
  // eslint-disable-next-line no-var
  var __carenestDb: Db | undefined
  // eslint-disable-next-line no-var
  var __carenestDbReady: Promise<void> | undefined
}

function createNeon(url: string): Db {
  /* Imported lazily so PGlite-only environments never load the driver. */
  const { neon } = require('@neondatabase/serverless') as typeof import('@neondatabase/serverless')
  const sql = neon(url)

  return {
    backend: 'neon',
    async query<T>(text: string, params: unknown[] = []) {
      return (await sql.query(text, params)) as T[]
    },
    async one<T>(text: string, params: unknown[] = []) {
      const rows = (await sql.query(text, params)) as T[]
      return rows[0]
    },
    async exec(text: string) {
      await sql.query(text)
    },
  }
}

function createPglite(): Db {
  const { PGlite } = require('@electric-sql/pglite') as typeof import('@electric-sql/pglite')
  const path = require('node:path') as typeof import('node:path')
  const { mkdirSync } = require('node:fs') as typeof import('node:fs')

  const dir = path.join(process.cwd(), '.data', 'pg')
  mkdirSync(dir, { recursive: true })
  const pg = new PGlite(dir)

  return {
    backend: 'pglite',
    async query<T>(text: string, params: unknown[] = []) {
      const result = await pg.query<T>(text, params)
      return result.rows
    },
    async one<T>(text: string, params: unknown[] = []) {
      const result = await pg.query<T>(text, params)
      return result.rows[0]
    },
    async exec(text: string) {
      await pg.exec(text)
    },
  }
}

export function getDb(): Db {
  if (globalThis.__carenestDb) return globalThis.__carenestDb

  const url = process.env.DATABASE_URL
  const db = url ? createNeon(url) : createPglite()

  globalThis.__carenestDb = db
  return db
}

/**
 * Applies the schema once per process.
 *
 * Neon deployments should run `npm run migrate` from CI instead — this is here
 * so a local checkout works with no setup step, and so serverless cold starts
 * against an empty database self-heal rather than 500.
 */
export async function ensureSchema(): Promise<void> {
  if (globalThis.__carenestDbReady) return globalThis.__carenestDbReady

  globalThis.__carenestDbReady = (async () => {
    const { SCHEMA } = await import('./schema')
    await getDb().exec(SCHEMA)
  })()

  return globalThis.__carenestDbReady
}

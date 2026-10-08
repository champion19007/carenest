import 'server-only'
import { createDatabase, type Db } from './adapters'
import { LATEST_MIGRATION } from './migrations'
export type { Db, Row } from './adapters'
declare global {
  var __carenestDb: Db | undefined
  var __carenestDbPromise: Promise<Db> | undefined
  var __carenestDbReady: Promise<void> | undefined
}
export function getDb(): Db {
  if (globalThis.__carenestDb) return globalThis.__carenestDb
  const ready = () => {
    if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL && process.env.CARENEST_LOCAL_MODE !== '1') {
      throw new Error('Configure DATABASE_URL, or run npm run start:local for a single local embedded database.')
    }
    globalThis.__carenestDbPromise ??= createDatabase(process.env.CARENEST_LOCAL_MODE === '1' ? undefined : process.env.DATABASE_URL).catch(error => {
      globalThis.__carenestDbPromise = undefined
      throw error
    })
    return globalThis.__carenestDbPromise
  }
  const facade: Db = {
    backend: process.env.DATABASE_URL && process.env.CARENEST_LOCAL_MODE !== '1' ? 'postgres' : 'pglite',
    async query<T>(sql: string, values: unknown[] = []) { return (await ready()).query<T>(sql, values) },
    async one<T>(sql: string, values: unknown[] = []) { return (await ready()).one<T>(sql, values) },
    async exec(sql: string) { await (await ready()).exec(sql) },
    async transaction<T>(work: (tx: Db) => Promise<T>) { return (await ready()).transaction(work) },
    async close() { await (await ready()).close?.() },
  }
  globalThis.__carenestDb = facade
  return facade
}
/** Schema readiness is a read. DDL runs in the explicit migration command. */
export async function ensureSchema(): Promise<void> {
  globalThis.__carenestDbReady ??= (async () => {
    try {
      const row = await getDb().one('SELECT version FROM public.schema_migrations WHERE version = $1', [LATEST_MIGRATION])
      if (!row) throw new Error('Database migrations are pending. Run npm run migrate before starting CareNest.')
    } catch (error) {
      globalThis.__carenestDbReady = undefined
      throw error
    }
  })()
  return globalThis.__carenestDbReady
}

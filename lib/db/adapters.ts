import { mkdir } from 'node:fs/promises'
import path from 'node:path'
export type Row = Record<string, unknown>
export interface Db {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>
  one<T = Row>(text: string, params?: unknown[]): Promise<T | undefined>
  exec(text: string): Promise<void>
  transaction<T>(work: (tx: Db) => Promise<T>): Promise<T>
  close?: () => Promise<void>
  readonly backend: 'postgres' | 'pglite'
}

export async function createDatabase(url?: string, directory = path.join(process.cwd(), '.data', 'pg')): Promise<Db> {
  if (url) {
    const { Pool, types } = await import('pg')
    types.setTypeParser(1184, value => new Date(value).toISOString())
    types.setTypeParser(1082, value => value)
    const maximum = Number(process.env.DB_POOL_MAX ?? 4)
    if (!Number.isInteger(maximum) || maximum < 1 || maximum > 20) throw new Error('DB_POOL_MAX must be 1–20')
    const pool = new Pool({ connectionString: url, max: maximum, connectionTimeoutMillis: 2000,
      idleTimeoutMillis: 30_000, statement_timeout: 5000, application_name: 'carenest',
      ...(process.env.PG_SSL === 'require' ? { ssl: { rejectUnauthorized: true, ca: process.env.PG_CA_CERT } } : {}),
    })
    pool.on('error', () => console.error('[database] pooled connection error'))
    const root: Db = {
      backend: 'postgres',
      async query<T>(sql: string, values: unknown[] = []) { return (await pool.query(sql, values)).rows as T[] },
      async one<T>(sql: string, values: unknown[] = []) { return (await root.query<T>(sql, values))[0] },
      async exec(sql: string) { await pool.query(sql) },
      async transaction<T>(work: (tx: Db) => Promise<T>) {
        const client = await pool.connect()
        const tx: Db = {
          backend: 'postgres',
          async query<R>(sql: string, values: unknown[] = []) { return (await client.query(sql, values)).rows as R[] },
          async one<R>(sql: string, values: unknown[] = []) { return (await tx.query<R>(sql, values))[0] },
          async exec(sql: string) { await client.query(sql) },
          async transaction<R>(nested: (same: Db) => Promise<R>) { return nested(tx) },
        }
        try {
          await client.query('BEGIN')
          await client.query("SET LOCAL lock_timeout = '2s'")
          const result = await work(tx)
          await client.query('COMMIT')
          return result
        } catch (error) {
          await client.query('ROLLBACK').catch(() => {})
          throw error
        } finally { client.release() }
      },
      close: () => pool.end(),
    }
    return root
  }
  await mkdir(directory, { recursive: true })
  const { PGlite } = await import('@electric-sql/pglite')
  const pg = new PGlite(directory, { parsers: { 1184: value => new Date(value).toISOString(), 1082: value => value } })
  const root: Db = {
    backend: 'pglite',
    async query<T>(sql: string, values: unknown[] = []) { return (await pg.query<T>(sql, values)).rows },
    async one<T>(sql: string, values: unknown[] = []) { return (await root.query<T>(sql, values))[0] },
    async exec(sql: string) { await pg.exec(sql) },
    async transaction<T>(work: (tx: Db) => Promise<T>) {
      return pg.transaction(async client => {
        const tx: Db = {
          backend: 'pglite',
          async query<R>(sql: string, values: unknown[] = []) { return (await client.query<R>(sql, values)).rows },
          async one<R>(sql: string, values: unknown[] = []) { return (await tx.query<R>(sql, values))[0] },
          async exec(sql: string) { await client.exec(sql) },
          async transaction<R>(nested: (same: Db) => Promise<R>) { return nested(tx) },
        }
        return work(tx)
      })
    },
    close: () => pg.close(),
  }
  return root
}

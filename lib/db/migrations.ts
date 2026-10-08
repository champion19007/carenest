import { createHash } from 'node:crypto'
import { SCHEMA } from './schema'
import { FOUNDATION } from './foundation-schema'
import {EXTENDED} from './extended-schema'
import {MAINTENANCE} from './maintenance-schema'
import {LIVEKIT} from './livekit-schema'
import type { Db } from './adapters'
export const migrations = [
  { version: '0001-legacy', sql: SCHEMA },
  { version: '0002-local-foundation', sql: FOUNDATION },
  { version: '0003-extended-local-workflows', sql: EXTENDED },
  { version: '0004-controlled-maintenance', sql: MAINTENANCE },
  { version: '0005-livekit-video', sql: LIVEKIT },
]
export const LATEST_MIGRATION = migrations.at(-1)!.version
export async function applyMigrations(db: Db) {
  await db.exec('CREATE TABLE IF NOT EXISTS public.schema_migrations (version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())')
  await db.transaction(async tx => {
    await tx.query('SELECT pg_advisory_xact_lock(19423707)')
    for (const migration of migrations) {
      const checksum = createHash('sha256').update(migration.sql).digest('hex')
      const existing = await tx.one<{ checksum: string }>('SELECT checksum FROM public.schema_migrations WHERE version=$1', [migration.version])
      if (existing) {
        if (existing.checksum !== checksum) throw new Error(`Migration ${migration.version} was modified after application; add a new migration`)
        continue
      }
      await tx.exec(migration.sql)
      await tx.query('INSERT INTO public.schema_migrations(version,checksum) VALUES ($1,$2)', [migration.version, checksum])
    }
  })
}

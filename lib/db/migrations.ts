import { createHash } from 'node:crypto'
import { SCHEMA } from './schema'
import { FOUNDATION } from './foundation-schema'
import {EXTENDED} from './extended-schema'
import {MAINTENANCE} from './maintenance-schema'
import {LIVEKIT} from './livekit-schema'
import {MESSAGING_DEMO} from './messaging-demo-schema'
import {CASHFREE} from './cashfree-schema'
import {PAID_BOOKING} from './paid-booking-schema'
import {FAST2SMS_SCHEMA} from './fast2sms-schema'
import {APPOINTMENT_NOTIFICATIONS} from './appointment-notification-schema'
import {PROVIDER_KYC} from './provider-kyc-schema'
import {VERIFY_SCHEMA} from './verify-schema'
import type { Db } from './adapters'
export const migrations = [
  { version: '0001-legacy', sql: SCHEMA },
  { version: '0002-local-foundation', sql: FOUNDATION },
  { version: '0003-extended-local-workflows', sql: EXTENDED },
  { version: '0004-controlled-maintenance', sql: MAINTENANCE },
  { version: '0005-livekit-video', sql: LIVEKIT },
  { version: '0006-whatsapp-demo-payments', sql: MESSAGING_DEMO },
  { version: '0007-cashfree-sandbox', sql: CASHFREE },
  { version: '0008-paid-booking-payouts', sql: PAID_BOOKING },
  { version: '0009-fast2sms-messaging', sql: FAST2SMS_SCHEMA },
  { version: '0010-appointment-notifications', sql: APPOINTMENT_NOTIFICATIONS },
  { version: '0011-provider-kyc', sql: PROVIDER_KYC },
  { version: '0012-twilio-verify', sql: VERIFY_SCHEMA },
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

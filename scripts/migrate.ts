import { loadEnvConfig } from '@next/env'
import { createDatabase } from '../lib/db/adapters'
import { applyMigrations } from '../lib/db/migrations'
import {assertLocalStopped,claimLocalMaintenance} from './local-lock.mjs'
loadEnvConfig(process.cwd(),process.env.NODE_ENV==='development')
async function main() {
  const local=!process.argv.includes('--postgres')
  if(local){process.env.CARENEST_LOCAL_MODE='1';await assertLocalStopped()}
  else if(!process.env.DATABASE_URL)throw new Error('Explicit PostgreSQL migration requires DATABASE_URL')
  const release=local?await claimLocalMaintenance():async()=>{}
  let db:Awaited<ReturnType<typeof createDatabase>>|undefined
  try { db=await createDatabase(local?undefined:process.env.DATABASE_URL);await applyMigrations(db); console.log('Ordered migrations applied successfully.') }
  finally { await db?.close?.();await release() }
}
main().catch(() => { console.error('Migration failed; inspect configuration/schema before retrying.'); process.exitCode = 1 })

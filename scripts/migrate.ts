import { loadEnvConfig } from '@next/env'
import { createDatabase } from '../lib/db/adapters'
import { applyMigrations,migrations } from '../lib/db/migrations'
import {databaseTarget,inspectCareNestDatabase} from './database-target.mjs'
import {assertLocalStopped,claimLocalMaintenance} from './local-lock.mjs'
loadEnvConfig(process.cwd(),process.env.NODE_ENV==='development')
async function main() {
  const {local,url}=databaseTarget(process.argv.slice(2),process.env)
  if(local){process.env.CARENEST_LOCAL_MODE='1';await assertLocalStopped()}
  const release=local?await claimLocalMaintenance():async()=>{}
  let db:Awaited<ReturnType<typeof createDatabase>>|undefined
  try { db=await createDatabase(url);if(!local){await inspectCareNestDatabase(db,migrations);process.env.CARENEST_LOCAL_MODE='0'};await applyMigrations(db); console.log('Ordered migrations applied successfully.') }
  finally { await db?.close?.();await release() }
}
main().catch(() => { console.error('Migration failed; inspect configuration/schema before retrying.'); process.exitCode = 1 })

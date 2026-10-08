import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {createDatabase} from '../lib/db/adapters.ts'
import {applyMigrations,LATEST_MIGRATION,migrations} from '../lib/db/migrations.ts'
test('real local adapter applies ordered migrations once and rolls back failed transactions',async()=>{
 const prefix=path.join(os.tmpdir(),'carenest-migration-test-'),directory=await fs.mkdtemp(prefix),db=await createDatabase(undefined,directory)
 try{
  await applyMigrations(db);await applyMigrations(db)
  assert.equal(Number((await db.one('SELECT count(*) n FROM schema_migrations')).n),migrations.length)
  assert.equal((await db.one('SELECT version FROM schema_migrations WHERE version=$1',[LATEST_MIGRATION])).version,LATEST_MIGRATION)
  await assert.rejects(db.transaction(async tx=>{await tx.query("INSERT INTO patient.users(id,phone,name) VALUES('rollback-user','9000000001','Test')");throw new Error('injected transaction failure')}),/injected/)
  assert.equal(await db.one("SELECT id FROM patient.users WHERE id='rollback-user'"),undefined)
 }finally{await db.close();const resolved=path.resolve(directory);assert.ok(resolved.startsWith(path.resolve(prefix)));await fs.rm(resolved,{recursive:true,force:true})}
})

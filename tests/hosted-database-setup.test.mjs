import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {databaseTarget,inspectCareNestDatabase} from '../scripts/database-target.mjs'
import {freshDb,addDoctor,addUser} from './helpers.mjs'
import {loadServices} from './service-loader.mjs'

test('remote maintenance needs an explicit destination; default commands cannot target hosted data',()=>{
 const env={DATABASE_URL:'postgresql://fixture:fixture@dedicated.example.test/carenest',CARENEST_EXPECTED_DB_HOST:'dedicated.example.test'}
 assert.equal(databaseTarget([],env).url,undefined)
 assert.equal(databaseTarget(['--postgres'],env).local,false)
 for(const invalid of [{...env,CARENEST_EXPECTED_DB_HOST:undefined},{...env,CARENEST_EXPECTED_DB_HOST:'other.example.test'},{...env,DATABASE_URL:'https://dedicated.example.test/carenest'}])assert.throws(()=>databaseTarget(['--postgres'],invalid))
})

test('remote inspection rejects another app before DDL and recognises only CareNest checksums',async()=>{
 const migrations=[{version:'fixture-carenest',sql:'fixture schema'}]
 let tables=[],history=[];const db={query:async sql=>sql.includes('pg_tables')?tables:history}
 assert.equal((await inspectCareNestDatabase(db,migrations)).empty,true)
 await assert.rejects(inspectCareNestDatabase(db,migrations,{seed:true}))
 tables=[{schemaname:'neon_auth',tablename:'user'}];assert.equal((await inspectCareNestDatabase(db,migrations)).empty,true)
 tables=[{schemaname:'public',tablename:'Series'}];await assert.rejects(inspectCareNestDatabase(db,migrations),/existing application/)
 tables=[{schemaname:'public',tablename:'schema_migrations'}];history=[{version:'other-app',checksum:'fixture'}];await assert.rejects(inspectCareNestDatabase(db,migrations),/recognised CareNest/)
 history=[{version:'fixture-carenest',checksum:createHash('sha256').update(migrations[0].sql).digest('hex')}]
 assert.equal((await inspectCareNestDatabase(db,migrations,{seed:true})).empty,false)
 history[0].checksum='changed';await assert.rejects(inspectCareNestDatabase(db,migrations))
})

test('hosted demo catalogue shows labelled sample fees without enabling real bookings or bypassing KYC',async()=>{
 const env={...process.env},db=await freshDb();Object.assign(process.env,{NODE_ENV:'production',CARENEST_LOCAL_MODE:'0',AUTH_SECRET:'fixture-secret-'.repeat(4)})
 const load=loadServices(db),directory=load('lib/db/sql.ts'),bookings=load('lib/domain/bookings.ts')
 try{
  await addDoctor(db,'sample');await addDoctor(db,'unreviewed');await addUser(db,'patient','9000000001')
  await db.query("UPDATE provider.doctors SET is_demo=true WHERE id='sample'")
  assert.equal((await directory.searchDoctors()).length,0)
  await db.query('INSERT INTO provider.demo_catalogue_settings(id,enabled) VALUES(1,true)')
  const rows=await directory.searchDoctors();assert.equal(rows.length,1);assert.equal(rows[0].id,'sample');assert.equal(rows[0].fee,600);assert.equal(rows[0].catalogue_only,true);assert.equal(rows[0].verified_at,null)
  assert.equal((await directory.findDoctorBySlug('sample')).catalogue_only,true)
  await db.query("INSERT INTO provider.appointment_slots(slot_id,doctor_id,slot_start,slot_end) VALUES('slot','sample',now()+interval '1 day',now()+interval '1 day 30 minutes')")
  await assert.rejects(bookings.requestAppointment({actorId:'patient',doctorId:'sample',slotId:'slot',mode:'clinic',idempotencyKey:'hosted-demo-not-bookable',consent:true}),e=>e.code==='PROVIDER_UNAVAILABLE')
  assert.equal(Number((await db.one('SELECT count(*) n FROM patient.bookings')).n),0)
  await db.query('UPDATE provider.demo_catalogue_settings SET enabled=false');assert.equal((await directory.searchDoctors()).length,0)
 }finally{await db.close();for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env)}
})

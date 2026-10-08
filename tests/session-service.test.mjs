import test from 'node:test'
import assert from 'node:assert/strict'
import {freshDb,addUser} from './helpers.mjs'
import {loadServices} from './service-loader.mjs'
import {totpAt,verifyTotp} from '../lib/totp.ts'
test('authenticator matches standard SHA1 counter vectors and rejects malformed codes',()=>{
 const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
 assert.equal(totpAt(secret,0),'755224');assert.equal(totpAt(secret,1),'287082')
 assert.equal(verifyTotp(secret,'287082',59000),1);assert.equal(verifyTotp(secret,'12345',59000),null)
})
test('actual sessions use current roles, current account state and privileged idle limits',async t=>{
 process.env.AUTH_SECRET='session-service-test-secret-'.repeat(3)
 const db=await freshDb(),token='test-session-token',jar={get:name=>({value:name==='carenest_session'?token:'tampered-old-claims'})}
 const load=loadServices(db,{'next/headers':{cookies:async()=>jar},'next/navigation':{redirect:url=>{throw Object.assign(new Error('Redirect'),{location:url})}}}),auth=load('lib/auth.ts'),sql=load('lib/db/sql.ts')
 try{
  await addUser(db,'account','9000000001');await sql.createSession(token,'account')
  await t.test('invalid or obsolete routing claims cannot change current privilege',async()=>{
   assert.equal((await auth.currentClaims()).role,'patient')
   await db.query("UPDATE patient.users SET role='doctor',kyc_level='verified' WHERE id='account'")
   assert.equal((await auth.currentClaims()).role,'doctor')
   await db.query("UPDATE patient.users SET role='patient',kyc_level='none' WHERE id='account'")
   assert.equal((await auth.currentClaims()).role,'patient')
  })
  await t.test('suspension takes effect without waiting for a cookie to expire',async()=>{
   await db.query("UPDATE patient.users SET status='SUSPENDED' WHERE id='account'")
   assert.equal(await auth.currentUser(),null)
   await db.query("UPDATE patient.users SET status='ACTIVE',role='doctor' WHERE id='account'")
  })
  await t.test('polling does not refresh idle age and an idle clinician session is revoked',async()=>{
   await db.query("UPDATE patient.sessions SET last_seen_at=now()-interval '5 minutes'")
   const before=(await db.one('SELECT last_seen_at FROM patient.sessions')).last_seen_at
   assert.ok(await auth.currentUser(false));assert.equal((await db.one('SELECT last_seen_at FROM patient.sessions')).last_seen_at,before)
   await db.query("UPDATE patient.sessions SET last_seen_at=now()-interval '31 minutes'")
   assert.equal(await auth.currentUser(),null);assert.equal(Number((await db.one('SELECT count(*) n FROM patient.sessions')).n),0)
  })
 }finally{await db.close()}
})

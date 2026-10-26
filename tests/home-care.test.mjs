import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {freshDb,addUser} from './helpers.mjs'
import {loadServices} from './service-loader.mjs'

test('home care uses real persistence, consent and owner-scoped review transitions',async t=>{
 const db=await freshDb(),load=loadServices(db),care=load('lib/domain/home-care.ts')
 const day=new Date(Date.now()+86400000*2).toISOString().slice(0,10),end=new Date(Date.now()+86400000*5).toISOString().slice(0,10)
 const input=(overrides={})=>({service:'nursing',audience:'human',city:'Navi Mumbai',pin:'410210',startsOn:day,timeWindow:'morning',notes:'Help with walking after a planned recovery visit.',requestKey:randomUUID(),consent:true,...overrides})
 try{
  await addUser(db,'owner','9000000001');await addUser(db,'other','9000000002')
  await db.query("INSERT INTO admins(id,username,password_hash,salt,totp_secret) VALUES('admin','test-admin','unused','unused','mfa-present'),('no-mfa','no-mfa','unused','unused',NULL)")
  await db.query("INSERT INTO patient.pets(id,owner_id,name,species,sex) VALUES('pet-own','owner','Milo','dog','male'),('pet-other','other','Other pet','cat','unknown')")
  await db.query("INSERT INTO patient.family_members(id,user_id,name,relation) VALUES('family-own','owner','Test parent','Mother'),('family-other','other','Other parent','Father')")
  let request
  await t.test('submission is encrypted, saved once on retries and never a booking or payment',async()=>{
   const body=input({familyId:'family-own'}),ids=await Promise.all([care.requestHomeCare('owner',body),care.requestHomeCare('owner',body)])
   assert.equal(ids[0],ids[1]);request=ids[0]
   const row=await db.one('SELECT * FROM patient.home_care_requests WHERE id=$1',[request])
   assert.equal(row.status,'REQUESTED');assert.ok(!row.encrypted_details.includes('walking'))
   assert.equal((await care.ownHomeCareRequests('owner'))[0].details.notes,body.notes)
   assert.equal((await care.ownHomeCareRequests('owner'))[0].subject_name,'Test parent')
   assert.equal((await care.ownHomeCareRequests('owner'))[0].request_hash,undefined)
   assert.equal((await db.one('SELECT count(*)::int n FROM patient.bookings')).n,0)
   assert.equal((await db.one('SELECT count(*)::int n FROM domain_events')).n,0)
   await assert.rejects(care.requestHomeCare('owner',{...body,notes:'A changed request'}),e=>e.code==='IDEMPOTENCY')
  })
  await t.test('pet and household ownership, service and explicit consent cannot be forged',async()=>{
   for(const overrides of [{familyId:'family-other'},{audience:'pet',petId:'pet-other'},{audience:'pet'},{petId:'pet-own'},{audience:'pet',petId:'pet-own',familyId:'family-own'}])await assert.rejects(care.requestHomeCare('owner',input(overrides)),e=>e.code==='SUBJECT')
   await assert.rejects(care.requestHomeCare('owner',input({consent:false})),e=>e.code==='CONSENT')
   await assert.rejects(care.requestHomeCare('owner',input({service:'emergency'})),e=>e.code==='SERVICE')
   assert.equal((await care.ownHomeCareRequests('other')).length,0)
   await assert.rejects(care.changeHomeCareRequest('other',request,0,'CANCELLED'),e=>e.code==='NOT_FOUND')
  })
  await t.test('care dates and Indian PINs are checked by the service, not just browser validation',async()=>{
   for(const overrides of [{startsOn:'2026-02-30'},{startsOn:'2000-01-01'},{pin:'012345'},{timeWindow:'midnight'},{service:'care_home'},{service:'care_home',endsOn:day},{endsOn:end}])await assert.rejects(care.requestHomeCare('owner',input(overrides)))
  })
  await t.test('MFA review is consented and versioned; owners cannot approve their own requests',async()=>{
   await assert.rejects(care.adminHomeCareRequests('owner'),e=>e.code==='FORBIDDEN')
   await assert.rejects(care.adminHomeCareRequests('no-mfa'),e=>e.code==='FORBIDDEN')
   await assert.rejects(care.changeHomeCareRequest('owner',request,0,'REVIEWING','Approve my request'),e=>e.code==='STATE')
   await assert.rejects(care.changeHomeCareRequest('admin',request,0,'CONTACTED','Incorrect skip',true),e=>e.code==='STATE')
   await care.changeHomeCareRequest('admin',request,0,'REVIEWING','We are reviewing the requested support.',true)
   await assert.rejects(care.changeHomeCareRequest('owner',request,0,'CANCELLED'),e=>e.code==='CHANGED')
   await care.changeHomeCareRequest('admin',request,1,'CONTACTED','We need to discuss the visit requirements before quoting.',true)
   assert.match((await care.ownHomeCareRequests('owner'))[0].details.reviewNote,/requirements/)
   assert.equal((await care.adminHomeCareRequests('admin'))[0].phone,'9000000001')
   await care.changeHomeCareRequest('owner',request,2,'CANCELLED')
   assert.equal((await care.adminHomeCareRequests('admin')).length,0)
   assert.ok((await db.one("SELECT revoked_at FROM patient.consents WHERE subject_id=$1",[request])).revoked_at)
   await assert.rejects(care.changeHomeCareRequest('admin',request,3,'CLOSED','Cannot continue after cancellation',true),e=>e.code==='CHANGED')
  })
  await t.test('pet stays retain their owned subject and require a date range',async()=>{
   const id=await care.requestHomeCare('owner',input({service:'care_home',audience:'pet',petId:'pet-own',endsOn:end}))
   const item=(await care.ownHomeCareRequests('owner')).find(r=>r.id===id)
   assert.equal(item.subject_name,'Milo');assert.equal(item.ends_on,end)
   const consent=await db.one('SELECT id FROM patient.consents WHERE subject_id=$1',[id])
   await load('lib/domain/governance.ts').revokeConsent('owner',consent.id)
   assert.equal((await care.ownHomeCareRequests('owner')).find(r=>r.id===id).status,'CANCELLED')
   assert.equal((await care.adminHomeCareRequests('admin')).length,0)
   await assert.rejects(care.changeHomeCareRequest('admin',id,1,'REVIEWING','Cannot review revoked consent',true),e=>e.code==='CHANGED')
  })
  await t.test('approved privacy restriction cancels pending coordination instead of leaving unreachable requests',async()=>{
   const id=await care.requestHomeCare('other',input()),gov=load('lib/domain/governance.ts')
   const privacyId=await gov.requestPrivacyAction('other','RESTRICTION','Fictional privacy restriction review')
   await gov.decidePrivacyRequest('admin',privacyId,'APPROVED','Reviewed restriction for this fictional account')
   assert.equal((await db.one('SELECT status FROM patient.home_care_requests WHERE id=$1',[id])).status,'CANCELLED')
   assert.ok((await db.one('SELECT revoked_at FROM patient.consents WHERE subject_id=$1',[id])).revoked_at)
   await assert.rejects(care.ownHomeCareRequests('other'),e=>e.code==='FORBIDDEN')
  })
  await t.test('account request budget is atomic and disabled accounts cannot create or read requests',async()=>{
   const results=await Promise.allSettled(Array.from({length:5},()=>care.requestHomeCare('owner',input())))
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
   assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='LIMIT').length,4)
   await db.query("UPDATE patient.users SET status='RESTRICTED' WHERE id='owner'")
   await assert.rejects(care.requestHomeCare('owner',input()),e=>e.code==='FORBIDDEN')
   await assert.rejects(care.ownHomeCareRequests('owner'),e=>e.code==='FORBIDDEN')
  })
 }finally{await db.close()}
})

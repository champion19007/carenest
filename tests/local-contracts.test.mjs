import test from 'node:test'
import assert from 'node:assert/strict'
import {freshDb,addDoctor,addUser} from './helpers.mjs'
import {loadServices} from './service-loader.mjs'
import {destinationFor} from '../lib/routes.ts'
import {rupeesToPaise} from '../lib/money.ts'
test('redirect parsing rejects encoded slashes, backslashes and foreign destinations',()=>{
 for(const next of ['//evil.example','/\\evil.example','/%5cevil.example','/%2f%2fevil.example','/\u0000test','https://evil.example'])assert.equal(destinationFor('patient',next),'/dashboard/patient')
 assert.equal(destinationFor('patient','/account?tab=records'),'/account?tab=records')
 assert.equal(rupeesToPaise('350.25'),'35025');assert.throws(()=>rupeesToPaise('1.001'))
})
test('actual schedule generation anchors to the current IST date and respects closures',async()=>{
 const db=await freshDb(),service=loadServices(db)('lib/db/schedule-materializer.ts')
 try{
  await addDoctor(db,'provider')
  const instant=new Date('2030-06-01T20:00:00Z'),localDay=new Date('2030-06-02T00:00:00Z')
  await db.query('INSERT INTO provider.schedule_rules(id,doctor_id,weekday,start_minute,end_minute,duration_minutes) VALUES($1,$2,$3,540,600,30)',['schedule','provider',localDay.getUTCDay()])
  await service.materializeSlots(db,'provider',1,instant)
  const slots=await db.query('SELECT slot_start FROM provider.appointment_slots ORDER BY slot_start')
  assert.equal(slots.length,2);assert.equal(slots[0].slot_start,'2030-06-02T03:30:00.000Z')
  await db.query("INSERT INTO provider.schedule_exceptions(doctor_id,day,closed) VALUES('provider','2030-06-02',true)")
  await db.query('DELETE FROM provider.appointment_slots')
  await service.materializeSlots(db,'provider',1,instant);assert.equal(Number((await db.one('SELECT count(*) n FROM provider.appointment_slots')).n),0)
 }finally{await db.close()}
})
test('actual provider onboarding and immutable estimates commit required evidence and audit together',async t=>{
 const db=await freshDb(),load=loadServices(db),provider=load('lib/domain/providers.ts'),estimates=load('lib/db/estimates.ts')
 try{
  await addUser(db,'applicant','9000000001');await addUser(db,'patient','9000000002')
  await db.query("INSERT INTO admins(id,username,password_hash,salt,totp_secret) VALUES('admin','test-admin','unused','unused','mfa-present')")
  const draft={name:'Test practitioner',kind:'human',speciality:'General Physician',qualification:'Test qualification',registration:'TEST-REG-1',council:'Test council',clinic:'Test clinic',address:'Test address',city:'Mumbai',pin:'400001',fee:600,experience:5,languages:'English',supportedSpecies:[]}
  const id=await provider.saveProviderApplication('applicant',draft)
  await t.test('submission requires clean private evidence and explicit human verification',async()=>{
   await assert.rejects(provider.submitProviderApplication('applicant',id),e=>e.code==='EVIDENCE')
   await db.query("INSERT INTO private_files(id,owner_id,application_id,uploaded_by,original_name,mime,bytes,checksum,storage_key,state) VALUES('proof','applicant',$1,'applicant','test.png','image/png',100,'test','not-a-download-object','CLEAN')",[id])
   await provider.submitProviderApplication('applicant',id)
   await assert.rejects(provider.reviewProviderApplication('admin',id,'APPROVED','Registration manually checked',false),e=>e.code==='VERIFICATION')
   await provider.reviewProviderApplication('admin',id,'APPROVED','Test manual registration check',true)
   assert.equal((await db.one("SELECT role FROM patient.users WHERE id='applicant'")).role,'doctor')
   assert.equal((await db.one('SELECT status FROM provider.applications WHERE id=$1',[id])).status,'APPROVED')
   await assert.rejects(provider.reviewProviderApplication('admin',id,'APPROVED','Repeated registration check',true),e=>e.code==='STATE')
  })
  await db.query("INSERT INTO clinic.surgery_leads(id,name,phone,procedure,city,status,user_id) VALUES('lead','Test person','9000000002','Test procedure','Mumbai','APPROVED','patient')")
  const input={id:'estimate-one',leadId:'lead',procedure:'Test procedure',hospital:'Test hospital',roomTier:'General ward',lineItems:[{label:'Recorded quote',amount:1000}],issuedBy:'admin'}
  await t.test('outbox failure rolls back the complete estimate',async()=>{
   const failing={...db,transaction:work=>db.transaction(tx=>work({...tx,query:(sql,args)=>sql.startsWith('INSERT INTO domain_events')?Promise.reject(new Error('outbox down')):tx.query(sql,args)}))}
   await assert.rejects(loadServices(failing)('lib/db/estimates.ts').issueEstimate(input),/outbox down/)
   assert.equal(await db.one('SELECT id FROM clinic.estimates WHERE id=$1',[input.id]),undefined)
  })
  await t.test('concurrent stale reprices cannot fork the immutable quote chain',async()=>{
   await estimates.issueEstimate(input)
   const results=await Promise.allSettled(['two','three'].map(name=>estimates.issueEstimate({...input,id:'estimate-'+name,supersedes:input.id})))
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
   assert.equal(Number((await db.one('SELECT count(*) n FROM clinic.estimates')).n),2)
   await assert.rejects(db.query("UPDATE clinic.estimates SET hospital='Changed' WHERE id=$1",[input.id]),/cannot be UPDATE|immutable|append-only/)
  })
 }finally{await db.close()}
})

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import {freshDb,addUser,addDoctor} from './helpers.mjs'
import {loadServices} from './service-loader.mjs'

test('actual local pet, lab, file, finance, profile, review and worker workflows',async t=>{
 process.env.CARENEST_LOCAL_MODE='1';process.env.AUTH_SECRET='local-workflow-test-secret-'.repeat(3)
 const prefix=path.join(os.tmpdir(),'carenest-file-test-'),directory=await fs.mkdtemp(prefix),priorRoot=process.env.PRIVATE_FILE_ROOT
 process.env.PRIVATE_FILE_ROOT=directory
 const db=await freshDb(),load=loadServices(db),pets=load('lib/domain/pets.ts'),labs=load('lib/domain/labs.ts'),files=load('lib/domain/files.ts'),billing=load('lib/domain/billing.ts'),booking=load('lib/domain/bookings.ts')
 try{
  for(const[id,phone,role]of [['patient','9000000001','patient'],['other','9000000002','patient'],['doctor','9000000003','doctor'],['lab-staff','9000000004','patient']])await addUser(db,id,phone,role)
  await db.query("UPDATE patient.users SET name=id,kyc_level='verified' WHERE id='doctor'")
  await db.query("INSERT INTO clinic.clinics(id,name) VALUES('clinic','Test clinic'),('lab','Test laboratory')")
  await addDoctor(db,'provider',{slug:'different-public-slug'})
  await db.query("UPDATE provider.doctors SET user_id='doctor',verified_at=now(),clinic_id='clinic'")
  await db.query("INSERT INTO clinic.memberships(clinic_id,user_id,role) VALUES('lab','lab-staff','lab')")
  await db.query("INSERT INTO clinic.lab_packages(id,clinic_id,name,fee_paise,status,verified_at) VALUES('package','lab','Test package',35000,'ACTIVE',now())")
  let petId,labId,invoiceId,visit
  await t.test('owned pet health persists; foreign access and mutation fail',async()=>{
   petId=await pets.savePet('patient',{name:'Milo',species:'dog',breed:'Mixed',sex:'male'})
   await pets.addPetHealth('patient',petId,{weight:'12.4',vaccine:'Recorded vaccine',givenOn:'2025-01-01',dueOn:'2026-01-01'})
   assert.equal((await pets.petHealth('patient',petId)).vaccines.length,1)
   await assert.rejects(pets.petHealth('other',petId),e=>e.code==='FORBIDDEN')
   await assert.rejects(pets.savePet('other',{id:petId,name:'Stolen',species:'dog',breed:'',sex:'unknown'}),e=>e.code==='FORBIDDEN')
   await assert.rejects(booking.requestAppointment({actorId:'patient',doctorId:'provider',slotId:'missing',mode:'clinic',petId,idempotencyKey:'human-provider-pet-request',consent:true}),e=>e.code==='SUBJECT')
  })
  await t.test('lab intent is idempotent and foreign family ownership is enforced',async()=>{
   labId=await labs.requestLabOrder('patient','package',null,'lab-request-idempotency',true)
   assert.equal(await labs.requestLabOrder('patient','package',null,'lab-request-idempotency',true),labId)
   assert.equal(Number((await db.one('SELECT count(*) n FROM clinic.invoices WHERE lab_order_id=$1',[labId])).n),1)
   await db.query("INSERT INTO patient.family_members(id,user_id,name,relation) VALUES('foreign-family','other','Other person','Parent')")
   await assert.rejects(labs.requestLabOrder('patient','package','foreign-family','foreign-lab-subject-key',true),e=>e.code==='SUBJECT')
   await assert.rejects(labs.updateLabOrder('other',labId,'CONFIRMED',new Date(Date.now()+3600000).toISOString(),''),e=>e.code==='FORBIDDEN')
  })
  await t.test('result upload is staff scoped, PDFs quarantined and normalized images private',async()=>{
   const png=await sharp({create:{width:2,height:2,channels:3,background:'#1677ff'}}).png().toBuffer()
   await assert.rejects(files.uploadPrivateFile('patient','result.png',png,{labOrderId:labId}),e=>e.code==='FORBIDDEN')
   const pdf=await files.uploadPrivateFile('lab-staff','report.pdf',Buffer.from('%PDF-1.7\nlocal test'),{labOrderId:labId})
   assert.equal(pdf.state,'QUARANTINED')
   await assert.rejects(files.downloadPrivateFile('patient',null,pdf.id),e=>e.code==='QUARANTINED')
   const image=await files.uploadPrivateFile('lab-staff','report.png',png,{labOrderId:labId})
   assert.equal(image.state,'CLEAN')
   const downloaded=await files.downloadPrivateFile('patient',null,image.id)
   assert.equal(downloaded.file.owner_id,'patient');assert.equal(downloaded.bytes[0],137)
   await assert.rejects(files.downloadPrivateFile('other',null,image.id),e=>e.code==='FORBIDDEN')
   const row=await db.one('SELECT storage_key FROM private_files WHERE id=$1',[image.id])
   assert.equal((await fs.readFile(path.join(directory,row.storage_key),'utf8')).includes('PNG'),false)
   for(const state of ['CONFIRMED','COLLECTED','PROCESSING'])await labs.updateLabOrder('lab-staff',labId,state,new Date(Date.now()+3600000).toISOString(),'')
   await assert.rejects(labs.updateLabOrder('lab-staff',labId,'COMPLETED','',pdf.id),e=>e.code==='RESULT')
   await labs.updateLabOrder('lab-staff',labId,'COMPLETED','',image.id)
   assert.equal((await labs.ownLabOrders('patient'))[0].state,'COMPLETED')
  })
  await t.test('duplicate offline receipts produce one balanced integer ledger posting',async()=>{
   invoiceId=(await db.one('SELECT id FROM clinic.invoices WHERE lab_order_id=$1',[labId])).id
   await assert.rejects(billing.recordClinicPayment('other',invoiceId,'cash','35000'),e=>e.code==='FORBIDDEN')
   await assert.rejects(billing.recordClinicPayment('lab-staff',invoiceId,'cash','35001'),e=>e.code==='AMOUNT')
   await Promise.all([billing.recordClinicPayment('lab-staff',invoiceId,'cash','35000'),billing.recordClinicPayment('lab-staff',invoiceId,'cash','35000')])
   assert.equal(Number((await db.one('SELECT count(*) n FROM ledger_entries')).n),2)
   assert.equal(String((await db.one('SELECT sum(balance_paise) total FROM ledger_accounts')).total),'0')
   assert.equal((await db.one('SELECT state FROM clinic.invoices WHERE id=$1',[invoiceId])).state,'PAID')
  })
  await t.test('duplicate captures and refund callbacks cannot double-post money',async()=>{
   await db.query("INSERT INTO payment_orders(id,invoice_id,user_id,amount_paise,currency,gateway,idempotency_key,external_id,state) VALUES('payment', $1,'patient',35000,'INR','razorpay','payment-idempotency','order_test','CREATED')",[invoiceId])
   await billing.settleCapturedPayment('event1','order_test','payment_test','35000','INR')
   await billing.settleCapturedPayment('event1','order_test','payment_test','35000','INR')
   await billing.settleCapturedPayment('event2','order_test','payment_test','35000','INR')
   assert.equal((await db.one("SELECT state FROM payment_orders WHERE id='payment'")).state,'OVERPAYMENT')
   assert.equal((await db.one("SELECT account_type FROM ledger_accounts WHERE account_id='refund-liability:lab'")).account_type,'REFUND_LIABILITY')
   assert.equal(Number((await db.one('SELECT count(*) n FROM ledger_entries')).n),4)
   await assert.rejects(billing.requestRefund('other','payment','1','Foreign refund attempt'),e=>e.code==='NOT_FOUND')
   await db.query("UPDATE refunds SET external_id='refund_test',state='APPROVED' WHERE payment_id='payment'")
   await billing.settleRefund('refund_test');await billing.settleRefund('refund_test')
   assert.equal(Number((await db.one('SELECT count(*) n FROM ledger_entries')).n),6)
   assert.equal((await db.one('SELECT state FROM clinic.invoices WHERE id=$1',[invoiceId])).state,'PAID')
   assert.equal(String((await db.one('SELECT sum(balance_paise) total FROM ledger_accounts')).total),'0')
  })
  await t.test('cancelled lab invoices cannot collect payment and a late capture stays refundable',async()=>{
   const id=await labs.requestLabOrder('patient','package',null,'cancelled-lab-request-key',true)
   await labs.updateLabOrder('lab-staff',id,'CANCELLED','','')
   const invoice=(await db.one('SELECT id,state FROM clinic.invoices WHERE lab_order_id=$1',[id]))
   assert.equal(invoice.state,'VOID')
   await assert.rejects(billing.recordClinicPayment('lab-staff',invoice.id,'cash','35000'),e=>e.code==='STATE')
   await db.query("INSERT INTO payment_orders(id,invoice_id,user_id,amount_paise,currency,gateway,idempotency_key,external_id,state) VALUES('late-payment',$1,'patient',35000,'INR','razorpay','late-payment-intent','late-order','CREATED')",[invoice.id])
   await billing.settleCapturedPayment('late-event','late-order','late-capture','35000','INR')
   assert.equal((await db.one('SELECT state FROM clinic.invoices WHERE id=$1',[invoice.id])).state,'VOID')
   assert.equal((await db.one("SELECT state FROM payment_orders WHERE id='late-payment'")).state,'OVERPAYMENT')
   assert.equal((await db.one("SELECT state FROM refunds WHERE payment_id='late-payment'")).state,'REQUESTED')
  })
  await t.test('profile demographic synchronization and audit rollback are atomic',async()=>{
   const profile=load('lib/domain/profile.ts'),input={name:'Patient name',email:null,dob:'2000-02-29',gender:'Female',city:'Mumbai'}
   await profile.updatePersonProfile('patient',input)
   assert.deepEqual(await db.one("SELECT name,dob,gender FROM patient.family_members WHERE user_id='patient' AND is_self"),{name:'Patient name',dob:'2000-02-29',gender:'Female'})
   const failing={...db,transaction:work=>db.transaction(tx=>work({...tx,query:(sql,args)=>sql.startsWith('INSERT INTO audit_log')?Promise.reject(new Error('audit down')):tx.query(sql,args)}))}
   await assert.rejects(loadServices(failing)('lib/domain/profile.ts').updatePersonProfile('patient',{...input,name:'Must roll back'}),/audit down/)
   assert.equal((await db.one("SELECT name FROM patient.users WHERE id='patient'")).name,'Patient name')
  })
  await t.test('clinical attendance gates reviews and duplicate reviews do not corrupt aggregates',async()=>{
   await db.query("INSERT INTO provider.appointment_slots(slot_id,doctor_id,slot_start,slot_end) VALUES('visit-slot','provider',now()+interval '30 minutes',now()+interval '60 minutes')")
   visit=await booking.requestAppointment({actorId:'patient',doctorId:'provider',slotId:'visit-slot',mode:'clinic',idempotencyKey:'review-visit-request-key',consent:true})
   await booking.respondAppointment({actorId:'doctor',bookingId:visit.id,decision:'confirmed'})
   const review=load('lib/domain/reviews.ts')
   await assert.rejects(review.createAttendedReview('patient','provider',5,'Before the visit'),e=>e.code==='ELIGIBILITY')
   await booking.startAppointment('doctor',visit.id);await booking.finishAppointment('doctor',visit.id,'attended')
   const outcomes=await Promise.allSettled([review.createAttendedReview('patient','provider',5,'Completed local visit'),review.createAttendedReview('patient','provider',4,'Duplicate local visit')])
   assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1)
   assert.equal(Number((await db.one("SELECT reviews_count FROM provider.doctors WHERE id='provider'")).reviews_count),1)
   const receipt=(await db.one('SELECT id FROM clinic.invoices WHERE booking_id=$1',[visit.id])).id
   await db.query("UPDATE provider.doctors SET verified_at=NULL,is_demo=true WHERE id='provider'")
   await billing.recordClinicPayment('doctor',receipt,'cash','60000')
   assert.equal((await db.one('SELECT state FROM clinic.invoices WHERE id=$1',[receipt])).state,'PAID')
  })
  await t.test('expired worker leases and unknown handlers fail closed',async()=>{
   const outbox=load('lib/db/outbox.ts')
   await db.query("UPDATE domain_events SET status='SENT'")
   await outbox.emit({kind:'unknown.integration',eventKey:'unknown-test'})
   const first=(await outbox.claimBatch(1))[0]
   await db.query("UPDATE domain_events SET locked_until=now()-interval '1 second' WHERE id=$1",[first.id])
   const second=(await outbox.claimBatch(1))[0]
   await assert.rejects(outbox.markSent(first.id,first.lease_token),/lease lost/)
   assert.notEqual(first.lease_token,second.lease_token)
   await outbox.markFailed(second.id,second.attempts,'UNKNOWN_HANDLER',second.lease_token,true)
   assert.equal((await db.one('SELECT status FROM domain_events WHERE id=$1',[first.id])).status,'FAILED')
   await outbox.emit({kind:'another.unknown',eventKey:'unknown-drain-test'})
   const drain=loadServices(db,{'./triage':{triageEnquiry:async()=>{throw new Error('Unexpected external AI')}}})('lib/drain.ts')
   assert.equal((await drain.drainAll(1)).failed,1)
   assert.equal((await db.one("SELECT last_error FROM domain_events WHERE event_key='unknown-drain-test'")).last_error,'UNKNOWN_HANDLER')
  })
  await t.test('support review uses current admin access and an expected-state transition',async()=>{
   const support=load('lib/domain/support.ts'),id=await support.createSupportCase('patient','Test support request','This is a fictional local support case.')
   await assert.rejects(support.updateSupportCase('other',id,'OPEN','IN_REVIEW'),e=>e.code==='FORBIDDEN')
   await db.query("INSERT INTO admins(id,username,password_hash,salt,totp_secret) VALUES('admin','test-admin','unused','unused','mfa-present')")
   await support.updateSupportCase('admin',id,'OPEN','IN_REVIEW')
   await assert.rejects(support.updateSupportCase('admin',id,'OPEN','IN_REVIEW'),e=>e.code==='CHANGED')
   await support.updateSupportCase('admin',id,'IN_REVIEW','RESOLVED')
   assert.equal((await support.supportCases('patient'))[0].state,'RESOLVED')
   assert.equal((await support.supportCases('other')).length,0)
  })
  await t.test('old ambiguous email delivery is held beyond the provider deduplication window',async()=>{
   const oldFetch=globalThis.fetch;let calls=0
   process.env.CARENEST_LOCAL_MODE='0';process.env.RESEND_API_KEY='fake-test-key';process.env.EMAIL_FROM='test@example.invalid'
   try{
    await db.query("UPDATE patient.users SET email='patient@example.invalid',email_verified_at=now() WHERE id='patient'")
    await db.query("INSERT INTO patient.notification_preferences(user_id,email_enabled) VALUES('patient',true) ON CONFLICT(user_id) DO UPDATE SET email_enabled=true")
    await db.query("INSERT INTO notification_delivery(effect_key,channel,state,updated_at) VALUES('event:old-email:external','email','SENDING',now()-interval '26 hours')")
    globalThis.fetch=async()=>{calls++;throw new Error('External requests forbidden in this test')}
    await assert.rejects(load('lib/notifications.ts').sendExternalUpdate('patient','old-email'),e=>e.code==='DELIVERY_UNKNOWN')
    assert.equal(calls,0)
   }finally{globalThis.fetch=oldFetch;process.env.CARENEST_LOCAL_MODE='1';delete process.env.RESEND_API_KEY;delete process.env.EMAIL_FROM}
  })
  await t.test('private-object purge respects a new hold, removes the file and is idempotent',async()=>{
   const file=await db.one("SELECT id,storage_key FROM private_files WHERE mime='image/png' LIMIT 1")
   await db.query("UPDATE private_files SET state='PURGE_PENDING' WHERE id=$1",[file.id]);await db.query("INSERT INTO retention_holds(id,user_id,resource_id,reason,created_by) VALUES('file-hold','patient',$1,'Synthetic hold','admin')",[file.id])
   await assert.rejects(files.purgePrivateFile(file.id),e=>e.code==='HOLD');await fs.access(path.join(directory,file.storage_key))
   await db.query("DELETE FROM retention_holds WHERE id='file-hold'");await files.purgePrivateFile(file.id);await files.purgePrivateFile(file.id)
   await assert.rejects(fs.access(path.join(directory,file.storage_key)),e=>e.code==='ENOENT')
   assert.deepEqual(await db.one('SELECT state,original_name FROM private_files WHERE id=$1',[file.id]),{state:'PURGED',original_name:'Erased private file'})
  })
 }finally{
  await db.close();if(priorRoot===undefined)delete process.env.PRIVATE_FILE_ROOT;else process.env.PRIVATE_FILE_ROOT=priorRoot
  assert.ok(path.resolve(directory).startsWith(path.resolve(prefix)));await fs.rm(directory,{recursive:true,force:true})
 }
})

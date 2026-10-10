import test from 'node:test'
import assert from 'node:assert/strict'
import {freshDb,addUser,addDoctor} from './helpers.mjs'
import {loadServices} from './service-loader.mjs'
import {generateKeyPairSync,privateDecrypt,constants,randomUUID} from 'node:crypto'
import {writeFileSync,unlinkSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'

test('prepaid appointment and completed-doctor payout lifecycle',async t=>{
 const env={...process.env},originalFetch=globalThis.fetch
 Object.assign(process.env,{CARENEST_LOCAL_MODE:'1',ENABLE_PAYMENTS:'1',CASHFREE_ENV:'sandbox',CASHFREE_CLIENT_ID:'TEST_fixture',CASHFREE_CLIENT_SECRET:'fixture_pg',ENABLE_DOCTOR_PAYOUTS:'1',CASHFREE_PAYOUT_CLIENT_ID:'fixture_payout',CASHFREE_PAYOUT_CLIENT_SECRET:'fixture_payout_secret',APP_ORIGIN:'http://localhost:3000'})
 delete process.env.CASHFREE_PAYOUT_PUBLIC_KEY_PATH
 const db=await freshDb(),load=loadServices(db),bookings=load('lib/domain/bookings.ts'),billing=load('lib/domain/billing.ts'),payouts=load('lib/domain/doctor-payouts.ts')
 const orders=new Map(),transfers=new Map();let serial=7000,paid=false,posts=0,loseTransferResponse=false,wrongBeneficiary=false,wrongAmount=false,denyBeneficiary=false,transferState='RECEIVED',transferCode='RECEIVED'
 globalThis.fetch=async(url,options={})=>{
  const u=new URL(url),body=options.body?JSON.parse(options.body):null
  assert.equal(u.origin,'https://sandbox.cashfree.com')
  if(u.pathname.startsWith('/pg/')){
   assert.equal(options.headers['x-client-secret'],'fixture_pg')
   if(u.pathname==='/pg/orders'&&body){const row={...body,payment_session_id:'session_'+body.order_id,paymentId:String(++serial)};orders.set(body.order_id,row);return Response.json(row)}
   const parts=u.pathname.split('/'),order=orders.get(parts[3]);if(!order)return Response.json({},{status:404})
   return Response.json(parts[4]==='payments'?[{order_id:order.order_id,cf_payment_id:order.paymentId,payment_amount:order.order_amount,payment_currency:'INR',payment_status:paid?'SUCCESS':'FAILED'}]:{...order,order_status:paid?'PAID':'ACTIVE'})
  }
  assert.equal(options.headers['x-client-secret'],'fixture_payout_secret');assert.equal(options.headers['x-api-version'],'2024-01-01')
  if(u.pathname==='/payout/beneficiary')return denyBeneficiary?Response.json({message:'IP not whitelisted',type:'authentication_error'},{status:403}):Response.json({beneficiary_id:u.searchParams.get('beneficiary_id'),beneficiary_status:'VERIFIED'})
  if(body){posts++;assert.match(body.transfer_id,/^[A-Za-z0-9_]{1,40}$/);transfers.set(body.transfer_id,{...body,cf_transfer_id:String(++serial)});if(loseTransferResponse){loseTransferResponse=false;throw new Error('Provider accepted; response lost')}}
  const row=transfers.get(body?.transfer_id??u.searchParams.get('transfer_id'));if(!row)return Response.json({},{status:404})
  return Response.json({...row,status:transferState,status_code:transferCode,transfer_amount:wrongAmount?1:row.transfer_amount,beneficiary_details:{beneficiary_id:wrongBeneficiary?'foreign':row.beneficiary_details.beneficiary_id}})
 }
 let index=0
 const reserve=async()=>{
  const id='slot_'+(++index)
  await db.query("INSERT INTO provider.appointment_slots(slot_id,doctor_id,slot_start,slot_end) VALUES($1,'provider',now()+($2::int*interval '1 hour'),now()+($2::int*interval '1 hour')+interval '30 minutes')",[id,index])
  const b=await bookings.requestAppointment({actorId:'patient',doctorId:'provider',slotId:id,mode:'clinic',idempotencyKey:'booking_fixture_'+index,consent:true,paymentRequired:true})
  const i=await db.one('SELECT * FROM clinic.invoices WHERE booking_id=$1',[b.id])
  return {b,i,id}
 }
 const pay=async(v)=>{paid=true;const p=await billing.createPaymentOrder('patient',v.i.id,'payment_fixture_'+v.id);await billing.verifyCheckout('patient',p.externalOrderId);return p}
 const complete=async(v)=>{
  await db.query("UPDATE provider.appointment_slots SET slot_start=now()-interval '30 minutes',slot_end=now() WHERE slot_id=$1",[v.id])
  await db.query("UPDATE patient.bookings SET starts_at=now()-interval '30 minutes',ends_at=now() WHERE id=$1",[v.b.id])
  await bookings.finishAppointment('doctor',v.b.id,'attended');await payouts.queueDoctorPayouts()
  return db.one('SELECT * FROM doctor_payouts WHERE booking_id=$1',[v.b.id])
 }
 try{
  await addUser(db,'patient','9000000001');await addUser(db,'other','9000000002');await addUser(db,'doctor','9000000003','doctor')
  await db.query("UPDATE patient.users SET kyc_level='verified' WHERE id='doctor'")
  await db.query("INSERT INTO clinic.clinics(id,name) VALUES('clinic','QA clinic')")
  await addDoctor(db,'provider',{fee:400});await db.query("UPDATE provider.doctors SET user_id='doctor',clinic_id='clinic',verified_at=now() WHERE id='provider'")
  await db.query("INSERT INTO admins(id,username,password_hash,salt,totp_secret) VALUES('admin','qa-admin','fixture','fixture','fixture')")
  let v,p,d
  await t.test('slot is held, invoice is trusted, failed payment never schedules and another patient cannot claim it',async()=>{
   v=await reserve();assert.equal(v.b.status,'requested');assert.equal(v.i.state,'UNPAID');assert.equal(Number(v.i.total_paise),40000)
   await assert.rejects(bookings.respondAppointment({actorId:'doctor',bookingId:v.b.id,decision:'confirmed'}),e=>e.code==='PAYMENT_REQUIRED')
   await assert.rejects(bookings.requestAppointment({actorId:'other',doctorId:'provider',slotId:v.id,mode:'clinic',idempotencyKey:'contender_fixture',consent:true,paymentRequired:true}),e=>e.code==='SLOT_UNAVAILABLE')
   p=await billing.createPaymentOrder('patient',v.i.id,'initial_payment_fixture');assert.equal((await billing.verifyCheckout('patient',p.externalOrderId)).state,'AWAITING_CAPTURE')
   assert.equal((await db.one('SELECT status FROM patient.bookings WHERE id=$1',[v.b.id])).status,'requested')
   const retry=await billing.createPaymentOrder('patient',v.i.id,'different_browser_key_fixture');assert.equal(retry.externalOrderId,p.externalOrderId)
   await assert.rejects(billing.verifyCheckout('other',p.externalOrderId),e=>e.code==='NOT_FOUND')
  })
  await t.test('verified payment atomically schedules, duplicate verification creates one encounter and one capture',async()=>{
   paid=true;const result=await billing.verifyCheckout('patient',p.externalOrderId);assert.equal(result.bookingStatus,'confirmed');assert.equal(result.bookingId,v.b.id)
   await billing.verifyCheckout('patient',p.externalOrderId)
   assert.equal((await db.one('SELECT status FROM provider.appointment_slots WHERE slot_id=$1',[v.id])).status,'BOOKED')
   assert.equal(Number((await db.one('SELECT count(*) n FROM clinic.encounters WHERE booking_id=$1',[v.b.id])).n),1)
   assert.equal(Number((await db.one('SELECT count(*) n FROM financial_effects')).n),1)
   await payouts.queueDoctorPayouts();assert.equal(Number((await db.one('SELECT count(*) n FROM doctor_payouts')).n),0)
   await assert.rejects(billing.requestRefund('patient',p.paymentId,'100','Refund before cancellation'),e=>e.code==='CANCEL_FIRST')
  })
  await t.test('doctor destination requires administrator attestation and provider verification',async()=>{
   await assert.rejects(payouts.bindDoctorBeneficiary('patient','provider','QA_DOCTOR',true),e=>e.code==='FORBIDDEN')
   await assert.rejects(payouts.bindDoctorBeneficiary('admin','provider','QA_DOCTOR',false),e=>e.code==='ATTESTATION')
   await payouts.bindDoctorBeneficiary('admin','provider','QA_DOCTOR',true)
   await assert.rejects(bookings.finishAppointment('other',v.b.id,'attended'),e=>e.code==='FORBIDDEN')
  })
  await t.test('completion queues once; accepted and sent transfers remain pending until completed credit',async()=>{
   d=await complete(v);await payouts.queueDoctorPayouts();assert.equal(Number((await db.one('SELECT count(*) n FROM doctor_payouts')).n),1)
   await payouts.processDoctorPayout(d.id);assert.equal((await db.one('SELECT state FROM doctor_payouts WHERE id=$1',[d.id])).state,'PENDING');assert.equal(posts,1)
   transferState='SUCCESS';transferCode='SENT_TO_BENEFICIARY';await payouts.processDoctorPayout(d.id);assert.equal((await db.one('SELECT state FROM doctor_payouts WHERE id=$1',[d.id])).state,'PENDING')
   transferCode='COMPLETED';await payouts.processDoctorPayout(d.id);await payouts.processDoctorPayout(d.id)
   assert.equal(posts,1);assert.equal((await db.one('SELECT state FROM doctor_payouts WHERE id=$1',[d.id])).state,'PAID')
   assert.equal(Number((await db.one('SELECT count(*) n FROM ledger_entries')).n),4);assert.equal(String((await db.one('SELECT sum(balance_paise) n FROM ledger_accounts')).n),'0')
   assert.equal((await payouts.doctorPayoutHistory('other')).length,0);assert.equal((await payouts.doctorPayoutHistory('doctor')).length,1)
   await assert.rejects(billing.requestRefund('patient',p.paymentId,'100','Refund after completed payout'),e=>e.code==='PAYOUT_IN_PROGRESS')
  })
  await t.test('provider reversals reverse accounting exactly once and never create an automatic replacement transfer',async()=>{
   transferState='REVERSED';transferCode='REVERSED';await payouts.processDoctorPayout(d.id);await payouts.processDoctorPayout(d.id)
   assert.equal(posts,1);assert.equal((await db.one('SELECT state FROM doctor_payouts WHERE id=$1',[d.id])).state,'REVERSED')
   assert.equal(Number((await db.one('SELECT count(*) n FROM ledger_entries')).n),6);assert.equal(String((await db.one('SELECT sum(balance_paise) n FROM ledger_accounts')).n),'0')
  })
  await t.test('timeout after transfer acceptance recovers by the same ID; mismatched evidence cannot mark paid',async()=>{
   const another=await reserve();await pay(another);const queued=await complete(another);transferState='RECEIVED';transferCode='RECEIVED';loseTransferResponse=true
   await payouts.processDoctorPayout(queued.id);assert.equal((await db.one('SELECT state FROM doctor_payouts WHERE id=$1',[queued.id])).state,'UNKNOWN');const beforePosts=posts
   transferState='SUCCESS';transferCode='COMPLETED';wrongAmount=true;await payouts.processDoctorPayout(queued.id);assert.equal((await db.one('SELECT state FROM doctor_payouts WHERE id=$1',[queued.id])).state,'UNKNOWN');wrongAmount=false;wrongBeneficiary=true;await payouts.processDoctorPayout(queued.id);wrongBeneficiary=false
   await payouts.processDoctorPayout(queued.id);assert.equal(posts,beforePosts);assert.equal((await db.one('SELECT state FROM doctor_payouts WHERE id=$1',[queued.id])).state,'PAID')
  })
  await t.test('expired payment never steals a reused slot and creates a refund liability',async()=>{
   const late=await reserve();paid=false;const order=await billing.createPaymentOrder('patient',late.i.id,'late_payment_fixture')
   await db.query("UPDATE provider.appointment_slots SET locked_until=now()-interval '1 second' WHERE slot_id=$1",[late.id]);await bookings.sweepAppointmentHolds()
   await bookings.requestAppointment({actorId:'other',doctorId:'provider',slotId:late.id,mode:'clinic',idempotencyKey:'new_owner_fixture',consent:true,paymentRequired:true})
   paid=true;assert.equal((await billing.verifyCheckout('patient',order.externalOrderId)).state,'OVERPAYMENT')
   assert.equal((await db.one('SELECT status FROM patient.bookings WHERE id=$1',[late.b.id])).status,'expired')
   assert.equal((await db.one('SELECT locked_by FROM provider.appointment_slots WHERE slot_id=$1',[late.id])).locked_by,'other')
   assert.equal(Number((await db.one('SELECT count(*) n FROM refunds WHERE payment_id=$1',[order.paymentId])).n),1)
  })
  await t.test('paid cancellation frees slot and requests one full refund; pre-payout refund blocks doctor transfer',async()=>{
   const cancel=await reserve(),order=await pay(cancel);await bookings.cancelAppointment('patient',cancel.b.id);await bookings.cancelAppointment('patient',cancel.b.id)
   assert.equal((await db.one('SELECT status FROM provider.appointment_slots WHERE slot_id=$1',[cancel.id])).status,'AVAILABLE');assert.equal(Number((await db.one('SELECT count(*) n FROM refunds WHERE payment_id=$1',[order.paymentId])).n),1)
   const disputed=await reserve(),payment=await pay(disputed),queued=await complete(disputed)
   await billing.requestRefund('patient',payment.paymentId,'100','Dispute before doctor payout');const beforePosts=posts;await payouts.processDoctorPayout(queued.id)
   assert.equal(posts,beforePosts);assert.equal((await db.one('SELECT state FROM doctor_payouts WHERE id=$1',[queued.id])).state,'BLOCKED_REFUND')
  })
  await t.test('paid reschedule retains confirmation and invoice without a second charge',async()=>{
   const move=await reserve();await pay(move)
   await db.query("INSERT INTO provider.appointment_slots(slot_id,doctor_id,slot_start,slot_end) VALUES('move_target','provider',now()+interval '50 hours',now()+interval '50 hours 30 minutes')")
   const current=await db.one('SELECT revision FROM patient.bookings WHERE id=$1',[move.b.id]),changed=await bookings.rescheduleAppointment('patient',move.b.id,'move_target',current.revision)
   assert.equal(changed.status,'confirmed');assert.equal((await db.one("SELECT status FROM provider.appointment_slots WHERE slot_id='move_target'")).status,'BOOKED')
   assert.equal((await db.one('SELECT state FROM clinic.invoices WHERE id=$1',[move.i.id])).state,'PAID')
   await bookings.cancelAppointment('patient',move.b.id)
  })
  await t.test('late capture without a sweep expires only its own hold and requests refund',async()=>{
   const late=await reserve();const order=await billing.createPaymentOrder('patient',late.i.id,'late_unswept_fixture')
   await db.query("UPDATE provider.appointment_slots SET locked_until=now()-interval '1 second' WHERE slot_id=$1",[late.id])
   assert.equal((await billing.verifyCheckout('patient',order.externalOrderId)).state,'OVERPAYMENT')
   assert.equal((await db.one('SELECT status FROM provider.appointment_slots WHERE slot_id=$1',[late.id])).status,'AVAILABLE')
   assert.equal((await db.one('SELECT status FROM patient.bookings WHERE id=$1',[late.b.id])).status,'expired')
  })
  await t.test('no-show cannot create a doctor payout; zero fee schedules without gateway charge',async()=>{
   const noShow=await reserve();await pay(noShow)
   await db.query("UPDATE provider.appointment_slots SET slot_start=now()-interval '30 minutes',slot_end=now() WHERE slot_id=$1",[noShow.id])
   await bookings.finishAppointment('doctor',noShow.b.id,'no_show');await payouts.queueDoctorPayouts()
   assert.equal(await db.one('SELECT id FROM doctor_payouts WHERE booking_id=$1',[noShow.b.id]),undefined)
   await db.query("UPDATE provider.doctors SET fee=0 WHERE id='provider'");const free=await reserve();await db.query("UPDATE provider.doctors SET fee=400 WHERE id='provider'")
   assert.equal(free.b.status,'confirmed');assert.equal(free.i.state,'WAIVED');assert.equal(Number((await db.one('SELECT count(*) n FROM payment_orders WHERE invoice_id=$1',[free.i.id])).n),0)
  })
  await t.test('IP rejection before transfer safely retries after setup and uses the current verified destination',async()=>{
   const waiting=await reserve();await pay(waiting);const queued=await complete(waiting),beforePosts=posts;denyBeneficiary=true
   await payouts.processDoctorPayout(queued.id);let row=await db.one('SELECT * FROM doctor_payouts WHERE id=$1',[queued.id]);assert.equal(row.state,'WAITING_SETUP');assert.equal(row.submitted_at,null);assert.equal(posts,beforePosts)
   denyBeneficiary=false;await payouts.bindDoctorBeneficiary('admin','provider','QA_DOCTOR_NEW',true);transferState='SUCCESS';transferCode='COMPLETED'
   await payouts.processDoctorPayout(queued.id);row=await db.one('SELECT * FROM doctor_payouts WHERE id=$1',[queued.id]);assert.equal(row.state,'PAID');assert.equal(row.beneficiary_id,'QA_DOCTOR_NEW');assert.equal(posts,beforePosts+1)
  })
  await t.test('failed payout is visible and cannot automatically send a second transfer',async()=>{
   const failed=await reserve();await pay(failed);const queued=await complete(failed);transferState='FAILED';transferCode='INSUFFICIENT_BALANCE';const beforePosts=posts
   await payouts.processDoctorPayout(queued.id);await payouts.processDoctorPayout(queued.id)
   assert.equal((await db.one('SELECT state FROM doctor_payouts WHERE id=$1',[queued.id])).state,'FAILED');assert.equal(posts,beforePosts+1)
   assert.equal(await db.one('SELECT effect_key FROM financial_effects WHERE effect_key=$1',['payout:'+queued.id]),undefined)
  })
  await t.test('missing payout keys leave a visible obligation without a fake transfer',async()=>{
   const waiting=await reserve();await pay(waiting);const queued=await complete(waiting);process.env.ENABLE_DOCTOR_PAYOUTS='0';const beforePosts=posts;await payouts.processDoctorPayout(queued.id)
   assert.equal(posts,beforePosts);assert.equal((await db.one('SELECT state FROM doctor_payouts WHERE id=$1',[queued.id])).state,'WAITING_SETUP')
  })
 }finally{globalThis.fetch=originalFetch;await db.close();for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env)}
})

test('Cashfree public-key authentication encrypts only the client ID and fresh timestamp',async()=>{
 const env={...process.env},originalFetch=globalThis.fetch,file=path.join(tmpdir(),'carenest-public-key-'+randomUUID()+'.pem')
 const keys=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}})
 Object.assign(process.env,{CARENEST_LOCAL_MODE:'1',CASHFREE_ENV:'sandbox',ENABLE_DOCTOR_PAYOUTS:'1',CASHFREE_PAYOUT_CLIENT_ID:'TEST_SIGNING_FIXTURE',CASHFREE_PAYOUT_CLIENT_SECRET:'fixture-signing-secret',CASHFREE_PAYOUT_PUBLIC_KEY_PATH:file})
 writeFileSync(file,keys.publicKey)
 let calls=0
 globalThis.fetch=async(url,options)=>{
  calls++;assert.ok(String(url).startsWith('https://sandbox.cashfree.com/payout/'))
  const plaintext=privateDecrypt({key:keys.privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha1'},Buffer.from(options.headers['x-cf-signature'],'base64')).toString()
  assert.match(plaintext,/^TEST_SIGNING_FIXTURE\.\d+$/);assert.ok(Math.abs(Date.now()/1000-Number(plaintext.split('.')[1]))<3);assert.ok(!plaintext.includes('fixture-signing-secret'))
  return Response.json({beneficiary_id:'fixture',beneficiary_status:'VERIFIED'})
 }
 try{
  const api=loadServices({})('lib/cashfree-payouts.ts');await api.verifiedBeneficiary('fixture');assert.equal(calls,1)
  writeFileSync(file,keys.privateKey);await assert.rejects(api.verifiedBeneficiary('fixture'),e=>e.code==='PAYOUT_PUBLIC_KEY');assert.equal(calls,1)
  writeFileSync(file,'invalid public key');await assert.rejects(api.verifiedBeneficiary('fixture'),e=>e.code==='PAYOUT_PUBLIC_KEY');assert.equal(calls,1)
  process.env.CASHFREE_ENV='production';await assert.rejects(api.verifiedBeneficiary('fixture'),e=>e.code==='PAYOUT_SETUP')
 }finally{globalThis.fetch=originalFetch;unlinkSync(file);for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env)}
})

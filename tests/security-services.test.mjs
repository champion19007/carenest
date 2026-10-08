import test from 'node:test'
import assert from 'node:assert/strict'
import {freshDb,addUser,addDoctor} from './helpers.mjs'
import {loadServices} from './service-loader.mjs'
test('actual OTP and limiter services enforce atomic challenge and all-key budgets',async t=>{
 process.env.AUTH_SECRET='test-auth-secret-'.repeat(4)
 const db=await freshDb(),load=loadServices(db),otp=load('lib/domain/otp.ts'),rate=load('lib/domain/rate-limit.ts')
 try{
  await t.test('stored OTP is a MAC, correct code can be consumed once',async()=>{
   await otp.issueOtp('9000000001','123456')
   assert.notEqual((await db.one("SELECT code FROM otps WHERE phone='9000000001'")).code,'123456')
   const outcomes=await Promise.all(Array.from({length:8},()=>otp.consumeOtp('9000000001','123456')))
   assert.equal(outcomes.filter(r=>r.ok).length,1)
  })
  await t.test('concurrent guesses cannot exceed five attempts or revive a challenge',async()=>{
   await otp.issueOtp('9000000002','654321')
   await Promise.all(Array.from({length:12},()=>otp.consumeOtp('9000000002','111111')))
   assert.equal((await db.one("SELECT attempts FROM otps WHERE phone='9000000002'")).attempts,5)
   assert.equal((await otp.consumeOtp('9000000002','654321')).ok,false)
  })
  await t.test('denial on one key does not charge another key',async()=>{
   const a={bucket:'one',key:'a',limit:1,seconds:60},b={bucket:'two',key:'b',limit:2,seconds:60}
   assert.equal((await rate.consumeLimits([a])).allowed,true)
   assert.equal((await rate.consumeLimits([a,b])).allowed,false)
   assert.equal((await rate.consumeLimits([b])).remaining,1)
  })
  await t.test('concurrent budget consumption admits exactly its limit',async()=>{
   const outcomes=await Promise.all(Array.from({length:12},()=>rate.consumeLimits([{bucket:'parallel',key:'p',limit:3,seconds:60}])))
   assert.equal(outcomes.filter(r=>r.allowed).length,3)
  })
 }finally{await db.close()}
})
test('actual clinical services reject foreign encounters, malformed prescriptions and failed audits',async t=>{
 process.env.AUTH_SECRET='test-clinical-secret-'.repeat(4)
 const db=await freshDb(),load=loadServices(db),bookings=load('lib/domain/bookings.ts'),clinical=load('lib/domain/clinical.ts')
 try{
  await addUser(db,'patient','9000000001');await addUser(db,'other','9000000002');await addUser(db,'doctor','9000000003','doctor');await addUser(db,'foreign-doctor','9000000004','doctor')
  await db.query("UPDATE patient.users SET kyc_level='verified' WHERE role='doctor'")
  await db.query('UPDATE patient.users SET name=id')
  await addDoctor(db,'provider',{slug:'provider'});await addDoctor(db,'foreign-provider',{slug:'foreign-provider'})
  await db.query("UPDATE provider.doctors SET user_id=CASE id WHEN 'provider' THEN 'doctor' ELSE 'foreign-doctor' END,verified_at=now()")
  await db.query("INSERT INTO provider.appointment_slots(slot_id,doctor_id,slot_start,slot_end) VALUES('clinical-slot','provider',now()+interval '1 hour',now()+interval '75 minutes')")
  const booking=await bookings.requestAppointment({actorId:'patient',doctorId:'provider',slotId:'clinical-slot',mode:'clinic',idempotencyKey:'clinical-booking-request',consent:true})
  await bookings.respondAppointment({actorId:'doctor',bookingId:booking.id,decision:'confirmed'})
  const e=await db.one('SELECT id FROM clinic.encounters WHERE booking_id=$1',[booking.id])
  await bookings.startAppointment('doctor',booking.id)
  await t.test('assigned clinician names are resolved on server; foreign clinician denied',async()=>{
   const id=await clinical.writeClinicalRecord({actorId:'doctor',encounterId:e.id,kind:'chart_notes',body:{complaints:'Test complaint',patientName:'Forged name',doctorName:'Forged clinician'}})
   const row=await db.one('SELECT body FROM documents WHERE id=$1',[id])
   assert.notEqual(row.body.patientName,'Forged name');assert.notEqual(row.body.doctorName,'Forged clinician')
   assert.equal(typeof row.body._encrypted,'string')
   const decoded=(await clinical.readEncounter('doctor',e.id)).records[0].body
   assert.equal(decoded.patientName,'patient')
   assert.equal(decoded.doctorName,'Dr provider')
   await assert.rejects(clinical.readEncounter('foreign-doctor',e.id),err=>err.code==='FORBIDDEN')
   await assert.rejects(clinical.readEncounter('other',e.id),err=>err.code==='FORBIDDEN')
   await assert.rejects(db.query('UPDATE documents SET body=$2 WHERE id=$1',[id,JSON.stringify({changed:true})]),/append-only/)
  })
  await t.test('invalid medicine duration and arbitrary prescription object rejected',async()=>{
   for(const drugs of [{drug:'bad'},[{drug:'Test medicine',dose:'one',frequency:'daily',days:'forever'}]]) await assert.rejects(clinical.writeClinicalRecord({actorId:'doctor',encounterId:e.id,kind:'prescriptions',body:{drugs}}),err=>err.code==='VALIDATION')
  })
  await t.test('patient can read own records, but audit failure prevents returning them',async()=>{
   assert.equal((await clinical.patientRecords('patient')).length,1)
   const failing={...db,transaction:work=>db.transaction(tx=>work({...tx,query:(sql,args)=>{if(sql.startsWith('INSERT INTO audit_log'))throw new Error('audit unavailable');return tx.query(sql,args)}}))}
   await assert.rejects(loadServices(failing)('lib/domain/clinical.ts').patientRecords('patient'),/audit unavailable/)
  })
  await t.test('clinical recipient identity is distinct from the household account owner',async()=>{
   await db.query("INSERT INTO patient.family_members(id,user_id,name,relation) VALUES('child-subject','patient','Fictional child','Child')")
   await db.query("INSERT INTO provider.appointment_slots(slot_id,doctor_id,slot_start,slot_end) VALUES('family-slot','provider',now()+interval '30 minutes',now()+interval '45 minutes')")
   const familyBooking=await bookings.requestAppointment({actorId:'patient',doctorId:'provider',slotId:'family-slot',mode:'clinic',familyId:'child-subject',idempotencyKey:'family-clinical-request-key',consent:true})
   await bookings.respondAppointment({actorId:'doctor',bookingId:familyBooking.id,decision:'confirmed'});await assert.rejects(bookings.startAppointment('doctor',familyBooking.id),err=>err.code==='IN_PROGRESS');await bookings.finishAppointment('doctor',booking.id,'attended');await bookings.startAppointment('doctor',familyBooking.id)
   const encounter=(await db.one('SELECT id FROM clinic.encounters WHERE booking_id=$1',[familyBooking.id])).id
   await clinical.writeClinicalRecord({actorId:'doctor',encounterId:encounter,kind:'chart_notes',body:{complaints:'Fictional family chart test'}})
   const body=(await clinical.readEncounter('doctor',encounter)).records[0].body
   assert.equal(body.patientId,'child-subject');assert.equal(body.subjectId,'child-subject');assert.equal(body.ownerId,'patient');assert.equal(body.patientName,'Fictional child')
  })
  await t.test('repeated clinical save intent produces one immutable record and rejects changed content',async()=>{
   const input={actorId:'doctor',encounterId:e.id,kind:'chart_notes',requestKey:'clinical-save-intent-key',body:{complaints:'One fictional save intent'}}
   const results=await Promise.all([clinical.writeClinicalRecord(input),clinical.writeClinicalRecord(input)])
   assert.equal(results[0],results[1]);assert.equal(Number((await db.one('SELECT count(*) n FROM documents WHERE id=$1',[results[0]])).n),1)
   await assert.rejects(clinical.writeClinicalRecord({...input,body:{complaints:'Different content under the old intent'}}),err=>err.code==='IDEMPOTENCY_CONFLICT')
   assert.equal(Object.hasOwn((await clinical.readEncounter('doctor',e.id)).records.find(r=>r.id===results[0]).body,'_requestHash'),false)
  })
 }finally{await db.close()}
})

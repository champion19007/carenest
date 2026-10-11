import test from 'node:test'
import assert from 'node:assert/strict'
import {freshDb,addUser,addDoctor} from './helpers.mjs'
import {loadServices} from './service-loader.mjs'

test('consultation history reports completed visits without media or foreign records',async t=>{
 process.env.AUTH_SECRET='consultation-history-test-secret-'.repeat(3)
 const db=await freshDb(),load=loadServices(db),history=load('lib/domain/consultation-history.ts'),secrets=load('lib/secrets.ts')
 try{
  await addUser(db,'patient','9000000001');await addUser(db,'other','9000000002');await addUser(db,'doctor','9000000003','doctor')
  await db.query("UPDATE patient.users SET name='Patient name',kyc_level='verified' WHERE id='doctor'")
  await db.query("INSERT INTO clinic.clinics(id,name) VALUES('clinic','Care clinic')")
  await addDoctor(db,'provider',{name:'Dr History',slug:'history-doctor',video:true})
  await db.query("UPDATE provider.doctors SET user_id='doctor',verified_at=now(),clinic_id='clinic' WHERE id='provider'")
  await db.query("INSERT INTO patient.pets(id,owner_id,name,species) VALUES('pet','patient','Milo','dog')")
  await db.query("INSERT INTO patient.family_members(id,user_id,name,relation) VALUES('family','patient','Family member','Mother')")
  const visit=async(id,status='attended',owner='patient',extra={})=>db.query(`INSERT INTO patient.bookings
   (id,user_id,doctor_id,kind,slot,fee,status,starts_at,ends_at,attended_at,patient_for,pet_id)
   VALUES($1,$2,'provider',$3,'legacy time label',600,$4,'2026-01-02T10:00:00Z','2026-01-02T10:30:00Z',CASE WHEN $4='attended' THEN '2026-01-02T10:30:00Z'::timestamptz ELSE NULL END,$5,$6)`,[id,owner,extra.kind??'clinic',status,extra.familyId??null,extra.petId??null])
  await visit('completed-video','attended','patient',{kind:'video'})
  await visit('completed-pet','attended','patient',{petId:'pet'})
  await visit('completed-family','attended','patient',{familyId:'family'})
  for(const status of ['requested','confirmed','cancelled','no_show','expired','declined'])await visit(status,status)
  await visit('foreign','attended','other')

  await t.test('only attended visits appear with doctor and owned human/pet labels',async()=>{
   const result=await history.consultationHistory('patient')
   assert.equal(result.items.length,3);assert.equal(result.next,null)
   assert.ok(result.items.every(v=>v.doctor_name==='Dr History'&&v.clinic==='Care clinic'))
   assert.equal(result.items.find(v=>v.id==='booking:completed-pet').subject_name,'Milo')
   assert.equal(result.items.find(v=>v.id==='booking:completed-pet').subject_kind,'pet')
   assert.equal(result.items.find(v=>v.id==='booking:completed-family').subject_name,'Family member')
   assert.equal(result.items.find(v=>v.id==='booking:completed-video').kind,'video')
   assert.equal((await history.consultationHistory('other')).items.length,1)
   assert.ok(!JSON.stringify(result).includes('person_identity'))
  })

  await t.test('claimed walk-ins join history while unclaimed visits stay private',async()=>{
   for(const[id,owner]of [['claimed','patient'],['unclaimed',null]]){
    await db.query("INSERT INTO clinic.people(id,clinic_id,owner_id,kind,encrypted_identity,created_by,consent_attested_at) VALUES($1,'clinic',$2,'pet',$3,'doctor',now())",[id,owner,secrets.encryptSecret(JSON.stringify({name:'Clinic pet',phone:'9000000001',reason:'Private clinical details'}),'person:'+id)])
    await db.query("INSERT INTO clinic.walk_ins(id,clinic_id,person_id,doctor_id,state,fee_paise,request_key,request_hash,created_by,checked_in_at,ended_at) VALUES($1,'clinic',$1,'provider','ATTENDED',60000,$1,$1,'doctor','2026-01-03T10:00:00Z','2026-01-03T10:30:00Z')",[id])
    await db.query("INSERT INTO clinic.encounters(id,walk_in_id,doctor_id,clinic_person_id,patient_user_id,state) VALUES($1,$1,'provider',$1,$2,'CLOSED')",[id,owner])
   }
   const result=await history.consultationHistory('patient'),walk=result.items.find(v=>v.id==='walk-in:claimed')
   assert.equal(walk.subject_name,'Clinic pet');assert.equal(walk.subject_kind,'pet')
   assert.ok(!result.items.some(v=>v.id==='walk-in:unclaimed'))
   assert.ok(!JSON.stringify(result).includes('Private clinical details'))
   assert.ok(!JSON.stringify(result).includes('9000000001'))
  })

  await t.test('completion appears immediately after the clinician closes the appointment',async()=>{
   await db.query("INSERT INTO provider.appointment_slots(slot_id,doctor_id,slot_start,slot_end) VALUES('finish-slot','provider','2026-01-02T12:00:00Z','2026-01-02T12:30:00Z')")
   await visit('finish-visit','confirmed')
   await db.query("UPDATE patient.bookings SET slot_id='finish-slot' WHERE id='finish-visit'")
   await db.query("UPDATE provider.appointment_slots SET status='BOOKED',reserved_booking_id='finish-visit' WHERE slot_id='finish-slot'")
   assert.ok(!(await history.consultationHistory('patient')).items.some(v=>v.id==='booking:finish-visit'))
   await load('lib/domain/bookings.ts').finishAppointment('doctor','finish-visit','attended')
   assert.ok((await history.consultationHistory('patient')).items.some(v=>v.id==='booking:finish-visit'))
  })

  await t.test('keyset pagination loses no visits with identical timestamps and cannot cross ownership',async()=>{
   for(let i=0;i<25;i++)await visit('older-'+String(i).padStart(2,'0'))
   const ids=[],pages=[];let cursor
   do{const page=await history.consultationHistory('patient',cursor);pages.push(page);ids.push(...page.items.map(v=>v.id));cursor=page.next}while(cursor)
   assert.equal(pages[0].items.length,20);assert.equal(ids.length,30);assert.equal(new Set(ids).size,30)
   assert.ok(!ids.includes('booking:foreign'))
   const cross=await history.consultationHistory('other',pages[0].next)
   assert.ok(cross.items.every(v=>v.id==='booking:foreign'))
  })

  await t.test('invalid cursors and inactive accounts fail without exposing visit details',async()=>{
   for(const cursor of ['***',Buffer.from(JSON.stringify({at:'bad',id:'x'})).toString('base64url'),'a'.repeat(401)])await assert.rejects(history.consultationHistory('patient',cursor),e=>e.code==='CURSOR')
   await assert.rejects(history.consultationHistory('missing'),e=>e.code==='FORBIDDEN')
   await db.query("UPDATE patient.users SET status='SUSPENDED' WHERE id='patient'")
   await assert.rejects(history.consultationHistory('patient'),e=>e.code==='FORBIDDEN')
  })
 }finally{await db.close()}
})

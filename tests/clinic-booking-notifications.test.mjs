import test from 'node:test'
import assert from 'node:assert/strict'
import {freshDb,addUser,addDoctor} from './helpers.mjs'
import {loadServices} from './service-loader.mjs'
test('clinic confirmations are durable, scoped to the current clinician and exclude patient details',async()=>{
 const env={...process.env},db=await freshDb();Object.assign(process.env,{CARENEST_LOCAL_MODE:'1',AUTH_SECRET:'fixture-auth-'.repeat(5),APP_URL:'http://localhost:3000'})
 const load=loadServices(db),bookings=load('lib/domain/bookings.ts'),messages=load('lib/domain/appointment-notifications.ts')
 try{
  await addUser(db,'patient','9000000001');await addUser(db,'doctor-user','9000000002','doctor');await db.query("UPDATE patient.users SET name='Private patient' WHERE id='patient'");await db.query("UPDATE patient.users SET kyc_level='verified' WHERE id='doctor-user'")
  await addDoctor(db,'doctor');await db.query("INSERT INTO clinic.clinics(id,name) VALUES('clinic','Fixture clinic')");await db.query("UPDATE provider.doctors SET user_id='doctor-user',clinic_id='clinic',verified_at=now() WHERE id='doctor'")
  await db.query("INSERT INTO provider.appointment_slots(slot_id,doctor_id,slot_start,slot_end) VALUES('slot','doctor',now()+interval '1 day',now()+interval '1 day 30 minutes')")
  const b=await bookings.requestAppointment({actorId:'patient',doctorId:'doctor',slotId:'slot',mode:'clinic',idempotencyKey:'clinic-notice-fixture',consent:true})
  await bookings.respondAppointment({actorId:'doctor-user',bookingId:b.id,decision:'confirmed'})
  const e=await db.one("SELECT * FROM domain_events WHERE kind='provider.booking_confirmed'");assert.equal(e.payload.userId,'doctor-user')
  const message=await messages.updateMessage('doctor-user',String(e.id));assert.ok(message.appointment.time.includes('IST'));assert.equal(message.appointment.url,'http://localhost:3000/practice/requests');assert.equal(message.text.includes('9000000001'),false);assert.equal(message.text.includes('Private patient'),false)
  await assert.rejects(messages.updateMessage('patient',String(e.id)),error=>error.code==='RECIPIENT')
  await db.query("UPDATE patient.users SET status='SUSPENDED' WHERE id='doctor-user'");assert.equal(await messages.updateMessage('doctor-user',String(e.id)),null)
  await db.query("UPDATE patient.users SET status='ACTIVE' WHERE id='doctor-user'");await db.query("UPDATE patient.bookings SET status='cancelled',revision=revision+1 WHERE id=$1",[b.id]);assert.equal(await messages.updateMessage('doctor-user',String(e.id)),null)
 }finally{await db.close();for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env)}
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {freshDb,addDoctor,addUser} from './helpers.mjs'
import {loadServices} from './service-loader.mjs'

test('actual queue derives only today’s checked-in current reservations',async t=>{
 const db=await freshDb(),queue=loadServices(db)('lib/db/queue.ts')
 try{
  await addDoctor(db,'doctor');await addDoctor(db,'other-doctor');await addUser(db,'patient','9000000001')
  async function visit(id,minutes,doctor='doctor',day=0){
   await db.query("INSERT INTO provider.appointment_slots(slot_id,doctor_id,slot_start,slot_end,status) VALUES($1,$2,(now() AT TIME ZONE 'Asia/Kolkata')::date AT TIME ZONE 'Asia/Kolkata'+($3||' days')::interval+interval '12 hours'+($4||' minutes')::interval,(now() AT TIME ZONE 'Asia/Kolkata')::date AT TIME ZONE 'Asia/Kolkata'+($3||' days')::interval+interval '12 hours'+($4||' minutes')::interval+interval '15 minutes','BOOKED')",['slot-'+id,doctor,String(day),String(minutes)])
   await db.query("INSERT INTO patient.bookings(id,user_id,doctor_id,slot_id,kind,slot,fee,status,starts_at,ends_at,checked_in_at) SELECT $1,'patient',doctor_id,slot_id,'clinic',slot_start,600,'confirmed',slot_start,slot_end,now()+($3||' minutes')::interval FROM provider.appointment_slots WHERE slot_id=$2",[id,'slot-'+id,String(minutes)])
   await db.query('UPDATE provider.appointment_slots SET reserved_booking_id=$2 WHERE slot_id=$1',['slot-'+id,id])
  }
  await visit('first',-30);await visit('second',-15);await visit('mine',0);await visit('tomorrow',0,'doctor',1);await visit('yesterday',0,'doctor',-1);await visit('other',0,'other-doctor')
  await t.test('counts actual checked-in patients ahead and labels estimate freshness',async()=>{
   const result=await queue.queueStatusFor('mine');assert.equal(result.ahead,2);assert.equal(result.estimated,true);assert.ok(Date.parse(result.estimatedStart)>=Date.now()-1000);assert.ok(result.measuredAt)
  })
  await t.test('tomorrow, yesterday, requested and unchecked visits do not get a position',async()=>{
   assert.equal(await queue.queueStatusFor('tomorrow'),undefined);assert.equal(await queue.queueStatusFor('yesterday'),undefined)
   await db.query("UPDATE patient.bookings SET status='requested' WHERE id='mine'");assert.equal(await queue.queueStatusFor('mine'),undefined)
   await db.query("UPDATE patient.bookings SET status='confirmed',checked_in_at=NULL WHERE id='mine'");assert.equal(await queue.queueStatusFor('mine'),undefined)
   await db.query("UPDATE patient.bookings SET checked_in_at=now() WHERE id='mine'")
  })
  await t.test('seen visits and stale reservation joins disappear',async()=>{
   await db.query("UPDATE patient.bookings SET status='attended',started_at=now()-interval '20 minutes',attended_at=now() WHERE id='first'")
   await db.query("UPDATE provider.appointment_slots SET status='ATTENDED' WHERE slot_id='slot-first'")
   assert.equal((await queue.queueStatusFor('mine')).ahead,1)
   await db.query("UPDATE provider.appointment_slots SET reserved_booking_id=NULL WHERE slot_id='slot-second'")
   assert.equal((await queue.queueStatusFor('mine')).ahead,0)
   assert.equal(await queue.queueStatusFor('first'),undefined)
   assert.deepEqual((await queue.queueForDoctor('doctor')).map(r=>r.booking_id),['mine'])
  })
 }finally{await db.close()}
})
import test from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, addUser, addDoctor } from './helpers.mjs'
import { loadServices } from './service-loader.mjs'

test('actual booking service enforces ownership, atomicity, stale reservations and idempotency', async t => {
  process.env.AUTH_SECRET = 'local-service-test-secret-'.repeat(3)
  const db = await freshDb()
  const service = loadServices(db)('lib/domain/bookings.ts')
  try {
    await addUser(db,'patient-a','9000000001'); await addUser(db,'patient-b','9000000002')
    await addUser(db,'clinician','9000000003','doctor')
    await db.query("UPDATE patient.users SET kyc_level='verified' WHERE id='clinician'")
    await addDoctor(db,'doctor',{slug:'doctor-slug',video:true})
    await db.query("UPDATE provider.doctors SET user_id='clinician',verified_at=now() WHERE id='doctor'")
    const slot = async id => db.query("INSERT INTO provider.appointment_slots(slot_id,doctor_id,slot_start,slot_end) VALUES($1,'doctor',now()+interval '4 hours',now()+interval '4 hours 15 minutes')",[id])
    // Unique provider/start requires different timestamps across test slots.
    const insertSlot = async (id,hour) => db.query("INSERT INTO provider.appointment_slots(slot_id,doctor_id,slot_start,slot_end) VALUES($1,'doctor',now()+($2||' hours')::interval,now()+($2||' hours')::interval+interval '15 minutes')",[id,String(hour)])
    const request = (actorId,slotId,key,extra={}) => service.requestAppointment({ actorId,doctorId:'doctor',slotId,mode:'clinic',idempotencyKey:key,consent:true,...extra })
    await insertSlot('primary',4)
    const a = await request('patient-a','primary','original-request-key')
    await t.test('replay returns the same appointment and one committed event',async()=>{
      assert.equal((await request('patient-a','primary','original-request-key')).id,a.id)
      assert.equal(Number((await db.one('SELECT count(*) n FROM domain_events WHERE subject_id=$1',[a.id])).n),1)
      await assert.rejects(request('patient-a','primary','original-request-key',{mode:'video',videoConsent:true}),e=>e.code==='IDEMPOTENCY_CONFLICT')
    })
    await db.query("UPDATE provider.appointment_slots SET locked_until=now()-interval '1 minute' WHERE slot_id='primary'")
    const b = await request('patient-b','primary','replacement-request-key')
    await t.test('expired A cannot confirm or decline B reservation',async()=>{
      assert.equal((await db.one('SELECT status FROM patient.bookings WHERE id=$1',[a.id])).status,'expired')
      for(const decision of ['confirmed','declined']) await assert.rejects(service.respondAppointment({actorId:'clinician',bookingId:a.id,decision}),e=>e.code==='STALE_REQUEST')
      assert.equal((await db.one("SELECT reserved_booking_id FROM provider.appointment_slots WHERE slot_id='primary'")).reserved_booking_id,b.id)
      await service.respondAppointment({actorId:'clinician',bookingId:b.id,decision:'confirmed'})
      assert.equal((await db.one("SELECT status FROM provider.appointment_slots WHERE slot_id='primary'")).status,'BOOKED')
    })
    await insertSlot('foreign-family',5)
    await db.query("INSERT INTO patient.family_members(id,user_id,name,relation) VALUES('family-b','patient-b','Private name','Mother')")
    await t.test('foreign family and unsupported mode rejected before reservation',async()=>{
      await assert.rejects(request('patient-a','foreign-family','foreign-family-request',{familyId:'family-b'}),e=>e.code==='SUBJECT')
      await assert.rejects(request('patient-a','foreign-family','unsupported-mode-request',{mode:'teleport'}),e=>e.code==='MODE')
      assert.equal((await db.one("SELECT status FROM provider.appointment_slots WHERE slot_id='foreign-family'")).status,'AVAILABLE')
    })
    await insertSlot('rollback',6)
    await t.test('outbox failure rolls back appointment and slot hold',async()=>{
      const failing={...db, transaction:work=>db.transaction(tx=>work({...tx, query:(sql,args)=>{
        if(sql.startsWith('INSERT INTO domain_events')) throw new Error('injected event failure')
        return tx.query(sql,args)
      }}))}
      const actual=loadServices(failing)('lib/domain/bookings.ts')
      await assert.rejects(actual.requestAppointment({actorId:'patient-a',doctorId:'doctor',slotId:'rollback',mode:'clinic',idempotencyKey:'rollback-request-key',consent:true}),/injected/)
      assert.equal((await db.one("SELECT status FROM provider.appointment_slots WHERE slot_id='rollback'")).status,'AVAILABLE')
      assert.equal(Number((await db.one("SELECT count(*) n FROM patient.bookings WHERE idempotency_key='rollback-request-key'")).n),0)
    })
    await t.test('failed replacement keeps original confirmed appointment',async()=>{
      const occupied=await request('patient-a','foreign-family','occupy-replacement-key')
      await assert.rejects(service.rescheduleAppointment('patient-b',b.id,'foreign-family',1),e=>e.code==='SLOT_UNAVAILABLE')
      assert.equal((await db.one('SELECT slot_id,status FROM patient.bookings WHERE id=$1',[b.id])).slot_id,'primary')
      assert.equal((await db.one('SELECT reserved_booking_id FROM provider.appointment_slots WHERE slot_id=$1',[occupied.slot_id])).reserved_booking_id,occupied.id)
    })
    await t.test('foreign cancellation fails and own cancellation releases exactly its slot',async()=>{
      await assert.rejects(service.cancelAppointment('patient-a',b.id),e=>e.code==='FORBIDDEN')
      await service.cancelAppointment('patient-b',b.id)
      assert.equal((await db.one("SELECT status FROM provider.appointment_slots WHERE slot_id='primary'")).status,'AVAILABLE')
      assert.equal((await service.cancelAppointment('patient-b',b.id)).status,'cancelled')
    })
    await t.test('suspended practitioner rejected from state transitions and public booking',async()=>{
      await db.query("UPDATE provider.doctors SET status='SUSPENDED' WHERE id='doctor'")
      await assert.rejects(request('patient-a','rollback','suspended-request-key'),e=>e.code==='PROVIDER_UNAVAILABLE')
      const pending=await db.one("SELECT id FROM patient.bookings WHERE status='requested' LIMIT 1")
      await assert.rejects(service.respondAppointment({actorId:'clinician',bookingId:pending.id,decision:'confirmed'}),e=>e.code==='PROVIDER_UNAVAILABLE')
    })
  } finally { await db.close() }
})

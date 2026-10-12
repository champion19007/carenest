import test from 'node:test'
import assert from 'node:assert/strict'
import {jwtVerify} from 'jose'
import {AccessToken,TrackSource} from 'livekit-server-sdk'
import {freshDb,addUser,addDoctor} from './helpers.mjs'
import {loadServices} from './service-loader.mjs'

test('hosted sample video uses paid bookings and a scoped test host without clinical privileges',async t=>{
 const prior={...process.env},db=await freshDb(),rooms=new Map()
 Object.assign(process.env,{CARENEST_LOCAL_MODE:'0',CARENEST_DEMO_BOOKING:'1',ENABLE_PAYMENTS:'1',CASHFREE_ENV:'sandbox',CASHFREE_CLIENT_ID:'TEST_fixture',CASHFREE_CLIENT_SECRET:'fixture',LIVEKIT_URL:'wss://fixture.livekit.cloud',LIVEKIT_API_KEY:'fixture-key',LIVEKIT_API_SECRET:'fixture-video-secret-'.repeat(3),AUTH_SECRET:'hosted-video-fixture-'.repeat(3)})
 delete process.env.CARENEST_DEMO_VIDEO;delete process.env.CARENEST_DEMO_VIDEO_HOST_ID
 class MediaApi{async createRoom(options){assert.equal(options.maxParticipants,2);rooms.set(options.name,{name:options.name,participants:[]});return {name:options.name}}async deleteRoom(name){rooms.delete(name)}async listRooms(){return [...rooms.values()]}async listParticipants(name){return rooms.get(name)?.participants??[]}async removeParticipant(name,id){rooms.get(name).participants=rooms.get(name).participants.filter(p=>p.identity!==id)}}
 const load=loadServices(db,{'livekit-server-sdk':{AccessToken,TrackSource,RoomServiceClient:MediaApi}}),booking=load('lib/domain/bookings.ts'),lk=load('lib/domain/livekit.ts'),video=load('lib/domain/video.ts'),host=load('lib/domain/demo-video.ts'),directory=load('lib/db/sql.ts')
 try{
  for(const [id,phone]of [['patient','9000000051'],['host','9000000052'],['stranger','9000000053']])await addUser(db,id,phone)
  await db.query("INSERT INTO clinic.clinics(id,name) VALUES('demo-clinic','Fictional clinic')")
  for(const id of ['sample','second']){await addDoctor(db,id,{video:true});await db.query("UPDATE provider.doctors SET is_demo=true,verified_at=NULL,user_id=NULL,clinic_id='demo-clinic' WHERE id=$1",[id]);for(const [suffix,offset]of [['soon',5],['later',120]])await db.query("INSERT INTO provider.appointment_slots(slot_id,doctor_id,slot_start,slot_end) VALUES($1,$2,now()+($3::int*interval '1 minute'),now()+(($3::int+30)*interval '1 minute'))",[id+'-'+suffix,id,offset])}
  await db.query('INSERT INTO provider.demo_catalogue_settings(id,enabled) VALUES(1,true)')
  const intent={actorId:'patient',doctorId:'sample',slotId:'sample-soon',mode:'video',paymentRequired:true,consent:true,videoConsent:true,idempotencyKey:'hosted-video-intent'}
  await t.test('video remains unavailable without an explicitly configured active host and separate patient',async()=>{
   assert.equal((await directory.findDoctorBySlug('sample')).video,false);await assert.rejects(booking.requestAppointment(intent),e=>e.code==='DEMO_MODE')
   Object.assign(process.env,{CARENEST_DEMO_VIDEO:'1',CARENEST_DEMO_VIDEO_HOST_ID:'host'});assert.equal((await directory.findDoctorBySlug('sample')).video,true)
   await assert.rejects(booking.requestAppointment({...intent,actorId:'host'}),e=>e.code==='DEMO_HOST')
   await assert.rejects(booking.requestAppointment({...intent,videoConsent:false}),e=>e.code==='CONSENT')
  })
  const b=await booking.requestAppointment(intent)
  await t.test('an unpaid hold cannot join or appear in the host list; host overlap is checked across sample providers',async()=>{
   await assert.rejects(lk.livekitJoin('patient',b.id),e=>e.code==='UNAVAILABLE');assert.equal((await host.demoHostAppointments('host')).length,0)
   await assert.rejects(booking.requestAppointment({...intent,doctorId:'second',slotId:'second-soon',idempotencyKey:'overlap-other-provider'}),e=>e.code==='OVERLAP')
   await db.transaction(async tx=>{await tx.query("UPDATE clinic.invoices SET state='PAID' WHERE booking_id=$1",[b.id]);assert.equal(await booking.confirmPaidAppointment(tx,b),true)})
   b.revision=(await db.one('SELECT revision FROM patient.bookings WHERE id=$1',[b.id])).revision
  })
  await t.test('only the patient and designated test host receive room-scoped media tokens; no clinical role is granted',async()=>{
   await video.provisionVideo(b.id)
   const patient=await lk.livekitJoin('patient',b.id),owner=await lk.livekitJoin('host',b.id),claims=(await jwtVerify(owner.participantToken,new TextEncoder().encode(process.env.LIVEKIT_API_SECRET))).payload
   assert.equal(claims.name,'Demo host');assert.equal(claims.video.roomJoin,true);assert.equal(claims.video.roomRecord,undefined);assert.equal(claims.video.roomAdmin,undefined);assert.equal(claims.exp-claims.nbf,30);assert.deepEqual(claims.video.canPublishSources,['camera','microphone'])
   assert.notEqual(patient.participantToken,owner.participantToken);await assert.rejects(lk.livekitJoin('stranger',b.id),e=>e.code==='UNAVAILABLE')
   await assert.rejects(host.demoHostAppointments('stranger'),e=>e.code==='NOT_FOUND')
   const list=await host.demoHostAppointments('host');assert.equal(list[0].id,b.id);assert.deepEqual(Object.keys(list[0]).sort(),['doctor_name','ends_at','id','starts_at'])
   const account=await db.one("SELECT role,kyc_level FROM patient.users WHERE id='host'");assert.equal(account.role,'patient');assert.notEqual(account.kyc_level,'verified')
   await assert.rejects(booking.finishAppointment('host',b.id,'attended'),e=>['DEMO_CLINICIAN','FORBIDDEN'].includes(e.code))
  })
  await t.test('revoked consent, suspended host, changed host and disabled demo all deny another token',async()=>{
   await db.query("UPDATE patient.consents SET revoked_at=now() WHERE booking_id=$1 AND purpose='video-provider'",[b.id]);await assert.rejects(lk.livekitJoin('host',b.id),e=>e.code==='UNAVAILABLE');await db.query('UPDATE patient.consents SET revoked_at=NULL WHERE booking_id=$1',[b.id])
   await db.query("UPDATE patient.users SET status='SUSPENDED' WHERE id='host'");await assert.rejects(lk.livekitJoin('patient',b.id),e=>e.code==='UNAVAILABLE');await db.query("UPDATE patient.users SET status='ACTIVE' WHERE id='host'")
   process.env.CARENEST_DEMO_VIDEO_HOST_ID='stranger';await assert.rejects(lk.livekitJoin('host',b.id),e=>e.code==='UNAVAILABLE');process.env.CARENEST_DEMO_VIDEO_HOST_ID='host'
   process.env.CARENEST_DEMO_VIDEO='0';await assert.rejects(lk.livekitJoin('patient',b.id),e=>e.code==='UNAVAILABLE');process.env.CARENEST_DEMO_VIDEO='1'
  })
  await t.test('paid rescheduling keeps the original slot on cross-provider host conflict and enforces the join window',async()=>{
   const other=await booking.requestAppointment({...intent,doctorId:'second',slotId:'second-later',idempotencyKey:'other-later-provider'})
   await assert.rejects(booking.rescheduleAppointment('patient',b.id,'sample-later',b.revision),e=>e.code==='OVERLAP');assert.equal((await db.one('SELECT slot_id FROM patient.bookings WHERE id=$1',[b.id])).slot_id,'sample-soon')
   await booking.cancelAppointment('patient',other.id,0)
   await db.query("UPDATE patient.bookings SET starts_at=now()+interval '2 hours',ends_at=now()+interval '3 hours' WHERE id=$1",[b.id]);await assert.rejects(lk.livekitJoin('host',b.id),e=>e.code==='WINDOW')
   await db.query("UPDATE patient.bookings SET starts_at=now()+interval '5 minutes',ends_at=now()+interval '35 minutes' WHERE id=$1",[b.id])
  })
  await t.test('cancellation denies joins and closes the provider room',async()=>{
   await booking.cancelAppointment('patient',b.id,b.revision);await video.cancelVideo(b.id);assert.equal(rooms.size,0);await assert.rejects(lk.livekitJoin('host',b.id),e=>e.code==='UNAVAILABLE')
  })
 }finally{await db.close();for(const key of Object.keys(process.env))if(!(key in prior))delete process.env[key];Object.assign(process.env,prior)}
})

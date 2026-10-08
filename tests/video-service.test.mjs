import test from 'node:test'
import assert from 'node:assert/strict'
import {freshDb,addUser,addDoctor} from './helpers.mjs'
import {loadServices} from './service-loader.mjs'

test('actual meeting adapters use participant scope, reconciliation and cancellation',async t=>{
 process.env.CARENEST_LOCAL_MODE='1';process.env.AUTH_SECRET='video-test-secret-'.repeat(4)
 process.env.GOOGLE_CLIENT_ID='test-google-client';process.env.GOOGLE_CLIENT_SECRET='test-google-secret'
 const db=await freshDb(),load=loadServices(db),video=load('lib/domain/video.ts'),bookings=load('lib/domain/bookings.ts'),secrets=load('lib/secrets.ts'),originalFetch=globalThis.fetch
 try{
  for(const[id,phone,role]of [['patient','9000000001','patient'],['stranger','9000000002','patient'],['doctor','9000000003','doctor']])await addUser(db,id,phone,role)
  await db.query("UPDATE patient.users SET kyc_level='verified' WHERE id='doctor'")
  await addDoctor(db,'provider',{video:true});await db.query("UPDATE provider.doctors SET verified_at=now(),user_id='doctor',video_provider='google'")
  await t.test('unsafe local OAuth origins and foreign state are rejected',async()=>{
   assert.throws(()=>video.integrationOrigin('https://attacker.example'),e=>e.code==='ORIGIN')
   const url=new URL(await video.beginVideoConnection('doctor','google','http://127.0.0.1:3000'))
   assert.equal(url.searchParams.get('code_challenge_method'),'S256')
   await assert.rejects(video.completeVideoConnection('doctor','google','foreign-state','test-code'),e=>e.code==='OAUTH_STATE')
  })
  await t.test('unconnected or unconsented video requests are not accepted',async()=>{
   const input={actorId:'patient',doctorId:'provider',slotId:'slot',mode:'video',idempotencyKey:'video-consent-test-key',consent:true}
   await assert.rejects(bookings.requestAppointment(input),e=>e.code==='CONSENT')
   await assert.rejects(bookings.requestAppointment({...input,videoConsent:true}),e=>e.code==='CONNECTION')
  })
  const insertConnection=async provider=>db.query("INSERT INTO provider.connections(id,user_id,provider,encrypted_tokens,account_ref,expires_at) VALUES($1,'doctor',$2,$3,'test-host',now()+interval '1 hour')",['connection-'+provider,provider,secrets.encryptSecret(JSON.stringify({access_token:'test-access',refresh_token:'test-refresh',expires_in:3600}),'connection:doctor:'+provider)])
  await insertConnection('google')
  async function createVisit(id,minute){
   await db.query("INSERT INTO provider.appointment_slots(slot_id,doctor_id,slot_start,slot_end) VALUES($1,'provider',now()+($2||' minutes')::interval,now()+($2||' minutes')::interval+interval '10 minutes')",[id,String(minute)])
   const b=await bookings.requestAppointment({actorId:'patient',doctorId:'provider',slotId:id,mode:'video',idempotencyKey:id+'-video-request-key',consent:true,videoConsent:true})
   await bookings.respondAppointment({actorId:'doctor',bookingId:b.id,decision:'confirmed'});return b
  }
  const meet=await createVisit('google-slot',5)
  let calls=[],externalId
  globalThis.fetch=async(url,init={})=>{
   calls.push({url:String(url),method:init.method??'GET'})
   if(init.method==='POST'){const body=JSON.parse(init.body);externalId=body.id;return Response.json({id:externalId,conferenceData:{createRequest:{status:{statusCode:'pending'}}}})}
   if(init.method==='DELETE')return new Response(null,{status:204})
   return Response.json({id:externalId,hangoutLink:'https://meet.google.com/test-room'})
  }
  await t.test('Google pending conferences are reconciled without duplicate creates',async()=>{
   await assert.rejects(video.provisionVideo(meet.id),e=>e.code==='CONFERENCE_PENDING')
   await video.provisionVideo(meet.id)
   assert.equal(calls.filter(c=>c.method==='POST').length,1)
   assert.equal(await video.videoJoin('patient',meet.id),'https://meet.google.com/test-room')
   await assert.rejects(video.videoJoin('stranger',meet.id),e=>e.code==='NOT_FOUND')
   await db.query("UPDATE patient.consents SET revoked_at=now() WHERE booking_id=$1 AND purpose='video-provider'",[meet.id])
   await assert.rejects(video.videoJoin('patient',meet.id),e=>e.code==='CONSENT')
   await db.query('UPDATE patient.consents SET revoked_at=NULL WHERE booking_id=$1',[meet.id])
  })
  await t.test('cancelled appointment closes provider resource and denies subsequent joins',async()=>{
   await bookings.cancelAppointment('patient',meet.id);await video.cancelVideo(meet.id)
   assert.equal(calls.filter(c=>c.method==='DELETE').length,1)
   assert.equal((await db.one('SELECT state FROM video_sessions WHERE booking_id=$1',[meet.id])).state,'CANCELLED')
   await assert.rejects(video.videoJoin('patient',meet.id),e=>e.code==='STATE')
  })
  await t.test('cancellation during Google creation cleans up the resource returned late',async()=>{
   const race=await createVisit('google-race-slot',60);let deletes=0,creates=0
   globalThis.fetch=async(url,init={})=>{
    if(init.method==='DELETE'){deletes++;return deletes===1?new Response('',{status:404}):new Response(null,{status:204})}
    creates++;const body=JSON.parse(init.body)
    await bookings.cancelAppointment('patient',race.id);await video.cancelVideo(race.id)
    return Response.json({id:body.id,hangoutLink:'https://meet.google.com/late-room'})
   }
   await video.provisionVideo(race.id)
   assert.equal(creates,1);assert.equal(deletes,2)
   const room=await db.one('SELECT state,external_id FROM video_sessions WHERE booking_id=$1',[race.id])
   assert.equal(room.state,'CANCELLED');assert.equal(room.external_id,null)
  })
 }finally{globalThis.fetch=originalFetch;await db.close()}
})

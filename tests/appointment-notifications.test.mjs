import test from 'node:test'
import assert from 'node:assert/strict'
import {freshDb,addUser,addDoctor} from './helpers.mjs'
import {loadServices} from './service-loader.mjs'

test('appointment scheduling, WhatsApp templates and Gmail respect current bookings and independent delivery',async t=>{
 const env={...process.env},oldFetch=globalThis.fetch,db=await freshDb(),emails=[],whatsapps=[];let smtpLost=false
 Object.assign(process.env,{CARENEST_LOCAL_MODE:'1',AUTH_SECRET:'notification-fixture-'.repeat(4),APP_URL:'http://localhost:3000',MESSAGING_PROVIDER:'fast2sms',FAST2SMS_ENABLED:'1',FAST2SMS_API_KEY:'fixture-key',FAST2SMS_TEST_PHONE:'9000000001',FAST2SMS_LOCAL_DAILY_LIMIT:'20',FAST2SMS_WHATSAPP_PHONE_NUMBER_ID:'12345678',FAST2SMS_WHATSAPP_BOOKING_TEMPLATE:'fixture_booking',FAST2SMS_WHATSAPP_REMINDER_TEMPLATE:'fixture_reminder',EMAIL_ENABLED:'1',EMAIL_PROVIDER:'gmail',GMAIL_SENDER_EMAIL:'fixture.sender@gmail.com',GMAIL_APP_PASSWORD:'a'.repeat(16),EMAIL_LOCAL_DAILY_LIMIT:'20'})
 const load=loadServices(db,{nodemailer:{createTransport:()=>({sendMail:async mail=>{emails.push(mail);if(smtpLost)throw new Error('SMTP acknowledgement lost');return {messageId:mail.messageId,accepted:[mail.to]};},close:()=>{}})}})
 const notices=load('lib/domain/appointment-notifications.ts'),prefs=load('lib/domain/notification-preferences.ts'),mail=load('lib/email.ts'),fast=load('lib/fast2sms.ts'),external=load('lib/notifications.ts')
 const event=async(kind,id,revision=0)=>db.one('INSERT INTO domain_events(kind,subject_id,payload,event_key) VALUES($1,$2,$3::jsonb,$4) RETURNING id',[kind,id,JSON.stringify({userId:'owner',revision}),'fixture:'+kind+':'+id+':'+revision])
 const booking=async(id,status='confirmed',minutes=30,paid=false)=>db.query("INSERT INTO patient.bookings(id,user_id,doctor_id,kind,slot,status,starts_at,ends_at,payment_required) VALUES($1,'owner','doctor','clinic','fixture',$2,now()+($3||' minutes')::interval,now()+($3||' minutes')::interval+interval '30 minutes',$4)",[id,status,String(minutes),paid])
 globalThis.fetch=async(url,options)=>{assert.ok(String(url).startsWith('https://www.fast2sms.com/dev/whatsapp/'));whatsapps.push(JSON.parse(options.body));return Response.json({messages:[{id:'wamid.fixture_'+whatsapps.length}]})}
 try{
  await addUser(db,'owner','9000000001');await addUser(db,'other','9000000002');await addDoctor(db,'doctor')
  await db.query("UPDATE patient.users SET email='fixture.recipient@gmail.com',email_verified_at=now() WHERE id='owner'")
  await prefs.saveNotificationPreferences('owner',true,false,true,true)
  await t.test('only eligible visits are scheduled; concurrent scheduler runs create one durable ten-minute event',async()=>{
   await booking('future');await booking('soon','confirmed',9);await booking('cancelled','cancelled');await booking('unpaid','confirmed',30,true);await booking('requested','requested');await booking('past','confirmed',-5)
   const counts=await Promise.all([notices.scheduleAppointmentReminders(),notices.scheduleAppointmentReminders()]);assert.equal(counts.reduce((a,b)=>a+b,0),2)
   const scheduled=await db.query("SELECT e.subject_id,e.available_at=b.starts_at-interval '10 minutes' precise FROM domain_events e JOIN patient.bookings b ON b.id=e.subject_id WHERE e.kind='booking.reminder_due'")
   assert.deepEqual(scheduled.map(e=>e.subject_id).sort(),['future','soon']);assert.equal(scheduled.find(e=>e.subject_id==='future').precise,true);assert.equal(await notices.scheduleAppointmentReminders(),0)
  })
  await t.test('confirmation contains server-derived doctor, full date, IST time and account link, then sends once per channel',async()=>{
   const e=await event('booking.confirmed','future'),message=await notices.updateMessage('owner',String(e.id))
   assert.match(message.text,/Doctor: Dr doctor/);assert.match(message.text,/IST/);assert.ok(message.appointment.date.includes(String(new Date().getFullYear())));assert.equal(message.appointment.url,'http://localhost:3000/account')
   await external.sendExternalUpdate('owner',String(e.id));assert.equal(emails.length,1);assert.equal(whatsapps.length,1)
   const variables=whatsapps[0].template.components[0].parameters.map(p=>p.text);assert.equal(whatsapps[0].template.name,'fixture_booking');assert.deepEqual(variables,[message.appointment.doctor,message.appointment.date,message.appointment.time,message.appointment.mode,message.appointment.url]);assert.equal(emails[0].to,'fixture.recipient@gmail.com');assert.equal(emails[0].text,message.text)
   await external.sendExternalUpdate('owner',String(e.id));assert.equal(emails.length,1);assert.equal(whatsapps.length,1)
   await assert.rejects(notices.updateMessage('other',String(e.id)),e=>e.code==='RECIPIENT')
  })
  await t.test('due reminder uses its utility template and can send only while the current visit is upcoming',async()=>{
   const e=await db.one("SELECT id FROM domain_events WHERE kind='booking.reminder_due' AND subject_id='soon'")
   await external.sendExternalUpdate('owner',String(e.id));assert.equal(whatsapps.at(-1).template.name,'fixture_reminder');assert.match(emails.at(-1).subject,/reminder/)
   const before=emails.length;await external.sendExternalUpdate('owner',String(e.id));assert.equal(emails.length,before)
   await db.query("UPDATE patient.bookings SET status='cancelled',revision=revision+1 WHERE id='soon'");assert.equal(await notices.updateMessage('owner',String(e.id)),null)
  })
  await t.test('rescheduling invalidates the old reminder; started visits and reminder opt-outs suppress it',async()=>{
   const old=await db.one("SELECT id FROM domain_events WHERE kind='booking.reminder_due' AND subject_id='future'")
   await db.query("UPDATE patient.bookings SET revision=revision+1,starts_at=now()+interval '8 minutes',ends_at=now()+interval '38 minutes' WHERE id='future'")
   assert.equal(await notices.updateMessage('owner',String(old.id)),null);assert.equal(await notices.scheduleAppointmentReminders(),1)
   const next=await db.one("SELECT id FROM domain_events WHERE event_key='booking:future:1:reminder:10min'");assert.ok(await notices.updateMessage('owner',String(next.id)))
   await prefs.saveNotificationPreferences('owner',true,false,false,true);assert.equal(await notices.updateMessage('owner',String(next.id)),null)
   await prefs.saveNotificationPreferences('owner',true,false,true,true);await db.query("UPDATE patient.bookings SET started_at=now() WHERE id='future'");assert.equal(await notices.updateMessage('owner',String(next.id)),null)
  })
  await t.test('WhatsApp failure does not suppress email, and retries cannot send a second accepted email',async()=>{
   await booking('independent');const e=await event('booking.confirmed','independent'),template=process.env.FAST2SMS_WHATSAPP_BOOKING_TEMPLATE;delete process.env.FAST2SMS_WHATSAPP_BOOKING_TEMPLATE
   const before=emails.length;await assert.rejects(external.sendExternalUpdate('owner',String(e.id)),e=>e.code==='FAST2SMS_SETUP');assert.equal(emails.length,before+1)
   await assert.rejects(external.sendExternalUpdate('owner',String(e.id)));assert.equal(emails.length,before+1);process.env.FAST2SMS_WHATSAPP_BOOKING_TEMPLATE=template
  })
  await t.test('lost SMTP receipt is recorded as unknown without blindly duplicating; unverified email and opt-outs are skipped',async()=>{
   await booking('unknown');const e=await event('booking.confirmed','unknown'),before=emails.length;smtpLost=true
   await assert.rejects(mail.sendEmailUpdate('owner',String(e.id)));smtpLost=false;await assert.rejects(mail.sendEmailUpdate('owner',String(e.id)),e=>e.code==='DELIVERY_UNKNOWN');assert.equal(emails.length,before+1)
   assert.equal((await db.one("SELECT state FROM notification_delivery WHERE effect_key=$1",['event:'+e.id+':email'])).state,'UNKNOWN')
   await db.query("UPDATE patient.users SET email_verified_at=NULL WHERE id='owner'");await mail.sendEmailUpdate('owner',String(e.id));assert.equal(emails.length,before+1)
   await prefs.saveNotificationPreferences('owner',false,false,true,false);await mail.sendEmailUpdate('owner',String(e.id));assert.equal(emails.length,before+1)
  })
  await t.test('worker delivers one current in-app reminder and records completion without duplicating it',async()=>{
   await booking('worker-reminder','confirmed',7);await notices.scheduleAppointmentReminders()
   const e=await db.one("SELECT id FROM domain_events WHERE event_key='booking:worker-reminder:0:reminder:10min'")
   const drain=load('lib/drain.ts');await drain.drainAll(30)
   assert.equal((await db.one('SELECT status FROM domain_events WHERE id=$1',[String(e.id)])).status,'SENT')
   assert.equal(Number((await db.one('SELECT count(*) n FROM patient.notifications WHERE event_id=$1',[String(e.id)])).n),1)
   await drain.drainAll(30);assert.equal(Number((await db.one('SELECT count(*) n FROM patient.notifications WHERE event_id=$1',[String(e.id)])).n),1)
  })
 }finally{globalThis.fetch=oldFetch;await db.close();for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env)}
})

test('Google signup, login and explicit linking preserve identity and verified-email ownership',async()=>{
 const db=await freshDb(),google=loadServices(db)('lib/domain/google-identity.ts'),identity={sub:'google_fixture',email:'owner@example.com',name:'Fixture person',emailVerified:true}
 try{
  await addUser(db,'otp-owner','9000000001')
  await assert.rejects(google.acceptGoogleIdentity({...identity,emailVerified:false}),e=>e.code==='GOOGLE_IDENTITY')
  const created=await google.acceptGoogleIdentity(identity);assert.equal(created.isNew,true);assert.ok(created.user.email_verified_at)
  const again=await google.acceptGoogleIdentity(identity);assert.equal(again.isNew,false);assert.equal(again.user.id,created.user.id)
  await assert.rejects(google.acceptGoogleIdentity(identity,'otp-owner'),e=>e.code==='GOOGLE_LINK')
  const linked=await google.acceptGoogleIdentity({...identity,sub:'google_second',email:'second@example.com'},'otp-owner');assert.equal(linked.user.id,'otp-owner');assert.ok(linked.user.email_verified_at)
  await assert.rejects(google.acceptGoogleIdentity({...identity,sub:'google_third',email:'second@example.com'}),e=>e.code==='GOOGLE_LINK')
  await db.query("UPDATE patient.users SET status='SUSPENDED' WHERE id=$1",[created.user.id]);await assert.rejects(google.acceptGoogleIdentity(identity),e=>e.code==='GOOGLE_ACCOUNT')
 }finally{await db.close()}
})

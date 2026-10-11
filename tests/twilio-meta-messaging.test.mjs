import test from 'node:test'
import assert from 'node:assert/strict'
import {freshDb,addUser,addDoctor} from './helpers.mjs'
import {loadServices} from './service-loader.mjs'

function restore(env){for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env)}
test('Twilio Verify uses provider approval, durable intent binding and bounded spending',async t=>{
 const env={...process.env},originalFetch=globalThis.fetch,db=await freshDb(),calls=[]
 Object.assign(process.env,{CARENEST_LOCAL_MODE:'1',AUTH_SECRET:'fixture-secret-'.repeat(5),SMS_PROVIDER:'twilio-verify',TWILIO_VERIFY_ENABLED:'1',TWILIO_VERIFY_LOCAL_DAILY_LIMIT:'10',TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_API_KEY_SID:'SK'+'b'.repeat(32),TWILIO_API_KEY_SECRET:'c'.repeat(32),TWILIO_VERIFY_SERVICE_SID:'VA'+'d'.repeat(32)})
 let serial=0,wrongBinding=false,unknown=false,held=null;const receipts=new Map()
 globalThis.fetch=async(url,options)=>{
  const form=new URLSearchParams(options.body);calls.push({url:String(url),form})
  assert.equal(options.headers.Authorization,'Basic '+Buffer.from(process.env.TWILIO_API_KEY_SID+':'+process.env.TWILIO_API_KEY_SECRET).toString('base64'))
  if(unknown)throw new Error('Network acknowledgement lost')
  if(String(url).endsWith('/Verifications')){
   assert.equal(form.get('Channel'),'sms');assert.equal(form.has('CustomCode'),false)
   const sid='VE'+(++serial).toString(16).padStart(32,'0'),receipt={sid,account_sid:process.env.TWILIO_ACCOUNT_SID,service_sid:process.env.TWILIO_VERIFY_SERVICE_SID,to:form.get('To'),channel:'sms',status:'pending'};receipts.set(sid,receipt);return Response.json(receipt)
  }
  assert.ok(String(url).endsWith('/VerificationCheck'));const result={...receipts.get(form.get('VerificationSid')),status:form.get('Code')==='654321'?'approved':'pending',valid:form.get('Code')==='654321'}
  if(wrongBinding)result.to='+919000000099'
  if(held)await held
  return Response.json(result)
 }
 const load=loadServices(db),verify=load('lib/twilio-verify.ts'),otp=load('lib/domain/otp.ts'),sms=load('lib/sms.ts')
 try{
  await t.test('Verify is selected without a Twilio sender/Auth Token; local codes are invalidated',async()=>{
   assert.equal(sms.smsProviderName(),'twilio-verify');assert.equal(sms.smsIsLive(),false)
   await otp.issueOtp('9000000001','123456','demo');await verify.requestTwilioVerifyOtp('9000000001')
   assert.equal(await db.one("SELECT phone FROM otps WHERE phone='9000000001'"),undefined)
   assert.equal((await verify.consumeTwilioVerifyOtp('9000000001','123456')).ok,false)
   assert.equal((await verify.consumeTwilioVerifyOtp('9000000001','654321')).ok,true)
   const before=calls.length;assert.equal((await verify.consumeTwilioVerifyOtp('9000000001','654321')).ok,false);assert.equal(calls.length,before)
  })
  await t.test('five wrong guesses and local five-minute expiry cannot authenticate',async()=>{
   await verify.requestTwilioVerifyOtp('9000000002')
   for(let i=0;i<5;i++)assert.equal((await verify.consumeTwilioVerifyOtp('9000000002','000000')).ok,false)
   const before=calls.length;assert.equal((await verify.consumeTwilioVerifyOtp('9000000002','654321')).ok,false);assert.equal(calls.length,before)
   await verify.requestTwilioVerifyOtp('9000000003');await db.query("UPDATE phone_verifications SET expires_at=now()-interval '1 second' WHERE phone='9000000003'")
   assert.equal((await verify.consumeTwilioVerifyOtp('9000000003','654321')).ok,false)
  })
  await t.test('approval for another recipient is rejected and never consumed',async()=>{
   await verify.requestTwilioVerifyOtp('9000000004');wrongBinding=true
   await assert.rejects(verify.consumeTwilioVerifyOtp('9000000004','654321'),e=>e.code==='VERIFY_UNKNOWN');wrongBinding=false
   assert.equal((await db.one("SELECT state FROM phone_verifications WHERE phone='9000000004'")).state,'UNKNOWN')
  })
  await t.test('simultaneous checks consume a provider approval once',async()=>{
   await verify.requestTwilioVerifyOtp('9000000005')
   const results=await Promise.all([verify.consumeTwilioVerifyOtp('9000000005','654321'),verify.consumeTwilioVerifyOtp('9000000005','654321')]);assert.equal(results.filter(r=>r.ok).length,1)
  })
  await t.test('an old in-flight approval cannot consume a newer verification intent',async()=>{
   await verify.requestTwilioVerifyOtp('9000000006');let release;held=new Promise(resolve=>release=resolve)
   const old=verify.consumeTwilioVerifyOtp('9000000006','654321')
   while((await db.one("SELECT state FROM phone_verifications WHERE phone='9000000006'")).state!=='CHECKING')await new Promise(resolve=>setTimeout(resolve,1))
   await verify.requestTwilioVerifyOtp('9000000006');release();held=null;assert.equal((await old).ok,false)
   assert.equal((await db.one("SELECT state FROM phone_verifications WHERE phone='9000000006'")).state,'PENDING')
  })
  await t.test('a displayed local OTP invalidates any old Verify intent after a provider switch',async()=>{
   await verify.requestTwilioVerifyOtp('9000000007');await otp.issueOtp('9000000007','123456','demo')
   const before=calls.length;assert.equal((await verify.consumeTwilioVerifyOtp('9000000007','654321')).ok,false);assert.equal(calls.length,before)
  })
  await t.test('the public auth action requests a provider code without generating or exposing a local OTP',async()=>{
   const auth=loadServices(db,{'next/headers':{headers:async()=>new Headers()},'@/lib/auth':{newOtp:()=>{throw new Error('Verify must own the OTP')}}})('app/actions/auth.ts')
   const form=new FormData();form.set('phone','9000000011');form.set('channel','sms')
   const result=await auth.requestOtp({},form);assert.equal(result.phone,'9000000011');assert.equal(result.otpHint,undefined);assert.match(result.notice,/Twilio/)
  })
  await t.test('unknown sends fail closed; the daily cap prevents a third provider request',async()=>{
   await db.query("DELETE FROM rate_limits WHERE bucket='twilio-verify-demo'");process.env.TWILIO_VERIFY_LOCAL_DAILY_LIMIT='2'
   unknown=true;await assert.rejects(verify.requestTwilioVerifyOtp('9000000008'),e=>e.code==='VERIFY_UNKNOWN');unknown=false
   assert.equal((await db.one("SELECT state FROM phone_verifications WHERE phone='9000000008'")).state,'UNKNOWN')
   await verify.requestTwilioVerifyOtp('9000000009');const before=calls.length
   await assert.rejects(verify.requestTwilioVerifyOtp('9000000010'),e=>e.code==='BUDGET');assert.equal(calls.length,before)
  })
 }finally{globalThis.fetch=originalFetch;await db.close();restore(env)}
})

test('Meta transaction and appointment notifications remain independent of Gmail and require approved templates',async t=>{
 const env={...process.env},originalFetch=globalThis.fetch,db=await freshDb(),emails=[],messages=[];let approval='APPROVED',smtpLost=false,metaLost=false,metaRejected=false
 Object.assign(process.env,{CARENEST_LOCAL_MODE:'1',AUTH_SECRET:'fixture-secret-'.repeat(5),APP_URL:'http://localhost:3000',WHATSAPP_PROVIDER:'meta',META_WHATSAPP_ENABLED:'1',META_WHATSAPP_ACCESS_TOKEN:'fixture-token-'.repeat(4),META_WHATSAPP_BUSINESS_ACCOUNT_ID:'123456789',WHATSAPP_PHONE_NUMBER_ID:'987654321',WHATSAPP_TO:'919000000001',WHATSAPP_TEMPLATE_LANG:'en',META_WHATSAPP_GRAPH_VERSION:'v24.0',META_WHATSAPP_LOCAL_DAILY_LIMIT:'20',META_WHATSAPP_BOOKING_TEMPLATE:'carenest_booking',META_WHATSAPP_REMINDER_TEMPLATE:'carenest_reminder',META_WHATSAPP_TRANSACTION_TEMPLATE:'carenest_transaction',META_WHATSAPP_UPDATE_TEMPLATE:'carenest_update',EMAIL_ENABLED:'1',EMAIL_PROVIDER:'gmail',GMAIL_SENDER_EMAIL:'fixture.sender@gmail.com',GMAIL_APP_PASSWORD:'a'.repeat(16),EMAIL_LOCAL_DAILY_LIMIT:'20'})
 const load=loadServices(db,{nodemailer:{createTransport:()=>({sendMail:async mail=>{emails.push(mail);if(smtpLost)throw new Error('SMTP acknowledgement lost');return {messageId:mail.messageId,accepted:[mail.to]}},close:()=>{}})}}),prefs=load('lib/domain/notification-preferences.ts'),meta=load('lib/meta-whatsapp.ts'),external=load('lib/notifications.ts'),notices=load('lib/domain/appointment-notifications.ts')
 globalThis.fetch=async(url,options)=>{
  assert.ok(String(url).startsWith('https://graph.facebook.com/v24.0/'));assert.equal(options.headers.Authorization,'Bearer '+process.env.META_WHATSAPP_ACCESS_TOKEN)
  if(options.method!=='POST'){
   const name=new URL(url).searchParams.get('name'),count=name==='carenest_transaction'?4:name==='carenest_update'?2:5
   return Response.json({data:[{name,status:approval,language:'en',category:'UTILITY',components:[{type:'BODY',text:'CareNest '+Array.from({length:count},(_,i)=>'{{'+(i+1)+'}}').join(' ')+' account details.'}]}]})
  }
  messages.push(JSON.parse(options.body));if(metaLost)throw new Error('Network acknowledgement lost');if(metaRejected)return Response.json({error:{code:190}},{status:401})
  return Response.json({messaging_product:'whatsapp',contacts:[{wa_id:'919000000001'}],messages:[{id:'wamid.fixture_'+messages.length}]})
 }
 const event=async(kind,id,key='fixture:'+id)=>db.one('INSERT INTO domain_events(kind,subject_id,payload,event_key) VALUES($1,$2,$3::jsonb,$4) RETURNING id',[kind,id,JSON.stringify({userId:'owner',revision:0}),key])
 const payment=async id=>{await db.query("INSERT INTO demo_payment_orders(id,user_id,idempotency_key,amount_paise,currency,state,gateway) VALUES($1,'owner',$1,10000,'INR','CAPTURED','cashfree')",[id]);return event('demo.payment_completed',id)}
 try{
  await addUser(db,'owner','9000000001');await addUser(db,'other','9000000002');await addDoctor(db,'doctor')
  await db.query("UPDATE patient.users SET email='fixture.recipient@gmail.com',email_verified_at=now() WHERE id='owner'");await prefs.saveNotificationPreferences('owner',true,false,true,true)
  await t.test('verified sandbox payment generates the same amount/reference in Gmail and approved WhatsApp exactly once',async()=>{
   const e=await payment('demo-paid');await external.sendExternalUpdate('owner',String(e.id))
   assert.equal(emails.length,1);assert.equal(messages.length,1);assert.match(emails[0].text,/100\.00 INR/);assert.match(emails[0].text,/demo-paid/)
   assert.deepEqual(messages[0].template.components[0].parameters.map(p=>p.text),['Sandbox payment received','100.00 INR','demo-paid','http://localhost:3000/account/billing'])
   await external.sendExternalUpdate('owner',String(e.id));assert.equal(emails.length,1);assert.equal(messages.length,1)
   await assert.rejects(notices.updateMessage('other',String(e.id)),e=>e.code==='RECIPIENT')
  })
  await t.test('pending and forged payment events never produce a paid receipt',async()=>{
   const e=await payment('demo-pending');await db.query("UPDATE demo_payment_orders SET state='CREATED' WHERE id='demo-pending'")
   assert.equal(await notices.updateMessage('owner',String(e.id)),null);await external.sendExternalUpdate('owner',String(e.id));assert.equal(emails.length,1);assert.equal(messages.length,1)
   const fake=await event('payment.recorded','missing-invoice');assert.equal(await notices.updateMessage('owner',String(fake.id)),null)
  })
  await t.test('real capture, excess capture and partial refund receipts use their own transaction amount',async()=>{
   await db.query("INSERT INTO patient.bookings(id,user_id,doctor_id,kind,slot,status) VALUES('receipt-booking','owner','doctor','clinic','fixture','confirmed')")
   await db.query("INSERT INTO clinic.invoices(id,booking_id,user_id,total_paise,state) VALUES('receipt-invoice','receipt-booking','owner',25000,'PAID')")
   await db.query("INSERT INTO payment_orders(id,invoice_id,user_id,amount_paise,gateway,state,idempotency_key) VALUES('receipt-payment','receipt-invoice','owner',25000,'cashfree','CAPTURED','receipt-payment')")
   const captured=await event('payment.recorded','receipt-invoice','payment:receipt-payment:captured'),capture=await notices.updateMessage('owner',String(captured.id))
   assert.equal(capture.transaction.amount,'250.00 INR');assert.equal(capture.reference,'receipt-payment');assert.equal(capture.transaction.status,'Payment received')
   await db.query("UPDATE payment_orders SET state='OVERPAYMENT' WHERE id='receipt-payment'");assert.match((await notices.updateMessage('owner',String(captured.id))).transaction.status,/refund review/)
   await db.query("INSERT INTO refunds(id,payment_id,amount_paise,reason,state,requested_by) VALUES('receipt-refund','receipt-payment',10000,'fixture','PROCESSED','owner')")
   const refunded=await event('payment.refunded','receipt-invoice','refund:receipt-refund:processed'),refund=await notices.updateMessage('owner',String(refunded.id))
   assert.equal(refund.transaction.amount,'100.00 INR');assert.equal(refund.reference,'receipt-refund');assert.equal(refund.title,'Refund completed')
   await db.query("UPDATE refunds SET state='REQUESTED' WHERE id='receipt-refund'");assert.equal(await notices.updateMessage('owner',String(refunded.id)),null)
  })
  await t.test('pending Meta approval blocks WhatsApp before spending, while Gmail still sends',async()=>{
   const e=await payment('demo-approval');approval='PENDING';const before=messages.length
   await assert.rejects(external.sendExternalUpdate('owner',String(e.id)),e=>e.code==='META_TEMPLATE');assert.equal(messages.length,before);assert.equal(emails.length,2)
   assert.equal(await db.one("SELECT effect_key FROM notification_delivery WHERE effect_key=$1",['event:'+e.id+':whatsapp']),undefined)
   approval='APPROVED';await external.sendExternalUpdate('owner',String(e.id));assert.equal(messages.length,before+1);assert.equal(emails.length,2)
  })
  await t.test('lost Gmail acknowledgement does not suppress WhatsApp or duplicate an accepted WhatsApp retry',async()=>{
   const e=await payment('demo-smtp-unknown'),before=messages.length;smtpLost=true;await assert.rejects(external.sendExternalUpdate('owner',String(e.id)));smtpLost=false
   assert.equal(messages.length,before+1);await assert.rejects(external.sendExternalUpdate('owner',String(e.id)));assert.equal(messages.length,before+1)
  })
  await t.test('lost Meta acknowledgement is held for review without sending or charging again',async()=>{
   const e=await payment('demo-meta-unknown'),before=messages.length;metaLost=true;await assert.rejects(external.sendExternalUpdate('owner',String(e.id)));metaLost=false
   assert.equal(messages.length,before+1);await assert.rejects(external.sendExternalUpdate('owner',String(e.id)));assert.equal(messages.length,before+1)
   assert.equal((await db.one('SELECT state FROM notification_delivery WHERE effect_key=$1',['event:'+e.id+':whatsapp'])).state,'UNKNOWN')
  })
  await t.test('rejected Meta credentials produce a rejected journal entry and preserve email',async()=>{
   const e=await payment('demo-meta-rejected'),before=emails.length;metaRejected=true;await assert.rejects(external.sendExternalUpdate('owner',String(e.id)));metaRejected=false
   assert.equal(emails.length,before+1);assert.equal((await db.one('SELECT state FROM notification_delivery WHERE effect_key=$1',['event:'+e.id+':whatsapp'])).state,'REJECTED')
  })
  await t.test('Meta demo cannot message a different phone, even if opt-in is present',async()=>{
   const e=await payment('demo-other-phone'),before=messages.length;process.env.WHATSAPP_TO='919000000002'
   await assert.rejects(external.sendExternalUpdate('owner',String(e.id)),e=>e.code==='META_RECIPIENT');assert.equal(messages.length,before);process.env.WHATSAPP_TO='919000000001'
  })
  await t.test('booking date and IST time come from the appointment; ten-minute reminder uses its own template',async()=>{
   await db.query("INSERT INTO patient.bookings(id,user_id,doctor_id,kind,slot,status,starts_at,ends_at) VALUES('meta-booking','owner','doctor','clinic','fixture','confirmed',now()+interval '9 minutes',now()+interval '39 minutes')")
   const e=await event('booking.confirmed','meta-booking');await external.sendExternalUpdate('owner',String(e.id));const values=messages.at(-1).template.components[0].parameters.map(p=>p.text)
   assert.equal(messages.at(-1).template.name,'carenest_booking');assert.equal(values[0],'Dr doctor');assert.match(values[2],/IST/);assert.match(values[3],/Appointment confirmed/)
   await notices.scheduleAppointmentReminders();const reminder=await db.one("SELECT id FROM domain_events WHERE kind='booking.reminder_due' AND subject_id='meta-booking'")
   await external.sendExternalUpdate('owner',String(reminder.id));assert.equal(messages.at(-1).template.name,'carenest_reminder')
   await db.query("UPDATE patient.bookings SET status='cancelled',revision=revision+1 WHERE id='meta-booking'");assert.equal(await notices.updateMessage('owner',String(reminder.id)),null)
  })
  await t.test('hello_world cannot stand in for a payment receipt; consent opt-out skips both channels',async()=>{
   const e=await payment('demo-no-template'),before=messages.length;process.env.META_WHATSAPP_TRANSACTION_TEMPLATE='hello_world'
   await assert.rejects(meta.sendMetaWhatsAppUpdate('owner',String(e.id)),e=>e.code==='META_TEMPLATE');assert.equal(messages.length,before)
   await prefs.saveNotificationPreferences('owner',false,false,true,false);await external.sendExternalUpdate('owner',String(e.id));assert.equal(messages.length,before)
  })
 }finally{globalThis.fetch=originalFetch;await db.close();restore(env)}
})

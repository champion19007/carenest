import test from 'node:test'
import assert from 'node:assert/strict'
import {createHmac} from 'node:crypto'
import {freshDb,addUser} from './helpers.mjs'
import {loadServices} from './service-loader.mjs'

test('Cashfree sandbox checkout and actual WhatsApp sandbox contracts',async t=>{
 const previousEnv={...process.env},previousFetch=globalThis.fetch
 Object.assign(process.env,{CARENEST_LOCAL_MODE:'1',AUTH_SECRET:'messaging-tests-auth-secret-'.repeat(3),ENABLE_PAYMENTS:'1',CASHFREE_ENV:'sandbox',CASHFREE_CLIENT_ID:'TEST_fixture',CASHFREE_CLIENT_SECRET:'fixture-payment-secret',WHATSAPP_SANDBOX_ENABLED:'1',TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_AUTH_TOKEN:'b'.repeat(32),WHATSAPP_FROM:'whatsapp:+14155238886',WHATSAPP_TEST_TO:'+919000000001',WHATSAPP_SANDBOX_WINDOW_EXPIRES_AT:new Date(Date.now()+3600000).toISOString(),WHATSAPP_STATUS_CALLBACK_URL:'https://test.example.invalid/api/webhooks/whatsapp'})
 delete process.env.WHATSAPP_OTP_CONTENT_SID;delete process.env.WHATSAPP_UPDATE_CONTENT_SID
 const db=await freshDb(),load=loadServices(db),payments=load('lib/domain/demo-payments.ts'),wa=load('lib/whatsapp.ts'),prefs=load('lib/domain/notification-preferences.ts'),otp=load('lib/domain/otp.ts')
 let orderCalls=0,messageCalls=0,messageFailure=false,amount=10000,captureStatus='SUCCESS',activeOrder='',lastMessage=''
 globalThis.fetch=async(url,options={})=>{
  const href=String(url)
  if(href==='https://sandbox.cashfree.com/pg/orders'){orderCalls++;const body=JSON.parse(options.body);assert.equal(body.order_amount,100);assert.equal(body.order_currency,'INR');assert.ok(body.order_id.length<=45);assert.match(options.headers['x-idempotency-key'],/^[a-f0-9-]{36}$/);activeOrder=body.order_id;return Response.json({order_id:activeOrder,order_amount:100,order_currency:'INR',order_status:'ACTIVE',payment_session_id:'session_fixture'})}
  if(href==='https://sandbox.cashfree.com/pg/orders/'+activeOrder+'/payments')return Response.json([{cf_payment_id:'12345',order_id:activeOrder,payment_amount:amount/100,payment_currency:'INR',payment_status:captureStatus}]);if(href==='https://sandbox.cashfree.com/pg/orders/'+activeOrder)return Response.json({order_id:activeOrder,order_amount:100,order_currency:'INR',order_status:captureStatus==='SUCCESS'?'PAID':'ACTIVE'})
  if(href.startsWith('https://api.twilio.com/')){
   if(options.method==='POST'){messageCalls++;lastMessage=options.body.get('Body');if(messageFailure)throw new Error('Uncertain network timeout');return Response.json({sid:'SM'+String(messageCalls).padStart(32,'0'),to:'whatsapp:+919000000001',from:process.env.WHATSAPP_FROM,account_sid:process.env.TWILIO_ACCOUNT_SID,status:'queued'})}
   const sid=href.split('/').at(-1).replace('.json','');return Response.json({sid,to:'whatsapp:+919000000001',from:process.env.WHATSAPP_FROM,account_sid:process.env.TWILIO_ACCOUNT_SID,status:'delivered'})
  }
  throw new Error('Unexpected external request in isolated test')
 }
 try{
  await addUser(db,'owner','9000000001');await addUser(db,'other','9000000002')
  let order
  await t.test('test orders derive price on the server, reuse request keys and reject non-local/live configurations',async()=>{
   order=await payments.createDemoPayment('owner','test-order-idempotency-key');assert.equal(order.amountPaise,'10000')
   const repeated=await payments.createDemoPayment('owner','test-order-idempotency-key');assert.equal(repeated.externalOrderId,order.externalOrderId);assert.equal(orderCalls,1)
   process.env.CASHFREE_ENV='production';await assert.rejects(payments.createDemoPayment('owner','live-order-rejected-key'),e=>e.code==='DEMO_DISABLED');process.env.CASHFREE_ENV='sandbox'
   process.env.CARENEST_LOCAL_MODE='0';await assert.rejects(payments.createDemoPayment('owner','non-local-demo-rejected-key'),e=>e.code==='DEMO_DISABLED');process.env.CARENEST_LOCAL_MODE='1'
   await assert.rejects(payments.createDemoPayment('missing','unknown-account-test-key'),e=>e.code==='FORBIDDEN')
  })
  await t.test('ownership, amount and authoritative payment status are checked before marking paid',async()=>{
   await assert.rejects(payments.verifyDemoPayment('other',order.externalOrderId),e=>e.code==='NOT_FOUND')
   amount=100;await assert.rejects(payments.verifyDemoPayment('owner',order.externalOrderId),e=>e.code==='AMOUNT');amount=10000
   captureStatus='PENDING';assert.equal((await payments.verifyDemoPayment('owner',order.externalOrderId)).state,'AWAITING_CAPTURE')
   assert.equal((await db.one('SELECT state FROM demo_payment_orders')).state,'CREATED');captureStatus='SUCCESS'
  })
  await t.test('capture is idempotent, emits one update and never mutates clinic invoices or ledger',async()=>{
   await payments.verifyDemoPayment('owner',order.externalOrderId);await payments.verifyDemoPayment('owner',order.externalOrderId)
   assert.equal((await db.one('SELECT state FROM demo_payment_orders')).state,'CAPTURED')
   assert.equal(Number((await db.one("SELECT count(*) n FROM domain_events WHERE kind='demo.payment_completed'")).n),1)
   assert.equal(Number((await db.one('SELECT count(*) n FROM clinic.invoices')).n),0);assert.equal(Number((await db.one('SELECT count(*) n FROM ledger_entries')).n),0)
   assert.equal((await payments.ownDemoPayments('other')).length,0)
  })
  await t.test('WhatsApp OTP is restricted to the joined phone and codes are not stored in message history',async()=>{
   await assert.rejects(wa.sendWhatsAppOtp('9000000002','123456','wrong-phone-challenge'),e=>e.code==='WHATSAPP_RECIPIENT');assert.equal(messageCalls,0)
   const challenge=await otp.issueOtp('9000000001','123456');await wa.sendWhatsAppOtp('9000000001','123456',challenge);assert.match(lastMessage,/123456/)
   const row=await db.one('SELECT * FROM whatsapp_messages');assert.equal(row.state,'ACCEPTED');assert.equal(JSON.stringify(row).includes('123456'),false)
   assert.equal((await otp.consumeOtp('9000000001','654321')).ok,false);assert.equal((await otp.consumeOtp('9000000001','123456')).ok,true);assert.equal((await otp.consumeOtp('9000000001','123456')).ok,false)
  })
  let receipt
  await t.test('updates need opt-in and retries do not send another WhatsApp message',async()=>{
   const before=messageCalls;await wa.sendWhatsAppUpdate('owner','event-one');assert.equal(messageCalls,before)
   await prefs.saveNotificationPreferences('owner',false,false,true,true)
   receipt=await wa.sendWhatsAppUpdate('owner','event-one');await wa.sendWhatsAppUpdate('owner','event-one');assert.equal(messageCalls,before+1)
   assert.equal(lastMessage.includes('123456'),false);assert.equal(lastMessage.includes('diagnosis'),false)
   assert.equal((await wa.ownWhatsAppMessages('other')).length,0)
   await assert.rejects(wa.refreshWhatsAppStatus('other',receipt),e=>e.code==='NOT_FOUND')
   await prefs.saveNotificationPreferences('owner',false,false,true,false);await wa.sendWhatsAppUpdate('owner','opted-out');assert.equal(messageCalls,before+1)
  })
  await t.test('authentic provider receipt advances delivery; forged and stale callbacks cannot falsify it',async()=>{
   assert.equal(await wa.refreshWhatsAppStatus('owner',receipt),'DELIVERED')
   const row=await db.one('SELECT provider_ref FROM whatsapp_messages WHERE id=$1',[receipt])
   const fields=new URLSearchParams({AccountSid:process.env.TWILIO_ACCOUNT_SID,MessageSid:row.provider_ref,MessageStatus:'sent',To:'whatsapp:+919000000001'})
   await assert.rejects(wa.acceptWhatsAppCallback('http://localhost:3000/api/webhooks/whatsapp',fields,'fake'),e=>e.code==='SIGNATURE')
   const signature=createHmac('sha1',process.env.TWILIO_AUTH_TOKEN).update(process.env.WHATSAPP_STATUS_CALLBACK_URL+[...fields.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+v).join('')).digest('base64')
   await wa.acceptWhatsAppCallback('http://localhost:3000/api/webhooks/whatsapp',fields,signature)
   assert.equal((await db.one('SELECT state FROM whatsapp_messages WHERE id=$1',[receipt])).state,'DELIVERED')
  })
  await t.test('an ambiguous WhatsApp outcome is recorded and never blindly resent',async()=>{
   await prefs.saveNotificationPreferences('owner',false,false,true,true);messageFailure=true;const before=messageCalls
   await assert.rejects(wa.sendWhatsAppUpdate('owner','ambiguous'),e=>e.code==='DELIVERY_UNKNOWN')
   await assert.rejects(wa.sendWhatsAppUpdate('owner','ambiguous'),e=>e.code==='DELIVERY_UNKNOWN');assert.equal(messageCalls,before+1)
   assert.equal((await db.one("SELECT state FROM whatsapp_messages WHERE effect_key='event:ambiguous:whatsapp:owner'")).state,'UNKNOWN');messageFailure=false
  })
  await t.test('the durable worker records the test-payment update even with WhatsApp opted out',async()=>{
   await prefs.saveNotificationPreferences('owner',false,false,true,false)
   const result=await load('lib/drain.ts').drainAll();assert.equal(result.failed,0)
   const updates=await db.query('SELECT title,body FROM patient.notifications WHERE user_id=$1',['owner']);assert.equal(updates.length,1);assert.match(updates[0].title,/Sandbox test/)
  })
 }finally{globalThis.fetch=previousFetch;await db.close();for(const key of Object.keys(process.env))if(!(key in previousEnv))delete process.env[key];Object.assign(process.env,previousEnv)}
})

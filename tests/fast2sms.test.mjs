import test from 'node:test'
import assert from 'node:assert/strict'
import {freshDb,addUser} from './helpers.mjs'
import {loadServices} from './service-loader.mjs'

test('Fast2SMS transports preserve OTP security, dual-channel updates and test credits',async t=>{
 const env={...process.env},oldFetch=globalThis.fetch,db=await freshDb()
 Object.assign(process.env,{CARENEST_LOCAL_MODE:'1',AUTH_SECRET:'fast2sms-fixture-auth-secret-'.repeat(3),MESSAGING_PROVIDER:'fast2sms',SMS_PROVIDER:'fast2sms',FAST2SMS_ENABLED:'1',FAST2SMS_API_KEY:'fixture-only-fast2sms-key',FAST2SMS_TEST_PHONE:'9000000001',FAST2SMS_SMS_OTP_ID:'12345678',FAST2SMS_SMS_SENDER_ID:'TESTER',FAST2SMS_SMS_UPDATE_MESSAGE_ID:'123456',FAST2SMS_WHATSAPP_PHONE_NUMBER_ID:'123456789012345',FAST2SMS_WHATSAPP_OTP_TEMPLATE:'fixture_otp',FAST2SMS_WHATSAPP_UPDATE_TEMPLATE:'fixture_update',FAST2SMS_WHATSAPP_VERSION:'v26.0',FAST2SMS_WHATSAPP_LANGUAGE:'en',FAST2SMS_LOCAL_DAILY_LIMIT:'10'})
 const load=loadServices(db,{'next/headers':{headers:async()=>new Headers(),cookies:async()=>({get:()=>undefined,set:()=>{},delete:()=>{}})},'next/navigation':{redirect:()=>{throw new Error('Unexpected redirect')}}}),api=load('lib/fast2sms.ts'),prefs=load('lib/domain/notification-preferences.ts'),otp=load('lib/domain/otp.ts'),auth=load('app/actions/auth.ts')
 let calls=[],failureChannel=null,timeout=false,badReceipt=false,statusCode=425
 globalThis.fetch=async(url,options)=>{
  assert.ok(String(url).startsWith('https://www.fast2sms.com/dev/'));assert.equal(options.method,'POST');assert.equal(options.headers.Authorization,'fixture-only-fast2sms-key');assert.equal(options.cache,'no-store')
  const body=JSON.parse(options.body),channel=String(url).includes('/whatsapp/')?'whatsapp':'sms';calls.push({channel,body,url:String(url)})
  if(channel===failureChannel){if(timeout)throw new Error('Lost response');return Response.json({return:false,status_code:statusCode,message:'Provider detail must not be echoed with secrets'},{status:400})}
  if(badReceipt)return Response.json({return:true})
  return Response.json(channel==='sms'?{return:true,request_id:'sms_request_'+calls.length}:{messages:[{id:'wamid.fixture_'+calls.length}]})
 }
 const resetBudget=()=>db.query("DELETE FROM rate_limits WHERE bucket='fast2sms-test-messages'")
 try{
  await addUser(db,'owner','9000000001');await addUser(db,'other','9000000002')
  await t.test('missing setup and non-allowlisted update tests never hit the provider',async()=>{
   process.env.FAST2SMS_ENABLED='0';assert.equal(api.fast2smsPairReady(),false);await assert.rejects(api.sendFast2sms('9000000001','sms','OTP','disabled',null,['123456']),e=>e.code==='FAST2SMS_SETUP');process.env.FAST2SMS_ENABLED='1'
   await assert.rejects(api.sendFast2sms('9000000002','sms','UPDATE','foreign','other',['Payment status updated','ref']),e=>e.code==='TEST_RECIPIENT');assert.equal(calls.length,0)
  })
  await t.test('missing OTP ID fails before sending or issuing a code and drops any old demo hint',async()=>{
   const id=process.env.FAST2SMS_SMS_OTP_ID;delete process.env.FAST2SMS_SMS_OTP_ID
   try{
    const form=new FormData();form.set('phone','9000000010');form.set('channel','sms');const before=calls.length
    const result=await auth.requestOtp({phone:'9000000010',notice:'Old demo',otpHint:'123456'},form)
    assert.match(result.error,/not ready/);assert.equal(result.otpHint,undefined);assert.equal(result.notice,undefined);assert.equal(result.phone,undefined);assert.equal(calls.length,before)
    assert.equal(await db.one("SELECT phone FROM otps WHERE phone='9000000010'"),undefined)
   }finally{process.env.FAST2SMS_SMS_OTP_ID=id}
  })
  await t.test('demo codes cannot sign in after switching to phone delivery, and unavailable delivery cannot verify',async()=>{
   let sessions=0
   const verify=loadServices(db,{'@/lib/auth':{...load('lib/auth.ts'),startSession:async()=>{sessions++}},'next/headers':{headers:async()=>new Headers()},'next/navigation':{redirect:url=>{throw new Error('REDIRECT:'+url)}}})('app/actions/auth.ts').verifyOtp
   const form=new FormData();form.set('phone','9000000001');form.set('code','123456');form.set('channel','sms')
   await otp.issueOtp('9000000001','123456','demo');process.env.FAST2SMS_ENABLED='0'
   assert.match((await verify({},form)).error,/not ready/);assert.equal(sessions,0)
   process.env.FAST2SMS_ENABLED='1';assert.match((await verify({},form)).error,/incorrect/);assert.equal(sessions,0)
   await otp.issueOtp('9000000001','123456','phone');await assert.rejects(verify({},form),/REDIRECT:/);assert.equal(sessions,1)
   assert.match((await verify({},form)).error,/expired/);assert.equal(sessions,1)
  })
  await t.test('both channels get one code, SMS expiry is five minutes, and WhatsApp body/button agree',async()=>{
   const challenge=await otp.issueOtp('9000000001','123456');const result=await api.sendFast2smsOtpPair('9000000001','123456',challenge);assert.deepEqual(result.acceptedChannels,['sms','whatsapp'])
   const sms=calls.find(c=>c.channel==='sms').body,wa=calls.find(c=>c.channel==='whatsapp').body
   assert.equal(sms.otp,'123456');assert.equal(sms.otp_expiry,5);assert.equal(sms.otp_length,6);assert.equal(sms.variables_values,'{otp}');assert.equal(wa.to,'919000000001');assert.equal(wa.template.components[0].parameters[0].text,'123456');assert.equal(wa.template.components[1].parameters[0].text,'123456')
   const stored=await db.one('SELECT code FROM otps');assert.notEqual(stored.code,'123456');assert.ok(!(await db.query('SELECT * FROM fast2sms_messages')).some(row=>JSON.stringify(row).includes('123456')))
   assert.equal((await otp.consumeOtp('9000000001','123456')).ok,true);assert.equal((await otp.consumeOtp('9000000001','123456')).ok,false)
   const before=calls.length;await api.sendFast2smsOtpPair('9000000001','123456',challenge);assert.equal(calls.length,before)
  })
  await t.test('real-provider auth action never returns an OTP hint and partial channel acceptance stays verifiable',async()=>{
   await resetBudget();failureChannel='whatsapp';const form=new FormData();form.set('phone','9000000001');form.set('channel','both')
   const state=await auth.requestOtp({},form);assert.equal(state.phone,'9000000001');assert.equal(state.channel,'both');assert.equal(state.otpHint,undefined);assert.match(state.notice,/SMS/)
   const code=calls.filter(c=>c.channel==='sms').at(-1).body.otp;assert.equal((await otp.consumeOtp('9000000001',code,'phone')).ok,true);failureChannel=null
  })
  await t.test('signup/login automatically sends to the submitted number without a test-phone entry',async()=>{
   await resetBudget();delete process.env.FAST2SMS_TEST_PHONE;assert.equal(api.fast2smsPairReady(),true)
   const form=new FormData();form.set('phone','9000000002');form.set('channel','both');const before=calls.length
   const result=await auth.requestOtp({},form);assert.equal(result.phone,'9000000002');assert.equal(result.otpHint,undefined);assert.equal(calls.length,before+2)
   const sms=calls.slice(before).find(c=>c.channel==='sms').body,wa=calls.slice(before).find(c=>c.channel==='whatsapp').body
   assert.equal(sms.mobile,'9000000002');assert.equal(wa.to,'919000000002');assert.equal(sms.otp,wa.template.components[0].parameters[0].text)
   assert.equal((await otp.consumeOtp('9000000002',sms.otp,'phone')).ok,true)
   process.env.FAST2SMS_TEST_PHONE='9000000001'
  })
  await t.test('opted-in payment updates use DLT and utility templates independently and deduplicate retries',async()=>{
   await resetBudget();await prefs.saveNotificationPreferences('owner',false,true,true,true)
   await db.query("INSERT INTO demo_payment_orders(id,user_id,idempotency_key,amount_paise,currency,state,gateway) VALUES('invoice_fixture','owner','fixture-payment',10000,'INR','CAPTURED','cashfree')")
   const event=await db.one("INSERT INTO domain_events(kind,subject_id,payload,event_key) VALUES('demo.payment_completed','invoice_fixture',$1::jsonb,'fixture-payment') RETURNING id",[JSON.stringify({userId:'owner'})]),before=calls.length
   await load('lib/notifications.ts').sendExternalUpdate('owner',String(event.id));assert.equal(calls.length,before+2)
   const sms=calls.at(-2).channel==='sms'?calls.at(-2):calls.at(-1),wa=calls.at(-2).channel==='whatsapp'?calls.at(-2):calls.at(-1)
   assert.equal(sms.body.route,'dlt');assert.equal(sms.body.sender_id,'TESTER');assert.equal(sms.body.message,123456);assert.equal(sms.body.variables_values,'Sandbox payment received|invoice_fixture');assert.equal(wa.body.template.name,'fixture_update');assert.equal(wa.body.template.components.length,1)
   await api.sendFast2smsUpdates('owner',String(event.id));assert.equal(calls.length,before+2);assert.equal((await api.ownFast2smsMessages('owner')).length,2);assert.equal((await api.ownFast2smsMessages('other')).length,0)
   await assert.rejects(api.sendFast2smsUpdates('other',String(event.id)),e=>e.code==='RECIPIENT')
   await prefs.saveNotificationPreferences('owner',false,false,true,false);const silent=await db.one("INSERT INTO domain_events(kind,subject_id,payload,event_key) VALUES('payment.refunded','invoice_fixture',$1::jsonb,'fixture-refund') RETURNING id",[JSON.stringify({userId:'owner'})]);await api.sendFast2smsUpdates('owner',String(silent.id));assert.equal(calls.length,before+2)
  })
  await t.test('one failed update channel does not prevent the other, and a worker retry does not double-charge it',async()=>{
   await resetBudget();await prefs.saveNotificationPreferences('owner',false,true,true,true);failureChannel='whatsapp'
   const event=await db.one("INSERT INTO domain_events(kind,subject_id,payload,event_key) VALUES('account.update_requested','owner',$1::jsonb,'fixture-confirmation') RETURNING id",[JSON.stringify({userId:'owner'})]),before=calls.length
   await assert.rejects(api.sendFast2smsUpdates('owner',String(event.id)));assert.equal(calls.length,before+2)
   await assert.rejects(api.sendFast2smsUpdates('owner',String(event.id)));assert.equal(calls.length,before+2)
   failureChannel=null
  })
  await t.test('SMS-only test update can be queued without enabling WhatsApp or spending credit immediately',async()=>{
   await prefs.saveNotificationPreferences('owner',false,true,true,false)
   const actions=loadServices(db,{'@/lib/auth':{requireUser:async()=>({id:'owner'})},'next/cache':{revalidatePath:()=>{}}})('app/actions/notifications.ts'),before=calls.length
   const result=await actions.requestWhatsAppTest({});assert.match(result.notice,/queued/);assert.equal(calls.length,before)
   const event=await db.one("SELECT * FROM domain_events WHERE kind='account.update_requested' ORDER BY id DESC LIMIT 1");assert.equal(event.payload.userId,'owner')
  })
  await t.test('lost outcomes and absent receipts cannot be blindly retried or labelled delivered',async()=>{
   await resetBudget();failureChannel='sms';timeout=true;const before=calls.length
   await assert.rejects(api.sendFast2sms('9000000001','sms','OTP','lost',null,['654321']),e=>e.code==='DELIVERY_UNKNOWN');await assert.rejects(api.sendFast2sms('9000000001','sms','OTP','lost',null,['654321']),e=>e.code==='DELIVERY_UNKNOWN');assert.equal(calls.length,before+1);assert.equal((await db.one("SELECT state FROM fast2sms_messages WHERE effect_key='sms:OTP:lost'")).state,'UNKNOWN')
   timeout=false;failureChannel=null;badReceipt=true;await assert.rejects(api.sendFast2sms('9000000001','whatsapp','OTP','no-receipt',null,['654321']),e=>e.code==='DELIVERY_UNKNOWN');badReceipt=false
   assert.equal(Number((await db.one("SELECT count(*) n FROM fast2sms_messages WHERE state='DELIVERED'")).n),0)
  })
  await t.test('daily test cap blocks a further charge and approved-template parameters cannot inject more recipients',async()=>{
   await resetBudget();process.env.FAST2SMS_LOCAL_DAILY_LIMIT='2';const before=calls.length
   await api.sendFast2sms('9000000001','sms','OTP','budget1',null,['987654']);await api.sendFast2sms('9000000001','whatsapp','OTP','budget2',null,['987654']);await assert.rejects(api.sendFast2sms('9000000001','sms','OTP','budget3',null,['987654']),e=>e.code==='BUDGET');assert.equal(calls.length,before+2)
   await assert.rejects(api.sendFast2sms('9000000001','sms','UPDATE','inject','owner',['paid|9999999999','ref']),e=>e.code==='MESSAGE')
  })
  await t.test('explicit Quick SMS demo needs no Smart OTP ID, sends one short code and caps all users at two per day',async()=>{
   await resetBudget();process.env.FAST2SMS_LOCAL_DAILY_LIMIT='10';process.env.FAST2SMS_SMS_OTP_ROUTE='quick';process.env.FAST2SMS_QUICK_OTP_DAILY_LIMIT='2'
   const id=process.env.FAST2SMS_SMS_OTP_ID;delete process.env.FAST2SMS_SMS_OTP_ID
   try{
    assert.equal(api.fast2smsReady('sms','OTP'),true);const before=calls.length
    await api.sendFast2sms('9000000001','sms','OTP','quick1',null,['123456']);await api.sendFast2sms('9000000002','sms','OTP','quick2',null,['654321'])
    const message=calls[before];assert.ok(message.url.endsWith('/bulkV2'));assert.equal(message.body.route,'q');assert.equal(message.body.numbers,'9000000001');assert.match(message.body.message,/123456/);assert.ok(message.body.message.length<160);assert.equal(message.body.otp_id,undefined)
    await assert.rejects(api.sendFast2sms('9000000003','sms','OTP','quick3',null,['123456']),e=>e.code==='BUDGET');assert.equal(calls.length,before+2)
    await api.sendFast2sms('9000000001','sms','OTP','quick1',null,['123456']);assert.equal(calls.length,before+2)
    process.env.CARENEST_LOCAL_MODE='0';assert.equal(api.fast2smsReady('sms','OTP'),false)
   }finally{process.env.CARENEST_LOCAL_MODE='1';process.env.FAST2SMS_SMS_OTP_ROUTE='smart';process.env.FAST2SMS_SMS_OTP_ID=id}
  })
 }finally{globalThis.fetch=oldFetch;await db.close();for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env)}
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {freshDb,addUser} from './helpers.mjs'
import {loadServices} from './service-loader.mjs'
test('email sign-in proves only an existing verified identity and never exposes or replays a code',async t=>{
 const env={...process.env},db=await freshDb(),sent=[];let loseReceipt=false
 Object.assign(process.env,{AUTH_SECRET:'fixture-auth-'.repeat(5),CARENEST_LOCAL_MODE:'1',EMAIL_OTP_ENABLED:'1',EMAIL_OTP_LOCAL_DAILY_LIMIT:'10',EMAIL_LOCAL_DAILY_LIMIT:'20',EMAIL_ENABLED:'1',EMAIL_PROVIDER:'gmail',GMAIL_SENDER_EMAIL:'sender@gmail.com',GMAIL_APP_PASSWORD:'a'.repeat(16)})
 const load=loadServices(db,{nodemailer:{createTransport:()=>({sendMail:async mail=>{sent.push(mail);if(loseReceipt)throw new Error('Private SMTP detail');return {messageId:mail.messageId,accepted:[mail.to]}},close:()=>{}})}}),auth=load('lib/domain/email-auth.ts')
 const reset=()=>db.query('DELETE FROM rate_limits'),code=()=>sent.at(-1).text.match(/\b(\d{6})\b/)[1]
 try{
  await addUser(db,'owner','9000000001');await addUser(db,'unverified','9000000002')
  await db.query("UPDATE patient.users SET email='owner@example.test',email_verified_at=now() WHERE id='owner'");await db.query("UPDATE patient.users SET email='unverified@example.test' WHERE id='unverified'")
  await t.test('unknown and unverified emails produce no messages or accounts',async()=>{
   await auth.requestEmailCode('unknown@example.test','fixture');await auth.requestEmailCode('unverified@example.test','fixture');assert.equal(sent.length,0);assert.equal(Number((await db.one('SELECT count(*) n FROM patient.users')).n),2)
  })
  await t.test('stored challenge contains only a MAC; valid concurrent checks sign in once',async()=>{
   await reset();const result=await auth.requestEmailCode('OWNER@example.test','fixture');assert.equal(result,undefined)
   const row=await db.one('SELECT * FROM email_auth_challenges');assert.equal(row.state,'ACCEPTED');assert.notEqual(row.code_mac,code());assert.equal(Object.keys(row).includes('email'),false)
   const results=await Promise.all([auth.consumeEmailCode('owner@example.test',code(),'fixture'),auth.consumeEmailCode('owner@example.test',code(),'fixture')]);assert.equal(results.filter(v=>v==='owner').length,1)
  })
  await t.test('five wrong attempts and expiry prevent authentication',async()=>{
   await reset();await auth.requestEmailCode('owner@example.test','fixture');const wrong=code()==='111111'?'222222':'111111'
   for(let i=0;i<5;i++)assert.equal(await auth.consumeEmailCode('owner@example.test',wrong,'fixture'),null)
   assert.equal(await auth.consumeEmailCode('owner@example.test',code(),'fixture'),null)
   await reset();await auth.requestEmailCode('owner@example.test','fixture');await db.query("UPDATE email_auth_challenges SET expires_at=now()-interval '1 second'");assert.equal(await auth.consumeEmailCode('owner@example.test',code(),'fixture'),null)
  })
  await t.test('changed, unverified and suspended accounts cannot use an earlier code',async()=>{
   for(const change of ["email='changed@example.test'","email_verified_at=NULL","status='SUSPENDED'"]){
    await db.query("UPDATE patient.users SET email='owner@example.test',email_verified_at=now(),status='ACTIVE' WHERE id='owner'");await reset();await auth.requestEmailCode('owner@example.test','fixture');const issued=code();await db.query("UPDATE patient.users SET "+change+" WHERE id='owner'");assert.equal(await auth.consumeEmailCode('owner@example.test',issued,'fixture'),null)
   }
   await db.query("UPDATE patient.users SET email='owner@example.test',email_verified_at=now(),status='ACTIVE' WHERE id='owner'")
  })
  await t.test('unknown SMTP acknowledgement is not considered proof of delivery',async()=>{
   await reset();loseReceipt=true;await auth.requestEmailCode('owner@example.test','fixture');loseReceipt=false;assert.equal((await db.one('SELECT state FROM email_auth_challenges')).state,'UNKNOWN');assert.equal(await auth.consumeEmailCode('owner@example.test',code(),'fixture'),null)
   const nativeFetch=globalThis.fetch;process.env.EMAIL_PROVIDER='resend';process.env.RESEND_API_KEY='fixture-only';process.env.EMAIL_FROM='CareNest <sender@example.test>'
   try{
    const sender=load('lib/email.ts');for(const id of [undefined,null,'',42]){globalThis.fetch=async()=>({ok:true,json:async()=>({id})});await assert.rejects(sender.sendSignInEmail('owner@example.test','123456','fixture-intent'),error=>error.code==='EMAIL_UNKNOWN')}
    globalThis.fetch=async()=>({ok:true,json:async()=>({id:'accepted-fixture'})});await sender.sendSignInEmail('owner@example.test','123456','fixture-intent')
   }finally{globalThis.fetch=nativeFetch;process.env.EMAIL_PROVIDER='gmail'}
  })
  await t.test('local and shared email caps prevent a further provider call; disabling email auth invalidates verification',async()=>{
   await reset();process.env.EMAIL_OTP_LOCAL_DAILY_LIMIT='1';await auth.requestEmailCode('owner@example.test','fixture');const before=sent.length;await db.query("DELETE FROM rate_limits WHERE bucket='email-login-cooldown'")
   await assert.rejects(auth.requestEmailCode('owner@example.test','fixture'),e=>e.code==='BUDGET');assert.equal(sent.length,before)
   process.env.EMAIL_OTP_ENABLED='0';assert.equal(await auth.consumeEmailCode('owner@example.test',code(),'fixture'),null)
  })
 }finally{await db.close();for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env)}
})

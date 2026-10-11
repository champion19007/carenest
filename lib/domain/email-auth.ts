import 'server-only'
import {randomInt,randomUUID,timingSafeEqual} from 'node:crypto'
import {ensureSchema,getDb} from '@/lib/db/client'
import {privateKey,localMode} from '@/lib/secrets'
import {consumeLimits} from './rate-limit'
import {emailConfigured,sendSignInEmail} from '@/lib/email'
import {reject} from './errors'
import {reportError} from '@/lib/observability'
export function normalizeEmail(value:string){const email=value.trim().toLowerCase();return email.length<=254&&/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i.test(email)?email:null}
export function emailCodeConfigured(){return process.env.EMAIL_OTP_ENABLED==='1'&&emailConfigured()}
export async function requestEmailCode(raw:string,network:string){
 const email=normalizeEmail(raw);if(!email)reject('EMAIL','Enter a valid email address.',400)
 if(!emailCodeConfigured())reject('EMAIL_SETUP','Email sign-in is not configured.',503)
 await ensureSchema()
 const limit=await consumeLimits([{bucket:'email-login-cooldown',key:email,limit:1,seconds:60},{bucket:'email-login-address',key:email,limit:5,seconds:3600},{bucket:'email-login-network',key:network,limit:20,seconds:3600}])
 if(!limit.allowed)reject('RATE_LIMIT','Please wait before requesting another email code.',429)
 const user=await getDb().one<{id:string}>("SELECT id FROM patient.users WHERE lower(email)=$1 AND email_verified_at IS NOT NULL AND status='ACTIVE'",[email])
 // No signup, implicit merge or disclosure of whether an email owns an account.
 if(!user)return
 const recipient=privateKey('email-auth-recipient',email),intent=randomUUID(),code=String(randomInt(100000,1000000))
 await getDb().transaction(async tx=>{
  if(localMode()){
   const cap=Number(process.env.EMAIL_OTP_LOCAL_DAILY_LIMIT??2);if(!Number.isInteger(cap)||cap<1||cap>10)reject('BUDGET','Set an email-code demo allowance between one and ten.',503)
   if(!(await consumeLimits([{bucket:'email-auth-demo',key:'global',limit:cap,seconds:86400}],tx)).allowed)reject('BUDGET','The email-code demo allowance was reached.',429)
   const shared=Number(process.env.EMAIL_LOCAL_DAILY_LIMIT??10);if(!Number.isInteger(shared)||shared<1||shared>20)reject('BUDGET','The local email allowance is invalid.',503)
   if(!(await consumeLimits([{bucket:'email-test-messages',key:'global',limit:shared,seconds:86400}],tx)).allowed)reject('BUDGET','The shared email demo allowance was reached.',429)
  }
  await tx.query(`INSERT INTO email_auth_challenges(recipient_hash,user_id,intent_id,code_mac,state,expires_at)
   VALUES($1,$2,$3,$4,'SENDING',now()+interval '5 minutes') ON CONFLICT(recipient_hash) DO UPDATE SET user_id=$2,intent_id=$3,code_mac=$4,state='SENDING',attempts=0,expires_at=now()+interval '5 minutes',created_at=now()`,[recipient,user.id,intent,privateKey('email-auth-code',recipient+':'+intent+':'+code)])
 })
 try{await sendSignInEmail(email,code,intent);await getDb().query("UPDATE email_auth_challenges SET state='ACCEPTED' WHERE recipient_hash=$1 AND intent_id=$2 AND state='SENDING'",[recipient,intent])}
 catch(error){await getDb().query("UPDATE email_auth_challenges SET state='UNKNOWN' WHERE recipient_hash=$1 AND intent_id=$2 AND state='SENDING'",[recipient,intent]);reportError(error,'auth.email_delivery_unknown')}
}
export async function consumeEmailCode(raw:string,code:string,network:string){
 const email=normalizeEmail(raw);if(!email||!/^\d{6}$/.test(code)||!emailCodeConfigured())return null
 await ensureSchema();if(!(await consumeLimits([{bucket:'email-login-check-network',key:network,limit:30,seconds:900}])).allowed)return null
 const recipient=privateKey('email-auth-recipient',email)
 return getDb().transaction(async tx=>{
  const row=await tx.one<{user_id:string;intent_id:string;code_mac:string;attempts:number}>("SELECT * FROM email_auth_challenges WHERE recipient_hash=$1 AND state='ACCEPTED' AND expires_at>now() AND attempts<5 FOR UPDATE",[recipient]);if(!row)return null
  const expected=Buffer.from(row.code_mac,'hex'),actual=Buffer.from(privateKey('email-auth-code',recipient+':'+row.intent_id+':'+code),'hex')
  if(expected.length!==actual.length||!timingSafeEqual(expected,actual)){await tx.query('UPDATE email_auth_challenges SET attempts=attempts+1 WHERE recipient_hash=$1',[recipient]);return null}
  const user=await tx.one<{id:string}>("SELECT id FROM patient.users WHERE id=$1 AND lower(email)=$2 AND email_verified_at IS NOT NULL AND status='ACTIVE' FOR SHARE",[row.user_id,email]);if(!user)return null
  await tx.query("UPDATE email_auth_challenges SET state='CONSUMED' WHERE recipient_hash=$1",[recipient]);return user.id
 })
}

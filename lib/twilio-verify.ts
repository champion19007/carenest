import 'server-only'
import {randomUUID} from 'node:crypto'
import {ensureSchema,getDb} from './db/client'
import {localMode} from './secrets'
import {normalizePhone} from './domain/otp'
import {consumeLimits} from './domain/rate-limit'
import {DomainError,reject} from './domain/errors'

function configuration(){
 const account=process.env.TWILIO_ACCOUNT_SID??'',key=process.env.TWILIO_API_KEY_SID??'',secret=process.env.TWILIO_API_KEY_SECRET??'',service=process.env.TWILIO_VERIFY_SERVICE_SID??''
 if(process.env.TWILIO_VERIFY_ENABLED!=='1'||!/^AC[a-f0-9]{32}$/i.test(account)||!/^SK[a-f0-9]{32}$/i.test(key)||secret.length<16||!/^VA[a-f0-9]{32}$/i.test(service))reject('VERIFY_SETUP','Twilio Verify needs the account, API key and Verify service configured.',503)
 return {account,key,secret,service}
}
export function twilioVerifyConfigured(){try{configuration();return true}catch{return false}}
type Verification={sid?:string;account_sid?:string;service_sid?:string;to?:string;channel?:string;status?:string;valid?:boolean}
async function request(endpoint:string,form:URLSearchParams){
 const c=configuration();let response:Response
 try{response=await fetch(`https://verify.twilio.com/v2/Services/${c.service}/${endpoint}`,{method:'POST',cache:'no-store',redirect:'error',headers:{Authorization:'Basic '+Buffer.from(c.key+':'+c.secret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:form,signal:AbortSignal.timeout(10000)})}
 catch{throw new DomainError('VERIFY_UNKNOWN','Twilio did not return a clear result. Request a new code after the cooldown.',503)}
 if(!response.ok)throw new DomainError(response.status>=500?'VERIFY_UNKNOWN':response.status===404?'VERIFY_EXPIRED':'VERIFY_REJECTED','Twilio could not complete verification. Check trial recipient verification, SMS permissions and the service configuration.',503)
 try{return await response.json() as Verification}catch{throw new DomainError('VERIFY_UNKNOWN','Twilio returned an unreadable verification result.',503)}
}
function matches(body:Verification,phone:string,c:ReturnType<typeof configuration>){return /^VE[a-f0-9]{32}$/i.test(body.sid??'')&&body.account_sid===c.account&&body.service_sid===c.service&&body.to==='+91'+phone&&body.channel==='sms'}
export async function requestTwilioVerifyOtp(rawPhone:string){
 const phone=normalizePhone(rawPhone);if(!phone)reject('PHONE','Enter a valid Indian mobile number.',400)
 const c=configuration();await ensureSchema();const intent=randomUUID()
 await getDb().transaction(async tx=>{
  if(localMode()){
   const cap=Number(process.env.TWILIO_VERIFY_LOCAL_DAILY_LIMIT??2)
   if(!Number.isInteger(cap)||cap<1||cap>10)reject('BUDGET','Choose a Twilio OTP demo cap between one and ten per day.',503)
   const budget=await consumeLimits([{bucket:'twilio-verify-demo',key:'global',limit:cap,seconds:86400}],tx)
   if(!budget.allowed)reject('BUDGET','The daily Twilio OTP demo limit has been reached.',429)
  }
  await tx.query('DELETE FROM otps WHERE phone=$1',[phone])
  await tx.query(`INSERT INTO phone_verifications(phone,intent_id,account_sid,service_sid,state,expires_at)
   VALUES($1,$2,$3,$4,'SENDING',now()+interval '5 minutes') ON CONFLICT(phone) DO UPDATE
   SET intent_id=$2,account_sid=$3,service_sid=$4,provider_sid=NULL,state='SENDING',attempts=0,expires_at=now()+interval '5 minutes',updated_at=now()`,[phone,intent,c.account,c.service])
 })
 try{
  const result=await request('Verifications',new URLSearchParams({To:'+91'+phone,Channel:'sms'}))
  if(!matches(result,phone,c)||result.status!=='pending')reject('VERIFY_UNKNOWN','Twilio returned an unexpected verification receipt.',503)
  const saved=await getDb().one("UPDATE phone_verifications SET provider_sid=$3,state='PENDING',updated_at=now() WHERE phone=$1 AND intent_id=$2 AND state='SENDING' AND expires_at>now() RETURNING phone",[phone,intent,result.sid])
  if(!saved)reject('VERIFY_EXPIRED','A newer sign-in request replaced this code.',409)
 }catch(error){
  await getDb().query("UPDATE phone_verifications SET state=$3,updated_at=now() WHERE phone=$1 AND intent_id=$2 AND state='SENDING'",[phone,intent,error instanceof DomainError&&error.code==='VERIFY_REJECTED'?'FAILED':'UNKNOWN'])
  throw error instanceof DomainError?error:new DomainError('VERIFY_UNKNOWN','Verification outcome needs review.',503)
 }
}
export async function consumeTwilioVerifyOtp(rawPhone:string,code:string){
 const phone=normalizePhone(rawPhone);if(!phone||!/^\d{6}$/.test(code))return {ok:false,reason:'invalid'}
 const c=configuration();await ensureSchema()
 // Claim before contacting Twilio: simultaneous approvals cannot create two sessions.
 const row=await getDb().one<{intent_id:string;provider_sid:string;attempts:number}>(`UPDATE phone_verifications SET state='CHECKING',attempts=attempts+1,updated_at=now()
  WHERE phone=$1 AND state='PENDING' AND attempts<5 AND expires_at>now() AND account_sid=$2 AND service_sid=$3 RETURNING intent_id,provider_sid,attempts`,[phone,c.account,c.service])
 if(!row)return {ok:false,reason:'expired'}
 try{
  const result=await request('VerificationCheck',new URLSearchParams({VerificationSid:row.provider_sid,Code:code}))
  if(!matches(result,phone,c)||result.sid!==row.provider_sid)reject('VERIFY_UNKNOWN','The verification result does not match this sign-in request.',503)
  if(result.status==='approved'&&result.valid===true){
   const consumed=await getDb().one("UPDATE phone_verifications SET state='CONSUMED',updated_at=now() WHERE phone=$1 AND intent_id=$2 AND state='CHECKING' AND expires_at>now() RETURNING phone",[phone,row.intent_id])
   return {ok:Boolean(consumed),reason:consumed?'':'expired'}
  }
  await getDb().query("UPDATE phone_verifications SET state=$3,updated_at=now() WHERE phone=$1 AND intent_id=$2 AND state='CHECKING'",[phone,row.intent_id,result.status==='pending'&&row.attempts<5?'PENDING':'FAILED'])
  return {ok:false,reason:row.attempts>=5?'attempts':result.status==='pending'?'invalid':'expired'}
 }catch(error){
  await getDb().query("UPDATE phone_verifications SET state='UNKNOWN',updated_at=now() WHERE phone=$1 AND intent_id=$2 AND state='CHECKING'",[phone,row.intent_id])
  throw error instanceof DomainError?error:new DomainError('VERIFY_UNKNOWN','Verification outcome needs review.',503)
 }
}

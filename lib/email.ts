import 'server-only'
import nodemailer from 'nodemailer'
import {ensureSchema,getDb} from './db/client'
import {localMode,privateKey} from './secrets'
import {consumeLimits} from './domain/rate-limit'
import {DomainError,reject} from './domain/errors'
import {notificationPreferences} from './domain/notification-preferences'
import {updateMessage} from './domain/appointment-notifications'

export function emailConfigured(){
 if(process.env.EMAIL_ENABLED!=='1')return false
 if(process.env.EMAIL_PROVIDER==='gmail')return /^[^\s@]+@gmail\.com$/i.test(process.env.GMAIL_SENDER_EMAIL??'')&&/^[A-Za-z0-9]{16}$/.test((process.env.GMAIL_APP_PASSWORD??'').replace(/\s/g,''))
 return process.env.EMAIL_PROVIDER==='resend'&&Boolean(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM)
}
export async function sendEmailUpdate(userId:string,eventId:string){
 await ensureSchema()
 const prefs=await notificationPreferences(userId);if(!prefs.email_enabled)return
 const user=await getDb().one<{email:string|null;email_verified_at:string|null}>("SELECT email,email_verified_at FROM patient.users WHERE id=$1 AND status='ACTIVE'",[userId])
 if(!user?.email||!user.email_verified_at)return
 const message=await updateMessage(userId,eventId);if(!message)return
 if(!emailConfigured())reject('EMAIL_SETUP','Booking email sending needs a configured sender.',503)
 const provider=process.env.EMAIL_PROVIDER!,key='event:'+eventId+':email',recipient=privateKey('email-recipient',user.email.toLowerCase())
 const claim=await getDb().transaction(async tx=>{
  const legacy=await tx.one<{state:string;channel:string}>('SELECT state,channel FROM notification_delivery WHERE effect_key=$1 FOR UPDATE',['event:'+eventId+':external'])
  if(legacy?.channel==='email'){
   if(['ACCEPTED','DELIVERED'].includes(legacy.state))return false
   reject('DELIVERY_UNKNOWN','The earlier email uses the previous delivery record and requires review before resending.',503)
  }
  const prior=await tx.one<{state:string;provider:string|null;recipient_hash:string|null;created_at:string;user_id:string|null}>('SELECT * FROM notification_delivery WHERE effect_key=$1 FOR UPDATE',[key])
  if(prior){
   if(prior.user_id!==userId||prior.recipient_hash!==recipient||prior.provider!==provider)reject('DELIVERY_UNKNOWN','The earlier email belongs to different delivery details; review it before resending.',503)
   if(['ACCEPTED','DELIVERED'].includes(prior.state))return false
   if(provider!=='resend'||prior.state!=='RETRYABLE'||Date.now()-new Date(prior.created_at).getTime()>23*3600000)reject('DELIVERY_UNKNOWN','The earlier email requires review before resending.',503)
   const retry=await tx.one("UPDATE notification_delivery SET state='SENDING',updated_at=now() WHERE effect_key=$1 AND state='RETRYABLE' RETURNING effect_key",[key]);return Boolean(retry)
  }
  if(localMode()){
   const cap=Number(process.env.EMAIL_LOCAL_DAILY_LIMIT??10)
   if(!Number.isInteger(cap)||cap<1||cap>20)reject('BUDGET','Choose a local email cap between 1 and 20.',503)
   const budget=await consumeLimits([{bucket:'email-test-messages',key:'global',limit:cap,seconds:86400}],tx);if(!budget.allowed)reject('BUDGET','The local email test limit was reached.',429)
  }
  const row=await tx.one("INSERT INTO notification_delivery(effect_key,channel,state,user_id,recipient_hash,provider) VALUES($1,'email','SENDING',$2,$3,$4) ON CONFLICT DO NOTHING RETURNING effect_key",[key,userId,recipient,provider])
  if(!row)reject('DELIVERY_UNKNOWN','Another worker owns this email.',503)
  return true
 });if(!claim)return
 try{
  let reference:string
  if(provider==='gmail'){
   const sender=process.env.GMAIL_SENDER_EMAIL!,transport=nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user:sender,pass:process.env.GMAIL_APP_PASSWORD!.replace(/\s/g,'')},connectionTimeout:8000,greetingTimeout:8000,socketTimeout:10000,logger:false,debug:false})
   try{
    const result=await transport.sendMail({from:{name:'CareNest',address:sender},to:user.email,subject:'CareNest: '+message.title,text:message.text,messageId:`<${privateKey('email-message-id',key)}@gmail.com>`})
    if(!result.messageId||!result.accepted.some((address:unknown)=>String(address).toLowerCase()===user.email!.toLowerCase()))reject('DELIVERY_UNKNOWN','Gmail accepted no matching recipient receipt.',503)
    reference=result.messageId
   }finally{transport.close()}
  }else{
   const response=await fetch('https://api.resend.com/emails',{method:'POST',cache:'no-store',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[user.email],subject:'CareNest: '+message.title,text:message.text}),signal:AbortSignal.timeout(10000)})
   if(!response.ok)reject('DELIVERY_REJECTED','Email provider rejected the request.',503)
   const body=await response.json() as {id?:string};if(!body.id)reject('DELIVERY_UNKNOWN','Email receipt missing.',503);reference=body.id
  }
  await getDb().query("UPDATE notification_delivery SET state='ACCEPTED',provider_ref=$2,updated_at=now() WHERE effect_key=$1",[key,reference])
 }catch(error){
  // SMTP has no idempotency guarantee: a lost acknowledgement needs review.
  // Resend retries retain the same idempotency key within its 24-hour window.
  await getDb().query('UPDATE notification_delivery SET state=$2,error_code=$3,updated_at=now() WHERE effect_key=$1',[key,provider==='resend'?'RETRYABLE':'UNKNOWN',error instanceof DomainError?error.code:'EMAIL_PROVIDER_FAILED'])
  throw new DomainError('EMAIL_PROVIDER_FAILED','Email sending needs provider review. No delivery is claimed.',503)
 }
}

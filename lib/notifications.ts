import 'server-only'
import {getDb} from './db/client'
import {localMode} from './secrets'
import {smsIsLive,sendTransactionalSms} from './sms'
import {DomainError} from './domain/errors'
import {notificationPreferences} from './domain/notification-preferences'
export async function sendExternalUpdate(userId:string,eventId:string){
 if(localMode())return
 const user=await getDb().one<{phone:string|null;email:string|null;email_verified_at:string|null}>("SELECT phone,email,email_verified_at FROM patient.users WHERE id=$1 AND status='ACTIVE'",[userId])
 if(!user)return
 const key='event:'+eventId+':external',prior=await getDb().one<{state:string;channel:string;updated_at:string}>('SELECT state,channel,updated_at FROM notification_delivery WHERE effect_key=$1',[key])
 if(prior?.state==='ACCEPTED'||prior?.state==='DELIVERED')return
 const preferences=await notificationPreferences(userId)
 const email=Boolean(preferences.email_enabled&&user.email&&user.email_verified_at&&process.env.RESEND_API_KEY&&process.env.EMAIL_FROM),sms=Boolean(preferences.sms_enabled&&user.phone&&smsIsLive())
 if(!email&&!sms)return
 if(prior&&['SENDING','UNKNOWN','RETRYABLE'].includes(prior.state)&&(prior.channel!==(email?'email':'sms')||(email&&Date.now()-new Date(prior.updated_at).getTime()>23*3600000)))throw new DomainError('DELIVERY_UNKNOWN','The earlier delivery requires reconciliation before changing channel or retrying outside the provider idempotency window.',503)
 if((prior?.state==='SENDING'||prior?.state==='UNKNOWN')&&!email)throw new DomainError('DELIVERY_UNKNOWN','An earlier SMS outcome needs reconciliation.',503)
 await getDb().query("INSERT INTO notification_delivery(effect_key,channel,state) VALUES($1,$2,'SENDING') ON CONFLICT(effect_key) DO NOTHING",[key,email?'email':'sms'])
 try{
  let reference:string
  if(email){
   const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[user.email],subject:'CareNest account update',text:'An update is available in your CareNest account. Sign in to review it. No clinical details are included in this email.'}),signal:AbortSignal.timeout(10000)})
   if(!response.ok)throw new DomainError('DELIVERY_REJECTED','Message provider rejected the request.',503)
   const result=await response.json() as {id?:string};if(!result.id)throw new DomainError('DELIVERY_UNKNOWN','Message receipt missing.',503);reference=result.id
  }else reference=await sendTransactionalSms(user.phone!,'An update is available in your CareNest account. Sign in to review it.')
  await getDb().query("UPDATE notification_delivery SET state='ACCEPTED',provider_ref=$2,updated_at=now() WHERE effect_key=$1",[key,reference])
 }catch(error){await getDb().query("UPDATE notification_delivery SET state=$2,error_code=$3,updated_at=now() WHERE effect_key=$1",[key,email?'RETRYABLE':'UNKNOWN',error instanceof DomainError?error.code:'DELIVERY_UNKNOWN']);throw error}
}

import 'server-only'
import {randomUUID} from 'node:crypto'
import {ensureSchema,getDb} from './db/client'
import {privateKey,localMode} from './secrets'
import {normalizePhone} from './domain/otp'
import {consumeLimits} from './domain/rate-limit'
import {notificationPreferences} from './domain/notification-preferences'
import {DomainError,reject} from './domain/errors'
import {updateMessage} from './domain/appointment-notifications'

type Channel='sms'|'whatsapp'
type Purpose='OTP'|'UPDATE'
const numeric=(value?:string)=>Boolean(value&&/^\d{1,32}$/.test(value))
const templateName=(value?:string)=>Boolean(value&&/^[a-z0-9_]{1,100}$/.test(value))
export const fast2smsSelected=()=>process.env.MESSAGING_PROVIDER==='fast2sms'
export const fast2smsQuickOtp=()=>process.env.FAST2SMS_SMS_OTP_ROUTE==='quick'
type AppointmentTemplate='BOOKING'|'REMINDER'
export function fast2smsReady(channel:Channel,purpose:Purpose,appointmentTemplate?:AppointmentTemplate){
 if(process.env.FAST2SMS_ENABLED!=='1'||!process.env.FAST2SMS_API_KEY?.trim())return false
 // Signup/login targets the number entered by the user. The local allowlist
 // applies only to optional update tests, never to authentication recipients.
 if(localMode()&&purpose==='UPDATE'&&!normalizePhone(process.env.FAST2SMS_TEST_PHONE??''))return false
 if(channel==='sms')return purpose==='OTP'?(fast2smsQuickOtp()?localMode():numeric(process.env.FAST2SMS_SMS_OTP_ID)):Boolean(/^[A-Za-z]{3,6}$/.test(process.env.FAST2SMS_SMS_SENDER_ID??'')&&/^\d{1,15}$/.test(process.env.FAST2SMS_SMS_UPDATE_MESSAGE_ID??''))
 return numeric(process.env.FAST2SMS_WHATSAPP_PHONE_NUMBER_ID)&&templateName(process.env[appointmentTemplate?'FAST2SMS_WHATSAPP_'+appointmentTemplate+'_TEMPLATE':purpose==='OTP'?'FAST2SMS_WHATSAPP_OTP_TEMPLATE':'FAST2SMS_WHATSAPP_UPDATE_TEMPLATE'])&&/^v\d+\.0$/.test(process.env.FAST2SMS_WHATSAPP_VERSION??'v26.0')&&/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(process.env.FAST2SMS_WHATSAPP_LANGUAGE??'en')
}
export const fast2smsPairReady=()=>fast2smsReady('sms','OTP')&&fast2smsReady('whatsapp','OTP')
function recipient(phone:string,purpose:Purpose){
 const digits=normalizePhone(phone);if(!digits)reject('PHONE','Use one valid Indian mobile number.',400)
 if(localMode()&&purpose==='UPDATE'&&digits!==normalizePhone(process.env.FAST2SMS_TEST_PHONE??''))reject('TEST_RECIPIENT','Local update tests are restricted to the configured test phone.',400)
 return digits
}
async function request(endpoint:string,body:unknown){
 let response:Response
 try{response=await fetch('https://www.fast2sms.com/dev/'+endpoint,{method:'POST',cache:'no-store',headers:{Authorization:process.env.FAST2SMS_API_KEY!,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)})}
 catch{throw new DomainError('DELIVERY_UNKNOWN','Fast2SMS could not confirm the outcome. Review the provider before sending again.',503)}
 const data=await response.json().catch(()=>null)
 if(!response.ok||data?.return===false){
  const status=Number(data?.status_code)
  const message=status===996?'Complete Fast2SMS OTP KYC.':status===999?'Fast2SMS requires its minimum paid wallet transaction before sending.':status===416?'Fast2SMS wallet balance is insufficient.':'Fast2SMS rejected this message. Check the approved templates and account setup.'
  throw new DomainError(response.status>=500?'DELIVERY_UNKNOWN':'DELIVERY_REJECTED',message,503)
 }
 if(!data)throw new DomainError('DELIVERY_UNKNOWN','Provider receipt could not be read.',503)
 return data
}
function payload(channel:Channel,purpose:Purpose,digits:string,values:string[],appointmentTemplate?:AppointmentTemplate){
 if(channel==='sms')return purpose==='OTP'?(fast2smsQuickOtp()?{route:'q',numbers:digits,message:`${values[0]} is your CareNest sign-in code. Valid for 5 minutes. Do not share it.`,sms_details:'1'}:{otp_id:process.env.FAST2SMS_SMS_OTP_ID,mobile:digits,otp:values[0],otp_length:6,otp_expiry:5,variables_values:'{otp}'}):{route:'dlt',sender_id:process.env.FAST2SMS_SMS_SENDER_ID,message:Number(process.env.FAST2SMS_SMS_UPDATE_MESSAGE_ID),variables_values:values.join('|'),numbers:digits}
 const body={type:'body',parameters:values.map(text=>({type:'text',text}))}
 const components:unknown[]=[body]
 if(purpose==='OTP')components.push({type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:values[0]}]})
 return {messaging_product:'whatsapp',recipient_type:'individual',to:'91'+digits,type:'template',template:{name:process.env[appointmentTemplate?'FAST2SMS_WHATSAPP_'+appointmentTemplate+'_TEMPLATE':purpose==='OTP'?'FAST2SMS_WHATSAPP_OTP_TEMPLATE':'FAST2SMS_WHATSAPP_UPDATE_TEMPLATE'],language:{code:process.env.FAST2SMS_WHATSAPP_LANGUAGE??'en'},components}}
}
export async function sendFast2sms(phone:string,channel:Channel,purpose:Purpose,effect:string,userId:string|null,values:string[],appointmentTemplate?:AppointmentTemplate){
 if(appointmentTemplate&&(channel!=='whatsapp'||purpose!=='UPDATE'))reject('MESSAGE','Appointment templates are for WhatsApp updates.',400)
 if(!fast2smsReady(channel,purpose,appointmentTemplate))reject('FAST2SMS_SETUP','Fast2SMS needs approved templates and activation before sending. Local update tests also need a configured test phone.',503)
 const digits=recipient(phone,purpose)
 if(!effect||effect.length>200||values.length!==(purpose==='OTP'?1:appointmentTemplate?5:2)||values.some(v=>typeof v!=='string'||!v||v.length>(appointmentTemplate?500:100)||/[|\r\n]/.test(v)))reject('MESSAGE','Invalid notification parameters.',400)
 if(purpose==='OTP'&&!/^\d{6}$/.test(values[0]))reject('OTP','Invalid sign-in challenge.',400)
 const key=channel+':'+purpose+':'+effect
 await ensureSchema()
 const claim=await getDb().transaction(async tx=>{
  const prior=await tx.one<{id:string;state:string;provider_ref:string|null;recipient_hash:string;user_id:string|null}>('SELECT * FROM fast2sms_messages WHERE effect_key=$1',[key])
  if(prior){if(prior.recipient_hash!==privateKey('fast2sms-recipient',digits)||prior.user_id!==userId)reject('IDEMPOTENCY','This delivery belongs to different details.');if(prior.state==='ACCEPTED'&&prior.provider_ref)return {id:prior.id,reference:prior.provider_ref};reject('DELIVERY_UNKNOWN','The previous message outcome requires review. It will not be charged again automatically.',503)}
  const limit=Number(process.env.FAST2SMS_LOCAL_DAILY_LIMIT??10)
  if(localMode()){
   if(!Number.isInteger(limit)||limit<1||limit>20)reject('BUDGET','Use a local daily cap between 1 and 20 messages.',503)
   const budget=await consumeLimits([{bucket:'fast2sms-test-messages',key:'global',limit,seconds:86400}],tx);if(!budget.allowed)reject('BUDGET','The local Fast2SMS message cap was reached. No more credits will be used today.',429)
   if(channel==='sms'&&purpose==='OTP'&&fast2smsQuickOtp()){
    const cap=Number(process.env.FAST2SMS_QUICK_OTP_DAILY_LIMIT??2)
    if(!Number.isInteger(cap)||cap<1||cap>2)reject('BUDGET','Quick SMS demo allows at most two OTP messages per day.',429)
    const quick=await consumeLimits([{bucket:'fast2sms-quick-otp',key:'global',limit:cap,seconds:86400}],tx);if(!quick.allowed)reject('BUDGET','The two-per-day Quick SMS demo limit was reached.',429)
   }
  }
  const id='f2_'+randomUUID()
  const inserted=await tx.one('INSERT INTO fast2sms_messages(id,user_id,effect_key,channel,purpose,recipient_hash) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(effect_key) DO NOTHING RETURNING id',[id,userId,key,channel,purpose,privateKey('fast2sms-recipient',digits)])
  if(!inserted)reject('DELIVERY_UNKNOWN','Another worker owns this delivery. Review its outcome.',503)
  return {id,reference:null as string|null}
 })
 if(claim.reference)return claim.reference
 try{
  const endpoint=channel==='sms'?(purpose==='OTP'&&!fast2smsQuickOtp()?'otp/send':'bulkV2'):`whatsapp/${process.env.FAST2SMS_WHATSAPP_VERSION??'v26.0'}/${process.env.FAST2SMS_WHATSAPP_PHONE_NUMBER_ID}/messages`
  const data=await request(endpoint,payload(channel,purpose,digits,values,appointmentTemplate))
  const ref=channel==='sms'?(data.return===true?data.request_id:null):(data.messages?.[0]?.id??data.response?.messages?.[0]?.id)
  if(typeof ref!=='string'||!ref||ref.length>300)reject('DELIVERY_UNKNOWN','Fast2SMS accepted no verifiable receipt. Check the account before retrying.',503)
  await getDb().query("UPDATE fast2sms_messages SET state='ACCEPTED',provider_ref=$2,updated_at=now() WHERE id=$1",[claim.id,ref])
  return ref
 }catch(error){await getDb().query("UPDATE fast2sms_messages SET state=$2,error_code=$3,updated_at=now() WHERE id=$1",[claim.id,error instanceof DomainError&&error.code==='DELIVERY_REJECTED'?'FAILED':'UNKNOWN',error instanceof DomainError?error.code:'DELIVERY_UNKNOWN']);throw error}
}
export async function sendFast2smsOtpPair(phone:string,code:string,challenge:string){
 if(!fast2smsPairReady())reject('FAST2SMS_SETUP','Approve and configure both OTP channels first.',503)
 const results=await Promise.allSettled((['sms','whatsapp'] as const).map(channel=>sendFast2sms(phone,channel,'OTP','otp:'+challenge,null,[code])))
 const channels=(['sms','whatsapp'] as const).filter((_,i)=>results[i].status==='fulfilled')
 if(!channels.length)reject('DELIVERY_UNKNOWN','Neither channel could accept this code. Review Fast2SMS before requesting another.',503)
 return {acceptedChannels:channels}
}
export async function sendFast2smsUpdates(userId:string,eventId:string){
 await ensureSchema();const prefs=await notificationPreferences(userId)
 const user=await getDb().one<{phone:string|null}>("SELECT phone FROM patient.users WHERE id=$1 AND status='ACTIVE'",[userId]);if(!user?.phone)return
 const event=await getDb().one<{kind:string;subject_id:string|null;payload:Record<string,unknown>}>('SELECT kind,subject_id,payload FROM domain_events WHERE id=$1',[eventId]);if(!event||event.payload.userId!==userId)reject('RECIPIENT','Notification ownership does not match.',403)
 const message=await updateMessage(userId,eventId);if(!message)return
 const channels:Channel[]=[];if(prefs.sms_enabled)channels.push('sms');if(prefs.whatsapp_enabled)channels.push('whatsapp')
 const appointmentTemplate=message.appointment&&(event.kind==='booking.confirmed'||message.reminder)?message.reminder?'REMINDER':'BOOKING':undefined
 const result=await Promise.allSettled(channels.map(channel=>{
  const a=message.appointment
  return channel==='whatsapp'&&appointmentTemplate&&a?sendFast2sms(user.phone!,channel,'UPDATE','event:'+eventId,userId,[a.doctor,a.date,a.time,a.mode,a.url],appointmentTemplate):sendFast2sms(user.phone!,channel,'UPDATE','event:'+eventId,userId,[a?`${message.title}: ${a.date}, ${a.time}`.slice(0,100):message.title,message.reference])
 }))
 const failure=result.find(r=>r.status==='rejected');if(failure?.status==='rejected')throw failure.reason
}
export async function ownFast2smsMessages(userId:string){await ensureSchema();return getDb().query<{id:string;channel:string;state:string;error_code:string|null;created_at:string}>("SELECT id,channel,state,error_code,created_at FROM fast2sms_messages WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",[userId])}

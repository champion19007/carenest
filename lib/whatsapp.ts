import 'server-only'
import {randomUUID,createHmac,timingSafeEqual} from 'node:crypto'
import {getDb,ensureSchema} from './db/client'
import {localMode,privateKey} from './secrets'
import {normalizePhone} from './domain/otp'
import {notificationPreferences} from './domain/notification-preferences'
import {DomainError,reject} from './domain/errors'
import {fast2smsSelected,fast2smsReady,sendFast2sms} from './fast2sms'
import {metaWhatsAppSelected,metaWhatsAppReady} from './meta-whatsapp'

type Purpose='OTP'|'UPDATE'
type Delivery={id:string;user_id:string|null;state:string;provider_ref:string|null;recipient_hash:string}
function configuration(){
 if(!localMode()||process.env.WHATSAPP_SANDBOX_ENABLED!=='1')reject('WHATSAPP_DISABLED','The WhatsApp sandbox is not enabled.',503)
 const sid=process.env.TWILIO_ACCOUNT_SID,token=process.env.TWILIO_AUTH_TOKEN,from=process.env.WHATSAPP_FROM,to=process.env.WHATSAPP_TEST_TO
 if(!sid||!/^AC[a-f0-9]{32}$/i.test(sid)||!token||token.length<16||!from||!/^whatsapp:\+[1-9]\d{6,14}$/.test(from)||!to||!/^\+91[6-9]\d{9}$/.test(to))reject('WHATSAPP_SETUP','Save the Twilio sandbox credentials and joined Indian test number privately before sending.',503)
 return {sid,token,from,to}
}
function template(purpose:Purpose){const sid=process.env[purpose==='OTP'?'WHATSAPP_OTP_CONTENT_SID':'WHATSAPP_UPDATE_CONTENT_SID'];if(sid&&!/^HX[a-f0-9]{32}$/i.test(sid))reject('WHATSAPP_TEMPLATE','Invalid WhatsApp template ID.',503);return sid}
function openSandboxWindow(){const end=Date.parse(process.env.WHATSAPP_SANDBOX_WINDOW_EXPIRES_AT??'');return Number.isFinite(end)&&end>Date.now()&&end<=Date.now()+24*3600000}
export function whatsappReady(purpose:Purpose='UPDATE'){if(metaWhatsAppSelected())return purpose==='UPDATE'&&metaWhatsAppReady();if(fast2smsSelected())return fast2smsReady('whatsapp',purpose);try{configuration();return Boolean(template(purpose)||openSandboxWindow())}catch{return false}}
export function whatsappSetupNotice(){if(metaWhatsAppSelected())return `Meta WhatsApp: booking ${metaWhatsAppReady('BOOKING')?'configured':'template needed'}, reminder ${metaWhatsAppReady('REMINDER')?'configured':'template needed'}, transaction ${metaWhatsAppReady('TRANSACTION')?'configured':'template needed'}. ACCEPTED means provider acceptance; check your phone for actual delivery.`;return whatsappReady()?'WhatsApp sandbox is configured for the joined test number.':'Join the Twilio test sandbox and configure its credentials plus an approved template or current 24-hour reply window. No WhatsApp message is simulated.'}
function callbackUrl(){
 const raw=process.env.WHATSAPP_STATUS_CALLBACK_URL;if(!raw)return undefined
 const url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/api/webhooks/whatsapp')reject('WHATSAPP_CALLBACK','Use the exact HTTPS WhatsApp status callback URL.',503)
 return url.href
}
async function providerRequest(path:string,body?:URLSearchParams){
 const c=configuration();let response:Response
 try{response=await fetch('https://api.twilio.com/2010-04-01/Accounts/'+c.sid+'/'+path,{method:body?'POST':'GET',headers:{Authorization:'Basic '+Buffer.from(c.sid+':'+c.token).toString('base64'),...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})},...(body?{body}:{}),signal:AbortSignal.timeout(10000)})}
 catch{throw new DomainError('DELIVERY_UNKNOWN','WhatsApp provider outcome is unknown; check the provider before retrying.',503)}
 if(!response.ok)throw new DomainError(response.status>=500?'DELIVERY_UNKNOWN':'DELIVERY_REJECTED','Twilio did not accept the WhatsApp request. Check sandbox membership and templates.',503)
 return await response.json() as {sid?:string;status?:string;to?:string;from?:string;account_sid?:string;error_code?:number|null}
}
function providerState(status?:string){return status==='read'?'READ':status==='delivered'?'DELIVERED':status==='sent'?'SENT':['failed','undelivered','canceled'].includes(status??'')?'FAILED':'ACCEPTED'}
async function recordState(id:string,state:string,errorCode:string|null=null){
 // Callbacks can arrive out of order. A sent/queued event cannot undo delivered/read.
 await getDb().query(`UPDATE whatsapp_messages SET state=CASE
 WHEN state='READ' THEN 'READ' WHEN $2='READ' THEN 'READ'
 WHEN state='DELIVERED' THEN 'DELIVERED' WHEN $2='DELIVERED' THEN 'DELIVERED'
 WHEN state='FAILED' THEN 'FAILED' WHEN $2='FAILED' THEN 'FAILED'
 WHEN state='SENT' THEN 'SENT' ELSE $2 END,error_code=$3,updated_at=now() WHERE id=$1`,[id,state,errorCode])
}
async function send(phone:string,purpose:Purpose,effectKey:string,userId:string|null,code?:string){
 const c=configuration(),digits=normalizePhone(phone)
 if(!digits||c.to!=='+91'+digits)reject('WHATSAPP_RECIPIENT','WhatsApp testing is restricted to the joined test number.',400)
 const content=template(purpose);if(!content&&!openSandboxWindow())reject('WHATSAPP_WINDOW','Send a message to the sandbox again, then update its 24-hour window; otherwise configure an approved template.',503)
 await ensureSchema()
 const claimed=await getDb().one<Delivery>(`INSERT INTO whatsapp_messages(id,user_id,effect_key,purpose,recipient_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT(effect_key) DO NOTHING RETURNING *`,['wa_'+randomUUID(),userId,effectKey,purpose,privateKey('whatsapp-recipient',digits)])
 if(!claimed){const previous=await getDb().one<Delivery>('SELECT * FROM whatsapp_messages WHERE effect_key=$1',[effectKey]);if(previous?.provider_ref&&['ACCEPTED','SENT','DELIVERED','READ'].includes(previous.state))return previous.id;reject('DELIVERY_UNKNOWN','The earlier WhatsApp attempt requires reconciliation before resending.',503)}
 try{
  const form=new URLSearchParams({From:c.from,To:'whatsapp:'+c.to})
  if(content){form.set('ContentSid',content);form.set('ContentVariables',JSON.stringify(purpose==='OTP'?{'1':'CareNest','2':code}:{'1':'CareNest','2':'An account update is available. Sign in to review it.'}))}
  else form.set('Body',purpose==='OTP'?`${code} is your CareNest sign-in code. It expires in 5 minutes. Do not share it.`:'CareNest: an account update is available. Sign in to review your appointments or payments. No clinical details are included in this message.')
  const callback=callbackUrl();if(callback)form.set('StatusCallback',callback)
  const result=await providerRequest('Messages.json',form)
  if(!result.sid||!/^SM[a-f0-9]{32}$/i.test(result.sid)||result.to!=='whatsapp:'+c.to||result.from!==c.from||result.account_sid!==c.sid)throw new DomainError('DELIVERY_UNKNOWN','The WhatsApp receipt needs provider reconciliation.',503)
  await getDb().query('UPDATE whatsapp_messages SET provider_ref=$2 WHERE id=$1',[claimed.id,result.sid])
  await recordState(claimed.id,providerState(result.status),result.error_code?String(result.error_code):null)
  if(providerState(result.status)==='FAILED')throw new DomainError('DELIVERY_REJECTED','WhatsApp delivery failed. Review the provider receipt.',503)
  return claimed.id
 }catch(error){await recordState(claimed.id,error instanceof DomainError&&error.code==='DELIVERY_REJECTED'?'FAILED':'UNKNOWN',error instanceof DomainError?error.code:'DELIVERY_UNKNOWN');throw error}
}
export async function sendWhatsAppOtp(phone:string,code:string,challenge:string){if(!/^\d{6}$/.test(code)||!challenge)reject('OTP','Invalid sign-in challenge.',400);if(fast2smsSelected())return sendFast2sms(phone,'whatsapp','OTP','otp:'+challenge,null,[code]);return send(phone,'OTP','otp:'+challenge,null,code)}
export async function sendWhatsAppUpdate(userId:string,eventId:string){
 await ensureSchema();const prefs=await notificationPreferences(userId);if(!prefs.whatsapp_enabled)return
 const user=await getDb().one<{phone:string|null}>("SELECT phone FROM patient.users WHERE id=$1 AND status='ACTIVE'",[userId]);if(!user?.phone)return
 // Fail visibly for an opted-in but unconfigured channel; the outbox records retry/failure.
 return send(user.phone,'UPDATE','event:'+eventId+':whatsapp:'+userId,userId)
}
export async function ownWhatsAppMessages(userId:string){await ensureSchema();return getDb().query<{id:string;state:string;created_at:string;provider_ref:string|null;error_code:string|null}>('SELECT id,state,created_at,provider_ref,error_code FROM whatsapp_messages WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30',[userId])}
export async function refreshWhatsAppStatus(userId:string,id:string){
 await ensureSchema();const row=await getDb().one<Delivery>('SELECT * FROM whatsapp_messages WHERE id=$1 AND user_id=$2',[id,userId]);if(!row?.provider_ref)reject('NOT_FOUND','Your WhatsApp provider receipt is unavailable.',404)
 const result=await providerRequest('Messages/'+encodeURIComponent(row.provider_ref)+'.json'),c=configuration()
 const digits=normalizePhone((result.to??'').replace(/^whatsapp:/,''))
 if(result.sid!==row.provider_ref||result.account_sid!==c.sid||result.from!==c.from||!digits||privateKey('whatsapp-recipient',digits)!==row.recipient_hash)reject('DELIVERY_UNKNOWN','WhatsApp receipt does not match this delivery.',503)
 await recordState(row.id,providerState(result.status),result.error_code?String(result.error_code):null)
 return providerState(result.status)
}
export async function acceptWhatsAppCallback(url:string,params:URLSearchParams,signature:string){
 await ensureSchema()
 const c=configuration(),expectedUrl=callbackUrl();if(!expectedUrl||new URL(url).pathname!==new URL(expectedUrl).pathname)reject('CALLBACK','WhatsApp callback is not configured.',503)
 const fields=[...params.entries()];if(new Set(fields.map(([key])=>key)).size!==fields.length)reject('CALLBACK','Duplicate callback fields.',400)
 const signed=expectedUrl+fields.sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,value])=>key+value).join('')
 const expected=createHmac('sha1',c.token).update(signed).digest('base64')
 if(signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))reject('SIGNATURE','Invalid WhatsApp callback signature.',401)
 if(params.get('AccountSid')!==c.sid)reject('CALLBACK','Unexpected WhatsApp account.',400)
 const row=await getDb().one<Delivery>('SELECT * FROM whatsapp_messages WHERE provider_ref=$1',[params.get('MessageSid')]);if(!row)reject('NOT_FOUND','WhatsApp receipt unavailable.',404)
 const to=params.get('To');if(to){const digits=normalizePhone(to.replace(/^whatsapp:/,''));if(!digits||privateKey('whatsapp-recipient',digits)!==row.recipient_hash)reject('CALLBACK','Unexpected recipient.',400)}
 const status=params.get('MessageStatus')??'';if(!['queued','accepted','sending','sent','delivered','read','failed','undelivered','canceled'].includes(status))reject('CALLBACK','Unknown WhatsApp status.',400)
 await recordState(row.id,providerState(status),/^\d{1,8}$/.test(params.get('ErrorCode')??'')?params.get('ErrorCode'):null)
}

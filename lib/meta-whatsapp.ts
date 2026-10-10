import 'server-only'
import {ensureSchema,getDb} from './db/client'
import {localMode,privateKey} from './secrets'
import {normalizePhone} from './domain/otp'
import {notificationPreferences} from './domain/notification-preferences'
import {updateMessage,type UpdateMessage} from './domain/appointment-notifications'
import {consumeLimits} from './domain/rate-limit'
import {DomainError,reject} from './domain/errors'

export function metaWhatsAppSelected(){return process.env.WHATSAPP_PROVIDER==='meta'}
function configuration(){
 const token=process.env.META_WHATSAPP_ACCESS_TOKEN??'',phoneId=process.env.WHATSAPP_PHONE_NUMBER_ID??'',waba=process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID??'',version=process.env.META_WHATSAPP_GRAPH_VERSION??'v24.0',language=process.env.WHATSAPP_TEMPLATE_LANG??'en'
 if(process.env.META_WHATSAPP_ENABLED!=='1'||token.length<30||!/^[0-9]{5,30}$/.test(phoneId)||!/^[0-9]{5,30}$/.test(waba)||!/^v\d{2}\.0$/.test(version)||!/^en(?:_[A-Z]{2})?$/.test(language))reject('META_SETUP','Meta WhatsApp needs its access token, business account, phone ID, API version and template language configured.',503)
 if(localMode()&&!normalizePhone(process.env.WHATSAPP_TO??''))reject('META_SETUP','Save the allowed WhatsApp test recipient privately.',503)
 return {token,phoneId,waba,version,language}
}
type TemplateKind='BOOKING'|'REMINDER'|'TRANSACTION'|'UPDATE'
function template(kind:TemplateKind){const value=process.env['META_WHATSAPP_'+kind+'_TEMPLATE']??'';if(!/^[a-z][a-z0-9_]{1,511}$/.test(value)||value==='hello_world')reject('META_TEMPLATE','Configure an approved Meta template for this message type. The hello_world test cannot carry appointment or transaction details.',503);return value}
export function metaWhatsAppReady(kind:TemplateKind='UPDATE'){try{configuration();template(kind);return true}catch{return false}}
export async function metaWhatsAppTemplateStatuses(){
 const kinds:TemplateKind[]=['BOOKING','REMINDER','TRANSACTION','UPDATE']
 try{
  const c=configuration(),response=await fetch(`https://graph.facebook.com/${c.version}/${c.waba}/message_templates?fields=name,status,language,category&limit=100`,{cache:'no-store',redirect:'error',headers:{Authorization:'Bearer '+c.token},signal:AbortSignal.timeout(8000)})
  if(!response.ok)throw new Error('Template lookup failed')
  const body=await response.json() as {data?:{name:string;status:string;language:string;category:string}[]}
  return kinds.map(kind=>{const name=process.env['META_WHATSAPP_'+kind+'_TEMPLATE']??'',item=body.data?.find(t=>t.name===name&&t.language===c.language);return {kind,name,status:!name?'NOT_CONFIGURED':!item?'NOT_FOUND':item.category!=='UTILITY'?'RECLASSIFIED_'+item.category:item.status}})
 }catch{return kinds.map(kind=>({kind,name:process.env['META_WHATSAPP_'+kind+'_TEMPLATE']??'',status:'LOOKUP_UNAVAILABLE'}))}
}
export async function assertMetaWhatsAppTestReady(){const c=configuration();await requireApprovedTemplate(c,template('UPDATE'),2)}
function messageTemplate(message:UpdateMessage){
 const kind:TemplateKind=message.appointment?message.reminder?'REMINDER':'BOOKING':message.transaction?'TRANSACTION':'UPDATE'
 const a=message.appointment,t=message.transaction
 const variables=a?[a.doctor,a.date,a.time,message.title+'; '+a.mode,a.url]:t?[t.status,t.amount,message.reference,t.url]:[message.title,message.reference]
 return {name:template(kind),variables}
}
async function requireApprovedTemplate(c:ReturnType<typeof configuration>,name:string,count:number){
 let response:Response
 try{response=await fetch(`https://graph.facebook.com/${c.version}/${c.waba}/message_templates?name=${encodeURIComponent(name)}&fields=name,status,language,category,components&limit=100`,{cache:'no-store',redirect:'error',headers:{Authorization:'Bearer '+c.token},signal:AbortSignal.timeout(10000)})}
 catch{reject('META_TEMPLATE','Meta template approval could not be checked. No message was sent.',503)}
 if(!response.ok)reject('META_TEMPLATE','Meta template access failed. Check management permissions and token validity.',503)
 const body=await response.json() as {data?:{name:string;status:string;language:string;category:string;components:{type:string;text?:string}[]}[]}
 const approved=body.data?.find(t=>t.name===name&&t.language===c.language&&t.status==='APPROVED'&&t.category==='UTILITY')
 const components=approved?.components??[],text=components.find(v=>v.type==='BODY')?.text??'',variables=[...text.matchAll(/\{\{(\d+)\}\}/g)].map(v=>Number(v[1]))
 if(!approved||components.some(v=>v.type!=='BODY')||Array.from({length:count},(_,i)=>i+1).some(n=>!variables.includes(n))||variables.some(n=>n<1||n>count)||variables.length!==count)reject('META_TEMPLATE','This Utility template is not approved or its body variables do not match CareNest. No message was sent.',503)
}
export async function sendMetaWhatsAppUpdate(userId:string,eventId:string){
 await ensureSchema();if(!(await notificationPreferences(userId)).whatsapp_enabled)return
 const user=await getDb().one<{phone:string|null}>("SELECT phone FROM patient.users WHERE id=$1 AND status='ACTIVE'",[userId]);if(!user?.phone)return
 const phone=normalizePhone(user.phone);if(!phone)reject('META_RECIPIENT','The account needs a valid Indian phone number.',400)
 const message=await updateMessage(userId,eventId);if(!message)return
 const c=configuration()
 if(localMode()&&phone!==normalizePhone(process.env.WHATSAPP_TO??''))reject('META_RECIPIENT','This local demo can send updates only to the allowed Meta test phone.',403)
 const selected=messageTemplate(message),key='event:'+eventId+':whatsapp',recipient=privateKey('meta-recipient',phone)
 const existing=await getDb().one<{state:string;provider:string;recipient_hash:string;user_id:string}>('SELECT * FROM notification_delivery WHERE effect_key=$1',[key])
 if(existing&&existing.provider==='meta'&&existing.user_id===userId&&existing.recipient_hash===recipient&&['ACCEPTED','DELIVERED'].includes(existing.state))return
 if(existing)reject('DELIVERY_UNKNOWN','The earlier WhatsApp result requires review before resending.',503)
 await requireApprovedTemplate(c,selected.name,selected.variables.length)
 const claim=await getDb().transaction(async tx=>{
  // A provider switch must not resend a previously accepted WhatsApp event.
  if(await tx.one('SELECT id FROM whatsapp_messages WHERE effect_key=$1',['event:'+eventId+':whatsapp:'+userId]))reject('DELIVERY_UNKNOWN','A previous WhatsApp provider already owns this update; review its receipt.',503)
  if(await tx.one("SELECT id FROM fast2sms_messages WHERE effect_key=$1 AND channel='whatsapp'",['whatsapp:UPDATE:event:'+eventId]))reject('DELIVERY_UNKNOWN','A previous WhatsApp provider already owns this update; review its receipt.',503)
  const prior=await tx.one<{state:string;provider:string|null;recipient_hash:string|null;user_id:string|null}>('SELECT * FROM notification_delivery WHERE effect_key=$1 FOR UPDATE',[key])
  if(prior){
   if(prior.provider!=='meta'||prior.user_id!==userId||prior.recipient_hash!==recipient)reject('DELIVERY_UNKNOWN','The earlier WhatsApp message belongs to different delivery details.',503)
   if(['ACCEPTED','DELIVERED'].includes(prior.state))return false
   reject('DELIVERY_UNKNOWN','The earlier WhatsApp result requires review before resending.',503)
  }
  if(localMode()){
   const cap=Number(process.env.META_WHATSAPP_LOCAL_DAILY_LIMIT??10);if(!Number.isInteger(cap)||cap<1||cap>20)reject('BUDGET','Choose a local WhatsApp cap between one and twenty.',503)
   const budget=await consumeLimits([{bucket:'meta-whatsapp-demo',key:'global',limit:cap,seconds:86400}],tx);if(!budget.allowed)reject('BUDGET','The daily WhatsApp demo message limit has been reached.',429)
  }
  const row=await tx.one("INSERT INTO notification_delivery(effect_key,channel,state,user_id,recipient_hash,provider) VALUES($1,'whatsapp','SENDING',$2,$3,'meta') ON CONFLICT DO NOTHING RETURNING effect_key",[key,userId,recipient]);if(!row)reject('DELIVERY_UNKNOWN','Another worker owns this WhatsApp update.',503);return true
 });if(!claim)return
 try{
  let response:Response
  try{response=await fetch(`https://graph.facebook.com/${c.version}/${c.phoneId}/messages`,{method:'POST',cache:'no-store',redirect:'error',headers:{Authorization:'Bearer '+c.token,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:'91'+phone,type:'template',template:{name:selected.name,language:{code:c.language},components:[{type:'body',parameters:selected.variables.map(text=>({type:'text',text}))}]}}),signal:AbortSignal.timeout(10000)})}
  catch{throw new DomainError('DELIVERY_UNKNOWN','Meta did not return a clear sending result.',503)}
  if(!response.ok)reject(response.status>=500?'DELIVERY_UNKNOWN':'DELIVERY_REJECTED','Meta rejected this request. Check token validity, approved templates, language and test recipient.',503)
  const body=await response.json() as {messages?:{id?:string}[];contacts?:{wa_id?:string}[];messaging_product?:string}
  const reference=body.messages?.[0]?.id
  if(body.messaging_product!=='whatsapp'||!reference?.startsWith('wamid.')||body.contacts?.[0]?.wa_id!=='91'+phone)reject('DELIVERY_UNKNOWN','Meta returned an unexpected WhatsApp receipt.',503)
  await getDb().query("UPDATE notification_delivery SET state='ACCEPTED',provider_ref=$2,updated_at=now() WHERE effect_key=$1",[key,reference])
 }catch(error){
  const code=error instanceof DomainError?error.code:'DELIVERY_UNKNOWN'
  await getDb().query("UPDATE notification_delivery SET state=$2,error_code=$3,updated_at=now() WHERE effect_key=$1",[key,code==='DELIVERY_REJECTED'?'REJECTED':'UNKNOWN',code])
  throw new DomainError(code,'WhatsApp sending needs provider review. No phone delivery is claimed.',503)
 }
}
export async function ownMetaWhatsAppMessages(userId:string){await ensureSchema();return getDb().query<{id:string;state:string;error_code:string|null}>("SELECT effect_key id,state,error_code FROM notification_delivery WHERE user_id=$1 AND channel='whatsapp' AND provider='meta' ORDER BY updated_at DESC LIMIT 30",[userId])}

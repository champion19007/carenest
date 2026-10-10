import 'server-only'
import {randomUUID} from 'node:crypto'
import {claimBatch,markFailed,markSent,type DomainEvent} from './db/outbox'
import {getDb,ensureSchema} from './db/client'
import {provisionVideo,cancelVideo} from './domain/video'
import {ensureSlots} from './db/slots'
import {triageEnquiry} from './triage'
import {addTriage} from './db/docs'
import {localMode} from './secrets'
import {DomainError} from './domain/errors'
import {sendExternalUpdate} from './notifications'
import {decodeEnquiryNotes} from './db/leads'
import {purgePrivateFile} from './domain/files'
import {updateMessage} from './domain/appointment-notifications'
export type DrainResult={claimed:number;sent:number;failed:number}
const bookingKinds=new Set(['booking.requested','booking.confirmed','booking.declined','booking.cancelled','booking.expired','booking.attended','booking.no_show'])
async function notify(event:DomainEvent,userId:string,title:string,body:string){
 await getDb().transaction(async tx=>{
  if(!await tx.one("SELECT id FROM patient.users WHERE id=$1 AND status='ACTIVE'",[userId]))throw new DomainError('RECIPIENT','No current recipient.',400)
  await tx.query('INSERT INTO patient.notifications(id,user_id,event_id,title,body) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,event_id) DO NOTHING',['notification_'+randomUUID(),userId,event.id,title,body])
  await tx.query("INSERT INTO notification_delivery(effect_key,channel,state) VALUES($1,'in-app','DELIVERED') ON CONFLICT DO NOTHING",['event:'+event.id+':in-app'])
 })
 await sendExternalUpdate(userId,event.id)
}
async function handle(event:DomainEvent){
 if(event.payload_version!==1)throw new DomainError('UNKNOWN_VERSION','Unsupported event payload version.',400)
 if(event.kind==='privacy.file_purge'){await purgePrivateFile(String(event.subject_id));return}
 if(event.kind==='booking.reminder_due'){
  const userId=String(event.payload.userId??''),message=await updateMessage(userId,event.id)
  if(message)await notify(event,userId,message.title,message.text)
  return
 }
 if(bookingKinds.has(event.kind)){
  const booking=await getDb().one<{user_id:string;status:string;revision:number;kind:string}>('SELECT user_id,status,revision,kind FROM patient.bookings WHERE id=$1',[event.subject_id])
  if(!booking)throw new DomainError('RECIPIENT','Appointment no longer exists.',400)
  // Delayed events cannot send obsolete confirmation text or resurrect an old room.
  if(typeof event.payload.revision==='number'&&event.payload.revision!==booking.revision)return
  if(booking.kind==='video'){
   if(booking.status==='confirmed')await provisionVideo(String(event.subject_id))
   else await cancelVideo(String(event.subject_id))
  }
  if(await getDb().one("SELECT id FROM patient.users WHERE id=$1 AND status='ACTIVE'",[booking.user_id])){const message=await updateMessage(booking.user_id,event.id);if(message)await notify(event,booking.user_id,message.title,message.text)}
  return
 }
 if(event.kind==='provider.schedule_changed'){if(!event.subject_id)throw new DomainError('PAYLOAD','Missing provider.',400);await ensureSlots(event.subject_id);return}
 if(event.kind==='consent.revoked'){
  if(['video-provider','appointment-sharing'].includes(String(event.payload.purpose)))await cancelVideo(String(event.subject_id),true)
  if(event.payload.purpose==='account-restriction'){
   const rows=await getDb().query<{id:string}>("SELECT id FROM patient.bookings WHERE user_id=$1 AND kind='video' AND status='confirmed'",[String(event.payload.userId??'')]);for(const row of rows)await cancelVideo(row.id,true)
  }
  return
 }
 if(event.kind==='lead.triage'){
  const lead=await getDb().one<{id:string;user_id:string;procedure:string;notes:string;city:string}>('SELECT id,user_id,procedure,notes,city FROM clinic.surgery_leads WHERE id=$1',[event.subject_id])
  if(!lead)throw new DomainError('PAYLOAD','Missing enquiry.',400)
  const prior=await getDb().one("SELECT id FROM documents WHERE collection='triage' AND subject_id=$1",[lead.id]);if(prior)return
  const consent=await getDb().one("SELECT id FROM patient.consents WHERE actor_id=$1 AND subject_id=$2 AND purpose='enquiry-ai' AND revoked_at IS NULL",[lead.user_id,lead.id])
  if(localMode()||process.env.ENABLE_EXTERNAL_TRIAGE!=='1'||!consent)return
  const triage=await triageEnquiry({...lead,notes:decodeEnquiryNotes(lead.id,lead.notes)})
  if(triage)await addTriage({leadId:lead.id,...triage});return
 }
 if(event.kind==='estimate.issued'){
  const lead=await getDb().one<{user_id:string}>(`SELECT l.user_id FROM clinic.estimates e JOIN clinic.surgery_leads l ON l.id=e.lead_id WHERE e.id=$1`,[event.subject_id])
  if(!lead?.user_id)throw new DomainError('RECIPIENT','No authenticated estimate recipient.',400)
  await notify(event,lead.user_id,'Estimate available','A versioned estimate is ready in your enquiry history.');return
 }
 if(['lab.requested','lab.updated','payment.recorded','payment.refunded','demo.payment_completed','doctor.payout_paid','doctor.payout_reversed','account.update_requested','account.email_test_requested','pet.vaccine_due','support.updated','pharmacy.updated'].includes(event.kind)){
  const userId=String(event.payload.userId??'');if(event.kind==='payment.recorded'&&!userId)return;if(!userId)throw new DomainError('PAYLOAD','Missing recipient.',400)
  await notify(event,userId,event.kind==='pet.vaccine_due'?'Pet reminder':event.kind==='demo.payment_completed'?'Sandbox test payment completed':'Care update',event.kind==='demo.payment_completed'?'Your ₹100 test payment was verified by the payment provider. No real money was collected and no clinic invoice was changed.':'An update is available in your account.');return
 }
 throw new DomainError('UNKNOWN_HANDLER','No handler registered for this event kind.',400)
}
export async function drainAll(limit=20,deadline=Date.now()+30000):Promise<DrainResult>{
 await ensureSchema();let sent=0,failed=0,claimed=0
 for(let index=0;index<Math.min(50,limit)&&Date.now()<deadline;index++){
  const events=await claimBatch(1);if(!events.length)break;const event=events[0];claimed++
  try{await handle(event);await markSent(event.id,event.lease_token??undefined);sent++}
  catch(error){await markFailed(event.id,event.attempts,error instanceof DomainError?error.code:'HANDLER_FAILED',event.lease_token??undefined,error instanceof DomainError&&['UNKNOWN_HANDLER','UNKNOWN_VERSION','PAYLOAD','RECIPIENT'].includes(error.code));failed++}
 }
 return {claimed,sent,failed}
}

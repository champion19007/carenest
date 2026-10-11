import 'server-only'
import {getDb} from '@/lib/db/client'
import {decodePreferences} from './workspace-settings'
import {workspaceTransaction,workspaceAudit} from './workspace-access'
export async function clinicChannelAllowed(eventId:string,channel:'sms'|'email'|'whatsapp'){
 const event=await getDb().one<{kind:string;subject_id:string}>('SELECT kind,subject_id FROM domain_events WHERE id=$1',[eventId]);if(!event)return false
 const booking=event.kind.startsWith('booking.'),payment=['payment.recorded','payment.refunded'].includes(event.kind)
 if(!booking&&!payment)return true
 const doctor=booking?await getDb().one<{id:string}>('SELECT doctor_id id FROM patient.bookings WHERE id=$1',[event.subject_id]):await getDb().one<{id:string}>('SELECT coalesce(b.doctor_id,w.doctor_id) id FROM clinic.invoices i LEFT JOIN patient.bookings b ON b.id=i.booking_id LEFT JOIN clinic.walk_ins w ON w.id=i.walk_in_id WHERE i.id=$1',[event.subject_id])
 if(!doctor)return true
 const row=await getDb().one<{encrypted_body:string}>('SELECT encrypted_body FROM clinic.workspace_preferences WHERE doctor_id=$1',[doctor.id]),prefs=decodePreferences(doctor.id,row?.encrypted_body).communications
 const topic=payment?'payments':event.kind==='booking.reminder_due'?'reminders':['booking.cancelled','booking.declined','booking.expired'].includes(event.kind)?'cancellations':'confirmations'
 return prefs[channel]&&prefs[topic]
}
export async function workspaceCommunications(actorId:string){return workspaceTransaction(actorId,async(tx,d)=>{
 const events=await tx.query<{id:string;kind:string;subject_id:string;state:string;created_at:string}>(`SELECT e.id,e.kind,e.subject_id,e.status state,e.created_at FROM domain_events e WHERE e.payload->>'userId'=$1 OR EXISTS(SELECT 1 FROM patient.bookings b WHERE b.id=e.subject_id AND b.doctor_id=$2) OR EXISTS(SELECT 1 FROM clinic.invoices i LEFT JOIN patient.bookings b ON b.id=i.booking_id LEFT JOIN clinic.walk_ins w ON w.id=i.walk_in_id WHERE i.id=e.subject_id AND coalesce(b.doctor_id,w.doctor_id)=$2) ORDER BY e.created_at DESC LIMIT 100`,[actorId,d.id])
 const deliveries=await tx.query<{effect_key:string;channel:string;state:string;error_code:string|null;updated_at:string}>('SELECT effect_key,channel,state,error_code,updated_at FROM notification_delivery WHERE EXISTS(SELECT 1 FROM unnest($1::text[]) e WHERE effect_key LIKE \'event:\'||e||\':%\') ORDER BY updated_at DESC LIMIT 500',[events.map(e=>String(e.id))])
 await workspaceAudit(tx,actorId,'practice:communications-read',d.id);return {events,deliveries}
})}

export async function clinicEmailFooter(eventId:string){const row=await getDb().one<{doctor_id:string}>("SELECT coalesce(b.doctor_id,ib.doctor_id,w.doctor_id) doctor_id FROM domain_events e LEFT JOIN patient.bookings b ON b.id=e.subject_id LEFT JOIN clinic.invoices i ON i.id=e.subject_id LEFT JOIN patient.bookings ib ON ib.id=i.booking_id LEFT JOIN clinic.walk_ins w ON w.id=i.walk_in_id WHERE e.id=$1",[eventId]);const doctorId=row?.doctor_id;if(!doctorId)return '';const prefs=await getDb().one<{encrypted_body:string}>('SELECT encrypted_body FROM clinic.workspace_preferences WHERE doctor_id=$1',[doctorId]);return decodePreferences(doctorId,prefs?.encrypted_body).email.footer}

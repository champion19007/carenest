import 'server-only'
import {randomUUID} from 'node:crypto'
import {getDb} from '@/lib/db/client'
import {localMode} from '@/lib/secrets'
import type {DomainEvent} from '@/lib/db/outbox'
/** Practice reminders stay in-app; private titles and notes never become outbound messages. */
export async function deliverPracticeReminder(event:DomainEvent){
 const userId=String(event.payload.userId??'')
 return getDb().transaction(async tx=>{
  const visit=event.kind==='practice.visit_reminder'
  const eligible=visit?await tx.one(`SELECT v.id FROM clinic.scheduled_visits v JOIN provider.doctors d ON d.id=v.doctor_id JOIN patient.users u ON u.id=d.user_id JOIN clinic.clinics c ON c.id=d.clinic_id JOIN clinic.memberships m ON m.clinic_id=c.id AND m.user_id=u.id
   WHERE v.id=$1 AND d.user_id=$2 AND v.revision=$3 AND v.state='SCHEDULED' AND v.starts_at>clock_timestamp() AND v.starts_at-interval '10 minutes'<=clock_timestamp()
   AND d.status='ACTIVE' AND u.status='ACTIVE' AND u.role='doctor' AND u.kyc_level='verified' AND c.status='ACTIVE' AND m.status='ACTIVE' AND m.role IN ('clinician','administrator') AND (d.verified_at IS NOT NULL OR ($4::boolean AND d.is_demo))`,[event.subject_id,userId,event.payload.revision,localMode()]):await tx.one(`SELECT r.id FROM clinic.workspace_reminders r JOIN provider.doctors d ON d.id=r.doctor_id JOIN patient.users u ON u.id=d.user_id JOIN clinic.clinics c ON c.id=d.clinic_id JOIN clinic.memberships m ON m.clinic_id=c.id AND m.user_id=u.id
   WHERE r.id=$1 AND d.user_id=$2 AND r.revision=$3 AND r.state='ACTIVE' AND r.due_at<=clock_timestamp()
   AND d.status='ACTIVE' AND u.status='ACTIVE' AND u.role='doctor' AND u.kyc_level='verified' AND c.status='ACTIVE' AND m.status='ACTIVE' AND m.role IN ('clinician','administrator') AND (d.verified_at IS NOT NULL OR ($4::boolean AND d.is_demo))`,[event.subject_id,userId,event.payload.revision,localMode()])
  if(!eligible)return false
  await tx.query('INSERT INTO patient.notifications(id,user_id,event_id,title,body) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,event_id) DO NOTHING',['notification_'+randomUUID(),userId,event.id,visit?'Clinic appointment starts shortly':'Practice reminder due','Open your clinic calendar to view this saved item.'])
  await tx.query("INSERT INTO notification_delivery(effect_key,channel,state) VALUES($1,'in-app','DELIVERED') ON CONFLICT DO NOTHING",['event:'+event.id+':in-app']);return true
 })
}

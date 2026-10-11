import 'server-only'
import {randomUUID} from 'node:crypto'
import {getDb,ensureSchema,type Db} from '@/lib/db/client'
import {localMode} from '@/lib/secrets'
import {reject} from './errors'
async function practitioner(tx:Db,actorId:string,write=false){
 const d=await tx.one<{id:string;clinic_id:string;name:string;clinic:string;status:string;verified_at:string|null;is_demo:boolean;role:string;kyc_level:string}>(`SELECT d.*,u.role,u.kyc_level FROM provider.doctors d JOIN patient.users u ON u.id=d.user_id WHERE d.user_id=$1 AND u.status='ACTIVE' ${write?'FOR UPDATE OF d FOR SHARE OF u':'FOR SHARE OF d,u'}`,[actorId])
 if(!d||d.role!=='doctor'||d.kyc_level!=='verified'||d.status!=='ACTIVE'||(!d.verified_at&&!(d.is_demo&&localMode())))reject('FORBIDDEN','Current practitioner access is required.',403)
 if(d.clinic_id&&await tx.one("SELECT id FROM clinic.clinics WHERE id=$1 AND status<>'ACTIVE'",[d.clinic_id]))reject('FORBIDDEN','Current clinic access is required.',403)
 return d
}
export async function practiceData(actorId:string){
 await ensureSchema()
 return getDb().transaction(async tx=>{
  const doctor=await practitioner(tx,actorId)
  const appointments=await tx.query<{id:string;status:string;kind:string;starts_at:string;ends_at:string;subject_name:string;checked_in_at:string|null;started_at:string|null;fee:number}>(`SELECT b.id,b.status,b.kind,b.starts_at,b.ends_at,coalesce(p.name,f.name,u.name) subject_name,b.checked_in_at,b.started_at,b.fee
   FROM patient.bookings b JOIN patient.users u ON u.id=b.user_id LEFT JOIN patient.family_members f ON f.id=b.patient_for AND f.user_id=b.user_id
   LEFT JOIN patient.pets p ON p.id=b.pet_id AND p.owner_id=b.user_id WHERE b.doctor_id=$1 ORDER BY b.starts_at DESC NULLS LAST LIMIT 200`,[doctor.id])
  const invoices=await tx.query<{id:string;booking_id:string;total_paise:string;state:string;created_at:string;payment_required:boolean;booking_status:string}>(`SELECT i.id,i.booking_id,i.total_paise,i.state,i.created_at,b.payment_required,b.status booking_status FROM clinic.invoices i JOIN patient.bookings b ON b.id=i.booking_id WHERE b.doctor_id=$1 ORDER BY i.created_at DESC LIMIT 200`,[doctor.id])
  const rules=await tx.query<{weekday:number;start_minute:number;end_minute:number;duration_minutes:number}>('SELECT weekday,start_minute,end_minute,duration_minutes FROM provider.schedule_rules WHERE doctor_id=$1 AND enabled ORDER BY weekday,start_minute',[doctor.id])
  const closures=await tx.query<{day:string;reason:string}>('SELECT day,reason FROM provider.schedule_exceptions WHERE doctor_id=$1 AND closed ORDER BY day',[doctor.id])
  const metrics=await tx.one<{requests:string;confirmed:string;attended:string;no_shows:string;collected:string}>(`SELECT count(*) FILTER(WHERE status='requested') requests,count(*) FILTER(WHERE status='confirmed') confirmed,
   count(*) FILTER(WHERE status='attended') attended,count(*) FILTER(WHERE status='no_show') no_shows,
   (SELECT coalesce(sum(i.total_paise),0) FROM clinic.invoices i JOIN patient.bookings x ON x.id=i.booking_id WHERE x.doctor_id=$1 AND i.state='PAID') collected
   FROM patient.bookings WHERE doctor_id=$1`,[doctor.id])
  await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'practice:read',$2)",[actorId,doctor.id])
  return {doctor,appointments,invoices,rules,closures,metrics}
 })
}
export async function setSchedule(actorId:string,raw:unknown){
 if(!Array.isArray(raw)||raw.length>28)reject('VALIDATION','Choose up to 28 weekly consultation windows.',400)
 const rules=raw.map(r=>{
  if(!r||typeof r!=='object')reject('VALIDATION','Check the schedule.',400)
  const value=r as Record<string,unknown>,weekday=Number(value.weekday),start=Number(value.start_minute),end=Number(value.end_minute),duration=Number(value.duration_minutes)
  if(![weekday,start,end,duration].every(Number.isInteger)||weekday<0||weekday>6||start<0||end>1440||start>=end||duration<5||duration>120)reject('VALIDATION','Check days, opening times and slot duration.',400)
  return {weekday,start,end,duration}
 }).sort((a,b)=>a.weekday-b.weekday||a.start-b.start)
 for(let i=1;i<rules.length;i++)if(rules[i].weekday===rules[i-1].weekday&&rules[i].start<rules[i-1].end)reject('OVERLAP','Consultation windows cannot overlap.',400)
 await ensureSchema()
 return getDb().transaction(async tx=>{
  const doctor=await practitioner(tx,actorId,true)
  await tx.query('DELETE FROM provider.schedule_rules WHERE doctor_id=$1',[doctor.id])
  for(const r of rules)await tx.query('INSERT INTO provider.schedule_rules(id,doctor_id,weekday,start_minute,end_minute,duration_minutes) VALUES($1,$2,$3,$4,$5,$6)',['rule_'+randomUUID(),doctor.id,r.weekday,r.start,r.end,r.duration])
  await tx.query("UPDATE provider.appointment_slots SET status='BLOCKED',version=version+1 WHERE doctor_id=$1 AND status='AVAILABLE' AND slot_start>now()",[doctor.id])
  await tx.query("INSERT INTO domain_events(kind,subject_id,payload,event_key) VALUES('provider.schedule_changed',$1,$2::jsonb,$3)",[doctor.id,JSON.stringify({doctorId:doctor.id}),'schedule_'+randomUUID()])
  await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'schedule:update',$2)",[actorId,doctor.id])
 })
}
export async function closeClinicDate(actorId:string,day:string,reason:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||Number.isNaN(new Date(day).getTime())||new Date(day).toISOString().slice(0,10)!==day||reason.length>200)reject('VALIDATION','Check the closure date and reason.',400)
 await ensureSchema()
 await getDb().transaction(async tx=>{const d=await practitioner(tx,actorId,true);await tx.query('SELECT id FROM provider.doctors WHERE id=$1 FOR UPDATE',[d.id]);await tx.query('INSERT INTO provider.schedule_exceptions(doctor_id,day,reason) VALUES($1,$2,$3) ON CONFLICT(doctor_id,day) DO UPDATE SET closed=true,reason=$3',[d.id,day,reason]);await tx.query("UPDATE provider.appointment_slots SET status='BLOCKED',version=version+1 WHERE doctor_id=$1 AND status='AVAILABLE' AND (slot_start AT TIME ZONE 'Asia/Kolkata')::date=$2::date",[d.id,day]);await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'schedule:closure',$2)",[actorId,d.id])})
}

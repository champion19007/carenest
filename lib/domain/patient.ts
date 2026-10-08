import 'server-only'
import {getDb,ensureSchema} from '@/lib/db/client'
import {reject} from './errors'
export type AppointmentView={id:string;doctor_id:string;doctor_slug:string;doctor_name:string;clinic:string;speciality:string;status:string;kind:string;fee:number;
 starts_at:string|null;ends_at:string|null;revision:number;subject_name:string;pet_id:string|null;slot_id:string|null;created_at:string;started_at:string|null}
export async function patientAppointments(actorId:string,cursor?:string) {
 await ensureSchema()
 let before:string|null=null,id:string|null=null
 if(cursor)try{if(cursor.length>400)throw new Error();const value=JSON.parse(Buffer.from(cursor,'base64url').toString());if(typeof value.at!=='string'||Number.isNaN(new Date(value.at).getTime())||typeof value.id!=='string'||value.id.length>100)throw new Error();before=value.at;id=value.id}catch{reject('CURSOR','Invalid history cursor.',400)}
 return getDb().transaction(async tx=>{
  if(!await tx.one("SELECT id FROM patient.users WHERE id=$1 AND status='ACTIVE'",[actorId]))reject('FORBIDDEN','Please sign in again.',403)
  const select=`SELECT b.*,coalesce(b.starts_at,s.slot_start) starts_at,coalesce(b.ends_at,s.slot_end) ends_at,
   d.slug doctor_slug,d.name doctor_name,d.clinic,d.speciality,coalesce(p.name,f.name,u.name) subject_name
   FROM patient.bookings b JOIN provider.doctors d ON d.id=b.doctor_id JOIN patient.users u ON u.id=b.user_id
   LEFT JOIN patient.family_members f ON f.id=b.patient_for AND f.user_id=b.user_id
   LEFT JOIN patient.pets p ON p.id=b.pet_id AND p.owner_id=b.user_id LEFT JOIN provider.appointment_slots s ON s.slot_id=b.slot_id WHERE b.user_id=$1`
  const upcoming=await tx.query<AppointmentView>(select+" AND b.status IN ('requested','confirmed') AND coalesce(b.starts_at,s.slot_start)>now() ORDER BY coalesce(b.starts_at,s.slot_start),b.id LIMIT 100",[actorId])
  const history=await tx.query<AppointmentView>(select+' AND ($2::timestamptz IS NULL OR (b.created_at,b.id)<($2::timestamptz,$3::text)) ORDER BY b.created_at DESC,b.id DESC LIMIT 31',[actorId,before,id])
  await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'appointment:read-own',$1)",[actorId])
  const page=history.slice(0,30),last=page.at(-1)
  return {upcoming,history:page,next:history.length>30&&last?Buffer.from(JSON.stringify({at:last.created_at,id:last.id})).toString('base64url'):null}
 })
}

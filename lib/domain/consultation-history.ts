import 'server-only'
import {ensureSchema,getDb} from '@/lib/db/client'
import {decryptSecret} from '@/lib/secrets'
import {reject} from './errors'

export type ConsultationHistoryItem={
 id:string;doctor_name:string;doctor_slug:string;speciality:string;clinic:string;
 kind:string;subject_name:string;subject_kind:string;visited_at:string;
 completed_at:string|null;started_at:string|null;encounter_id:string|null
}
type HistoryRow=ConsultationHistoryItem&{person_id:string|null;person_identity:string|null}
const PAGE_SIZE=20

/** Completed visits only. Booking requests and video join tokens are not proof of attendance. */
export async function consultationHistory(actorId:string,cursor?:string){
 await ensureSchema()
 let before:string|null=null,id:string|null=null
 if(cursor)try{
  if(cursor.length>400||!/^[A-Za-z0-9_-]+$/.test(cursor))throw new Error()
  const value=JSON.parse(Buffer.from(cursor,'base64url').toString())
  if(typeof value.at!=='string'||!Number.isFinite(new Date(value.at).getTime())||typeof value.id!=='string'||!value.id.length||value.id.length>150)throw new Error()
  before=new Date(value.at).toISOString();id=value.id
 }catch{reject('CURSOR','Invalid consultation history cursor.',400)}
 return getDb().transaction(async tx=>{
  if(!await tx.one("SELECT id FROM patient.users WHERE id=$1 AND status='ACTIVE'",[actorId]))reject('FORBIDDEN','Please sign in again.',403)
  const rows=await tx.query<HistoryRow>(`WITH visits AS (
   SELECT 'booking:'||b.id id,d.name doctor_name,d.slug doctor_slug,d.speciality,
    coalesce(c.name,nullif(d.clinic,''),'Clinic') clinic,b.kind,
    coalesce(p.name,f.name,u.name,'Patient') subject_name,
    CASE WHEN b.pet_id IS NOT NULL THEN 'pet' ELSE 'human' END subject_kind,
    coalesce(b.started_at,b.starts_at,b.attended_at,b.created_at) visited_at,
    b.attended_at completed_at,b.started_at,e.id encounter_id,
    NULL::text person_id,NULL::text person_identity
   FROM patient.bookings b JOIN provider.doctors d ON d.id=b.doctor_id
    JOIN patient.users u ON u.id=b.user_id LEFT JOIN clinic.clinics c ON c.id=d.clinic_id
    LEFT JOIN patient.pets p ON p.id=b.pet_id AND p.owner_id=b.user_id
    LEFT JOIN patient.family_members f ON f.id=b.patient_for AND f.user_id=b.user_id
    LEFT JOIN clinic.encounters e ON e.booking_id=b.id AND e.patient_user_id=b.user_id
   WHERE b.user_id=$1 AND b.status='attended'
   UNION ALL
   SELECT 'walk-in:'||w.id,d.name,d.slug,d.speciality,c.name,'clinic',
    'Clinic patient',p.kind,coalesce(w.started_at,w.checked_in_at),w.ended_at,w.started_at,e.id,
    p.id,p.encrypted_identity
   FROM clinic.walk_ins w JOIN clinic.people p ON p.id=w.person_id
    JOIN clinic.encounters e ON e.walk_in_id=w.id AND e.clinic_person_id=p.id
    JOIN provider.doctors d ON d.id=w.doctor_id JOIN clinic.clinics c ON c.id=w.clinic_id
   WHERE w.state='ATTENDED' AND p.owner_id=$1 AND e.patient_user_id=$1
  ) SELECT * FROM visits
   WHERE ($2::timestamptz IS NULL OR (visited_at,id)<($2::timestamptz,$3::text))
   ORDER BY visited_at DESC,id DESC LIMIT $4`,[actorId,before,id,PAGE_SIZE+1])
  const page=rows.slice(0,PAGE_SIZE),last=page.at(-1)
  const items=page.map(({person_id,person_identity,...visit})=>{
   if(person_id&&person_identity){
    const identity=JSON.parse(decryptSecret(person_identity,'person:'+person_id)) as {name?:unknown}
    return {...visit,subject_name:typeof identity.name==='string'?identity.name:'Clinic patient'}
   }
   return visit
  })
  await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'consultation:read-own-history',$1)",[actorId])
  return {items,next:rows.length>PAGE_SIZE&&last?Buffer.from(JSON.stringify({at:last.visited_at,id:last.id})).toString('base64url'):null}
 })
}

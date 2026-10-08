import 'server-only'
import {randomUUID} from 'node:crypto'
import {getDb,ensureSchema,type Db} from '@/lib/db/client'
import {encryptSecret,decryptSecret} from '@/lib/secrets'
import {normalizePhone} from './otp'
import {boundedText,reject} from './errors'
import {clinicAccess} from './clinic-access'
export type Address={id:string;label:string;street:string;locality:string;city:string;pin:string;contactPhone:string;instructions:string}
export async function saveAddress(actorId:string,raw:Record<string,unknown>){
 const data={label:boundedText(raw.label,60,1),street:boundedText(raw.street,300,3),locality:boundedText(raw.locality,100,2),city:boundedText(raw.city,100,2),pin:boundedText(raw.pin,6,6),contactPhone:normalizePhone(String(raw.contactPhone??'')),instructions:boundedText(raw.instructions??'',500)}
 if(!/^\d{6}$/.test(data.pin)||!data.contactPhone)reject('ADDRESS','Provide a six-digit PIN and valid Indian contact number.',400)
 await ensureSchema();return getDb().transaction(async tx=>{
  if(!await tx.one("SELECT id FROM patient.users WHERE id=$1 AND status='ACTIVE' FOR UPDATE",[actorId]))reject('FORBIDDEN','Sign in required.',403)
  const count=await tx.one<{n:string}>('SELECT count(*) n FROM patient.addresses WHERE user_id=$1 AND archived_at IS NULL',[actorId]);if(Number(count?.n)>=20)reject('LIMIT','Review your saved addresses before adding more.')
  const id='addr_'+randomUUID();await tx.query('INSERT INTO patient.addresses(id,user_id,label,encrypted_address,pin_code) VALUES($1,$2,$3,$4,$5)',[id,actorId,data.label,encryptSecret(JSON.stringify(data),'address:'+id),data.pin])
  await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'address:create',$2)",[actorId,id]);return id
 })
}
export async function ownAddresses(actorId:string){await ensureSchema();const rows=await getDb().query<{id:string;encrypted_address:string}>('SELECT id,encrypted_address FROM patient.addresses WHERE user_id=$1 AND archived_at IS NULL ORDER BY created_at DESC',[actorId]);return rows.map(r=>({id:r.id,...JSON.parse(decryptSecret(r.encrypted_address,'address:'+r.id))} as Address))}
export async function homeAddressSnapshot(tx:Db,actorId:string,id:string){const row=await tx.one<{encrypted_address:string}>('SELECT encrypted_address FROM patient.addresses WHERE id=$1 AND user_id=$2 AND archived_at IS NULL FOR SHARE',[id,actorId]);if(!row)reject('ADDRESS','Choose one of your own active addresses.',403);return JSON.parse(decryptSecret(row.encrypted_address,'address:'+id)) as Omit<Address,'id'>}
export async function dispatchList(actorId:string,clinicId:string){await ensureSchema();return getDb().transaction(async tx=>{
 await clinicAccess(tx,actorId,clinicId,['clinician','receptionist','administrator'])
 const rows=await tx.query<{booking_id:string;state:string;revision:number;assigned_to:string|null;starts_at:string;status:string;subject_name:string;encrypted_home_address:string}>(`SELECT h.*,b.starts_at,b.status,b.encrypted_home_address,coalesce(p.name,f.name,u.name) subject_name FROM clinic.home_visits h JOIN patient.bookings b ON b.id=h.booking_id JOIN patient.users u ON u.id=b.user_id LEFT JOIN patient.pets p ON p.id=b.pet_id LEFT JOIN patient.family_members f ON f.id=b.patient_for WHERE h.clinic_id=$1 AND b.status IN ('confirmed','attended','no_show','cancelled') ORDER BY b.starts_at DESC LIMIT 100`,[clinicId])
 await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'dispatch:read',$2)",[actorId,clinicId])
 return rows.map(({encrypted_home_address,...r})=>({...r,address:JSON.parse(decryptSecret(encrypted_home_address,'booking-home:'+r.booking_id)) as Address}))
 })}
export async function transitionHomeVisit(actorId:string,id:string,revision:number,next:string,assignee?:string){
 const transitions:Record<string,string[]>={UNASSIGNED:['ASSIGNED'],ASSIGNED:['EN_ROUTE'],EN_ROUTE:['ARRIVED'],ARRIVED:['COMPLETED']}
 await ensureSchema();return getDb().transaction(async tx=>{
  const row=await tx.one<{clinic_id:string;state:string;revision:number;assigned_to:string|null;status:string}>(`SELECT h.*,b.status FROM clinic.home_visits h JOIN patient.bookings b ON b.id=h.booking_id WHERE h.booking_id=$1 FOR UPDATE OF h,b`,[id])
  if(!row)reject('NOT_FOUND','Home visit unavailable.',404)
  const access=await clinicAccess(tx,actorId,row.clinic_id,['clinician','receptionist','administrator'])
  if(row.revision!==revision||!transitions[row.state]?.includes(next)||!['confirmed','attended'].includes(row.status))reject('STATE','This dispatch changed or is no longer eligible.')
  if(next==='ASSIGNED'){if(!assignee)reject('ASSIGNEE','Choose active clinic staff.');await clinicAccess(tx,assignee,row.clinic_id,['clinician','receptionist','administrator'])}
  else if(row.assigned_to!==actorId&&access.role!=='administrator')reject('FORBIDDEN','The assigned staff member must record this event.',403)
  if(next==='COMPLETED'&&row.status!=='attended')reject('STATE','The clinician must record the attended consultation before completing dispatch.')
  await tx.query('UPDATE clinic.home_visits SET state=$2,assigned_to=CASE WHEN $2=\'ASSIGNED\' THEN $3 ELSE assigned_to END,revision=revision+1,updated_at=now() WHERE booking_id=$1',[id,next,assignee??null])
  await tx.query("INSERT INTO audit_log(actor_id,action,resource,detail) VALUES($1,'dispatch:transition',$2,$3::jsonb)",[actorId,id,JSON.stringify({from:row.state,to:next})])
 })
}

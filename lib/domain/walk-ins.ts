import 'server-only'
import {randomUUID,randomBytes,createHash} from 'node:crypto'
import {getDb,ensureSchema} from '@/lib/db/client'
import {encryptSecret,decryptSecret,privateKey} from '@/lib/secrets'
import {paise} from '@/lib/money'
import {normalizePhone} from './otp'
import {boundedText,reject} from './errors'
import {clinicAccess,activeDoctor} from './clinic-access'
type Identity={name:string;phone:string;dob:string|null;sex:string;species:string;guardian:string;reason:string}
export async function registerWalkIn(actorId:string,input:{clinicId:string;doctorId:string;name:string;phone:string;dob?:string;sex:string;kind:string;species?:string;guardian?:string;reason:string;consentAttested:boolean;requestKey:string}){
 const name=boundedText(input.name,80,2),phone=normalizePhone(input.phone),reason=boundedText(input.reason,2000),key=boundedText(input.requestKey,128,16)
 if(!phone||!['human','pet'].includes(input.kind)||!input.consentAttested)reject('IDENTITY','Record a valid contact and the patient or guardian’s actual in-person consent.',400)
 const dob=input.dob||null
 if(dob&&(!/^\d{4}-\d{2}-\d{2}$/.test(dob)||Number.isNaN(new Date(dob).getTime())||new Date(dob).toISOString().slice(0,10)!==dob||new Date(dob)>new Date()))reject('DATE','Check the birth date.',400)
 const identity:Identity={name,phone,dob,sex:boundedText(input.sex,30),species:boundedText(input.species??'',20),guardian:boundedText(input.guardian??'',80),reason}
 if(input.kind==='pet'&&(!['dog','cat','rabbit','bird','other'].includes(identity.species)||identity.guardian.length<2))reject('SPECIES','Record the pet species and guardian name.',400)
 await ensureSchema();return getDb().transaction(async tx=>{
  await clinicAccess(tx,actorId,input.clinicId,['clinician','receptionist','administrator'])
  await tx.query('SELECT id FROM clinic.clinics WHERE id=$1 FOR UPDATE',[input.clinicId])
  const requestHash=createHash('sha256').update(JSON.stringify([actorId,input.doctorId,input.kind,identity])).digest('hex')
  const existing=await tx.one<{id:string;request_hash:string}>('SELECT id,request_hash FROM clinic.walk_ins WHERE clinic_id=$1 AND request_key=$2',[input.clinicId,key]);if(existing){if(existing.request_hash!==requestHash)reject('IDEMPOTENCY','This receipt request contains different visit details.');return {id:existing.id,claimToken:null}}
  const doctor=await activeDoctor(tx,input.doctorId,input.clinicId)
  if((doctor.kind==='vet')!==(input.kind==='pet')||(input.kind==='pet'&&!doctor.supported_species.includes(identity.species)))reject('SPECIES','The selected practitioner does not support this care subject.',400)
  const id='walk_'+randomUUID(),person='person_'+randomUUID(),claim=randomBytes(32).toString('base64url')
  await tx.query('INSERT INTO clinic.people(id,clinic_id,kind,encrypted_identity,claim_hash,claim_expires_at,created_by,consent_attested_at) VALUES($1,$2,$3,$4,$5,now()+interval \'7 days\',$6,now())',[person,input.clinicId,input.kind,encryptSecret(JSON.stringify(identity),'person:'+person),privateKey('clinic-claim',claim),actorId])
  await tx.query('INSERT INTO clinic.walk_ins(id,clinic_id,person_id,doctor_id,fee_paise,request_key,created_by,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,input.clinicId,person,doctor.id,paise(BigInt(doctor.fee)*100n).toString(),key,actorId,requestHash])
  await tx.query('INSERT INTO clinic.encounters(id,walk_in_id,doctor_id,clinic_person_id) VALUES($1,$2,$3,$4)',['enc_'+randomUUID(),id,doctor.id,person])
  await tx.query('INSERT INTO clinic.invoices(id,walk_in_id,clinic_person_id,total_paise) VALUES($1,$2,$3,$4)',['inv_'+randomUUID(),id,person,String(doctor.fee*100)])
  await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'walk-in:register',$2)",[actorId,id])
  return {id,claimToken:claim}
 })
}
export async function clinicWalkIns(actorId:string,clinicId:string){await ensureSchema();return getDb().transaction(async tx=>{
 await clinicAccess(tx,actorId,clinicId,['clinician','receptionist','administrator'])
 const rows=await tx.query<{id:string;person_id:string;encrypted_identity:string;doctor_id:string;doctor_name:string;state:string;checked_in_at:string;started_at:string|null;fee_paise:string;revision:number;invoice_id:string;invoice_state:string}>(`SELECT w.*,p.encrypted_identity,d.name doctor_name,i.id invoice_id,i.state invoice_state FROM clinic.walk_ins w JOIN clinic.people p ON p.id=w.person_id JOIN provider.doctors d ON d.id=w.doctor_id JOIN clinic.invoices i ON i.walk_in_id=w.id WHERE w.clinic_id=$1 AND (w.checked_in_at AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date ORDER BY w.checked_in_at LIMIT 200`,[clinicId])
 await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'walk-in:read',$2)",[actorId,clinicId])
 return rows.map(({encrypted_identity,...row})=>({...row,identity:JSON.parse(decryptSecret(encrypted_identity,'person:'+row.person_id)) as Identity}))
})}
export async function transitionWalkIn(actorId:string,id:string,revision:number,next:string){
 const transitions:Record<string,string[]>={WAITING:['IN_PROGRESS','NO_SHOW','CANCELLED'],IN_PROGRESS:['ATTENDED']}
 await ensureSchema();return getDb().transaction(async tx=>{
  const initial=await tx.one<{clinic_id:string;doctor_id:string}>('SELECT clinic_id,doctor_id FROM clinic.walk_ins WHERE id=$1',[id]);if(!initial)reject('NOT_FOUND','Walk-in unavailable.',404)
  await clinicAccess(tx,actorId,initial.clinic_id,['clinician','receptionist','administrator'])
  if(next==='IN_PROGRESS')await tx.query('SELECT id FROM provider.doctors WHERE id=$1 FOR UPDATE',[initial.doctor_id])
  const w=await tx.one<{clinic_id:string;doctor_id:string;state:string;revision:number}>('SELECT * FROM clinic.walk_ins WHERE id=$1 FOR UPDATE',[id]);if(!w)reject('NOT_FOUND','Walk-in unavailable.',404)
  const access=await clinicAccess(tx,actorId,w.clinic_id,['clinician','receptionist','administrator'])
  if(w.revision!==revision||!transitions[w.state]?.includes(next))reject('STATE','The walk-in changed or this transition is unavailable.')
  if(['IN_PROGRESS','ATTENDED'].includes(next)){const d=await activeDoctor(tx,w.doctor_id,w.clinic_id);if(d.user_id!==actorId||access.role!=='clinician')reject('FORBIDDEN','Only the assigned verified clinician can start or complete this encounter.',403)}
  if(next==='IN_PROGRESS'&&await tx.one("SELECT id FROM patient.bookings WHERE doctor_id=$1 AND status='confirmed' AND started_at IS NOT NULL UNION ALL SELECT id FROM clinic.walk_ins WHERE doctor_id=$1 AND id<>$2 AND state='IN_PROGRESS' LIMIT 1",[w.doctor_id,id]))reject('IN_PROGRESS','Complete the current assigned consultation before starting another.')
  await tx.query("UPDATE clinic.walk_ins SET state=$2,revision=revision+1,started_at=CASE WHEN $2='IN_PROGRESS' THEN now() ELSE started_at END,ended_at=CASE WHEN $2 IN ('ATTENDED','NO_SHOW','CANCELLED') THEN now() ELSE ended_at END WHERE id=$1",[id,next])
  if(['ATTENDED','NO_SHOW','CANCELLED'].includes(next))await tx.query("UPDATE clinic.encounters SET state='CLOSED',closed_at=now() WHERE walk_in_id=$1",[id])
  if(next==='CANCELLED')await tx.query("UPDATE clinic.invoices SET state='VOID' WHERE walk_in_id=$1 AND state='UNPAID'",[id])
  await tx.query("INSERT INTO audit_log(actor_id,action,resource,detail) VALUES($1,'walk-in:transition',$2,$3::jsonb)",[actorId,id,JSON.stringify({from:w.state,to:next})])
 })
}
export async function claimClinicVisit(actorId:string,token:string,confirmed:boolean){
 if(!confirmed||! /^[A-Za-z0-9_-]{40,80}$/.test(token))reject('CLAIM','Provide your clinic claim receipt and confirm this is your or your dependent’s visit.',400)
 await ensureSchema();return getDb().transaction(async tx=>{
  const user=await tx.one<{phone:string|null}>('SELECT phone FROM patient.users WHERE id=$1 AND status=\'ACTIVE\' FOR UPDATE',[actorId])
  if(!user?.phone)reject('PHONE','A verified matching phone is required before claiming a clinic visit.',403)
  const p=await tx.one<{id:string;encrypted_identity:string}>('SELECT id,encrypted_identity FROM clinic.people WHERE claim_hash=$1 AND owner_id IS NULL AND claim_expires_at>now() FOR UPDATE',[privateKey('clinic-claim',token)])
  if(!p)reject('CLAIM','The receipt is unavailable, expired or already used.',404)
  const identity=JSON.parse(decryptSecret(p.encrypted_identity,'person:'+p.id)) as Identity
  if(normalizePhone(user.phone)!==identity.phone)reject('CLAIM','The signed-in phone does not match the recorded guardian or patient contact.',403)
  await tx.query('UPDATE clinic.people SET owner_id=$2,linked_at=now(),claim_hash=NULL WHERE id=$1',[p.id,actorId])
  await tx.query('UPDATE clinic.encounters SET patient_user_id=$2 WHERE clinic_person_id=$1',[p.id,actorId])
  await tx.query('UPDATE clinic.invoices SET user_id=$2 WHERE clinic_person_id=$1',[p.id,actorId])
  await tx.query("INSERT INTO patient.consents(id,actor_id,purpose,subject_id,version) VALUES($1,$2,'walk-in-sharing',$3,'walk-in-v1')",['cns_'+randomUUID(),actorId,p.id])
  await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'walk-in:claim',$2)",[actorId,p.id])
  return p.id
 })
}

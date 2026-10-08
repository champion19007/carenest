import 'server-only'
import {randomUUID} from 'node:crypto'
import {getDb,ensureSchema} from '@/lib/db/client'
import {boundedText,reject} from './errors'
export type ProviderDraft={name:string;kind:'human'|'vet';speciality:string;qualification:string;registration:string;council:string;clinic:string;address:string;city:string;pin:string;fee:number;experience:number;languages:string;supportedSpecies:string[]}
export function parseProviderDraft(value:Record<string,unknown>):ProviderDraft {
 const fee=Number(value.fee),experience=Number(value.experience),kind=String(value.kind)
 if(!['human','vet'].includes(kind)||!Number.isInteger(fee)||fee<0||fee>1000000||!Number.isInteger(experience)||experience<0||experience>70)reject('VALIDATION','Check provider type, fee and experience.',400)
 const pin=boundedText(value.pin,6,6);if(!/^\d{6}$/.test(pin))reject('VALIDATION','Enter a six-digit PIN code.',400)
 const species=Array.isArray(value.supportedSpecies)?value.supportedSpecies.map(String):['dog','cat']
 if(species.some(s=>!['dog','cat','rabbit','bird','other'].includes(s)))reject('VALIDATION','Choose supported species from the list.',400)
 return {name:boundedText(value.name,80,2),kind:kind as 'human'|'vet',speciality:boundedText(value.speciality,100,2),qualification:boundedText(value.qualification,300,2),registration:boundedText(value.registration,80,2),council:boundedText(value.council,120,2),clinic:boundedText(value.clinic,120,2),address:boundedText(value.address,300,3),city:boundedText(value.city,80,2),pin,fee,experience,languages:boundedText(value.languages,200,2),supportedSpecies:species}
}
export async function providerApplication(actorId:string) {
 await ensureSchema()
 const application=await getDb().one<{id:string;draft:ProviderDraft;status:string;revision:number;reason:string|null}>("SELECT id,draft,status,revision,reason FROM provider.applications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1",[actorId])
 return application
}
export async function saveProviderApplication(actorId:string,raw:Record<string,unknown>) {
 const draft=parseProviderDraft(raw);await ensureSchema()
 return getDb().transaction(async tx=>{
  if(!await tx.one("SELECT id FROM patient.users WHERE id=$1 AND status='ACTIVE' FOR UPDATE",[actorId]))reject('FORBIDDEN','Sign in required.',403)
  if(await tx.one('SELECT id FROM provider.doctors WHERE user_id=$1',[actorId]))reject('EXISTING_PROVIDER','Use your existing practice settings. Publication changes need a verification review.')
  const existing=await tx.one<{id:string;status:string}>("SELECT id,status FROM provider.applications WHERE user_id=$1 AND status IN ('DRAFT','SUBMITTED','NEEDS_CHANGES') FOR UPDATE",[actorId])
  if(existing?.status==='SUBMITTED')reject('SUBMITTED','This case is awaiting review. Request changes through support.')
  const id=existing?.id??'application_'+randomUUID()
  if(existing)await tx.query("UPDATE provider.applications SET draft=$2::jsonb,status='DRAFT',revision=revision+1,updated_at=now() WHERE id=$1",[id,JSON.stringify(draft)])
  else await tx.query('INSERT INTO provider.applications(id,user_id,draft) VALUES($1,$2,$3::jsonb)',[id,actorId,JSON.stringify(draft)])
  await tx.query("INSERT INTO onboarding_events(application_id,actor_id,action) VALUES($1,$2,'DRAFT_SAVED')",[id,actorId])
  return id
 })
}
export async function submitProviderApplication(actorId:string,id:string) {
 await ensureSchema()
 return getDb().transaction(async tx=>{
  const a=await tx.one<{status:string;draft:ProviderDraft}>('SELECT status,draft FROM provider.applications WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,actorId])
  if(!await tx.one("SELECT id FROM patient.users WHERE id=$1 AND status='ACTIVE' FOR SHARE",[actorId]))reject('FORBIDDEN','Current account access is required.',403)
  if(!a||!['DRAFT','NEEDS_CHANGES'].includes(a.status))reject('STATE','That verification case cannot be submitted.')
  parseProviderDraft(a.draft as unknown as Record<string,unknown>)
  if(!await tx.one("SELECT id FROM private_files WHERE application_id=$1 AND owner_id=$2 AND state='CLEAN'",[id,actorId]))reject('EVIDENCE','Upload readable safety-checked registration evidence before submitting.')
  await tx.query("UPDATE provider.applications SET status='SUBMITTED',submitted_at=now(),revision=revision+1 WHERE id=$1",[id])
  await tx.query("INSERT INTO onboarding_events(application_id,actor_id,action) VALUES($1,$2,'SUBMITTED')",[id,actorId])
  return id
 })
}
export async function reviewProviderApplication(adminId:string,id:string,decision:string,reason:string,checked:boolean) {
 if(!['APPROVED','REJECTED','NEEDS_CHANGES'].includes(decision))reject('VALIDATION','Choose a review decision.',400)
 boundedText(reason,1000,10)
 if(decision==='APPROVED'&&!checked)reject('VERIFICATION','Record a completed professional registration check before approval.',400)
 await ensureSchema()
 return getDb().transaction(async tx=>{
  if(!await tx.one('SELECT id FROM admins WHERE id=$1 AND totp_secret IS NOT NULL',[adminId]))reject('FORBIDDEN','Administrator required.',403)
  const a=await tx.one<{user_id:string;draft:ProviderDraft;status:string;doctor_id:string|null}>('SELECT user_id,draft,status,doctor_id FROM provider.applications WHERE id=$1 FOR UPDATE',[id])
  if(!a||a.status!=='SUBMITTED')reject('STATE','That case already changed.')
  let doctorId=a.doctor_id
  if(decision==='APPROVED'){
   if(!await tx.one("SELECT id FROM patient.users WHERE id=$1 AND status='ACTIVE' FOR SHARE",[a.user_id]))reject('FORBIDDEN','The applicant account is no longer active.',403)
   const evidence=await tx.one("SELECT id FROM private_files WHERE application_id=$1 AND owner_id=$2 AND state='CLEAN'",[id,a.user_id])
   if(!evidence)reject('EVIDENCE','Registration evidence is missing or quarantined.')
   const d=parseProviderDraft(a.draft as unknown as Record<string,unknown>),clinicId='clinic_'+randomUUID()
   doctorId??='doctor_'+randomUUID()
   await tx.query('INSERT INTO clinic.clinics(id,name,address,city) VALUES($1,$2,$3,$4)',[clinicId,d.clinic,d.address,d.city])
   const slug=d.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50)+'-'+randomUUID().slice(0,8)
   await tx.query(`INSERT INTO provider.doctors(id,user_id,slug,name,speciality,qualification,experience,clinic,pin_code,city,fee,registration_no,council,status,verified_at,clinic_id,kind,languages,supported_species)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'ACTIVE',now(),$14,$15,$16,$17)`,[doctorId,a.user_id,slug,d.name,d.speciality,d.qualification,d.experience,d.clinic,d.pin,d.city,d.fee,d.registration,d.council,clinicId,d.kind,d.languages,d.supportedSpecies])
   await tx.query("UPDATE patient.users SET role='doctor',kyc_level='verified' WHERE id=$1",[a.user_id])
   await tx.query("INSERT INTO clinic.memberships(clinic_id,user_id,role) VALUES($1,$2,'clinician')",[clinicId,a.user_id])
   await tx.query("INSERT INTO provider.status_history(id,doctor_id,to_status,reason,actor) VALUES($1,$2,'ACTIVE',$3,$4)",['status_'+randomUUID(),doctorId,reason,adminId])
  }
  await tx.query('UPDATE provider.applications SET status=$2,reason=$3,reviewed_at=now(),reviewed_by=$4,doctor_id=$5,revision=revision+1 WHERE id=$1',[id,decision,reason,adminId,doctorId])
  await tx.query('INSERT INTO onboarding_events(application_id,actor_id,action,detail) VALUES($1,$2,$3,$4)',[id,adminId,decision,reason])
  await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'provider:review',$2)",[adminId,id])
 })
}

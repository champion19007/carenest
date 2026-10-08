import 'server-only'
import {randomUUID} from 'node:crypto'
import {getDb,ensureSchema} from '@/lib/db/client'
import {boundedText,reject} from './errors'
import {encryptSecret} from '@/lib/secrets'
export async function createEnquiry(actorId:string,input:{city:unknown;procedure:unknown;notes:unknown;consent:boolean;aiConsent:boolean}){
 if(!input.consent)reject('CONSENT','Agree to share this enquiry with the care coordination team.',400)
 const city=boundedText(input.city,80,2),procedure=boundedText(input.procedure,120,2),notes=boundedText(input.notes??'',1000)
 await ensureSchema();return getDb().transaction(async tx=>{
  const user=await tx.one<{name:string;phone:string|null}>("SELECT name,phone FROM patient.users WHERE id=$1 AND status='ACTIVE' FOR SHARE",[actorId]);if(!user)reject('FORBIDDEN','Sign in required.',403)
  const id='lead_'+randomUUID()
  await tx.query('INSERT INTO clinic.surgery_leads(id,user_id,name,phone,city,procedure,notes) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,actorId,user.name,user.phone??'',city,procedure,encryptSecret(notes,'enquiry:'+id)])
  await tx.query('INSERT INTO patient.consents(id,actor_id,purpose,subject_id,version) VALUES($1,$2,$3,$4,$5)',['consent_'+randomUUID(),actorId,'care-coordination',id,'enquiry-v1'])
  if(input.aiConsent)await tx.query('INSERT INTO patient.consents(id,actor_id,purpose,subject_id,version) VALUES($1,$2,$3,$4,$5)',['consent_'+randomUUID(),actorId,'enquiry-ai',id,'enquiry-ai-v1'])
  await tx.query("INSERT INTO domain_events(kind,subject_id,payload,event_key) VALUES('lead.triage',$1,$2::jsonb,$3)",[id,JSON.stringify({userId:actorId}),'lead:'+id+':triage'])
  await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'enquiry:create',$2)",[actorId,id])
  return id
 })
}
export async function routeEnquiry(adminId:string,id:string,doctorId:string,centreName:string){
 if(!doctorId&&!centreName)reject('VALIDATION','Choose a referral destination.',400)
 boundedText(centreName,150)
 await ensureSchema();return getDb().transaction(async tx=>{
  const lead=await tx.one<{status:string}>('SELECT status FROM clinic.surgery_leads WHERE id=$1 FOR UPDATE',[id])
  if(lead?.status!=='APPROVED')reject('STATE','Only a current approved enquiry can be routed.')
  if(doctorId){const d=await tx.one("SELECT id FROM provider.doctors WHERE id=$1 AND kind='human' AND status='ACTIVE' FOR SHARE",[doctorId]);if(!d)reject('PROVIDER','That provider cannot receive this referral.')}
  if(doctorId)await tx.query("INSERT INTO clinic.referrals(id,lead_id,kind,doctor_id,status) VALUES($1,$2,'doctor',$3,'RECORDED')",['referral_'+randomUUID(),id,doctorId])
  if(centreName)await tx.query("INSERT INTO clinic.referrals(id,lead_id,kind,centre_name,status) VALUES($1,$2,'diagnostic',$3,'RECORDED')",['referral_'+randomUUID(),id,centreName])
  await tx.query("UPDATE clinic.surgery_leads SET status='ROUTED',reviewed_by=$2,reviewed_at=now() WHERE id=$1",[id,adminId])
  await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'enquiry:route',$2)",[adminId,id])
 })
}

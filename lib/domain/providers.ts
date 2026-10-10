import 'server-only'
import {randomUUID} from 'node:crypto'
import {getDb,ensureSchema} from '@/lib/db/client'
import {reject} from './errors'
import {parseProviderDraft,validateKycReview,type ProviderDraft} from './provider-validation'
import {KYC_EVIDENCE,KYC_POLICY_VERSION,missingKycEvidence,type KycReviewChecks} from '@/lib/kyc'
export {parseProviderDraft,type ProviderDraft} from './provider-validation'
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
  if(existing)await tx.query("UPDATE provider.applications SET draft=$2::jsonb,status='DRAFT',consent_at=NULL,evidence_snapshot=NULL,policy_version=NULL,revision=revision+1,updated_at=now() WHERE id=$1",[id,JSON.stringify(draft)])
  else await tx.query('INSERT INTO provider.applications(id,user_id,draft) VALUES($1,$2,$3::jsonb)',[id,actorId,JSON.stringify(draft)])
  await tx.query("INSERT INTO onboarding_events(application_id,actor_id,action) VALUES($1,$2,'DRAFT_SAVED')",[id,actorId])
  return id
 })
}
export async function submitProviderApplication(actorId:string,id:string,attested=false,expectedRevision?:number) {
 await ensureSchema()
 return getDb().transaction(async tx=>{
  const a=await tx.one<{status:string;draft:ProviderDraft;revision:number}>('SELECT status,draft,revision FROM provider.applications WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,actorId])
  if(!await tx.one("SELECT id FROM patient.users WHERE id=$1 AND status='ACTIVE' FOR SHARE",[actorId]))reject('FORBIDDEN','Current account access is required.',403)
  if(!a||!['DRAFT','NEEDS_CHANGES'].includes(a.status))reject('STATE','That verification case cannot be submitted.')
  if(expectedRevision!==undefined&&expectedRevision!==a.revision)reject('REVISION','The verification draft changed. Refresh before submitting.')
  parseProviderDraft(a.draft as unknown as Record<string,unknown>)
  const files=await tx.query<{id:string;evidence_kind:string|null;state:string}>("SELECT id,evidence_kind,state FROM private_files WHERE application_id=$1 AND owner_id=$2 ORDER BY created_at DESC,id DESC FOR SHARE",[id,actorId])
  const missing=missingKycEvidence(files);if(missing.length)reject('EVIDENCE','Upload safety-checked evidence for: '+missing.join(', ')+'.')
  if(!attested)reject('CONSENT','Confirm that your evidence is accurate and you authorise the verification review.',400)
  const snapshot=Object.fromEntries(KYC_EVIDENCE.map(item=>[item.kind,files.find(file=>file.evidence_kind===item.kind)!.id]))
  await tx.query("UPDATE provider.applications SET status='SUBMITTED',submitted_at=now(),consent_at=now(),evidence_snapshot=$2::jsonb,policy_version=$3,revision=revision+1,updated_at=now() WHERE id=$1",[id,JSON.stringify(snapshot),KYC_POLICY_VERSION])
  await tx.query("INSERT INTO onboarding_events(application_id,actor_id,action) VALUES($1,$2,'SUBMITTED')",[id,actorId])
  return id
 })
}
export async function reviewProviderApplication(adminId:string,id:string,decision:string,reason:string,checks:KycReviewChecks) {
 validateKycReview(decision,reason,checks)
 await ensureSchema()
 return getDb().transaction(async tx=>{
  if(!await tx.one('SELECT id FROM admins WHERE id=$1 AND totp_secret IS NOT NULL',[adminId]))reject('FORBIDDEN','Administrator required.',403)
  const a=await tx.one<{user_id:string;draft:ProviderDraft;status:string;doctor_id:string|null;revision:number;consent_at:string|null;evidence_snapshot:Record<string,string>|null;policy_version:string|null}>('SELECT * FROM provider.applications WHERE id=$1 FOR UPDATE',[id])
  if(!a||a.status!=='SUBMITTED')reject('STATE','That case already changed.')
  if(a.revision!==checks.revision)reject('REVISION','The verification case changed. Refresh before reviewing.')
  let doctorId=a.doctor_id
  if(decision==='APPROVED'){
   if(!await tx.one("SELECT id FROM patient.users WHERE id=$1 AND status='ACTIVE' FOR SHARE",[a.user_id]))reject('FORBIDDEN','The applicant account is no longer active.',403)
   if(!a.consent_at||a.policy_version!==KYC_POLICY_VERSION||!a.evidence_snapshot)reject('EVIDENCE','This case needs the current evidence checklist and applicant consent.')
   const evidence=await tx.query<{id:string;evidence_kind:string|null;state:string}>('SELECT id,evidence_kind,state FROM private_files WHERE application_id=$1 AND owner_id=$2 AND id=ANY($3::text[]) FOR SHARE',[id,a.user_id,Object.values(a.evidence_snapshot)])
   if(missingKycEvidence(evidence).length||KYC_EVIDENCE.some(item=>!evidence.some(file=>file.id===a.evidence_snapshot![item.kind]&&file.evidence_kind===item.kind&&file.state==='CLEAN')))reject('EVIDENCE','Submitted evidence is missing, changed or quarantined.')
   const d=parseProviderDraft(a.draft as unknown as Record<string,unknown>),clinicId='clinic_'+randomUUID()
   await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[d.kind+':'+d.council.toLowerCase()+':'+d.registration.replace(/\s/g,'').toLowerCase()])
   if(await tx.one("SELECT id FROM provider.doctors WHERE kind=$1 AND lower(trim(council))=lower(trim($2)) AND lower(regexp_replace(registration_no,'\\s','','g'))=lower(regexp_replace($3::text,'\\s','','g')) AND is_demo=false",[d.kind,d.council,d.registration]))reject('REGISTRATION_DUPLICATE','This professional registration already has a provider profile.')
   doctorId??='doctor_'+randomUUID()
   await tx.query('INSERT INTO clinic.clinics(id,name,address,city) VALUES($1,$2,$3,$4)',[clinicId,d.clinic,d.address,d.city])
   const slug=d.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50)+'-'+randomUUID().slice(0,8)
   const area=await tx.one<{locality_id:number;name:string}>('SELECT locality_id,name FROM localities WHERE pin_code=$1',[d.pin])
   await tx.query(`INSERT INTO provider.doctors(id,user_id,slug,name,speciality,qualification,experience,clinic,pin_code,city,fee,registration_no,council,status,verified_at,clinic_id,kind,languages,supported_species,locality_id,locality)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'ACTIVE',now(),$14,$15,$16,$17,$18,$19)`,[doctorId,a.user_id,slug,d.name,d.speciality,d.qualification,d.experience,d.clinic,d.pin,d.city,d.fee,d.registration,d.council,clinicId,d.kind,d.languages,d.supportedSpecies,area?.locality_id??null,area?.name??''])
   await tx.query("UPDATE patient.users SET role='doctor',kyc_level='verified' WHERE id=$1",[a.user_id])
   await tx.query("INSERT INTO clinic.memberships(clinic_id,user_id,role) VALUES($1,$2,'clinician')",[clinicId,a.user_id])
   await tx.query("INSERT INTO provider.status_history(id,doctor_id,to_status,reason,actor) VALUES($1,$2,'ACTIVE',$3,$4)",['status_'+randomUUID(),doctorId,reason,adminId])
  }
  await tx.query('INSERT INTO provider.kyc_reviews(id,application_id,application_revision,reviewer_id,decision,checks,source_url,source_reference,reason,evidence_snapshot,policy_version) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb,$11)',['kyc_'+randomUUID(),id,a.revision,adminId,decision,JSON.stringify(checks),checks.sourceUrl||null,checks.sourceReference||null,reason,JSON.stringify(a.evidence_snapshot),KYC_POLICY_VERSION])
  await tx.query('UPDATE provider.applications SET status=$2,reason=$3,reviewed_at=now(),reviewed_by=$4,doctor_id=$5,revision=revision+1 WHERE id=$1',[id,decision,reason,adminId,doctorId])
  await tx.query('INSERT INTO onboarding_events(application_id,actor_id,action,detail) VALUES($1,$2,$3,$4)',[id,adminId,decision,reason])
  await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'provider:review',$2)",[adminId,id])
 })
}

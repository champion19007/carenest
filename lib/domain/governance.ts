import 'server-only'
import {randomUUID} from 'node:crypto'
import {getDb,ensureSchema,type Db} from '@/lib/db/client'
import {localMode,encryptSecret,decryptSecret} from '@/lib/secrets'
import {boundedText,reject} from './errors'
export async function adminAccess(tx:Db,adminId:string){if(!await tx.one('SELECT id FROM admins WHERE id=$1 AND totp_secret IS NOT NULL',[adminId]))reject('FORBIDDEN','MFA administrator access is required.',403)}
export async function saveCompanySettings(adminId:string,raw:Record<string,unknown>){
 const value={brand:boundedText(raw.brand,100,2),legalName:boundedText(raw.legalName,200,2),registration:boundedText(raw.registration,100,2),address:boundedText(raw.address,500,5),grievanceName:boundedText(raw.grievanceName,100,2),grievanceEmail:boundedText(raw.grievanceEmail,254,5),grievancePhone:boundedText(raw.grievancePhone,30,5),verified:false}
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.grievanceEmail))reject('EMAIL','Provide the actual grievance contact email.',400)
 await ensureSchema();await getDb().transaction(async tx=>{await adminAccess(tx,adminId);await tx.query("INSERT INTO platform.settings(name,value,updated_by) VALUES('company',$1::jsonb,$2) ON CONFLICT(name) DO UPDATE SET value=excluded.value,revision=platform.settings.revision+1,updated_by=$2,updated_at=now()",[JSON.stringify(value),adminId]);await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'company:update','company')",[adminId])})
}
export async function companySettings(){await ensureSchema();const row=await getDb().one<{value:Record<string,unknown>}>("SELECT value FROM platform.settings WHERE name='company'");return row?.value??null}
export async function submitPolicy(adminId:string,kind:string,content:unknown,evidence:string){
 if(!['CLINICAL','PRIVACY','PRESCRIBING'].includes(kind)||!content||typeof content!=='object'||Array.isArray(content))reject('POLICY','Provide a structured policy and correct kind.',400)
 const encoded=JSON.stringify(content);if(encoded.length>50000)reject('LIMIT','Policy is too large.',400);boundedText(evidence,2000,10)
 await ensureSchema();return getDb().transaction(async tx=>{await adminAccess(tx,adminId);await tx.query('SELECT id FROM admins WHERE id=$1 FOR UPDATE',[adminId]);const count=await tx.one<{version:number}>('SELECT coalesce(max(version),0)+1 version FROM review_policies WHERE kind=$1',[kind]);const id='policy_'+randomUUID();await tx.query('INSERT INTO review_policies(id,kind,version,content,evidence) VALUES($1,$2,$3,$4::jsonb,$5)',[id,kind,count?.version??1,encoded,evidence]);await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'policy:draft',$2)",[adminId,id]);return id})
}
export async function approvePolicy(adminId:string,id:string,reviewerId:string,attested:boolean){
 if(!attested)reject('REVIEW','Record completed human review before enabling the policy.',400)
 await ensureSchema();await getDb().transaction(async tx=>{
  await adminAccess(tx,adminId)
  const reviewer=await tx.one<{is_demo:boolean;kind:string;supported_species:string[]}>(`SELECT d.is_demo,d.kind,d.supported_species FROM patient.users u JOIN provider.doctors d ON d.user_id=u.id WHERE u.id=$1 AND u.status='ACTIVE' AND u.role='doctor' AND u.kyc_level='verified' AND d.status='ACTIVE' AND (d.verified_at IS NOT NULL OR ($2::boolean AND d.is_demo)) FOR SHARE OF u,d`,[reviewerId,localMode()])
  if(!reviewer)reject('REVIEWER','Select a current qualified reviewer. Legal/privacy approval also requires the appropriate external professional evidence.',403)
  const policy=await tx.one<{kind:string;content:Record<string,unknown>}>('SELECT kind,content FROM review_policies WHERE id=$1 AND state=\'DRAFT\' FOR UPDATE',[id]);if(!policy)reject('STATE','Policy unavailable or already reviewed.')
  if(policy.kind==='PRESCRIBING'){const species=policy.content.species,allowed=reviewer.kind==='vet'?reviewer.supported_species:['human'];if(!Array.isArray(species)||!species.length||species.some(s=>typeof s!=='string'||!allowed.includes(s)))reject('REVIEW_SCOPE','The policy must name its reviewed species, within this reviewer’s verified human or veterinary practice scope.',400)}
  if(policy.kind==='PRIVACY'){
   const days=policy.content.retentionDays as Record<string,unknown>|undefined
   if(!days||!['clinical','financial','contact'].every(k=>Number.isInteger(days[k])&&Number(days[k])>=0&&Number(days[k])<=36500)||typeof policy.content.legalReviewReference!=='string'||policy.content.legalReviewReference.length<10)reject('LEGAL_REVIEW','Record explicit retention periods and actual legal review evidence. No default legal period is assumed.',400)
  }
  await tx.query("UPDATE review_policies SET state='APPROVED',reviewer_id=$2,approved_by=$3,approved_at=now(),content=content||$4::jsonb WHERE id=$1",[id,reviewerId,adminId,JSON.stringify({demo:reviewer.is_demo})])
  await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'policy:approve',$2)",[adminId,id])
 })
}
export async function policies(adminId:string){await ensureSchema();await adminAccess(getDb(),adminId);return getDb().query<{id:string;kind:string;version:number;state:string;content:Record<string,unknown>;evidence:string}>('SELECT * FROM review_policies ORDER BY kind,version DESC')}
export async function approvedPolicy(kind:string){await ensureSchema();return getDb().one<{id:string;content:Record<string,unknown>;version:number}>("SELECT id,content,version FROM review_policies WHERE kind=$1 AND state='APPROVED' AND ($2::boolean OR coalesce((content->>'demo')::boolean,false)=false) ORDER BY version DESC LIMIT 1",[kind,localMode()])}
export async function ownConsentList(actorId:string){await ensureSchema();return getDb().query<{id:string;purpose:string;subject_id:string;booking_id:string|null;granted_at:string;revoked_at:string|null}>('SELECT id,purpose,subject_id,booking_id,granted_at,revoked_at FROM patient.consents WHERE actor_id=$1 ORDER BY granted_at DESC LIMIT 300',[actorId])}
export async function revokeConsent(actorId:string,id:string){await ensureSchema();return getDb().transaction(async tx=>{
 if(!await tx.one("SELECT id FROM patient.users WHERE id=$1 AND status IN ('ACTIVE','RESTRICTED') FOR SHARE",[actorId]))reject('FORBIDDEN','Sign in required.',403)
 const consent=await tx.one<{booking_id:string|null;purpose:string}>('UPDATE patient.consents SET revoked_at=coalesce(revoked_at,now()) WHERE id=$1 AND actor_id=$2 RETURNING booking_id,purpose',[id,actorId]);if(!consent)reject('NOT_FOUND','Consent unavailable.',404)
 await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'consent:revoke',$2)",[actorId,id])
 await tx.query("INSERT INTO domain_events(kind,subject_id,payload,event_key) VALUES('consent.revoked',$1,$2::jsonb,$3) ON CONFLICT DO NOTHING",[consent.booking_id??id,JSON.stringify({userId:actorId,purpose:consent.purpose}),'consent:'+id+':revoked'])
})}
export async function requestPrivacyAction(actorId:string,kind:string,detail:string){
 if(!['ACCESS','CORRECTION','DELETION','RESTRICTION'].includes(kind))reject('KIND','Choose an available privacy request.',400);boundedText(detail,2000,10)
 await ensureSchema();return getDb().transaction(async tx=>{
  if(!await tx.one("SELECT id FROM patient.users WHERE id=$1 AND status IN ('ACTIVE','RESTRICTED') FOR UPDATE",[actorId]))reject('FORBIDDEN','Sign in required.',403)
  const open=await tx.one('SELECT id FROM patient.privacy_requests WHERE user_id=$1 AND kind=$2 AND state IN (\'REQUESTED\',\'IN_REVIEW\',\'APPROVED\')',[actorId,kind]);if(open)reject('DUPLICATE','A request of this kind is already being reviewed.')
  const id='privacy_'+randomUUID();await tx.query('INSERT INTO patient.privacy_requests(id,user_id,kind,encrypted_detail) VALUES($1,$2,$3,$4)',[id,actorId,kind,encryptSecret(detail,'privacy:'+id)])
  await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'privacy:request',$2)",[actorId,id]);return id
 })
}
export async function privacyRequests(actorId:string,admin=false){await ensureSchema();if(admin)await adminAccess(getDb(),actorId);const rows=await getDb().query<{id:string;user_id:string;kind:string;state:string;encrypted_detail:string;encrypted_decision:string|null;due_at:string}>('SELECT * FROM patient.privacy_requests WHERE ($2::boolean OR user_id=$1) ORDER BY created_at DESC LIMIT 100',[actorId,admin]);await getDb().query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'privacy:read',$1)",[actorId]);return rows.map(({encrypted_detail,encrypted_decision,...r})=>({...r,detail:decryptSecret(encrypted_detail,'privacy:'+r.id),decision:encrypted_decision?decryptSecret(encrypted_decision,'privacy-decision:'+r.id):null}))}
export async function decidePrivacyRequest(adminId:string,id:string,next:string,decision:string){
 if(!['IN_REVIEW','APPROVED','REJECTED','COMPLETED'].includes(next))reject('STATE','Choose a review status.',400);boundedText(decision,2000,10)
 await ensureSchema();await getDb().transaction(async tx=>{
  await adminAccess(tx,adminId);const r=await tx.one<{user_id:string;kind:string;state:string}>('SELECT user_id,kind,state FROM patient.privacy_requests WHERE id=$1 FOR UPDATE',[id]);const transitions:Record<string,string[]>={REQUESTED:['IN_REVIEW','APPROVED','REJECTED'],IN_REVIEW:['APPROVED','REJECTED','COMPLETED'],APPROVED:['COMPLETED']};if(!r||!transitions[r.state]?.includes(next))reject('STATE','Request unavailable, resolved or not eligible for this review transition.')
  if(next==='COMPLETED'&&r.kind==='DELETION')reject('RETENTION','Use the retention execution operation after legal review; a status change cannot erase records.')
  if(next==='APPROVED'&&r.kind==='RESTRICTION'){await tx.query("UPDATE patient.users SET status='RESTRICTED' WHERE id=$1",[r.user_id]);await tx.query('UPDATE patient.consents SET revoked_at=coalesce(revoked_at,now()) WHERE actor_id=$1',[r.user_id]);await tx.query('DELETE FROM mobile_devices WHERE user_id=$1',[r.user_id]);await tx.query("INSERT INTO domain_events(kind,subject_id,payload,event_key) VALUES('consent.revoked',$1,$2::jsonb,$3) ON CONFLICT DO NOTHING",[id,JSON.stringify({userId:r.user_id,purpose:'account-restriction'}),'privacy:'+id+':restriction'])}
  await tx.query('UPDATE patient.privacy_requests SET state=$2,reviewed_by=$3,encrypted_decision=$4,resolved_at=CASE WHEN $2 IN (\'REJECTED\',\'COMPLETED\') THEN now() ELSE resolved_at END WHERE id=$1',[id,next,adminId,encryptSecret(decision,'privacy-decision:'+id)])
  await tx.query("INSERT INTO audit_log(actor_id,action,resource,detail) VALUES($1,'privacy:decision',$2,$3::jsonb)",[adminId,id,JSON.stringify({state:next})])
 })
}
export async function executeAccountErasure(adminId:string,requestId:string,confirmed:boolean){
 if(!confirmed)reject('CONFIRM','Confirm the reviewed, irreversible contact-erasure action.',400)
 const policy=await approvedPolicy('PRIVACY');if(!policy)reject('POLICY','An approved legally reviewed retention policy is required.',409)
 await ensureSchema();await getDb().transaction(async tx=>{
  await adminAccess(tx,adminId);const request=await tx.one<{user_id:string}>('SELECT user_id FROM patient.privacy_requests WHERE id=$1 AND kind=\'DELETION\' AND state=\'APPROVED\' FOR UPDATE',[requestId]);if(!request)reject('STATE','An approved deletion request is required.')
  if(await tx.one('SELECT id FROM retention_holds WHERE user_id=$1 AND (expires_at IS NULL OR expires_at>now())',[request.user_id]))reject('HOLD','A retention hold requires resolution before execution.')
  const retention=policy.content.retentionDays as {contact:number;clinical:number;financial:number}
  const created=await tx.one<{eligible:boolean}>("SELECT created_at+($2||' days')::interval<=now() eligible FROM patient.privacy_requests WHERE id=$1",[requestId,String(retention.contact)])
  if(!created?.eligible)reject('RETENTION','The reviewed contact-retention period has not elapsed.')
  if(await tx.one("SELECT id FROM provider.doctors WHERE user_id=$1 AND status='ACTIVE' UNION ALL SELECT clinic_id FROM clinic.memberships WHERE user_id=$1 AND status='ACTIVE' UNION ALL SELECT partner_id FROM pharmacy.memberships WHERE user_id=$1 AND status='ACTIVE' LIMIT 1",[request.user_id]))reject('OFFBOARDING','Resolve active professional and staff assignments before account erasure.')
  if(await tx.one("SELECT id FROM patient.bookings WHERE user_id=$1 AND status IN ('requested','confirmed') UNION ALL SELECT id FROM patient.lab_orders WHERE user_id=$1 AND state NOT IN ('COMPLETED','CANCELLED') UNION ALL SELECT id FROM pharmacy.orders WHERE user_id=$1 AND state NOT IN ('DELIVERED','REJECTED','CANCELLED') UNION ALL SELECT w.id FROM clinic.walk_ins w JOIN clinic.people p ON p.id=w.person_id WHERE p.owner_id=$1 AND w.state IN ('WAITING','IN_PROGRESS') LIMIT 1",[request.user_id]))reject('ACTIVE_CARE','Resolve or cancel active care and fulfilment requests before executing account erasure.')
  await tx.query("UPDATE patient.users SET name='Erased account',phone=NULL,email=NULL,email_verified_at=NULL,google_sub=NULL,dob=NULL,gender=NULL,city=NULL,status='ERASED' WHERE id=$1",[request.user_id])
  await tx.query('DELETE FROM patient.sessions WHERE user_id=$1',[request.user_id]);await tx.query('DELETE FROM mobile_devices WHERE user_id=$1',[request.user_id]);await tx.query('UPDATE patient.consents SET revoked_at=coalesce(revoked_at,now()) WHERE actor_id=$1',[request.user_id])
  await tx.query("INSERT INTO domain_events(kind,subject_id,payload,event_key) VALUES('consent.revoked',$1,$2::jsonb,$3) ON CONFLICT DO NOTHING",[requestId,JSON.stringify({userId:request.user_id,purpose:'account-restriction'}),'privacy:'+requestId+':erasure'])
  await tx.query('DELETE FROM patient.notification_preferences WHERE user_id=$1',[request.user_id]);await tx.query('DELETE FROM patient.notifications WHERE user_id=$1',[request.user_id])
  const addresses=await tx.query<{id:string}>('SELECT id FROM patient.addresses WHERE user_id=$1',[request.user_id]);for(const a of addresses)await tx.query("UPDATE patient.addresses SET encrypted_address=$2,label='Erased address',archived_at=now() WHERE id=$1",[a.id,encryptSecret('{}','address:'+a.id)])
  await tx.query("UPDATE patient.privacy_requests SET state='COMPLETED_WITH_RETENTION',resolved_at=now(),encrypted_decision=$2 WHERE id=$1",[requestId,encryptSecret(JSON.stringify({policyId:policy.id,contactErased:true,clinicalRetentionDays:retention.clinical,financialRetentionDays:retention.financial,retained:'Immutable care and financial records; held for reviewed retention execution'}),'privacy-decision:'+requestId)])
  await tx.query("INSERT INTO audit_log(actor_id,action,resource,detail) VALUES($1,'privacy:contact-erasure',$2,$3::jsonb)",[adminId,request.user_id,JSON.stringify({policyId:policy.id})])
 })
}
export async function purgeRetainedContent(adminId:string,requestId:string,confirmed:boolean){
 if(!confirmed)reject('CONFIRM','Confirm actual legal review and irreversible retained-content redaction.',400)
 const policy=await approvedPolicy('PRIVACY');if(!policy)reject('POLICY','An approved legally reviewed retention policy is required.')
 await ensureSchema();await getDb().transaction(async tx=>{
  await adminAccess(tx,adminId)
  const request=await tx.one<{user_id:string;state:string}>("SELECT r.user_id,r.state FROM patient.privacy_requests r JOIN patient.users u ON u.id=r.user_id WHERE r.id=$1 AND r.kind='DELETION' AND u.status='ERASED' FOR UPDATE OF r,u",[requestId]);if(request?.state==='RETAINED_CONTENT_PURGED')return;if(!request||request.state!=='COMPLETED_WITH_RETENTION')reject('STATE','Reviewed account-contact erasure must be completed first.')
  const documents=await tx.query<{id:string}>('SELECT d.id FROM documents d LEFT JOIN clinic.encounters e ON e.id=d.encounter_id WHERE d.owner_id=$1 OR e.patient_user_id=$1',[request.user_id]),ids=documents.map(d=>d.id)
  if(await tx.one('SELECT id FROM retention_holds WHERE (user_id=$1 OR resource_id=ANY($2::text[])) AND (expires_at IS NULL OR expires_at>now())',[request.user_id,ids]))reject('HOLD','A retention hold prevents retained-content redaction.')
  const periods=policy.content.retentionDays as {clinical:number;financial:number},days=Math.max(periods.clinical,periods.financial)
  const eligible=await tx.one<{eligible:boolean}>(`SELECT greatest(r.resolved_at,coalesce((SELECT max(created_at) FROM documents WHERE id=ANY($3::text[])),r.resolved_at),coalesce((SELECT max(created_at) FROM clinic.invoices WHERE user_id=$2),r.resolved_at),coalesce((SELECT max(created_at) FROM private_files f WHERE f.owner_id=$2 OR EXISTS(SELECT 1 FROM clinic.encounters e WHERE e.id=f.encounter_id AND e.patient_user_id=$2)),r.resolved_at))+($4||' days')::interval<=now() eligible FROM patient.privacy_requests r WHERE r.id=$1`,[requestId,request.user_id,ids,String(days)])
  if(!eligible?.eligible)reject('RETENTION','The reviewed clinical/financial periods have not elapsed since the latest retained source or account erasure.')
  const erased={retentionErased:true,policyId:policy.id,redactedAt:new Date().toISOString()}
  for(const d of documents){const body=JSON.stringify({_encrypted:encryptSecret(JSON.stringify(erased),'clinical:'+d.id)});await tx.query("INSERT INTO document_maintenance_permits(document_id,operation,old_body,new_body,approved_by,privacy_request_id,policy_id) SELECT id,'RETENTION_REDACTION',body,$2::jsonb,$3,$4,$5 FROM documents WHERE id=$1",[d.id,body,adminId,requestId,policy.id]);await tx.query('UPDATE documents SET body=$2::jsonb,lifecycle=\'RETENTION_ERASED\' WHERE id=$1',[d.id,body]);await tx.query('DELETE FROM document_maintenance_permits WHERE document_id=$1',[d.id])}
  const safety=await tx.query<{id:string;record_id:string;reviewer_id:string}>('SELECT id,record_id,reviewer_id FROM prescription_safety_reviews WHERE record_id=ANY($1::text[])',[ids]);for(const s of safety)await tx.query('UPDATE prescription_safety_reviews SET encrypted_detail=$2 WHERE id=$1',[s.id,encryptSecret('Retained clinical review content erased','safety:'+s.record_id+':'+s.reviewer_id)])
  const people=await tx.query<{id:string}>('SELECT id FROM clinic.people WHERE owner_id=$1',[request.user_id]);for(const p of people)await tx.query('UPDATE clinic.people SET encrypted_identity=$2,claim_hash=NULL WHERE id=$1',[p.id,encryptSecret(JSON.stringify({name:'Erased clinic subject',phone:'',reason:''}),'person:'+p.id)])
  await tx.query("UPDATE patient.family_members SET name='Erased dependent',dob=NULL,gender=NULL,archived_at=now() WHERE user_id=$1",[request.user_id])
  await tx.query("UPDATE patient.pets SET name='Erased pet',breed='',dob=NULL,microchip=NULL,archived_at=now() WHERE owner_id=$1",[request.user_id])
  const visits=await tx.query<{id:string}>('SELECT id FROM patient.bookings WHERE user_id=$1 AND encrypted_home_address IS NOT NULL',[request.user_id]);for(const b of visits)await tx.query('UPDATE patient.bookings SET encrypted_home_address=$2 WHERE id=$1',[b.id,encryptSecret('{}','booking-home:'+b.id)])
  const orders=await tx.query<{id:string}>('SELECT id FROM pharmacy.orders WHERE user_id=$1',[request.user_id]);for(const o of orders)await tx.query('UPDATE pharmacy.orders SET encrypted_address=$2 WHERE id=$1',[o.id,encryptSecret('{}','pharmacy-address:'+o.id)])
  for(const o of orders)await tx.query('UPDATE pharmacy.fulfilments SET tracking_ref=NULL,encrypted_receipt=$2 WHERE order_id=$1',[o.id,encryptSecret('{}','pharmacy-receipt:'+o.id)])
  const integrations=await tx.query<{id:string}>('SELECT id FROM integration_cases WHERE user_id=$1',[request.user_id]);for(const i of integrations)await tx.query('UPDATE integration_cases SET encrypted_payload=$2,external_ref=NULL WHERE id=$1',[i.id,encryptSecret('{}','integration:'+i.id)])
  const leads=await tx.query<{id:string}>('SELECT id FROM clinic.surgery_leads WHERE user_id=$1',[request.user_id]);for(const l of leads)await tx.query("UPDATE clinic.surgery_leads SET name='Erased account',phone='',notes=$2 WHERE id=$1",[l.id,encryptSecret('Retained content erased','enquiry:'+l.id)])
  const support=await tx.query<{id:string}>('SELECT id FROM support_cases WHERE user_id=$1',[request.user_id]);for(const s of support)await tx.query("UPDATE support_cases SET subject='Erased support content',detail=$2 WHERE id=$1",[s.id,encryptSecret('Retained content erased','support:'+s.id)])
  const files=await tx.query<{id:string}>("UPDATE private_files f SET state='PURGE_PENDING' WHERE (f.owner_id=$1 OR EXISTS(SELECT 1 FROM clinic.encounters e WHERE e.id=f.encounter_id AND e.patient_user_id=$1)) AND f.state<>'PURGED' RETURNING f.id",[request.user_id])
  for(const f of files)await tx.query("INSERT INTO domain_events(kind,subject_id,payload,event_key) VALUES('privacy.file_purge',$1,'{}',$2) ON CONFLICT DO NOTHING",[f.id,'privacy-file:'+f.id])
  await tx.query("UPDATE patient.privacy_requests SET state='RETAINED_CONTENT_PURGED',encrypted_decision=$2 WHERE id=$1",[requestId,encryptSecret(JSON.stringify({policyId:policy.id,redactedClinicalDocuments:ids.length,pendingPrivateFileDeletions:files.length,retained:'Pseudonymous audit, consent, appointment and financial metadata. Backups follow separate approved retention.'}),'privacy-decision:'+requestId)])
  await tx.query("INSERT INTO audit_log(actor_id,action,resource,detail) VALUES($1,'privacy:retained-content-redaction',$2,$3::jsonb)",[adminId,request.user_id,JSON.stringify({policyId:policy.id,documents:ids.length,filePurges:files.length})])
 })
}

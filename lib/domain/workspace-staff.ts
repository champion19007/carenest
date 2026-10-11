import 'server-only'
import {randomUUID} from 'node:crypto'
import {getDb,ensureSchema} from '@/lib/db/client'
import {encryptSecret,decryptSecret,localMode} from '@/lib/secrets'
import {boundedText,reject} from './errors'
import {workspaceTransaction,workspaceKey,requestDigest,workspaceAudit} from './workspace-access'
export async function requestStaffAccess(actorId:string,input:{name:string;email:string;role:string;note:string;requestKey:string}){
 const key=workspaceKey(input.requestKey),body={name:boundedText(input.name,80,2),email:boundedText(input.email,254,3).toLowerCase(),note:boundedText(input.note,1000)},hash=requestDigest([body,input.role])
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)||!['clinician','receptionist','lab'].includes(input.role))reject('STAFF','Choose a staff role and enter the employee’s verified account email.',400)
 return workspaceTransaction(actorId,async(tx,d)=>{const prior=await tx.one<{id:string;request_hash:string}>('SELECT id,request_hash FROM clinic.staff_requests WHERE doctor_id=$1 AND request_key=$2',[d.id,key]);if(prior){if(prior.request_hash!==hash)reject('IDEMPOTENCY','This staff access request changed.');return prior.id}
 const id='staff-request_'+randomUUID();await tx.query('INSERT INTO clinic.staff_requests(id,doctor_id,clinic_id,encrypted_body,requested_role,request_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,d.id,d.clinic_id,encryptSecret(JSON.stringify(body),'staff-request:'+id),input.role,key,hash]);await workspaceAudit(tx,actorId,'practice:staff-requested',id);return id
 },true)
}
export async function ownStaffRequests(actorId:string){return workspaceTransaction(actorId,async(tx,d)=>{const rows=await tx.query<{id:string;state:string;requested_role:string;revision:number;encrypted_body:string;created_at:string}>('SELECT * FROM clinic.staff_requests WHERE doctor_id=$1 ORDER BY created_at DESC LIMIT 100',[d.id]);await workspaceAudit(tx,actorId,'practice:staff-requests-read',d.id);return rows.map(({encrypted_body,...row})=>({...row,body:JSON.parse(decryptSecret(encrypted_body,'staff-request:'+row.id)) as {name:string;email:string;note:string}}))})}
export async function adminStaffRequests(adminId:string){await ensureSchema();return getDb().transaction(async tx=>{if(!await tx.one('SELECT id FROM admins WHERE id=$1 AND totp_secret IS NOT NULL',[adminId]))reject('FORBIDDEN','Enrolled administrator required.',403);const rows=await tx.query<{id:string;requested_role:string;revision:number;encrypted_body:string;clinic_name:string;clinician_name:string;state:string}>('SELECT r.*,c.name clinic_name,d.name clinician_name FROM clinic.staff_requests r JOIN clinic.clinics c ON c.id=r.clinic_id JOIN provider.doctors d ON d.id=r.doctor_id ORDER BY r.created_at DESC LIMIT 100');await workspaceAudit(tx,adminId,'admin:staff-requests-read','staff-requests');return rows.map(({encrypted_body,...row})=>({...row,body:JSON.parse(decryptSecret(encrypted_body,'staff-request:'+row.id)) as {name:string;email:string;note:string}}))})}
export async function reviewStaffAccess(adminId:string,id:string,revision:number,decision:'APPROVED'|'REJECTED',attested:boolean){
 if(!['APPROVED','REJECTED'].includes(decision)||!attested)reject('STAFF','Attest the requested identity, role and clinic authorization before deciding.',400)
 await ensureSchema();return getDb().transaction(async tx=>{
 if(!await tx.one('SELECT id FROM admins WHERE id=$1 AND totp_secret IS NOT NULL FOR SHARE',[adminId]))reject('FORBIDDEN','Enrolled administrator required.',403)
 const request=await tx.one<{doctor_id:string;clinic_id:string;encrypted_body:string;requested_role:string;state:string;revision:number}>('SELECT * FROM clinic.staff_requests WHERE id=$1 FOR UPDATE',[id]);if(!request||request.state!=='PENDING'||request.revision!==revision)reject('CHANGED','This staff request changed.',409)
 if(decision==='APPROVED'){
  const body=JSON.parse(decryptSecret(request.encrypted_body,'staff-request:'+id)),user=await tx.one<{id:string;role:string;kyc_level:string}>('SELECT id,role,kyc_level FROM patient.users WHERE lower(email)=$1 AND email_verified_at IS NOT NULL AND status=\'ACTIVE\' FOR SHARE',[body.email])
  if(!user)reject('IDENTITY','The employee must first verify that email on an active account.',409)
  if(!await tx.one("SELECT d.id FROM provider.doctors d JOIN patient.users u ON u.id=d.user_id JOIN clinic.clinics c ON c.id=d.clinic_id JOIN clinic.memberships m ON m.clinic_id=c.id AND m.user_id=u.id WHERE d.id=$1 AND c.status='ACTIVE' AND d.status='ACTIVE' AND u.status='ACTIVE' AND u.role='doctor' AND u.kyc_level='verified' AND m.status='ACTIVE' AND m.role IN ('clinician','administrator') AND (d.verified_at IS NOT NULL OR ($2::boolean AND d.is_demo))",[request.doctor_id,localMode()]))reject('CLINIC','The requesting practice is no longer eligible.',409)
  if(request.requested_role==='clinician'&&(!await tx.one("SELECT id FROM provider.doctors WHERE user_id=$1 AND clinic_id=$2 AND status='ACTIVE' AND verified_at IS NOT NULL",[user.id,request.clinic_id])||user.role!=='doctor'||user.kyc_level!=='verified'))reject('VERIFICATION','A clinician needs professional verification and an approved link to this clinic.',409)
  const existing=await tx.one<{role:string;status:string}>('SELECT role,status FROM clinic.memberships WHERE clinic_id=$1 AND user_id=$2 FOR UPDATE',[request.clinic_id,user.id])
  if(existing&&(existing.role!==request.requested_role||existing.status!=='ACTIVE'))reject('MEMBERSHIP','An existing role or revoked membership needs a separate authorized review.',409)
  await tx.query('INSERT INTO clinic.memberships(clinic_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[request.clinic_id,user.id,request.requested_role])
 }
 await tx.query('UPDATE clinic.staff_requests SET state=$2,revision=revision+1,reviewed_by=$3 WHERE id=$1',[id,decision,adminId]);await workspaceAudit(tx,adminId,'admin:staff-'+decision.toLowerCase(),id)
 })
}

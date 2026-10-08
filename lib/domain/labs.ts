import 'server-only'
import {randomUUID} from 'node:crypto'
import {getDb,ensureSchema,type Db} from '@/lib/db/client'
import {localMode} from '@/lib/secrets'
import {boundedText,reject} from './errors'
export type LabPackage={id:string;name:string;description:string;fee_paise:string;clinic_id:string;clinic_name:string;address:string;is_demo:boolean}
export async function labPackages(){await ensureSchema();return getDb().query<LabPackage>(`SELECT p.*,c.name clinic_name,c.address FROM clinic.lab_packages p JOIN clinic.clinics c ON c.id=p.clinic_id
 WHERE p.status='ACTIVE' AND c.status='ACTIVE' AND (p.verified_at IS NOT NULL OR ($1::boolean AND p.is_demo)) ORDER BY p.name LIMIT 100`,[localMode()])}
export async function requestLabOrder(actorId:string,packageId:string,familyId:string|null,key:string,consent:boolean){
 boundedText(key,128,16);if(!consent)reject('CONSENT','Agree to share necessary details with the selected lab.',400)
 await ensureSchema();return getDb().transaction(async tx=>{
  if(!await tx.one("SELECT id FROM patient.users WHERE id=$1 AND status='ACTIVE' FOR UPDATE",[actorId]))reject('FORBIDDEN','Sign in required.',403)
  const existing=await tx.one<{id:string;package_id:string;family_id:string|null}>('SELECT id,package_id,family_id FROM patient.lab_orders WHERE user_id=$1 AND idempotency_key=$2',[actorId,key])
  if(existing){if(existing.package_id!==packageId||existing.family_id!==familyId)reject('IDEMPOTENCY','The request key already identifies different details.');return existing.id}
  const p=await tx.one<LabPackage>(`SELECT p.*,c.name clinic_name FROM clinic.lab_packages p JOIN clinic.clinics c ON c.id=p.clinic_id WHERE p.id=$1 AND p.status='ACTIVE' AND c.status='ACTIVE' AND (p.verified_at IS NOT NULL OR ($2::boolean AND p.is_demo)) FOR SHARE OF p,c`,[packageId,localMode()])
  if(!p)reject('PACKAGE','That laboratory package is not published.')
  if(familyId&&!await tx.one('SELECT id FROM patient.family_members WHERE id=$1 AND user_id=$2 AND archived_at IS NULL',[familyId,actorId]))reject('SUBJECT','That household member is unavailable.',403)
  const id='lab_'+randomUUID()
  await tx.query('INSERT INTO patient.lab_orders(id,user_id,family_id,package_id,fee_paise,idempotency_key) VALUES($1,$2,$3,$4,$5,$6)',[id,actorId,familyId,packageId,p.fee_paise,key])
  await tx.query('INSERT INTO clinic.invoices(id,lab_order_id,user_id,total_paise) VALUES($1,$2,$3,$4)',['invoice_'+randomUUID(),id,actorId,p.fee_paise])
  await tx.query("INSERT INTO patient.consents(id,actor_id,purpose,subject_id,version) VALUES($1,$2,'lab-sharing',$3,'lab-v1')",['consent_'+randomUUID(),actorId,id])
  await tx.query("INSERT INTO domain_events(kind,subject_id,payload,event_key) VALUES('lab.requested',$1,$2::jsonb,$3)",[id,JSON.stringify({userId:actorId}),'lab:'+id+':requested'])
  await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'lab:request',$2)",[actorId,id])
  return id
 })
}
export async function ownLabOrders(actorId:string){await ensureSchema();return getDb().query<{id:string;name:string;state:string;scheduled_at:string|null;fee_paise:string;result_file_id:string|null;invoice_id:string;invoice_state:string;is_demo:boolean}>(`SELECT o.*,p.name,p.is_demo,i.id invoice_id,i.state invoice_state FROM patient.lab_orders o JOIN clinic.lab_packages p ON p.id=o.package_id LEFT JOIN clinic.invoices i ON i.lab_order_id=o.id WHERE o.user_id=$1 ORDER BY o.created_at DESC LIMIT 100`,[actorId])}
export async function labStaffOrders(actorId:string){await ensureSchema();return getDb().query<{id:string;user_id:string;name:string;patient_name:string;state:string;clinic_id:string}>(`SELECT o.*,p.name,p.clinic_id,u.name patient_name FROM patient.lab_orders o JOIN clinic.lab_packages p ON p.id=o.package_id JOIN patient.users u ON u.id=o.user_id
 JOIN clinic.memberships m ON m.clinic_id=p.clinic_id AND m.user_id=$1 AND m.status='ACTIVE' AND m.role IN ('lab','administrator') ORDER BY o.created_at DESC LIMIT 200`,[actorId])}
async function staff(tx:Db,actorId:string,clinicId:string){if(!await tx.one("SELECT m.user_id FROM clinic.memberships m JOIN patient.users u ON u.id=m.user_id JOIN clinic.clinics c ON c.id=m.clinic_id WHERE m.user_id=$1 AND m.clinic_id=$2 AND m.role IN ('lab','administrator') AND m.status='ACTIVE' AND u.status='ACTIVE' AND c.status='ACTIVE' FOR SHARE OF m,u,c",[actorId,clinicId]))reject('FORBIDDEN','Lab staff access is required.',403)}
export async function updateLabOrder(actorId:string,id:string,next:string,scheduledAt:string,resultFile:string){
 if(!['CONFIRMED','COLLECTED','PROCESSING','COMPLETED','CANCELLED'].includes(next))reject('STATE','Choose a valid order transition.',400)
 await ensureSchema();return getDb().transaction(async tx=>{
  const order=await tx.one<{user_id:string;clinic_id:string;state:string}>(`SELECT o.*,p.clinic_id FROM patient.lab_orders o JOIN clinic.lab_packages p ON p.id=o.package_id WHERE o.id=$1 FOR UPDATE OF o`,[id])
  if(!order)reject('NOT_FOUND','Order unavailable.',404);await staff(tx,actorId,order.clinic_id)
  const transitions:Record<string,string[]>={REQUESTED:['CONFIRMED','CANCELLED'],CONFIRMED:['COLLECTED','CANCELLED'],COLLECTED:['PROCESSING'],PROCESSING:['COMPLETED']}
  if(!transitions[order.state]?.includes(next))reject('STATE','This order changed or the transition is unavailable.')
  if(next==='CONFIRMED'&&(Number.isNaN(new Date(scheduledAt).getTime())||new Date(scheduledAt).getTime()<=Date.now()))reject('TIME','Confirm a future collection time.',400)
  if(next==='COMPLETED'){
   const file=await tx.one<{uploaded_by:string}>("SELECT uploaded_by FROM private_files WHERE id=$1 AND lab_order_id=$2 AND owner_id=$3 AND state='CLEAN'",[resultFile,id,order.user_id])
   if(!file)reject('RESULT','Attach the actual safety-checked result for this order.');await staff(tx,file.uploaded_by,order.clinic_id)
  }
  await tx.query('UPDATE patient.lab_orders SET state=$2,scheduled_at=CASE WHEN $2=\'CONFIRMED\' THEN $3::timestamptz ELSE scheduled_at END,result_file_id=CASE WHEN $2=\'COMPLETED\' THEN $4 ELSE result_file_id END WHERE id=$1',[id,next,next==='CONFIRMED'?scheduledAt:null,resultFile||null])
  if(next==='CANCELLED')await tx.query("UPDATE clinic.invoices SET state='VOID' WHERE lab_order_id=$1 AND state='UNPAID'",[id])
  await tx.query("INSERT INTO domain_events(kind,subject_id,payload,event_key) VALUES('lab.updated',$1,$2::jsonb,$3) ON CONFLICT DO NOTHING",[id,JSON.stringify({userId:order.user_id}),'lab:'+id+':'+next])
  await tx.query("INSERT INTO audit_log(actor_id,action,resource,detail) VALUES($1,'lab:transition',$2,$3::jsonb)",[actorId,id,JSON.stringify({from:order.state,to:next})])
 })
}

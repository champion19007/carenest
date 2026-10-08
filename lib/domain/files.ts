import 'server-only'
import {randomUUID,createHash} from 'node:crypto'
import {mkdir,writeFile,readFile,unlink} from 'node:fs/promises'
import path from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import sharp from 'sharp'
import {getDb,ensureSchema,type Db} from '@/lib/db/client'
import {encryptSecret,decryptSecret,localMode} from '@/lib/secrets'
import {boundedText,reject} from './errors'
export type FileContext={encounterId?:string;applicationId?:string;labOrderId?:string}
type FileRow={id:string;owner_id:string|null;clinic_owner_id:string|null;encounter_id:string|null;application_id:string|null;lab_order_id:string|null;storage_key:string;state:string;mime:string;original_name:string;bytes:string}
const directory=()=>path.resolve(/* turbopackIgnore: true */ process.env.PRIVATE_FILE_ROOT??path.join(process.cwd(),'.data','files'))
async function contextOwner(tx:Db,actorId:string,context:FileContext,upload=false) {
 const user=await tx.one<{role:string;kyc_level:string;status:string}>('SELECT role,kyc_level,status FROM patient.users WHERE id=$1 FOR SHARE',[actorId])
 if(!user||(user.status!=='ACTIVE'&&(upload||user.status!=='RESTRICTED')))reject('FORBIDDEN','Sign in required.',403)
 if(Object.values(context).filter(Boolean).length>1)reject('VALIDATION','Choose one file purpose.',400)
 if(context.encounterId){
  const e=await tx.one<{patient_user_id:string|null;clinic_id:string;doctor_user:string;doctor_status:string;provider_verified:boolean;consent:boolean}>(`SELECT e.patient_user_id,d.clinic_id,d.user_id doctor_user,d.status doctor_status,(d.verified_at IS NOT NULL OR ($2::boolean AND d.is_demo)) provider_verified,
   CASE WHEN e.walk_in_id IS NULL THEN EXISTS(SELECT 1 FROM patient.consents c WHERE c.booking_id=e.booking_id AND c.purpose='appointment-sharing' AND c.revoked_at IS NULL)
   ELSE EXISTS(SELECT 1 FROM clinic.people p WHERE p.id=e.clinic_person_id AND p.consent_attested_at IS NOT NULL AND (p.owner_id IS NULL OR EXISTS(SELECT 1 FROM patient.consents c WHERE c.subject_id=p.id AND c.actor_id=p.owner_id AND c.purpose='walk-in-sharing' AND c.revoked_at IS NULL))) END consent
   FROM clinic.encounters e JOIN provider.doctors d ON d.id=e.doctor_id WHERE e.id=$1 FOR SHARE OF e,d`,[context.encounterId,localMode()])
  if(!e||(e.patient_user_id!==actorId&&!(e.doctor_user===actorId&&user.status==='ACTIVE'&&user.role==='doctor'&&user.kyc_level==='verified'&&e.doctor_status==='ACTIVE'&&e.provider_verified&&e.consent)))reject('FORBIDDEN','That encounter is unavailable.',403)
  if(e.doctor_user===actorId&&await tx.one("SELECT id FROM clinic.clinics WHERE id=$1 AND status<>'ACTIVE'",[e.clinic_id]))reject('FORBIDDEN','This clinic is not currently active.',403)
  return e.patient_user_id??'clinic:'+e.clinic_id
 }
 if(context.applicationId){
  if(!await tx.one('SELECT id FROM provider.applications WHERE id=$1 AND user_id=$2',[context.applicationId,actorId]))reject('FORBIDDEN','That verification case is unavailable.',403)
 }
 if(context.labOrderId){
  const order=await tx.one<{user_id:string;clinic_id:string}>(`SELECT o.user_id,p.clinic_id FROM patient.lab_orders o JOIN clinic.lab_packages p ON p.id=o.package_id WHERE o.id=$1`,[context.labOrderId])
  if(!order)reject('FORBIDDEN','That lab order is unavailable.',403)
  const member=user.status==='ACTIVE'?await tx.one("SELECT m.user_id FROM clinic.memberships m JOIN clinic.clinics c ON c.id=m.clinic_id WHERE m.clinic_id=$1 AND m.user_id=$2 AND m.role IN ('lab','administrator') AND m.status='ACTIVE' AND c.status='ACTIVE'",[order.clinic_id,actorId]):null
  if((upload&&!member)||(!upload&&order.user_id!==actorId&&!member))reject('FORBIDDEN','That lab order is unavailable.',403)
  return order.user_id
 }
 return actorId
}
function objectPath(key:string){if(!/^[a-f0-9-]{36}\.enc$/.test(key))reject('FILE','Invalid file reference.',404);return path.join(/* turbopackIgnore: true */ directory(),key)}
export async function purgePrivateFile(id:string){await ensureSchema();await getDb().transaction(async tx=>{const file=await tx.one<FileRow>("SELECT * FROM private_files WHERE id=$1 AND state='PURGE_PENDING' FOR UPDATE",[id]);if(!file)return;const subject=file.owner_id??(file.encounter_id?(await tx.one<{patient_user_id:string|null}>('SELECT patient_user_id FROM clinic.encounters WHERE id=$1',[file.encounter_id]))?.patient_user_id:null);if(await tx.one('SELECT id FROM retention_holds WHERE (user_id=$1 OR resource_id=$2 OR resource_id=$3) AND (expires_at IS NULL OR expires_at>now())',[subject,file.id,file.encounter_id]))reject('HOLD','A current retention hold prevents private-object deletion.');await unlink(objectPath(file.storage_key)).catch(error=>{if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error});await tx.query("UPDATE private_files SET state='PURGED',original_name='Erased private file' WHERE id=$1",[id]);await tx.query("INSERT INTO audit_log(action,resource) VALUES('privacy:file-purged',$1)",[id])})}
export async function uploadPrivateFile(actorId:string,name:string,bytes:Uint8Array,context:FileContext) {
 boundedText(name,150,1)
 if(bytes.byteLength<1||bytes.byteLength>10485760)reject('SIZE','Files must be at most 10 MiB.',413)
 await ensureSchema();await getDb().transaction(tx=>contextOwner(tx,actorId,context,true))
 let content=Buffer.from(bytes),mime='',state='QUARANTINED'
 const raster=(content[0]===0xff&&content[1]===0xd8)||(content[0]===0x89&&content.subarray(1,4).toString()==='PNG')
 if(raster){
  try{content=await sharp(content,{limitInputPixels:20000000,animated:false}).rotate().png().toBuffer()}catch{reject('TYPE','That image could not be decoded safely.',400)}
  if(content.length>10485760)reject('SIZE','Decoded image is too large.',413)
  mime='image/png';state='CLEAN'
 }else if(content.subarray(0,5).toString()==='%PDF-')mime='application/pdf'
 else reject('TYPE','Upload a PDF, JPEG or PNG. Active image formats are not accepted.',400)
 await mkdir(directory(),{recursive:true})
 const key=randomUUID()+'.enc',id='file_'+randomUUID(),filename=objectPath(key)
 if(mime==='application/pdf'&&process.env.CLAMSCAN_PATH){
  const scanner=path.resolve(process.env.CLAMSCAN_PATH),scratch=path.join(directory(),randomUUID()+'.scan')
  await writeFile(scratch,content,{flag:'wx',mode:0o600})
  try{await promisify(execFile)(scanner,['--no-summary',scratch],{timeout:20000,maxBuffer:4096});state='CLEAN'}
  catch{state='QUARANTINED'}finally{await unlink(scratch).catch(()=>{})}
 }
 await writeFile(filename,encryptSecret(content.toString('base64'),id),{flag:'wx',mode:0o600})
 try{
  await getDb().transaction(async tx=>{
   const owner=await contextOwner(tx,actorId,context,true)
   const clinicOwner=owner.startsWith('clinic:')?owner.slice(7):null
   if(clinicOwner){await tx.query('INSERT INTO clinic.file_quota(clinic_id) VALUES($1) ON CONFLICT DO NOTHING',[clinicOwner]);await tx.query('SELECT clinic_id FROM clinic.file_quota WHERE clinic_id=$1 FOR UPDATE',[clinicOwner])}
   else{await tx.query('INSERT INTO private_file_quota(owner_id) VALUES($1) ON CONFLICT DO NOTHING',[owner]);await tx.query('SELECT owner_id FROM private_file_quota WHERE owner_id=$1 FOR UPDATE',[owner])}
   const used=await tx.one<{bytes:string}>("SELECT coalesce(sum(bytes),0) bytes FROM private_files WHERE (owner_id=$1 OR clinic_owner_id=$2) AND state<>'PURGED'",[clinicOwner?null:owner,clinicOwner])
   if(Number(used?.bytes)+content.length>(clinicOwner?1073741824:104857600))reject('QUOTA','The private file allowance is full.',413)
   await tx.query('INSERT INTO private_files(id,owner_id,clinic_owner_id,encounter_id,application_id,lab_order_id,original_name,mime,bytes,checksum,storage_key,state,uploaded_by) VALUES($1,$2,$13,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
    [id,clinicOwner?null:owner,context.encounterId??null,context.applicationId??null,context.labOrderId??null,name,mime,String(content.length),createHash('sha256').update(content).digest('hex'),key,state,actorId,clinicOwner])
   await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'file:upload',$2)",[actorId,id])
  })
 }catch(error){await unlink(filename).catch(()=>{});throw error}
 return {id,state,mime}
}
export async function downloadPrivateFile(actorId:string|null,adminId:string|null,id:string) {
 await ensureSchema()
 const file=await getDb().transaction(async tx=>{
  const row=await tx.one<FileRow>('SELECT * FROM private_files WHERE id=$1',[id])
  if(!row)reject('NOT_FOUND','File unavailable.',404)
  if(adminId&&row.application_id){if(!await tx.one('SELECT id FROM admins WHERE id=$1 AND totp_secret IS NOT NULL',[adminId]))reject('FORBIDDEN','File unavailable.',404)}
  else{
   if(!actorId)reject('FORBIDDEN','Sign in required.',401)
   if(row.owner_id!==actorId&&!row.encounter_id&&!row.lab_order_id)reject('FORBIDDEN','File unavailable.',404)
   const owner=await contextOwner(tx,actorId,{encounterId:row.encounter_id??undefined,applicationId:row.application_id??undefined,labOrderId:row.lab_order_id??undefined})
   if(row.clinic_owner_id){if(!row.encounter_id||!await tx.one('SELECT e.id FROM clinic.encounters e JOIN provider.doctors d ON d.id=e.doctor_id WHERE e.id=$1 AND d.clinic_id=$2',[row.encounter_id,row.clinic_owner_id]))reject('FORBIDDEN','File unavailable.',404)}
   else if(owner!==row.owner_id)reject('FORBIDDEN','File unavailable.',404)
  }
  if(row.state!=='CLEAN')reject('QUARANTINED','The file is awaiting a successful safety scan.',409)
  await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'file:download',$2)",[adminId??actorId,id])
  return row
 })
 const encrypted=await readFile(/* turbopackIgnore: true */ objectPath(file.storage_key),'utf8')
 return {file,bytes:Buffer.from(decryptSecret(encrypted,file.id),'base64')}
}

import 'server-only'
import {randomUUID} from 'node:crypto'
import {getDb,ensureSchema} from '@/lib/db/client'
import {boundedText,reject} from './errors'
import {paise} from '@/lib/money'
export async function publishLabPackage(adminId:string,input:{clinicName:unknown;address:unknown;city:unknown;name:unknown;description:unknown;feePaise:unknown;verification:unknown;checked:boolean}){
 const clinicName=boundedText(input.clinicName,120,2),address=boundedText(input.address,300,5),city=boundedText(input.city,80,2),name=boundedText(input.name,120,2),description=boundedText(input.description??'',1000),verification=boundedText(input.verification,1000,20),fee=paise(String(input.feePaise))
 if(!input.checked||fee>1000000000n)reject('VERIFICATION','Complete the lab partner verification and check the package price.',400)
 await ensureSchema();return getDb().transaction(async tx=>{
  if(!await tx.one('SELECT id FROM admins WHERE id=$1 AND totp_secret IS NOT NULL',[adminId]))reject('FORBIDDEN','Administrator required.',403)
  const clinic='clinic_'+randomUUID(),id='package_'+randomUUID()
  await tx.query('INSERT INTO clinic.clinics(id,name,address,city) VALUES($1,$2,$3,$4)',[clinic,clinicName,address,city])
  await tx.query("INSERT INTO clinic.lab_packages(id,clinic_id,name,description,fee_paise,status,verified_at) VALUES($1,$2,$3,$4,$5,'ACTIVE',now())",[id,clinic,name,description,fee.toString()])
  await tx.query("INSERT INTO audit_log(actor_id,action,resource,detail) VALUES($1,'lab:partner-verify',$2,$3::jsonb)",[adminId,id,JSON.stringify({verification})])
  return {id,clinicId:clinic}
 })
}
export async function assignClinicStaff(adminId:string,clinicId:string,userId:string,role:string){
 if(!['lab','receptionist','administrator'].includes(role))reject('ROLE','Choose a supported staff role.',400)
 await ensureSchema();await getDb().transaction(async tx=>{
  if(!await tx.one('SELECT id FROM admins WHERE id=$1 AND totp_secret IS NOT NULL',[adminId]))reject('FORBIDDEN','Administrator required.',403)
  if(!await tx.one("SELECT id FROM patient.users WHERE id=$1 AND status='ACTIVE'",[userId]))reject('USER','An active existing account is required.',400)
  if(!await tx.one("SELECT id FROM clinic.clinics WHERE id=$1 AND status='ACTIVE'",[clinicId]))reject('CLINIC','An active verified partner clinic is required.',400)
  await tx.query("INSERT INTO clinic.memberships(clinic_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(clinic_id,user_id) DO UPDATE SET role=$3,status='ACTIVE'",[clinicId,userId,role])
  await tx.query("INSERT INTO audit_log(actor_id,action,resource,detail) VALUES($1,'clinic:staff-assign',$2,$3::jsonb)",[adminId,clinicId,JSON.stringify({userId,role})])
 })
}

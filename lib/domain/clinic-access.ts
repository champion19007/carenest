import 'server-only'
import type {Db} from '@/lib/db/client'
import {localMode} from '@/lib/secrets'
import {reject} from './errors'
export type ClinicRole='clinician'|'receptionist'|'administrator'|'lab'
export async function clinicAccess(tx:Db,actorId:string,clinicId:string,roles:ClinicRole[]){
 const row=await tx.one<{role:ClinicRole;name:string;user_role:string;kyc_level:string;doctor_id:string|null;doctor_status:string|null;verified_at:string|null;is_demo:boolean}>(`
  SELECT m.role,u.name,u.role user_role,u.kyc_level,d.id doctor_id,d.status doctor_status,d.verified_at,d.is_demo
  FROM clinic.memberships m JOIN clinic.clinics c ON c.id=m.clinic_id JOIN patient.users u ON u.id=m.user_id
  LEFT JOIN provider.doctors d ON d.user_id=u.id AND d.clinic_id=c.id
  WHERE m.user_id=$1 AND m.clinic_id=$2 AND m.status='ACTIVE' AND c.status='ACTIVE' AND u.status='ACTIVE'
  FOR SHARE OF m,c,u`,[actorId,clinicId])
 if(!row||!roles.includes(row.role))reject('FORBIDDEN','Current clinic staff access is required.',403)
 if(row.role==='clinician'&&(row.user_role!=='doctor'||row.kyc_level!=='verified'||row.doctor_status!=='ACTIVE'||(!row.verified_at&&!(row.is_demo&&localMode()))))reject('FORBIDDEN','Current professional verification is required.',403)
 return row
}
export async function ownClinics(tx:Db,actorId:string){return tx.query<{id:string;name:string;role:ClinicRole}>(`SELECT c.id,c.name,m.role FROM clinic.memberships m JOIN clinic.clinics c ON c.id=m.clinic_id JOIN patient.users u ON u.id=m.user_id WHERE m.user_id=$1 AND m.status='ACTIVE' AND c.status='ACTIVE' AND u.status='ACTIVE' ORDER BY c.name`,[actorId])}
export async function activeDoctor(tx:Db,id:string,clinicId?:string){
 const d=await tx.one<{id:string;user_id:string;clinic_id:string;kind:string;supported_species:string[];fee:number}>(`
  SELECT d.* FROM provider.doctors d JOIN patient.users u ON u.id=d.user_id JOIN clinic.clinics c ON c.id=d.clinic_id
  WHERE d.id=$1 AND d.status='ACTIVE' AND u.status='ACTIVE' AND u.role='doctor' AND u.kyc_level='verified' AND c.status='ACTIVE'
  AND (d.verified_at IS NOT NULL OR ($2::boolean AND d.is_demo)) AND ($3::text IS NULL OR d.clinic_id=$3) FOR SHARE OF d,u,c`,[id,localMode(),clinicId??null])
 if(!d)reject('DOCTOR','Choose a currently verified practitioner in this clinic.',409)
 return d
}
